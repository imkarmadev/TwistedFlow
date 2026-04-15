/**
 * Route node — multi-route dispatcher with path param extraction.
 *
 *   method ──► [ ROUTE ]
 *   path   ──►          ──► GET /users       (exec)
 *   query  ──►          ──► GET /users/:id   (exec)
 *                        ──► POST /users      (exec)
 *                        ──► not found        (exec)
 *                        ──► params           (data)
 *                        ──► query            (data)
 *
 * Each configured route gets its own exec output. The "not found"
 * fallback always appears last.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import s from "./node.module.css";
import { pinClass } from "../../../lib/pin-classes";
import { useFlowExec } from "../../../lib/exec-context";

export interface RouteEntry {
  method: string;
  path: string;
  label?: string;
}

export interface RouteNodeData {
  routes?: RouteEntry[];
}

export function RouteNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as RouteNodeData;
  const routes = d.routes ?? [];

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
        <span className={s.matchBadge}>ROUTE</span>
        <span className={s.headerTitle}>
          {routes.length === 0
            ? "no routes"
            : `${routes.length} route${routes.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Row 1: exec-in + first route */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle
            id="exec-in"
            type="target"
            position={Position.Left}
            className={`${s.pin} ${s.pinExec}`}
          />
          <span className={s.pinName}>exec</span>
        </div>
        {routes.length > 0 && (
          <div className={s.pinLabelRight}>
            <span className={s.pinName}>
              {routes[0]!.label || `${routes[0]!.method} ${routes[0]!.path}`}
            </span>
            <Handle
              id="exec-route:0"
              type="source"
              position={Position.Right}
              className={`${s.pin} ${s.pinExec}`}
            />
          </div>
        )}
      </div>

      {/* Row 2: in:method + second route */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle
            id="in:method"
            type="target"
            position={Position.Left}
            className={`${s.pin} ${pinClass(s, "string")}`}
          />
          <span className={s.pinName}>method</span>
        </div>
        {routes.length > 1 ? (
          <div className={s.pinLabelRight}>
            <span className={s.pinName}>
              {routes[1]!.label || `${routes[1]!.method} ${routes[1]!.path}`}
            </span>
            <Handle
              id="exec-route:1"
              type="source"
              position={Position.Right}
              className={`${s.pin} ${s.pinExec}`}
            />
          </div>
        ) : <span className={s.pinSpacer} />}
      </div>

      {/* Row 3: in:path + third route */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle
            id="in:path"
            type="target"
            position={Position.Left}
            className={`${s.pin} ${pinClass(s, "string")}`}
          />
          <span className={s.pinName}>path</span>
        </div>
        {routes.length > 2 ? (
          <div className={s.pinLabelRight}>
            <span className={s.pinName}>
              {routes[2]!.label || `${routes[2]!.method} ${routes[2]!.path}`}
            </span>
            <Handle
              id="exec-route:2"
              type="source"
              position={Position.Right}
              className={`${s.pin} ${s.pinExec}`}
            />
          </div>
        ) : <span className={s.pinSpacer} />}
      </div>

      {/* Row 4: in:query + fourth route */}
      <div className={s.pinRow}>
        <div className={s.pinLabelLeft}>
          <Handle
            id="in:query"
            type="target"
            position={Position.Left}
            className={`${s.pin} ${pinClass(s, "string")}`}
          />
          <span className={s.pinName}>query</span>
        </div>
        {routes.length > 3 ? (
          <div className={s.pinLabelRight}>
            <span className={s.pinName}>
              {routes[3]!.label || `${routes[3]!.method} ${routes[3]!.path}`}
            </span>
            <Handle
              id="exec-route:3"
              type="source"
              position={Position.Right}
              className={`${s.pin} ${s.pinExec}`}
            />
          </div>
        ) : <span className={s.pinSpacer} />}
      </div>

      {/* Remaining route outputs (from index 4+) */}
      {routes.slice(4).map((r, i) => (
        <div className={s.pinRow} key={i + 4}>
          <span className={s.pinSpacer} />
          <div className={s.pinLabelRight}>
            <span className={s.pinName}>
              {r.label || `${r.method} ${r.path}`}
            </span>
            <Handle
              id={`exec-route:${i + 4}`}
              type="source"
              position={Position.Right}
              className={`${s.pin} ${s.pinExec}`}
            />
          </div>
        </div>
      ))}

      {/* Not Found — always present */}
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>not found</span>
          <Handle
            id="exec-notFound"
            type="source"
            position={Position.Right}
            className={`${s.pin} ${s.pinExec}`}
          />
        </div>
      </div>

      {/* Data outputs: params + query */}
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>params</span>
          <Handle
            id="out:params"
            type="source"
            position={Position.Right}
            className={`${s.pin} ${pinClass(s, "object")}`}
          />
        </div>
      </div>
      <div className={s.pinRow}>
        <span className={s.pinSpacer} />
        <div className={s.pinLabelRight}>
          <span className={s.pinName}>query</span>
          <Handle
            id="out:query"
            type="source"
            position={Position.Right}
            className={`${s.pin} ${pinClass(s, "object")}`}
          />
        </div>
      </div>
    </div>
  );
}
