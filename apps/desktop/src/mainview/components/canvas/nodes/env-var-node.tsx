/**
 * EnvVar node — reads a value from the selected .env file.
 * No design-time validation — missing keys return null at runtime.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { useFlowExec } from "../../../lib/exec-context";

export function EnvVarNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as { varKey?: string };
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
    <div className={clsx(s.node, s.envVarNode, selected && s.nodeSelected, statusClass)}>
      <div className={`${s.header} ${s.headerEnvVar}`}>
        <span className={s.envBadge}>ENV</span>
        <span className={s.headerTitle}>{varKey || "select variable"}</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {varKey ? `reads $${varKey} from .env` : "pick a variable in the inspector"}
          </span>
        </div>
      </div>

      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          {varKey || "value"}
          <Handle
            id="out:value"
            type="source"
            position={Position.Right}
            className={`${s.pin} ${s.pinString}`}
          />
        </div>
      </div>
    </div>
  );
}
