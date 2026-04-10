/**
 * Tauri command bridge for the React app.
 *
 * Replaces the old SQLite-backed RPC layer. Each method maps to a
 * `#[tauri::command]` in src-tauri/src/commands.rs and is called via
 * `invoke()` from `@tauri-apps/api/core`.
 *
 * Projects are now folder-based: a project is a directory on disk.
 * Flows and environments are individual JSON files inside that directory.
 *
 * Window controls go through `getCurrentWindow()` from
 * `@tauri-apps/api/window`. Native traffic lights are handled by macOS
 * directly (we set `decorations: true` + `titleBarStyle: Overlay` in
 * tauri.conf.json), so this hook only exposes minimize/maximize/close
 * for parity with the old API in case we need them later.
 */

import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ── Project ───────────────────────────────────────────────────────────────────

export interface ProjectInfo {
  path: string;
  name: string;
}

// ── Flows ─────────────────────────────────────────────────────────────────────

export interface FlowSummary {
  name: string;
  filename: string;
}

export interface FlowDetail {
  name: string;
  filename: string;
  nodes: unknown[];
  edges: unknown[];
  viewport?: object;
}

// ── Environments ──────────────────────────────────────────────────────────────

export interface EnvVar {
  key: string;
  value: string;
}

export interface Environment {
  name: string;
  filename: string;
  vars: EnvVar[];
}

// ── RPC surface ───────────────────────────────────────────────────────────────

export interface RPC {
  request: {
    // Projects
    createProject: (params: { parentPath: string; name: string }) => Promise<ProjectInfo>;
    openProject: (params: { path: string }) => Promise<ProjectInfo>;

    // Flows
    listFlows: (params: { projectPath: string }) => Promise<FlowSummary[]>;
    getFlow: (params: { projectPath: string; filename: string }) => Promise<FlowDetail | null>;
    saveFlow: (params: {
      projectPath: string;
      filename: string;
      nodes: unknown;
      edges: unknown;
      viewport?: unknown;
    }) => Promise<void>;
    createFlow: (params: { projectPath: string; name: string }) => Promise<FlowSummary>;
    deleteFlow: (params: { projectPath: string; filename: string }) => Promise<void>;
    renameFlow: (params: {
      projectPath: string;
      oldFilename: string;
      newName: string;
    }) => Promise<FlowSummary>;

    // Environments
    listEnvironments: (params: { projectPath: string }) => Promise<Environment[]>;
    saveEnvironment: (params: {
      projectPath: string;
      envName: string;
      vars: EnvVar[];
    }) => Promise<void>;
    createEnvironment: (params: { projectPath: string; envName: string }) => Promise<Environment>;
    deleteEnvironment: (params: { projectPath: string; envName: string }) => Promise<void>;

    // HTTP
    /** Fire a raw HTTP request via the Rust backend. */
    httpRequest: (params: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: string;
    }) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

    /** OAuth2 Client Credentials token exchange via Rust. */
    oauth2FetchToken: (params: {
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scopes: string;
    }) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>;

    /** OAuth2 Authorization Code flow — opens browser, waits for callback. */
    oauth2Authorize: (params: {
      authUrl: string;
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scopes: string;
    }) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>;

    // Executor
    runFlow: (params: { projectPath: string; filename: string; env?: string }) => Promise<void>;
    stopFlow: (params: { projectPath: string; filename: string }) => Promise<void>;
    listNodeTypes: () => Promise<unknown[]>;
  };
  send: {
    closeWindow: (params?: {}) => void;
    minimizeWindow: (params?: {}) => void;
    maximizeWindow: (params?: {}) => void;
  };
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Wraps Tauri's invoke + window APIs in the same shape the components
 * already use.
 *
 * Errors from invoke are surfaced via console.error. Calls that are
 * expected to return a list fall back to `[]`; nullable lookups fall back
 * to `null`; void mutations re-throw so callers can handle them explicitly.
 */
