/**
 * CORS node — handles preflight and injects Access-Control headers.
 *
 *   method  ──► [ CORS ]
 *   headers ──►          ──► preflight  (exec)
 *                        ──► request    (exec)
 *                        ──► corsHeaders (data)
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";

export function CorsNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as Record<string, unknown>;
  const origins = (d.allowOrigins as string) || "*";

  const { statuses } = useFlowExec();
  const status = statuses[id] ?? "idle";
  const statusClass =
    status === "running" ? s.statusRunning
    : status === "ok" ? s.statusOk
    : status === "error" ? s.statusError
    : status === "pending" ? s.statusPending
    : "";

  return (
    <div className={clsx(s.node, s.matchNode, selected && s.nodeSelected, statusClass)}>
      <div className={`${s.header} ${s.headerMatch}`}>
        <span className={s.matchBadge}>CORS</span>
        <span className={s.headerTitle}>{origins === "*" ? "allow all" : "restricted"}</span>
      </div>

      {/* exec-in + exec-preflight */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="exec-in" type="target" position={Position.Left} className={`${s.pin} ${s.pinExec}`} />
          <span className={s.pinName}>exec</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>preflight</span>
          <Handle id="exec-preflight" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* in:method + exec-request */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:method" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "string")}`} />
          <span className={s.pinName}>method</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>request</span>
          <Handle id="exec-request" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* in:headers + out:corsHeaders */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:headers" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "object")}`} />
          <span className={s.pinName}>headers</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>corsHeaders</span>
          <Handle id="out:corsHeaders" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "object")}`} />
        </div>
      </div>
    </div>
  );
}
