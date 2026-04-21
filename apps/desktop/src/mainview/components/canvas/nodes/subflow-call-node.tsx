/**
 * Subflow call node — renders a call site for a project subflow.
 *
 * Metadata is stored in `data._subflowDef` (shape mirrors plugin nodes).
 * Pins come from the subflow's interface: exec-typed pins become exec
 * handles, others become typed data handles.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { createContext, useContext } from "react";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";
import type { DataType } from "@twistedflow/core";

export interface SubflowDef {
  name: string;
  typeId: string;
  category: string;
  description: string;
  inputs: Array<{ key: string; dataType: string }>;
  outputs: Array<{ key: string; dataType: string }>;
}

/** Provided by FlowCanvas. Triggered when the user opens a subflow from its
 *  call node (either via the header button or by double-clicking the node). */
export const SubflowNavContext = createContext<(name: string) => void>(() => {});

export function SubflowCallNode({ id, data, selected }: NodeProps) {
  const navigateToSubflow = useContext(SubflowNavContext);
  const def = (data as Record<string, unknown>)?._subflowDef as SubflowDef | undefined;
  const name = def?.name ?? "Subflow";
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

  const rows = Math.max(inputs.length, outputs.length);

  const openSubflow = () => {
    if (def?.name) navigateToSubflow(def.name);
  };

  return (
    <div
      className={clsx(s.node, s.customNodeEl, selected && s.nodeSelected, statusClass)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        openSubflow();
      }}
    >
      <div className={`${s.header} ${s.headerCustom}`}>
        <span className={s.customBadge}>SUBFLOW</span>
        <span className={s.headerTitle}>{name}</span>
        <span
          className={s.subflowOpenBtn}
          title="Open subflow"
          onClick={(e) => {
            e.stopPropagation();
            openSubflow();
          }}
        >
          ↗
        </span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {`${inputs.length} in → ${outputs.length} out`}
          </span>
        </div>
      </div>

      {Array.from({ length: rows }, (_, i) => {
        const inp = inputs[i];
        const out = outputs[i];

        const inpIsExec = inp?.dataType === "exec";
        const outIsExec = out?.dataType === "exec";

        return (
          <div className={s.pinRow} key={i}>
            {inp ? (
              <div className={s.pinLabelLeft}>
                <Handle
                  id={inpIsExec ? `exec-in:${inp.key}` : `in:${inp.key}`}
                  type="target"
                  position={Position.Left}
                  className={
                    inpIsExec
                      ? `${s.pin} ${s.pinExec}`
                      : `${s.pin} ${pinClass(s, (inp.dataType || "unknown") as DataType)}`
                  }
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
                  id={outIsExec ? (outputs.filter(o => o.dataType === "exec").length > 1 ? `out:${out.key}` : "exec-out") : `out:${out.key}`}
                  type="source"
                  position={Position.Right}
                  className={
                    outIsExec
                      ? `${s.pin} ${s.pinExec}`
                      : `${s.pin} ${pinClass(s, (out.dataType || "unknown") as DataType)}`
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
