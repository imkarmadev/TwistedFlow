/**
 * Plugin node — renders a WASM plugin node loaded from ~/.twistedflow/plugins/.
 * The definition (name, inputs, outputs) is stored in `data._pluginDef`.
 *
 * All plugin nodes are exec nodes (exec-in → exec-out) with typed
 * data input/output pins declared in the plugin metadata.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";
import type { DataType } from "@twistedflow/core";

export interface PluginNodeDef {
  name: string;
  typeId: string;
  category: string;
  description: string;
  inputs: Array<{ key: string; dataType: string }>;
  outputs: Array<{ key: string; dataType: string }>;
}

export function PluginNode({ id, data, selected }: NodeProps) {
  const def = (data as Record<string, unknown>)?._pluginDef as PluginNodeDef | undefined;
  const name = def?.name ?? "Plugin";
  const inputs = def?.inputs ?? [];
  const outputs = def?.outputs ?? [];

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
        <span className={s.customBadge}>WASM</span>
        <span className={s.headerTitle}>{name}</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {`${inputs.length} in → ${outputs.length} out`}
          </span>
        </div>
      </div>

      {/* Exec pins */}
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

      {/* Data pins */}
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
                  className={`${s.pin} ${pinClass(s, (inp.dataType || "unknown") as DataType)}`}
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
                  className={`${s.pin} ${pinClass(s, (out.dataType || "unknown") as DataType)}`}
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
