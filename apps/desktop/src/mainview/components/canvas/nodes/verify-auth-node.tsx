/**
 * Verify Auth node — validates incoming auth and branches pass/fail.
 *
 *   headers ──► [ VERIFY AUTH ]
 *   secret  ──►                ──► pass  (exec)
 *                              ──► fail  (exec)
 *                              ──► claims (data)
 *                              ──► token  (data)
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";

export function VerifyAuthNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as Record<string, unknown>;
  const mode = (d.mode as string) || "bearer";

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
        <span className={s.matchBadge}>AUTH</span>
        <span className={s.headerTitle}>{mode}</span>
      </div>

      {/* exec-in + exec-pass */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="exec-in" type="target" position={Position.Left} className={`${s.pin} ${s.pinExec}`} />
          <span className={s.pinName}>exec</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>pass</span>
          <Handle id="exec-pass" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* in:headers + exec-fail */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:headers" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "object")}`} />
          <span className={s.pinName}>headers</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>fail</span>
          <Handle id="exec-fail" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* in:secret + out:claims */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:secret" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "string")}`} />
          <span className={s.pinName}>secret</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>claims</span>
          <Handle id="out:claims" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "object")}`} />
        </div>
      </div>

      {/* in:validKeys + out:token */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:validKeys" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "array")}`} />
          <span className={s.pinName}>validKeys</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>token</span>
          <Handle id="out:token" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "string")}`} />
        </div>
      </div>

      {/* out:error */}
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
