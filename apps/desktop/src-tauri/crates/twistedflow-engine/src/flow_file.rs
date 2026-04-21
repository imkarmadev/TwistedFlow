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
use crate::node::VariableDecl;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Flow kind — "main" is a regular entry flow, "subflow" is a reusable
/// callable flow that appears in the palette as a node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlowKind {
    Main,
    Subflow,
}

impl Default for FlowKind {
    fn default() -> Self {
        FlowKind::Main
    }
}

/// A single pin declaration in a subflow's interface.
/// `pin_type` is a string (e.g. "exec", "string", "number") so we can use
/// the same map on the frontend without going through DataType enum tricks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinDecl {
    pub key: String,
    #[serde(rename = "type")]
    pub pin_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
}

/// The I/O contract of a subflow — input pins (from Inputs node) and
/// output pins (from Outputs node).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Interface {
    #[serde(default)]
    pub inputs: Vec<PinDecl>,
    #[serde(default)]
    pub outputs: Vec<PinDecl>,
}

/// The on-disk `.flow.json` structure.
#[derive(Debug, Deserialize)]
pub struct FlowFile {
    #[serde(default)]
    pub twistedflow: u32,
    #[serde(default)]
    pub name: String,
    /// `main` (default) or `subflow`. Missing field = main.
    #[serde(default)]
    pub kind: FlowKind,
    /// Subflow palette category. Ignored for main flows.
    #[serde(default)]
    pub category: Option<String>,
    /// Subflow I/O contract. None for main flows; Some with 0+ pins for subflows.
    #[serde(default)]
    pub interface: Option<Interface>,
    /// Flow-scoped typed variable declarations. Each flow (main or subflow)
    /// owns its own set — subflow variables are NOT visible to the parent
    /// and vice versa (isolated scope).
    #[serde(default)]
    pub variables: Option<Vec<VariableDecl>>,
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
