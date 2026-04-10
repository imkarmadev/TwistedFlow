//! Env Setter node — patches all matching EnvVar nodes in the shared output cache.

use twistedflow_macros::node;
use twistedflow_engine::node::{Node, NodeCtx, NodeResult};
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

#[node(
    name = "Env Setter",
    type_id = "envSetter",
    category = "Variables",
    description = "Set an environment variable at runtime"
)]
pub struct EnvSetterNode;

impl Node for EnvSetterNode {
    fn execute<'a>(
        &'a self,
        ctx: NodeCtx<'a>,
    ) -> Pin<Box<dyn Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let var_key = ctx
                .node_data
                .get("varKey")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if let Some(key) = var_key {
                let value = ctx.resolve_input("in:value").await;

                // Collect matching envVar node IDs first to avoid holding the index borrow
                // while we await the lock.
                let matching_ids: Vec<String> = ctx
                    .index
                    .nodes
                    .values()
                    .filter(|n| {
                        n.node_type.as_deref() == Some("envVar")
                            && n.data
                                .get("varKey")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                == key
                    })
                    .map(|n| n.id.clone())
                    .collect();

                let mut out = ctx.outputs.lock().await;
                for id in matching_ids {
                    out.entry(id)
                        .or_default()
                        .insert("value".into(), value.clone().unwrap_or(Value::Null));
                }
            }

            NodeResult::Continue { output: None }
        })
    }
}
