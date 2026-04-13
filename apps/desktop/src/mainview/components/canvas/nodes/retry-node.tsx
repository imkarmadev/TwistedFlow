/**
 * Retry node — re-execute a sub-chain with retries and exponential backoff.
 *
 * Exec branches:
 *   - exec-body:   the chain to retry
 *   - exec-out:    fires on success (after body succeeds)
 *   - exec-failed: fires if all retries exhausted
 *
 * Data outputs:
 *   - attempts:  number of attempts made
 *   - succeeded: boolean
 *   - error:     last error message (if failed)
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";

export function RetryNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as Record<string, unknown>;
  const maxRetries = d.maxRetries ?? 3;
  const delayMs = d.delayMs ?? 1000;

  const { statuses } = useFlowExec();
  const status = statuses[id] ?? "idle";
  const statusClass =
    status === "running" ? s.statusRunning
    : status === "ok" ? s.statusOk
    : status === "error" ? s.statusError
    : status === "pending" ? s.statusPending
    : "";

  return (
    <div className={clsx(s.node, s.customNodeEl, selected && s.nodeSelected, statusClass)}>
      <div className={`${s.header} ${s.headerCustom}`}>
        <span className={s.customBadge}>FLOW</span>
        <span className={s.headerTitle}>Retry</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>{String(maxRetries)}× / {String(delayMs)}ms backoff</span>
        </div>
      </div>

      {/* exec-in → exec-body (the chain to retry) */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="exec-in" type="target" position={Position.Left} className={`${s.pin} ${s.pinExec}`} />
          <span className={s.pinName}>exec</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName} style={{ color: "#ffa726" }}>body</span>
          <Handle id="exec-body" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* exec-out (success) */}
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName} style={{ color: "#4ade80" }}>out</span>
          <Handle id="exec-out" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* exec-failed */}
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName} style={{ color: "#f87171" }}>failed</span>
          <Handle id="exec-failed" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* Data outputs */}
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>attempts</span>
          <Handle id="out:attempts" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "number")}`} />
        </div>
      </div>
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>succeeded</span>
          <Handle id="out:succeeded" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "boolean")}`} />
        </div>
      </div>
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>error</span>
          <Handle id="out:error" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "string")}`} />
        </div>
      </div>
    </div>
  );
}
