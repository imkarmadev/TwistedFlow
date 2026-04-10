//! Parse `.flow.json` files (domain format) and convert to engine graph format.
//!
//! Domain format (used by the desktop app + export files):
//!   nodes: [{ id, kind, position, config }]
//!   edges: [{ id, kind: "exec"|"data", fromNode, fromPin, toNode, toPin }]
//!
//! Engine format (used by the executor):
//!   nodes: [{ id, type, data }]
//!   edges: [{ source, sourceHandle, target, targetHandle, data: { kind } }]

use crate::graph::{EdgeData, EdgeKind, FlowGraph, GraphEdge, GraphNode};
use serde::Deserialize;
use serde_json::Value;

/// The on-disk `.flow.json` structure.
#[derive(Debug, Deserialize)]
pub struct FlowFile {
    #[serde(default)]
    pub twistedflow: u32,
    #[serde(default)]
    pub name: String,
    pub nodes: Vec<DomainNode>,
    pub edges: Vec<DomainEdge>,
}

#[derive(Debug, Deserialize)]
pub struct DomainNode {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub position: Option<Value>,
    #[serde(default)]
    pub config: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainEdge {
    pub id: String,
    pub kind: String,
    pub from_node: String,
    pub from_pin: String,
    pub to_node: String,
    pub to_pin: String,
}

impl FlowFile {
    /// Parse a `.flow.json` string.
    pub fn parse(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("Invalid flow file: {}", e))
    }

    /// Convert to engine graph format.
    pub fn to_graph(&self) -> FlowGraph {
        let nodes = self
            .nodes
            .iter()
            .map(|n| GraphNode {
                id: n.id.clone(),
                node_type: Some(n.kind.clone()),
                data: if n.config.is_null() {
                    Value::Object(serde_json::Map::new())
                } else {
                    n.config.clone()
                },
            })
            .collect();

        let edges = self
            .edges
            .iter()
            .map(|e| GraphEdge {
                source: e.from_node.clone(),
                source_handle: Some(e.from_pin.clone()),
                target: e.to_node.clone(),
                target_handle: Some(e.to_pin.clone()),
                data: Some(EdgeData {
                    kind: Some(match e.kind.as_str() {
                        "exec" => EdgeKind::Exec,
                        "data" => EdgeKind::Data,
                        _ => EdgeKind::Data,
                    }),
                }),
            })
            .collect();

        FlowGraph { nodes, edges }
    }
}
