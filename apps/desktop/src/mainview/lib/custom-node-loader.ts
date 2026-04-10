/**
 * Custom node loader.
 *
 * Scans a directory of .ts files via the Rust backend, transpiles them
 * to JS via sucrase, evals each file to extract the `export default { ... }`
 * node definition, and returns a list of validated custom node descriptors.
 *
 * The contract for a custom node .ts file:
 *
 *   export default {
 *     name: "My Node",
 *     category: "Custom",         // optional, defaults to "Custom"
 *     description: "Does stuff",  // optional
 *     async: false,               // optional, true = blocking async exec node
 *     emits: "eventName",         // optional, fire-and-forget + event
 *     inputs: [
 *       { key: "url", type: "string" },
 *     ],
 *     outputs: [
 *       { key: "data", type: "object" },
 *     ],
 *     execute(inputs: { url: string }) {
 *       return { data: { hello: "world" } };
 *     },
 *   };
 */

import { invoke } from "@tauri-apps/api/core";
import { transform } from "sucrase";
import type { DataType } from "@twistedflow/core";

export interface CustomNodeDef {
  /** Source filename for debugging. */
  filename: string;
  name: string;
  category: string;
  description: string;
  isAsync: boolean;
  emits?: string;
  inputs: Array<{ key: string; type: DataType }>;
  outputs: Array<{ key: string; type: DataType }>;
  /** The execute function as a string — stored for later eval at run time. */
  executeSource: string;
}

interface RawFile {
  filename: string;
  content: string;
}

/** Default global custom nodes directory — shared across all projects. */
export const DEFAULT_CUSTOM_NODES_DIR = "~/.twistedflow/customNodes";

/**
 * Scan multiple directories and load all valid custom node definitions.
 *
 * Always scans `~/.twistedflow/customNodes` (global shared nodes) plus
 * any comma-separated paths from project settings. Later directories
 * override earlier ones if they declare a node with the same name.
 *
 * Global nodes default to category "Shared", project nodes to "Custom".
 */
export async function loadCustomNodes(
  projectDirs: string,
): Promise<CustomNodeDef[]> {
  const dirs = new Set<string>();
  dirs.add(DEFAULT_CUSTOM_NODES_DIR);
  for (const d of projectDirs.split(",").map((s) => s.trim())) {
    if (d) dirs.add(d);
  }

  const nodesByName = new Map<string, CustomNodeDef>();

  for (const directory of dirs) {
    let files: RawFile[];
    try {
      files = await invoke<RawFile[]>("scan_custom_nodes", { directory });
    } catch {
      continue; // directory doesn't exist or unreadable — skip
    }

    const isGlobal = directory === DEFAULT_CUSTOM_NODES_DIR;

    for (const file of files) {
      try {
        const def = parseCustomNode(file.filename, file.content);
        if (def) {
          if (!def.category || def.category === "Custom") {
            def.category = isGlobal ? "Shared" : "Custom";
          }
          nodesByName.set(def.name, def);
        }
      } catch (err) {
        console.warn(`[custom-nodes] skipped ${file.filename}:`, err);
      }
    }
  }

  return [...nodesByName.values()];
}

/**
 * Parse a single .ts file into a CustomNodeDef, or null if invalid.
 */
function parseCustomNode(
  filename: string,
  content: string,
): CustomNodeDef | null {
  // Step 1: transpile TS → JS via sucrase (correct type stripping).
  let js: string;
  try {
    js = transform(content, {
      transforms: ["typescript"],
      disableESTransforms: true,
    }).code;
  } catch (err) {
    console.warn(`[custom-nodes] transpile failed for ${filename}:`, err);
    return null;
  }

  // Step 2: transform `export default { ... }` to a returnable expression.
  // We wrap the code so the default export becomes the return value.
  const wrapped = js
    .replace(/^import\s+.*$/gm, "")  // remove import statements (they'd fail in eval)
    .replace(/export\s+default\s+/, "return ")
    // Also handle `module.exports =`
    .replace(/module\.exports\s*=\s*/, "return ");

  // Step 3: eval in a sandboxed function scope.
  let raw: Record<string, unknown>;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(wrapped);
    raw = fn() as Record<string, unknown>;
  } catch (err) {
    console.warn(`[custom-nodes] eval failed for ${filename}:`, err);
    return null;
  }

  if (!raw || typeof raw !== "object") return null;

  // Step 4: validate required fields.
  const name = raw.name as string | undefined;
  if (!name || typeof name !== "string") {
    console.warn(`[custom-nodes] ${filename}: missing "name" field`);
    return null;
  }

  const inputs = validateFields(raw.inputs);
  const outputs = validateFields(raw.outputs);
  if (!inputs || !outputs) {
    console.warn(`[custom-nodes] ${filename}: invalid inputs/outputs`);
    return null;
  }

  // Step 5: extract the execute function source for later eval at run time.
  // We store it in a form that `new Function("return " + src)()` can
  // reconstruct as a callable. Method shorthand like `execute(inputs){}`
  // isn't a valid standalone expression, so we normalize to function form.
  const executeFn = raw.execute;
  let executeSource = "";
  if (typeof executeFn === "function") {
    const raw = executeFn.toString();
    // If it starts with the method name (shorthand), prefix with "function "
    if (/^\w+\s*\(/.test(raw) && !raw.startsWith("function") && !raw.startsWith("async")) {
      executeSource = "function " + raw;
    } else if (/^async\s+\w+\s*\(/.test(raw) && !raw.startsWith("async function")) {
      executeSource = raw.replace(/^async\s+/, "async function ");
    } else {
      executeSource = raw;
    }
  }

  return {
    filename,
    name,
    category: (raw.category as string) || "Custom",
    description: (raw.description as string) || "",
    isAsync: raw.async === true,
    emits: typeof raw.emits === "string" ? raw.emits : undefined,
    inputs,
    outputs,
    executeSource,
  };
}

function validateFields(
  raw: unknown,
): Array<{ key: string; type: DataType }> | null {
  if (!Array.isArray(raw)) return raw === undefined ? [] : null;
  const result: Array<{ key: string; type: DataType }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const key = (item as Record<string, unknown>).key;
    const type = (item as Record<string, unknown>).type;
    if (typeof key !== "string") return null;
    result.push({
      key,
      type: (type as DataType) ?? "unknown",
    });
  }
  return result;
}
