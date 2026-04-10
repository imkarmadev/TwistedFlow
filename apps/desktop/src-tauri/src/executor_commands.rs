//! Tauri commands for flow execution — bridges the Rust engine to the frontend.

use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use twistedflow_engine::{
    ExecContext, FlowGraph, GraphIndex, LogEntry, RunFlowOpts, StatusEvent,
};

/// Shared state for the active run. One run at a time.
pub struct ExecutorState {
    pub cancel: std::sync::Mutex<Option<CancellationToken>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusEventPayload {
    node_id: String,
    #[serde(flatten)]
    event: StatusEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEntryPayload {
    node_id: String,
    label: String,
    value: serde_json::Value,
}

#[tauri::command]
pub async fn run_flow(
    app: AppHandle,
    nodes: serde_json::Value,
    edges: serde_json::Value,
    context: serde_json::Value,
    executor_state: State<'_, ExecutorState>,
) -> Result<(), String> {
    // Deserialize graph
    let graph_nodes = serde_json::from_value(nodes).map_err(|e| format!("Invalid nodes: {}", e))?;
    let graph_edges = serde_json::from_value(edges).map_err(|e| format!("Invalid edges: {}", e))?;
    let exec_ctx: ExecContext =
        serde_json::from_value(context).map_err(|e| format!("Invalid context: {}", e))?;

    let graph = FlowGraph {
        nodes: graph_nodes,
        edges: graph_edges,
    };
    let index = Arc::new(GraphIndex::build(&graph));

    // Set up cancellation
    let cancel = CancellationToken::new();
    {
        let mut guard = executor_state.cancel.lock().unwrap();
        // Cancel any previously running flow
        if let Some(old) = guard.take() {
            old.cancel();
        }
        *guard = Some(cancel.clone());
    }

    // Status emitter → Tauri events
    let app_for_status = app.clone();
    let on_status: Box<dyn Fn(&str, StatusEvent) + Send + Sync> =
        Box::new(move |node_id: &str, event: StatusEvent| {
            let payload = StatusEventPayload {
                node_id: node_id.to_owned(),
                event,
            };
            let _ = app_for_status.emit("flow:status", &payload);
        });

    // Log emitter → Tauri events
    let app_for_log = app.clone();
    let on_log: Box<dyn Fn(LogEntry) + Send + Sync> = Box::new(move |entry: LogEntry| {
        let payload = LogEntryPayload {
            node_id: entry.node_id,
            label: entry.label,
            value: entry.value,
        };
        let _ = app_for_log.emit("flow:log", &payload);
    });

    // Build reqwest client
    let http_client = reqwest::Client::builder()
        .user_agent("TwistedFlow/0.3")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Build the node registry: built-in nodes (via inventory) + WASM plugins.
    let mut registry = twistedflow_engine::build_registry();

    // Load WASM plugins from default + project-specific directories
    let plugin_dirs = vec![twistedflow_engine::DEFAULT_PLUGINS_DIR];
    let wasm_nodes = twistedflow_engine::load_wasm_plugins(&plugin_dirs);
    for (type_id, node, _meta) in wasm_nodes {
        registry.insert(type_id, node);
    }

    let opts = Arc::new(RunFlowOpts {
        index,
        context: exec_ctx,
        on_status,
        on_log,
        cancel: cancel.clone(),
        http_client,
        registry,
    });

    // Run the engine
    let result = twistedflow_engine::run_flow(opts).await;

    // Clear cancel token
    {
        let mut guard = executor_state.cancel.lock().unwrap();
        *guard = None;
    }

    result
}

#[tauri::command]
pub fn stop_flow(executor_state: State<'_, ExecutorState>) -> Result<(), String> {
    let guard = executor_state.cancel.lock().unwrap();
    if let Some(token) = guard.as_ref() {
        token.cancel();
    }
    Ok(())
}

/// Return metadata for all available node types (built-in + WASM plugins).
#[tauri::command]
pub fn list_node_types() -> serde_json::Value {
    let mut all = Vec::new();

    // Built-in nodes
    for meta in twistedflow_engine::all_node_metadata() {
        all.push(serde_json::to_value(meta).unwrap_or_default());
    }

    // WASM plugins
    let plugin_dirs = vec![twistedflow_engine::DEFAULT_PLUGINS_DIR];
    let wasm_nodes = twistedflow_engine::load_wasm_plugins(&plugin_dirs);
    for (_type_id, _node, meta) in wasm_nodes {
        all.push(serde_json::to_value(&meta).unwrap_or_default());
    }

    serde_json::Value::Array(all)
}
