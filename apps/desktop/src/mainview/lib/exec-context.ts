/**
 * Shared execution context for the canvas.
 *
 * The FlowCanvas owns the actual `run()` function and the per-node status
 * map. Custom node renderers (Start node's Run button + env selector,
 * HttpRequest node's status border) consume this context via
 * `useFlowExec()` so they don't need props plumbed through React Flow.
 *
 * Status state lives here in React state — never persisted to disk.
 * Environments are surfaced so the Start node can render the env dropdown.
 */

import { createContext, useContext } from "react";
import type { NodeStatus } from "@twistedflow/core";

export interface EnvVar {
  key: string;
  value: string;
}

export interface ProjectEnvironment {
  name: string;
  filename: string;
  vars: EnvVar[];
}

export interface FlowExecContextValue {
  run: () => void;
  stop: () => void;
  /** Map of node id → current status. Missing entries default to "idle". */
  statuses: Record<string, NodeStatus>;
  /** Last successful output of a node, keyed by id. */
  results: Record<string, Record<string, unknown>>;
  /** Last error message of a failed node, keyed by id. */
  errors: Record<string, string>;
  /** True while a flow run is in progress. */
  running: boolean;

  /** Environments belonging to the active project. */
  environments: ProjectEnvironment[];
  /**
   * The environment currently selected on the Start node, or null if
   * no Start node exists or none is selected. EnvVar nodes validate
   * their varKey against this env's vars list and render red if the
   * key is missing.
   */
  activeEnvironment: ProjectEnvironment | null;

  /** True when the flow is structurally valid and can be executed. */
  canRun: boolean;
  /** Human-readable reason the run is disabled (null when canRun). */
  runDisabledReason: string | null;
}

export const FlowExecContext = createContext<FlowExecContextValue>({
  run: () => {},
  stop: () => {},
  statuses: {},
  results: {},
  errors: {},
  running: false,
  environments: [],
  activeEnvironment: null,
  canRun: false,
  runDisabledReason: null,
});

export function useFlowExec(): FlowExecContextValue {
  return useContext(FlowExecContext);
}
