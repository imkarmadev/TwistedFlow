import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import s from "./sidebar.module.css";

interface FlowItem {
  name: string;
  filename: string;
}

interface SidebarProps {
  activeProjectPath: string | null;
  activeProjectName: string | null;
  activeFlowFilename: string | null;
  /** Set of flow filenames that are currently running. */
  runningFlows: Set<string>;
  onOpenProject: (path: string) => void;
  onCreateProject: (parentPath: string, name: string) => void;
  onSelectFlow: (filename: string) => void;
  onOpenSettings: () => void;
}

// ── Recent projects (localStorage) ──────────────────────────────────

const RECENTS_KEY = "twistedflow:recentProjects";
const MAX_RECENTS = 8;

interface RecentProject {
  path: string;
  name: string;
}

function getRecents(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(path: string, name: string) {
  const list = getRecents().filter((r) => r.path !== path);
  list.unshift({ path, name });
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
}

function removeRecent(path: string) {
  const list = getRecents().filter((r) => r.path !== path);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
}

// ── Main sidebar ────────────────────────────────────────────────────

export function Sidebar({
  activeProjectPath,
  activeProjectName,
  activeFlowFilename,
  runningFlows,
  onOpenProject,
  onCreateProject,
  onSelectFlow,
  onOpenSettings,
}: SidebarProps) {
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmDeleteFlow, setConfirmDeleteFlow] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentProject[]>(getRecents);
  const [showCreateName, setShowCreateName] = useState(false);
  const [createName, setCreateName] = useState("");

  // Track recent when project opens
  useEffect(() => {
    if (activeProjectPath && activeProjectName) {
      pushRecent(activeProjectPath, activeProjectName);
      setRecents(getRecents());
    }
  }, [activeProjectPath, activeProjectName]);

  // Load flows
  useEffect(() => {
    if (!activeProjectPath) {
      setFlows([]);
      return;
    }
    invoke<FlowItem[]>("list_flows", { projectPath: activeProjectPath })
      .then(setFlows)
      .catch(() => setFlows([]));
  }, [activeProjectPath, activeFlowFilename]);

  const refreshFlows = useCallback(() => {
    if (!activeProjectPath) return;
    invoke<FlowItem[]>("list_flows", { projectPath: activeProjectPath })
      .then(setFlows)
      .catch(() => setFlows([]));
  }, [activeProjectPath]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleOpenProject = async () => {
    const selected = await pickFolder({ directory: true, title: "Open TwistedFlow Project" });
    if (selected && typeof selected === "string") {
      onOpenProject(selected);
    }
  };

  const handleCreateProject = async () => {
    const selected = await pickFolder({ directory: true, title: "Choose parent folder for new project" });
    if (selected && typeof selected === "string") {
      setShowCreateName(true);
      setCreateName("");
      // Store parent path temporarily
      (window as unknown as Record<string, string>).__tfCreateParent = selected;
    }
  };

  const submitCreateProject = () => {
    const parent = (window as unknown as Record<string, string>).__tfCreateParent;
    const name = createName.trim();
    setShowCreateName(false);
    setCreateName("");
    if (parent && name) {
      onCreateProject(parent, name);
    }
  };

  const submitNewFlow = async () => {
    const name = draft.trim();
    setCreatingFlow(false);
    setDraft("");
    if (!name || !activeProjectPath) return;
    try {
      const created = await invoke<{ filename: string }>("create_flow", {
        projectPath: activeProjectPath,
        name,
      });
      refreshFlows();
      onSelectFlow(created.filename);
    } catch (e) {
      console.error("create_flow", e);
    }
  };

  const deleteFlow = async (filename: string) => {
    if (!activeProjectPath) return;
    await invoke("delete_flow", { projectPath: activeProjectPath, filename });
    setConfirmDeleteFlow(null);
    refreshFlows();
    if (activeFlowFilename === filename) onSelectFlow("");
  };

  const handleRemoveRecent = (path: string) => {
    removeRecent(path);
    setRecents(getRecents());
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <aside className={s.sidebar}>
      <div data-tauri-drag-region className={s.dragHandle} />

      {/* Header */}
      <div className={s.header}>
        <span className={s.headerLabel}>Project</span>
        {activeProjectPath && (
          <button className={s.gear} onClick={onOpenSettings} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      {/* Active project pill */}
      {activeProjectName ? (
        <div className={s.projectPill}>{activeProjectName}</div>
      ) : null}

      {/* Open / Create buttons */}
      <div className={s.projectActions}>
        <button className={s.projectActionBtn} onClick={handleOpenProject}>
          Open Project
        </button>
        <button className={s.projectActionBtn} onClick={handleCreateProject}>
          Create Project
        </button>
      </div>

      {/* Create project name input */}
      {showCreateName && (
        <div className={s.panel}>
          <div className={s.panelLabel}>Project name</div>
          <input
            autoFocus
            className={s.input}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreateProject();
              if (e.key === "Escape") setShowCreateName(false);
            }}
            placeholder="my-project"
          />
          <div className={s.panelActions}>
            <button className={s.panelBtn} onClick={submitCreateProject}>Create</button>
            <button className={clsx(s.panelBtn, s.panelBtnGhost)} onClick={() => setShowCreateName(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Recent projects (only when no project is open) */}
      {!activeProjectPath && recents.length > 0 && (
        <>
          <div className={s.divider} />
          <div className={s.sectionLabel}>Recent</div>
          <div className={s.list}>
            {recents.map((r) => (
              <div key={r.path} className={s.flowRow}>
                <button
                  className={s.flowItem}
                  onClick={() => onOpenProject(r.path)}
                  title={r.path}
                >
                  {r.name}
                </button>
                <div className={s.flowIcons}>
                  <span
                    className={s.flowIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRecent(r.path);
                    }}
                    title="Remove from recents"
                  >
                    ×
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Flows section */}
      {activeProjectPath && (
        <>
          <div className={s.divider} />
          <div className={s.sectionLabel}>Flows</div>

          <div className={s.list}>
            {flows.length === 0 && !creatingFlow && (
              <div className={s.emptyHint}>No flows yet.</div>
            )}

            {flows.map((f) => (
              <div key={f.filename} className={s.flowRow}>
                <button
                  className={clsx(s.flowItem, f.filename === activeFlowFilename && s.flowItemActive)}
                  onClick={() => onSelectFlow(f.filename)}
                >
                  {runningFlows.has(f.filename) && <span className={s.runningDot} />}
                  {f.name}
                </button>
                <div className={s.flowIcons}>
                  <span
                    className={clsx(s.flowIcon, confirmDeleteFlow === f.filename && s.flowIconDanger)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmDeleteFlow !== f.filename) {
                        setConfirmDeleteFlow(f.filename);
                        setTimeout(() => setConfirmDeleteFlow(null), 3000);
                        return;
                      }
                      void deleteFlow(f.filename);
                    }}
                    title={confirmDeleteFlow === f.filename ? "Click again to confirm" : "Delete flow"}
                  >
                    {confirmDeleteFlow === f.filename ? "!" : "×"}
                  </span>
                </div>
              </div>
            ))}

            {creatingFlow && (
              <input
                autoFocus
                className={s.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void submitNewFlow()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitNewFlow();
                  if (e.key === "Escape") {
                    setDraft("");
                    setCreatingFlow(false);
                  }
                }}
                placeholder="Flow name"
              />
            )}

            {!creatingFlow && (
              <button
                className={s.addFlow}
                onClick={() => { setCreatingFlow(true); setDraft(""); }}
              >
                + new flow
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
