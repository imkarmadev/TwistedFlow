/**
 * Flow import/export as JSON files.
 *
 * Format:
 *   {
 *     "twistedrest": 1,        // version marker
 *     "name": "my-flow",
 *     "nodes": [...],
 *     "edges": [...],
 *     "viewport": { x, y, zoom }
 *   }
 *
 * Export: fetches flow from DB → formats → triggers browser download.
 * Import: reads a .json file → creates a new flow → saves nodes/edges.
 */

import type { RPC } from "../use-tauri";

export interface FlowFile {
  twistedrest: number;
  name: string;
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
}

/**
 * Export a flow as a .json download.
 */
export async function exportFlow(rpc: RPC, flowId: string): Promise<void> {
  const flow = await rpc.request.getFlow({ id: flowId });
  if (!flow) return;

  const data: FlowFile = {
    twistedrest: 1,
    name: flow.name,
    nodes: flow.nodes,
    edges: flow.edges,
    viewport: (flow as unknown as Record<string, unknown>).viewport as
      | { x: number; y: number; zoom: number }
      | undefined,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(flow.name)}.flow.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a flow from a .json file. Opens a file picker, parses the
 * file, creates a new flow in the given project, and saves the
 * imported nodes/edges. Returns the new flow's id, or null on cancel/error.
 */
export async function importFlow(
  rpc: RPC,
  projectId: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.flow.json";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text) as Partial<FlowFile>;

        // Validate basic structure
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          console.error("[importFlow] invalid file: missing nodes or edges");
          resolve(null);
          return;
        }

        const name = data.name || file.name.replace(/\.flow\.json$|\.json$/, "");

        // Create the flow (seeds a Start node, but we'll overwrite)
        const created = await rpc.request.createFlow({
          projectId,
          name: `${name} (imported)`,
        });
        if (!created.id) {
          resolve(null);
          return;
        }

        // Overwrite with imported data
        await rpc.request.saveFlow({
          id: created.id,
          nodes: data.nodes,
          edges: data.edges,
          viewport: data.viewport,
        });

        resolve(created.id);
      } catch (err) {
        console.error("[importFlow] parse error:", err);
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "flow";
}
