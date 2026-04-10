/**
 * Env Setter node — writes a value into the runtime env vars map.
 *
 *   exec ──► [ SET ENV "token" ] ──► exec
 *   value ──►
 *
 * Use case: an HTTP login response returns an auth token. Env Setter
 * stores it as "token" so all downstream HTTP nodes that use #{token}
 * (via EnvVar nodes) pick it up automatically.
 *
 * Has exec pins — it's a mutation point in the chain, not a pure-data node.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { useFlowExec } from "../../../lib/exec-context";

export interface EnvSetterNodeData {
  varKey?: string;
}

export function EnvSetterNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as EnvSetterNodeData;
  const varKey = d.varKey ?? "";

  const { statuses } = useFlowExec();
  const status = statuses[id] ?? "idle";
  const statusClass =
    status === "running" ? s.statusRunning
    : status === "ok" ? s.statusOk
    : status === "error" ? s.statusError
    : status === "pending" ? s.statusPending
    : "";

  return (
    <div className={clsx(s.node, s.envSetterNode, selected && s.nodeSelected, statusClass)}>
      <div className={`${s.header} ${s.headerEnvSetter}`}>
        <span className={s.envSetterBadge}>SET</span>
        <span className={s.headerTitle}>{varKey || "select key"}</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {varKey ? `writes to env.${varKey}` : "pick a key in the inspector"}
          </span>
        </div>
      </div>

      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="exec-in" type="target" position={Position.Left} className={`${s.pin} ${s.pinExec}`} />
          <span className={s.pinName}>exec</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>exec</span>
          <Handle id="exec-out" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:value" type="target" position={Position.Left} className={`${s.pin} ${s.pinObject}`} />
          <span className={s.pinName}>value</span>
        </div>
        <span className={s.pinSpacer} />
      </div>
    </div>
  );
}
