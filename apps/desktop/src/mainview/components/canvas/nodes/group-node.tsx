/**
 * Collapsed group placeholder.
 *
 * Rendered by applyGroups() when a group has `collapsed: true`. The
 * synthetic node carries:
 *   data._groupId       → which group this represents
 *   data._label         → display label
 *   data._boundaryPins  → pins to render (computed from crossing edges)
 *
 * Header icons (left-to-right):
 *   ⛶ Ungroup      dissolves the group (members become loose nodes)
 *   ⊕ Expand       sets collapsed = false → members reappear inline
 *   (no icon for drill-down — that's double-click on the whole node)
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import type { BoundaryPin } from "../../../lib/groups";
import type { DataType } from "@twistedflow/core";

interface GroupNodeData {
  _groupId: string;
  _label: string;
  _boundaryPins?: BoundaryPin[];
}

export interface GroupNodeCallbacks {
  onUngroup: (groupId: string) => void;
  onExpand: (groupId: string) => void;
  onRename: (groupId: string, label: string) => void;
}

/**
 * Context to hand callbacks into the node component without dragging them
 * through node.data (which would break memo equality and trigger re-renders
 * on every canvas mutation).
 */
import { createContext, useContext, useState, useEffect } from "react";
export const GroupCallbacksContext = createContext<GroupNodeCallbacks>({
  onUngroup: () => {},
  onExpand: () => {},
  onRename: () => {},
});

export function GroupNode({ data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const pins = d._boundaryPins ?? [];
  const { onUngroup, onExpand, onRename } = useContext(GroupCallbacksContext);

  const leftPins = pins.filter((p) => p.side === "left");
  const rightPins = pins.filter((p) => p.side === "right");
  const rows = Math.max(leftPins.length, rightPins.length, 1);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d._label || "Group");
  useEffect(() => {
    setDraft(d._label || "Group");
  }, [d._label]);

  const commit = () => {
    const next = draft.trim() || "Group";
    if (next !== d._label) onRename(d._groupId, next);
    setEditing(false);
  };

  return (
    <div className={clsx(s.node, s.groupNode, selected && s.nodeSelected)}>
      <div className={`${s.header} ${s.headerGroup}`}>
        <span className={s.groupIconBtn} onClick={(e) => {
          e.stopPropagation();
          onUngroup(d._groupId);
        }} title="Ungroup (dissolve group, keep nodes)">
          ⛶
        </span>
        <span className={s.groupIconBtn} onClick={(e) => {
          e.stopPropagation();
          onExpand(d._groupId);
        }} title="Expand inline (show members on the canvas)">
          ⊕
        </span>
        {editing ? (
          <input
            autoFocus
            className={`${s.groupNameInput} nodrag`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(d._label || "Group");
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={s.headerTitle}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {d._label || "Group"}
          </span>
        )}
        <span className={s.groupHint} title="Double-click the node (not the label) to drill in">↘</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {pins.length} boundary pin{pins.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Render pins row-by-row, left + right aligned */}
      {Array.from({ length: rows }, (_, i) => {
        const lp = leftPins[i];
        const rp = rightPins[i];
        return (
          <div className={s.pinRow} key={i}>
            {lp ? (
              <div className={s.pinLabelLeft}>
                <Handle
                  id={lp.id}
                  type="target"
                  position={Position.Left}
                  className={
                    lp.kind === "exec"
                      ? `${s.pin} ${s.pinExec}`
                      : `${s.pin} ${pinClass(s, (lp.dataType ?? "unknown") as DataType)}`
                  }
                />
                <span className={s.pinName}>{lp.label}</span>
              </div>
            ) : (
              <span className={s.pinSpacer} />
            )}
            {rp ? (
              <div className={s.pinLabelRight}>
                <span className={s.pinName}>{rp.label}</span>
                <Handle
                  id={rp.id}
                  type="source"
                  position={Position.Right}
                  className={
                    rp.kind === "exec"
                      ? `${s.pin} ${s.pinExec}`
                      : `${s.pin} ${pinClass(s, (rp.dataType ?? "unknown") as DataType)}`
                  }
                />
              </div>
            ) : (
              <span className={s.pinSpacer} />
            )}
          </div>
        );
      })}
    </div>
  );
}
