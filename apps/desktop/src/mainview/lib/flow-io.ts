/**
 * Flow file format descriptor.
 *
 * Flows are now stored as *.flow.json files on disk — the user copies/moves
 * them directly. This interface documents the on-disk format and is used by
 * the CLI and any future tooling.
 */

export interface FlowFile {
  twistedflow: number;
  name: string;
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
}
