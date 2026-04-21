/**
 * Flow-scoped I/O interface for subflows.
 *
 * A subflow declares its callable signature via a top-level `interface` field
 * in the flow JSON:
 *
 *   {
 *     "kind": "subflow",
 *     "interface": {
 *       "inputs":  [{ "key": "userId", "type": "string" }, { "key": "in",  "type": "exec" }],
 *       "outputs": [{ "key": "user",   "type": "object" }, { "key": "ok",  "type": "exec" },
 *                   { "key": "err",    "type": "exec" }]
 *     }
 *   }
 *
 * The Inputs / Outputs nodes on the canvas render their pins from this
 * declaration. Editing the Interface Panel updates this single source of
 * truth — node renders re-compute pins, dangling edges get culled by the
 * existing pin-delete detection in flow-canvas.
 */

import { createContext, useContext } from "react";
import type { DataType } from "@twistedflow/core";

/** Pin types supported by subflow interfaces. */
export type PinType = DataType | "exec";

/** A single pin declaration in the subflow's interface. */
export interface PinDecl {
  /** Pin name — unique within its side (inputs or outputs). */
  key: string;
  /** "exec" for white exec pins, else a data type for colored data pins. */
  type: PinType;
  /** Default value (only meaningful for data pins). */
  default?: unknown;
}

/** The complete I/O contract of a subflow. */
export interface Interface {
  inputs: PinDecl[];
  outputs: PinDecl[];
}

export interface FlowInterfaceContextValue {
  /** The subflow's declared interface, or null for main flows. */
  interface: Interface | null;
  /** Update the interface (triggers autosave + pin re-render). */
  setInterface: (iface: Interface) => void;
}

export const FlowInterfaceContext = createContext<FlowInterfaceContextValue>({
  interface: null,
  setInterface: () => {},
});

/** Hook for node components + panels to access the flow's interface. */
export function useFlowInterface(): FlowInterfaceContextValue {
  return useContext(FlowInterfaceContext);
}
