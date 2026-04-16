//! TwistedFlow Plugin SDK — guest-side library for WASM plugin nodes.
//!
//! Plugin authors depend on this crate to define custom nodes that
//! compile to `.wasm` and load into TwistedFlow at runtime.
//!
//! # Example
//!
//! ```rust,ignore
//! use twistedflow_plugin::*;
//!
//! nodes! {
//!     node "UUID Generator" (type_id = "uuidGen", category = "Utility") {
//!         outputs: [{ key: "uuid", data_type: "string" }],
//!         execute: |_inputs| {
//!             // Simple UUID v4 using random bytes
//!             let uuid = format!("{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
//!                 random_u32(), random_u16(), random_u16() & 0xfff,
//!                 (random_u16() & 0x3fff) | 0x8000, random_u64() & 0xffffffffffff);
//!             PluginOutputs::new().set("uuid", uuid)
//!         }
//!     }
//! }
//! ```

pub use serde_json::{self, Value};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Host callbacks ──────────────────────────────────────────────────
//
// Plugins can call these to interact with the TwistedFlow host at runtime.
// The host implements them via wasmtime Linker::func_wrap.

/// Host-provided functions. These route to the TwistedFlow host when the
/// plugin is running inside the engine. In test/unit contexts (non-WASM)
/// they are no-ops.
pub mod host {
    #[cfg(target_arch = "wasm32")]
    #[link(wasm_import_module = "env")]
    extern "C" {
        fn tf_log(ptr: *const u8, len: u32);
    }

    /// Log a message from the plugin. Appears in the TwistedFlow console
    /// panel under the calling node's id. Safe to call from anywhere in
    /// a node's `execute` body.
    ///
    /// In the CLI, messages print to stdout prefixed with `[plugin]`.
    pub fn log(msg: &str) {
        #[cfg(target_arch = "wasm32")]
        {
            let bytes = msg.as_bytes();
            unsafe { tf_log(bytes.as_ptr(), bytes.len() as u32) }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let _ = msg;
        }
    }
}

// ── Plugin metadata ─────────────────────────────────────────────────

/// Pin definition for a plugin node's inputs/outputs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinDef {
    pub key: String,
    #[serde(default = "default_data_type")]
    pub data_type: String,
}

fn default_data_type() -> String {
    "unknown".to_string()
}

/// Metadata for a single plugin node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginNodeDef {
    pub name: String,
    pub type_id: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub inputs: Vec<PinDef>,
    #[serde(default)]
    pub outputs: Vec<PinDef>,
}

// ── Plugin inputs/outputs ───────────────────────────────────────────

/// Typed accessor for node input values.
pub struct PluginInputs {
    data: HashMap<String, Value>,
}

impl PluginInputs {
    pub fn from_json(json: &str) -> Self {
        let data: HashMap<String, Value> =
            serde_json::from_str(json).unwrap_or_default();
        Self { data }
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key)
    }

    pub fn get_string(&self, key: &str) -> Option<String> {
        self.data.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
    }

    pub fn get_number(&self, key: &str) -> Option<f64> {
        self.data.get(key).and_then(|v| v.as_f64())
    }

    pub fn get_bool(&self, key: &str) -> Option<bool> {
        self.data.get(key).and_then(|v| v.as_bool())
    }

    pub fn get_object(&self, key: &str) -> Option<&serde_json::Map<String, Value>> {
        self.data.get(key).and_then(|v| v.as_object())
    }

    pub fn get_array(&self, key: &str) -> Option<&Vec<Value>> {
        self.data.get(key).and_then(|v| v.as_array())
    }

    /// Get raw Value, useful for passing through unchanged.
    pub fn get_value(&self, key: &str) -> Value {
        self.data.get(key).cloned().unwrap_or(Value::Null)
    }
}

/// Builder for node output values.
pub struct PluginOutputs {
    data: HashMap<String, Value>,
}

impl PluginOutputs {
    pub fn new() -> Self {
        Self { data: HashMap::new() }
    }

    pub fn set(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.data.insert(key.to_string(), value.into());
        self
    }

    pub fn set_value(mut self, key: &str, value: Value) -> Self {
        self.data.insert(key.to_string(), value);
        self
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.data).unwrap_or_else(|_| "{}".to_string())
    }
}

impl Default for PluginOutputs {
    fn default() -> Self {
        Self::new()
    }
}

// ── ABI helpers for WASM exports ────────────────────────────────────

