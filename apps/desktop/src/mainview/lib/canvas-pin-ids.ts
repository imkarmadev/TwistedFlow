import type { Edge, Node } from "@xyflow/react";
import type { PayloadField } from "./node-pins";
import type { FlowVariable } from "./variables-context";
import type { Interface } from "./flow-interface-context";
import {
  computeAssertPins,
  computeAssertTypePins,
  computeBreakObjectPins,
  computeConvertPins,
  computeCookiePins,
  computeCorsPins,
  computeEmitEventPins,
  computeEncodeDecodePins,
  computeEnvVarPins,
  computeExitPins,
  computeFileReadPins,
  computeFileWritePins,
  computeFilterPins,
  computeForEachPins,
  computeFunctionPins,
  computeGetVariablePins,
  computeHashPins,
  computeHttpListenPins,
  computeHttpRequestPins,
  computeIfElsePins,
  computeLogPins,
  computeMakeObjectPins,
  computeMapPins,
  computeMatchPins,
  computeMergePins,
  computeOnEventPins,
  computeParseArgsPins,
  computeParseBodyPins,
  computePrintPins,
  computePromptPins,
  computeRateLimitPins,
  computeRedirectPins,
  computeReducePins,
  computeRegexPins,
  computeRetryPins,
  computeRouteMatchPins,
  computeRoutePins,
  computeSendResponsePins,
  computeServeStaticPins,
  computeSetHeadersPins,
  computeSetVariablePins,
  computeShellExecPins,
  computeSleepPins,
  computeStartPins,
  computeStderrPins,
  computeStdinPins,
  computeTapPins,
  computeTemplatePins,
  computeTryCatchPins,
  computeVerifyAuthPins,
  type ComputedPins,
} from "./node-pins";

export interface PinCollectionContext {
  variables?: FlowVariable[];
  flowInterface?: Interface | null;
}

/**
 * After node data or a subflow interface changes, exposed handles may shrink.
 * Drop edges whose source or target handle no longer exists.
 */
export function cullDanglingEdges(
  edges: Edge[],
  nodes: Node[],
  context: PinCollectionContext = {},
): Edge[] {
  const pinIndex = new Map<string, Set<string>>();
  const nodeIndex = new Map<string, Node>();
  for (const n of nodes) {
    pinIndex.set(n.id, collectPinIds(n, context));
    nodeIndex.set(n.id, n);
  }

  const filtered = edges.filter((e) => {
    const srcNode = nodeIndex.get(e.source);
    const tgtPins = pinIndex.get(e.target);
    if (!srcNode || !tgtPins) return false;

    // Break-Object and On Event expose dynamic output pins that depend on
    // other graph state, so their source handles are validated elsewhere.
    const dynamicSrc = srcNode.type === "breakObject" || srcNode.type === "onEvent";
    if (!dynamicSrc) {
      const srcPins = pinIndex.get(e.source);
      if (e.sourceHandle && !srcPins?.has(e.sourceHandle)) return false;
    }

    if (e.targetHandle && !tgtPins.has(e.targetHandle)) return false;
    return true;
  });

  return filtered.length === edges.length ? edges : filtered;
}

