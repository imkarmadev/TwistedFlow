//! Send Response node — writes an HTTP response back to the client.
//!
//! Used inside an HTTP Listen's request chain. Reads the listen node ID
//! from the chain's outputs to find the response slot, then writes
//! status, headers, and body to it.

use twistedflow_macros::node;
use twistedflow_engine::node::{Node, NodeCtx, NodeResult};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use crate::http_listen::{get_response_slot, HttpResponseData};

#[node(
    name = "Send Response",
    type_id = "sendResponse",
    category = "HTTP Server",
    description = "Send an HTTP response back to the client"
)]
pub struct SendResponseNode;

impl Node for SendResponseNode {
    fn execute<'a>(
        &'a self,
        ctx: NodeCtx<'a>,
    ) -> Pin<Box<dyn Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            // Read status from node_data or input
            let status = if let Some(val) = ctx.resolve_input("in:status").await {
                val.as_u64().unwrap_or(200) as u16
            } else {
                ctx.node_data.get("status")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(200) as u16
            };

            // Read body from input
            let body = ctx.resolve_input("in:body").await.unwrap_or(Value::Null);
            let body_str = match &body {
                Value::String(s) => s.clone(),
                Value::Null => String::new(),
                other => serde_json::to_string(other).unwrap_or_default(),
            };

            // Read headers from node_data
            let mut headers = HashMap::new();
            if let Some(Value::Array(arr)) = ctx.node_data.get("headers") {
                for h in arr {
                    let key = h.get("key").and_then(|v| v.as_str()).unwrap_or("");
                    let val = h.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    if !key.is_empty() {
                        headers.insert(key.to_string(), val.to_string());
                    }
                }
            }

            // Find the listen node ID by walking up the output chain
            // The HTTP Listen node stores "_listenNodeId" in its outputs
            let listen_node_id = {
                let out = ctx.outputs.lock().await;
                // Search through all outputs for one with _listenNodeId
                let mut found = None;
                for (_node_id, node_out) in out.iter() {
                    if let Some(Value::String(id)) = node_out.get("_listenNodeId") {
                        found = Some(id.clone());
                        break;
                    }
                }
                found
            };

            if let Some(listen_id) = listen_node_id {
                let slot = get_response_slot(&listen_id);
                *slot.lock().await = Some(HttpResponseData {
                    status,
                    headers: headers.clone(),
                    body: body_str.clone(),
                });
            }

            NodeResult::Continue {
                output: Some(json!({
                    "status": status,
                    "bodyLength": body_str.len(),
                })),
            }
        })
    }
}