function makeRpc(): RPC {
  const win = getCurrentWindow();

  const safe = async <T,>(cmd: string, args: InvokeArgs, fallback: T): Promise<T> => {
    try {
      return (await invoke<T>(cmd, args)) ?? fallback;
    } catch (err) {
      console.error(`[invoke ${cmd}]`, err);
      return fallback;
    }
  };

  /** For void mutations: surfaces the error rather than swallowing it. */
  const run = async (cmd: string, args: InvokeArgs): Promise<void> => {
    try {
      await invoke(cmd, args);
    } catch (err) {
      console.error(`[invoke ${cmd}]`, err);
      throw err;
    }
  };

  return {
    request: {
      // ── Projects ────────────────────────────────────────────────────────────

      createProject: ({ parentPath, name }) =>
        safe<ProjectInfo>("create_project", { parentPath, name }, { path: "", name }),

      openProject: ({ path }) =>
        safe<ProjectInfo>("open_project", { path }, { path: "", name: "" }),

      // ── Flows ────────────────────────────────────────────────────────────────

      listFlows: ({ projectPath }) =>
        safe<FlowSummary[]>("list_flows", { projectPath }, []),

      getFlow: ({ projectPath, filename }) =>
        safe<FlowDetail | null>(
          "get_flow",
          { projectPath, filename },
          null,
        ),

      saveFlow: ({ projectPath, filename, nodes, edges, viewport }) =>
        run("save_flow", { projectPath, filename, nodes, edges, viewport }),

      createFlow: ({ projectPath, name }) =>
        safe<FlowSummary>("create_flow", { projectPath, name }, { name, filename: "" }),

      deleteFlow: ({ projectPath, filename }) =>
        run("delete_flow", { projectPath, filename }),

      renameFlow: ({ projectPath, oldFilename, newName }) =>
        safe<FlowSummary>(
          "rename_flow",
          { projectPath, oldFilename, newName },
          { name: newName, filename: oldFilename },
        ),

      // ── Environments ─────────────────────────────────────────────────────────

      listEnvironments: ({ projectPath }) =>
        safe<Environment[]>("list_environments", { projectPath }, []),

      saveEnvironment: ({ projectPath, envName, vars }) =>
        run("save_environment", { projectPath, envName, vars }),

      createEnvironment: ({ projectPath, envName }) =>
        safe<Environment>(
          "create_environment",
          { projectPath, envName },
          { name: envName, filename: "", vars: [] },
        ),

      deleteEnvironment: ({ projectPath, envName }) =>
        run("delete_environment", { projectPath, envName }),

      // ── HTTP ─────────────────────────────────────────────────────────────────

      httpRequest: (params) =>
        safe<{ status: number; headers: Record<string, string>; body: string }>(
          "http_request",
          params as unknown as InvokeArgs,
          { status: 0, headers: {}, body: "" },
        ),

      oauth2FetchToken: async ({ tokenUrl, clientId, clientSecret, scopes }) => {
        try {
          return await invoke<{ accessToken: string; refreshToken: string; expiresAt: number }>(
            "oauth2_client_credentials",
            { tokenUrl, clientId, clientSecret, scopes },
          );
        } catch (err) {
          console.error("[invoke oauth2_client_credentials]", err);
          return null;
        }
      },

      oauth2Authorize: async ({ authUrl, tokenUrl, clientId, clientSecret, scopes }) => {
        try {
          return await invoke<{ accessToken: string; refreshToken: string; expiresAt: number }>(
            "oauth2_authorize",
            { authUrl, tokenUrl, clientId, clientSecret, scopes },
          );
        } catch (err) {
          console.error("[invoke oauth2_authorize]", err);
          return null;
        }
      },

      // ── Executor ─────────────────────────────────────────────────────────────

      runFlow: ({ projectPath, filename, env }) =>
        run("run_flow", { projectPath, filename, env }),

      stopFlow: ({ projectPath, filename }) =>
        run("stop_flow", { projectPath, filename }),

      listNodeTypes: () =>
        safe<unknown[]>("list_node_types", {}, []),
    },

    send: {
      closeWindow: () => {
        void win.close();
      },
      minimizeWindow: () => {
        void win.minimize();
      },
      maximizeWindow: () => {
        void win.toggleMaximize();
      },
    },
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns a stable RPC instance. Tauri's invoke is always available
 * (no async init), so we don't need a `ready` flag — but we keep
 * `{ rpc }` as the return shape so callers don't need to change.
 */
let cachedRpc: RPC | null = null;
export function useTauri() {
  if (!cachedRpc) cachedRpc = makeRpc();
  return { rpc: cachedRpc };
}