/// Write a string to WASM linear memory and return a pointer.
/// The format is: [u32 length][utf-8 bytes]
/// The host reads the length prefix to know how many bytes to read.
#[doc(hidden)]
pub fn __write_string_to_memory(s: &str) -> *const u8 {
    let bytes = s.as_bytes();
    let len = bytes.len() as u32;
    // Allocate: 4 bytes for length + string bytes
    let layout = std::alloc::Layout::from_size_align(4 + bytes.len(), 4).unwrap();
    unsafe {
        let ptr = std::alloc::alloc(layout);
        // Write length prefix
        std::ptr::copy_nonoverlapping(len.to_le_bytes().as_ptr(), ptr, 4);
        // Write string bytes
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr.add(4), bytes.len());
        ptr
    }
}

/// Read a string from WASM linear memory given pointer and length.
#[doc(hidden)]
pub fn __read_string_from_memory(ptr: *const u8, len: usize) -> String {
    unsafe {
        let slice = std::slice::from_raw_parts(ptr, len);
        String::from_utf8_lossy(slice).into_owned()
    }
}

// ── The main macro ──────────────────────────────────────────────────

/// Declare one or more plugin nodes and generate the WASM ABI exports.
///
/// # Usage
///
/// ```rust,ignore
/// use twistedflow_plugin::*;
///
/// nodes! {
///     node "Uppercase" (type_id = "uppercase", category = "Text") {
///         inputs: [{ key: "text", data_type: "string" }],
///         outputs: [{ key: "result", data_type: "string" }],
///         execute: |inputs| {
///             let text = inputs.get_string("text").unwrap_or_default();
///             PluginOutputs::new().set("result", text.to_uppercase())
///         }
///     }
///
///     node "Lowercase" (type_id = "lowercase", category = "Text") {
///         inputs: [{ key: "text", data_type: "string" }],
///         outputs: [{ key: "result", data_type: "string" }],
///         execute: |inputs| {
///             let text = inputs.get_string("text").unwrap_or_default();
///             PluginOutputs::new().set("result", text.to_lowercase())
///         }
///     }
/// }
/// ```
#[macro_export]
macro_rules! nodes {
    (
        $(
            node $name:literal (
                type_id = $type_id:literal
                , category = $category:literal
                $(, description = $desc:literal)?
            ) {
                $(inputs: [$({key: $in_key:literal, data_type: $in_type:literal}),* $(,)?],)?
                $(outputs: [$({key: $out_key:literal, data_type: $out_type:literal}),* $(,)?],)?
                execute: $exec:expr
            }
        )*
    ) => {
        // Generate metadata JSON
        #[no_mangle]
        pub extern "C" fn tf_metadata() -> *const u8 {
            let defs = vec![
                $(
                    $crate::PluginNodeDef {
                        name: $name.to_string(),
                        type_id: $type_id.to_string(),
                        category: $category.to_string(),
                        description: {
                            let _d = "";
                            $( let _d = $desc; )?
                            _d.to_string()
                        },
                        inputs: {
                            #[allow(unused_mut)]
                            let mut v = Vec::new();
                            $($(
                                v.push($crate::PinDef {
                                    key: $in_key.to_string(),
                                    data_type: $in_type.to_string(),
                                });
                            )*)?
                            v
                        },
                        outputs: {
                            #[allow(unused_mut)]
                            let mut v = Vec::new();
                            $($(
                                v.push($crate::PinDef {
                                    key: $out_key.to_string(),
                                    data_type: $out_type.to_string(),
                                });
                            )*)?
                            v
                        },
                    },
                )*
            ];
            let json = $crate::serde_json::to_string(&defs).unwrap_or_else(|_| "[]".into());
            $crate::__write_string_to_memory(&json)
        }

        // Generate execute dispatcher
        #[no_mangle]
        pub extern "C" fn tf_execute(
            type_id_ptr: *const u8,
            type_id_len: u32,
            inputs_ptr: *const u8,
            inputs_len: u32,
        ) -> *const u8 {
            let type_id = $crate::__read_string_from_memory(type_id_ptr, type_id_len as usize);
            let inputs_json = $crate::__read_string_from_memory(inputs_ptr, inputs_len as usize);
            let inputs = $crate::PluginInputs::from_json(&inputs_json);

            let result: $crate::PluginOutputs = match type_id.as_str() {
                $(
                    $type_id => {
                        let f: fn($crate::PluginInputs) -> $crate::PluginOutputs = $exec;
                        f(inputs)
                    }
                )*
                _ => $crate::PluginOutputs::new(),
            };

            let json = result.to_json();
            $crate::__write_string_to_memory(&json)
        }

        // WASI requires a main for wasm32-wasip1 cdylib, but we don't use it.
        // The host calls tf_metadata and tf_execute directly.
    };
}
