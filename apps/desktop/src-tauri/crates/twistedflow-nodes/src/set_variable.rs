//! Set Variable node — writes a named, typed runtime variable.
//! Exec node: exec-in → exec-out, data input "in:value".

use twistedflow_macros::node;
use twistedflow_engine::node::{Node, NodeCtx, NodeResult};
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

#[node(
    name = "Set Variable",
    type_id = "setVariable",
    category = "Variables",
    description = "Set a runtime variable within the flow"
)]
pub struct SetVariableNode;

impl Node for SetVariableNode {
    fn execute<'a>(
        &'a self,
        ctx: NodeCtx<'a>,
    ) -> Pin<Box<dyn Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let var_name = ctx
                .node_data
                .get("varName")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if var_name.is_empty() {
                return NodeResult::Error {
                    message: "Set Variable: no variable name specified".into(),
                    raw_response: None,
                };
            }

            // Resolve the value input
            let value = ctx
                .resolve_input("in:value")
                .await
                .unwrap_or(Value::Null);

            // Store in the runtime variables namespace.
            // We use a special prefix "__var:" in the outputs to distinguish
            // flow variables from node outputs. Get Variable reads from this.
            {
                let mut out = ctx.outputs.lock().await;
                out.entry("__variables__".to_string())
                    .or_default()
                    .insert(var_name.to_string(), value.clone());
            }

            NodeResult::Continue {
                output: Some(serde_json::json!({ "variable": var_name, "value": value })),
            }
        })
    }
}
