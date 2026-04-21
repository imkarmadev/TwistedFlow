/**
 * Outputs node — terminal return of a subflow. One exec-in pin (always)
 * plus one data-in pin per non-exec output declared in the interface.
 *
 * Each Outputs node represents ONE return branch, selected via the
 * `branch` config dropdown (populated from the interface's exec outputs).
 * Drop multiple Outputs nodes on the canvas to route different branches
 * — e.g. one configured with `branch: "ok"` and another with `branch:
 * "err"`. Whichever one the chain reaches first wins the return.
 */

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";
import { useFlowInterface } from "../../../lib/flow-interface-context";
import type { DataType } from "@twistedflow/core";

export function SubflowOutputsNode({ id, data, selected }: NodeProps) {
  const { interface: iface } = useFlowInterface();
  const { setNodes } = useReactFlow();

  const execOutputs = (iface?.outputs ?? []).filter((p) => p.type === "exec");
  const dataOutputs = (iface?.outputs ?? []).filter((p) => p.type !== "exec");

  const branch = (data as { branch?: string } | undefined)?.branch
    ?? execOutputs[0]?.key
    ?? "";

  const setBranch = (next: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...(n.data ?? {}), branch: next } } : n,
      ),
    );
  };

  const { statuses } = useFlowExec();
  const status = statuses[id] ?? "idle";
  const statusClass =
    status === "running" ? s.statusRunning
    : status === "ok" ? s.statusOk
    : status === "error" ? s.statusError
    : status === "pending" ? s.statusPending
    : "";

  return (
    <div className={clsx(s.node, s.subflowOutputsNode, selected && s.nodeSelected, statusClass)}>
      <div className={`${s.header} ${s.headerSubflowOut}`}>
        <span className={s.headerIcon}>⇤</span>
        <span className={s.headerTitle}>Outputs</span>
      </div>

      <div className={s.body}>
        {execOutputs.length > 1 ? (
          <>
            <label className={s.fieldLabel}>Branch</label>
            <select
              className={`${s.envSelect} nodrag`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              {execOutputs.map((p) => (
                <option key={p.key} value={p.key}>{p.key}</option>
              ))}
            </select>
          </>
        ) : (
          <div className={s.urlText}>
            <span className={s.muted}>
              {execOutputs.length === 1 ? `branch: ${execOutputs[0].key}` : "no exec output"}
            </span>
          </div>
        )}
      </div>

      {/* Always-present exec-in pin */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle id="exec-in" type="target" position={Position.Left} className={`${s.pin} ${s.pinExec}`} />
          <span className={s.pinName}>exec</span>
        </div>
        <span className={s.pinSpacer} />
      </div>

      {dataOutputs.map((pin) => (
        <div className={s.pinRow} key={pin.key}>
          <div className={s.pinLabelLeft}>
            <Handle
              id={`in:${pin.key}`}
              type="target"
              position={Position.Left}
              className={`${s.pin} ${pinClass(s, pin.type as DataType)}`}
            />
            <span className={s.pinName}>{pin.key}</span>
          </div>
          <span className={s.pinSpacer} />
        </div>
      ))}
    </div>
  );
}