export function collectPinIds(
  node: Node,
  { variables = [], flowInterface = null }: PinCollectionContext = {},
): Set<string> {
  let pins: ComputedPins;
  if (node.type === "start") pins = computeStartPins();
  else if (node.type === "httpRequest") pins = computeHttpRequestPins(node.data ?? {});
  else if (node.type === "envVar")
    pins = computeEnvVarPins((node.data as { varKey?: string } | undefined)?.varKey);
  else if (node.type === "breakObject") pins = computeBreakObjectPins();
  else if (node.type === "forEachSequential" || node.type === "forEachParallel")
    pins = computeForEachPins();
  else if (node.type === "convert")
    pins = computeConvertPins(
      (node.data as { targetType?: string } | undefined)?.targetType,
    );
  else if (node.type === "tap") pins = computeTapPins();
  else if (node.type === "log") pins = computeLogPins();
  else if (node.type === "setVariable") {
    const varName = (node.data as { varName?: string } | undefined)?.varName;
    const decl = variables.find((v) => v.name === varName);
    pins = computeSetVariablePins(decl?.type);
  } else if (node.type === "getVariable") {
    const varName = (node.data as { varName?: string } | undefined)?.varName;
    const decl = variables.find((v) => v.name === varName);
    pins = computeGetVariablePins(varName, decl?.type);
  }
  else if (node.type === "match")
    pins = computeMatchPins(
      (node.data as { cases?: Array<{ value: string; label?: string }> } | undefined)?.cases,
    );
  else if (node.type === "function") {
    const fd = node.data as { inputs?: PayloadField[]; outputs?: PayloadField[] } | undefined;
    pins = computeFunctionPins(fd?.inputs, fd?.outputs);
  } else if (node.type === "makeObject")
    pins = computeMakeObjectPins(
      (node.data as { fields?: PayloadField[] } | undefined)?.fields,
    );
  else if (node.type === "emitEvent")
    pins = computeEmitEventPins(
      (node.data as { payload?: PayloadField[] } | undefined)?.payload,
    );
  else if (node.type === "onEvent") {
    pins = computeOnEventPins();
  }
  else if (node.type === "parseArgs") pins = computeParseArgsPins();
  else if (node.type === "stdin") pins = computeStdinPins();
  else if (node.type === "stderr") pins = computeStderrPins();
  else if (node.type === "prompt") pins = computePromptPins();
  else if (node.type === "regex")
    pins = computeRegexPins((node.data as { mode?: string } | undefined)?.mode);
  else if (node.type === "template")
    pins = computeTemplatePins((node.data as { template?: string } | undefined)?.template);
  else if (node.type === "encodeDecode") pins = computeEncodeDecodePins();
  else if (node.type === "hash")
    pins = computeHashPins((node.data as { algorithm?: string } | undefined)?.algorithm);
  else if (node.type === "filter") pins = computeFilterPins();
  else if (node.type === "map") pins = computeMapPins();
  else if (node.type === "merge") pins = computeMergePins();
  else if (node.type === "reduce") pins = computeReducePins();
  else if (node.type === "retry") pins = computeRetryPins();
  else if (node.type === "print") pins = computePrintPins();
  else if (node.type === "shellExec") pins = computeShellExecPins();
  else if (node.type === "fileRead") pins = computeFileReadPins();
  else if (node.type === "fileWrite") pins = computeFileWritePins();
  else if (node.type === "sleep") pins = computeSleepPins();
  else if (node.type === "exit") pins = computeExitPins();
  else if (node.type === "assert") pins = computeAssertPins();
  else if (node.type === "assertType") pins = computeAssertTypePins();
  else if (node.type === "httpListen") pins = computeHttpListenPins();
  else if (node.type === "sendResponse") pins = computeSendResponsePins();
  else if (node.type === "routeMatch") pins = computeRouteMatchPins();
  else if (node.type === "ifElse") pins = computeIfElsePins();
  else if (node.type === "tryCatch") pins = computeTryCatchPins();
  else if (node.type === "route")
    pins = computeRoutePins(
      (node.data as { routes?: Array<{ method: string; path: string; label?: string }> } | undefined)?.routes,
    );
  else if (node.type === "parseBody") pins = computeParseBodyPins();
  else if (node.type === "setHeaders") pins = computeSetHeadersPins();
  else if (node.type === "cors") pins = computeCorsPins();
  else if (node.type === "verifyAuth") pins = computeVerifyAuthPins();
  else if (node.type === "rateLimit") pins = computeRateLimitPins();
  else if (node.type === "cookie")
    pins = computeCookiePins((node.data as { mode?: string } | undefined)?.mode);
  else if (node.type === "redirect") pins = computeRedirectPins();
  else if (node.type === "serveStatic") pins = computeServeStaticPins();
  else if (node.type === "customNode") {
    const def = (node.data as Record<string, unknown>)?._customDef as
      | { inputs?: Array<{ key: string }>; outputs?: Array<{ key: string }>; isAsync?: boolean }
      | undefined;
    const ids = new Set<string>();
    if (def?.isAsync) { ids.add("exec-in"); ids.add("exec-out"); }
    for (const inp of def?.inputs ?? []) ids.add(`in:${inp.key}`);
    for (const out of def?.outputs ?? []) ids.add(`out:${out.key}`);
    return ids;
  } else if (node.type === "pluginNode") {
    const pluginDef = (node.data as Record<string, unknown>)?._pluginDef as
      | { inputs?: Array<{ key: string }>; outputs?: Array<{ key: string }> }
      | undefined;
    const ids = new Set<string>();
    ids.add("exec-in");
    ids.add("exec-out");
    for (const inp of pluginDef?.inputs ?? []) ids.add(`in:${inp.key}`);
    for (const out of pluginDef?.outputs ?? []) ids.add(`out:${out.key}`);
    return ids;
  } else if (node.type === "subflowInputs") {
    return collectSubflowInputNodePins(flowInterface);
  } else if (node.type === "subflowOutputs") {
    return collectSubflowOutputNodePins(flowInterface);
  } else if (node.type === "subflowCall") {
    const def = (node.data as Record<string, unknown>)?._subflowDef as
      | { inputs?: Array<{ key: string; dataType: string }>; outputs?: Array<{ key: string; dataType: string }> }
      | undefined;
    const ids = new Set<string>();
    const execOutCount = (def?.outputs ?? []).filter((p) => p.dataType === "exec").length;
    for (const inp of def?.inputs ?? []) {
      ids.add(inp.dataType === "exec" ? `exec-in:${inp.key}` : `in:${inp.key}`);
    }
    for (const out of def?.outputs ?? []) {
      ids.add(out.dataType === "exec"
        ? execOutCount > 1 ? `out:${out.key}` : "exec-out"
        : `out:${out.key}`);
    }
    return ids;
  } else pins = { inputs: [], outputs: [] };
  return new Set([...pins.inputs.map((p) => p.id), ...pins.outputs.map((p) => p.id)]);
}

function collectSubflowInputNodePins(flowInterface: Interface | null): Set<string> {
  const ids = new Set<string>();
  let seenExec = false;
  for (const pin of flowInterface?.inputs ?? []) {
    if (pin.type === "exec") {
      ids.add(seenExec ? `exec-out:${pin.key}` : "exec-out");
      seenExec = true;
    } else {
      ids.add(`out:${pin.key}`);
    }
  }
  return ids;
}

function collectSubflowOutputNodePins(flowInterface: Interface | null): Set<string> {
  const ids = new Set<string>(["exec-in"]);
  for (const pin of flowInterface?.outputs ?? []) {
    if (pin.type !== "exec") ids.add(`in:${pin.key}`);
  }
  return ids;
}
