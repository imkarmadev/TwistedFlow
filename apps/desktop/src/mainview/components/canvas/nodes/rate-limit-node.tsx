/**
 * Rate Limit node — sliding window rate limiter.
 *
 *   headers ──► [ RATE LIMIT ]
 *   key     ──►                ──► pass    (exec)
 *                              ──► limited (exec)
 *                              ──► remaining       (data)
 *                              ──► rateLimitHeaders (data)
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";

export function RateLimitNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as Record<string, unknown>;
  const max = (d.maxRequests as number) ?? 100;
  const windowMs = (d.windowMs as number) ?? 60000;

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
        <span className={s.matchBadge}>LIMIT</span>
        <span className={s.headerTitle}>{max}/{windowMs >= 60000 ? `${windowMs / 60000}m` : `${windowMs / 1000}s`}</span>
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

      {/* in:headers + exec-limited */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:headers" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "object")}`} />
          <span className={s.pinName}>headers</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>limited</span>
          <Handle id="exec-limited" type="source" position={Position.Right} className={`${s.pin} ${s.pinExec}`} />
        </div>
      </div>

      {/* in:key + out:remaining */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="in:key" type="target" position={Position.Left} className={`${s.pin} ${pinClass(s, "string")}`} />
          <span className={s.pinName}>key</span>
        </div>
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>remaining</span>
          <Handle id="out:remaining" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "number")}`} />
        </div>
      </div>

      {/* out:rateLimitHeaders */}
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>rateLimitHeaders</span>
          <Handle id="out:rateLimitHeaders" type="source" position={Position.Right} className={`${s.pin} ${pinClass(s, "object")}`} />
        </div>
      </div>
    </div>
  );
}
