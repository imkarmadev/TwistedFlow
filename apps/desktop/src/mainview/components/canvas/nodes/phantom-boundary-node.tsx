/**
 * Phantom boundary nodes shown inside drill-down view of a collapsed
 * group. Not persistent, not selectable, not draggable — they just
 * expose the pins that cross the group boundary so the user can see
 * exactly what's coming in from outside (left phantom) and what's going
 * out to outside (right phantom).
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import type { BoundaryPin } from "../../../lib/groups";
import type { DataType } from "@twistedflow/core";

interface PhantomData {
  _pins: BoundaryPin[];
  _label: string;
}

export function PhantomInputsNode({ data }: NodeProps) {
  const d = data as unknown as PhantomData;
  return (
    <div className={`${s.node} ${s.phantomNode}`}>
      <div className={`${s.header} ${s.headerPhantom}`}>
        <span className={s.headerTitle}>{d._label}</span>
      </div>
      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>{d._pins.length} pin{d._pins.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      {d._pins.map((pin) => (
        <div className={s.pinRow} key={pin.id}>
          <span className={s.pinSpacer} />
          <div className={s.pinLabelRight}>
            <span className={s.pinName}>{pin.label}</span>
            <Handle
              id={pin.id}
              type="source"
              position={Position.Right}
              className={
                pin.kind === "exec"
                  ? `${s.pin} ${s.pinExec}`
                  : `${s.pin} ${pinClass(s, (pin.dataType ?? "unknown") as DataType)}`
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PhantomOutputsNode({ data }: NodeProps) {
  const d = data as unknown as PhantomData;
  return (
    <div className={`${s.node} ${s.phantomNode}`}>
      <div className={`${s.header} ${s.headerPhantom}`}>
        <span className={s.headerTitle}>{d._label}</span>
      </div>
      <div className={s.body}>
        <div className={s.urlText}>
          <span className={s.muted}>{d._pins.length} pin{d._pins.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      {d._pins.map((pin) => (
        <div className={s.pinRow} key={pin.id}>
          <div className={s.pinLabelLeft}>
            <Handle
              id={pin.id}
              type="target"
              position={Position.Left}
              className={
                pin.kind === "exec"
                  ? `${s.pin} ${s.pinExec}`
                  : `${s.pin} ${pinClass(s, (pin.dataType ?? "unknown") as DataType)}`
              }
            />
            <span className={s.pinName}>{pin.label}</span>
          </div>
          <span className={s.pinSpacer} />
        </div>
      ))}
    </div>
  );
}
