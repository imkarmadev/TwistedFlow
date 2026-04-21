/**
 * Inputs node — entry of a subflow. Renders one pin per declaration in
 * `flow.interface.inputs`: exec-typed pins become exec handles, data-typed
 * pins become colored data handles. All pins are on the right side
 * (outputs) since this node exposes the subflow's inputs to the canvas
 * inside the subflow.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";
import { useFlowInterface } from "../../../lib/flow-interface-context";
import type { DataType } from "@twistedflow/core";

export function SubflowInputsNode({ id, selected }: NodeProps) {
  const { interface: iface } = useFlowInterface();
  const pins = iface?.inputs ?? [];

  const { statuses } = useFlowExec();
  const status = statuses[id] ?? "idle";
  const statusClass =
    status === "running" ? s.statusRunning
    : status === "ok" ? s.statusOk
    : status === "error" ? s.statusError
    : status === "pending" ? s.statusPending
    : "";

  return (
    <div className={clsx(s.node, s.subflowInputsNode, selected && s.nodeSelected, statusClass)}>
      <div className={`${s.header} ${s.headerSubflowIn}`}>
        <span className={s.headerIcon}>⇥</span>
        <span className={s.headerTitle}>Inputs</span>
      </div>

      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>
            {pins.length === 0 ? "no inputs declared" : `${pins.length} output${pins.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {(() => {
        // First exec input → always `exec-out` so run_chain's default advance
        // finds it. Extra exec inputs are rare (UE Functions have just one);
        // for now they render as `exec-out:<key>` and are routed only if the
        // caller explicitly wires via that handle id.
        let seenExec = false;
        return pins.map((pin) => {
          const isExec = pin.type === "exec";
          const handleId = isExec
            ? seenExec ? `exec-out:${pin.key}` : "exec-out"
            : `out:${pin.key}`;
          if (isExec) seenExec = true;
          return (
            <div className={s.pinRow} key={pin.key}>
              <span className={s.pinSpacer} />
              <div className={s.pinLabelRight}>
                <span className={s.pinName}>{pin.key}</span>
                <Handle
                  id={handleId}
                  type="source"
                  position={Position.Right}
                  className={
                    isExec
                      ? `${s.pin} ${s.pinExec}`
                      : `${s.pin} ${pinClass(s, pin.type as DataType)}`
                  }
                />
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}
