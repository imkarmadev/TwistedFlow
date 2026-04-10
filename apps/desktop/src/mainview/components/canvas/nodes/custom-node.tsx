/**
 * Custom node — renders any node loaded from a .ts file in the custom
 * nodes directory. The actual definition (name, inputs, outputs, execute
 * source) is stored in the node's `data._customDef`.
 *
 * Three visual modes based on the definition:
 *   - Sync (no async, no emits): pure data node, no exec pins
 *   - Async blocking (async: true, no emits): exec pins, chain waits
 *   - Async + event (async: true, emits: "name"): exec pins + event tag
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";
import type { CustomNodeDef } from "../../../lib/custom-node-loader";

export function CustomNode({ id, data, selected }: NodeProps) {
  const def = (data as Record<string, unknown>)?._customDef as CustomNodeDef | undefined;
  const name = def?.name ?? "Custom";
  const inputs = def?.inputs ?? [];
  const outputs = def?.outputs ?? [];
  const hasExec = def?.isAsync ?? false;
  const emits = def?.emits;

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
        <span className={s.customBadge}>{emits ? "ASYNC" : hasExec ? "EXEC" : "FN"}</span>
        <span className={s.headerTitle}>{name}</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {emits ? `emits → ${emits}` : `${inputs.length} in → ${outputs.length} out`}
          </span>
        </div>
      </div>

      {/* Exec row (only for async nodes) */}
      {hasExec && (
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
      )}

      {/* Data pins — pair inputs and outputs row by row */}
      {Array.from({ length: Math.max(inputs.length, outputs.length) }, (_, i) => {
        const inp = inputs[i];
        const out = outputs[i];
        return (
          <div className={s.pinRow} key={i}>
            {inp ? (
              <div className={s.pinLabelLeft}>
                <Handle
                  id={`in:${inp.key}`}
                  type="target"
                  position={Position.Left}
                  className={`${s.pin} ${pinClass(s, inp.type)}`}
                />
                <span className={s.pinName}>{inp.key}</span>
              </div>
            ) : (
              <span className={s.pinSpacer} />
            )}
            {out ? (
              <div className={s.pinLabelRight}>
                <span className={s.pinName}>{out.key}</span>
                <Handle
                  id={`out:${out.key}`}
                  type="source"
                  position={Position.Right}
                  className={`${s.pin} ${pinClass(s, out.type)}`}
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
