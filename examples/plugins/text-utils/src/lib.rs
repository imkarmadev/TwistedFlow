//! Example TwistedFlow plugin — text transformation nodes.
//!
//! Build: cargo build --target wasm32-wasip1 --release
//! Install: cp target/wasm32-wasip1/release/twistedflow_plugin_text_utils.wasm ~/.twistedflow/plugins/

use twistedflow_plugin::*;

nodes! {
    node "Uppercase" (type_id = "pluginUppercase", category = "Text") {
        inputs: [{key: "text", data_type: "string"}],
        outputs: [{key: "result", data_type: "string"}],
        execute: |inputs| {
            let text = inputs.get_string("text").unwrap_or_default();
            PluginOutputs::new().set("result", text.to_uppercase())
        }
    }

    node "Lowercase" (type_id = "pluginLowercase", category = "Text") {
        inputs: [{key: "text", data_type: "string"}],
        outputs: [{key: "result", data_type: "string"}],
        execute: |inputs| {
            let text = inputs.get_string("text").unwrap_or_default();
            PluginOutputs::new().set("result", text.to_lowercase())
        }
    }

    node "Reverse" (type_id = "pluginReverse", category = "Text") {
        inputs: [{key: "text", data_type: "string"}],
        outputs: [{key: "result", data_type: "string"}],
        execute: |inputs| {
            let text = inputs.get_string("text").unwrap_or_default();
            PluginOutputs::new().set("result", text.chars().rev().collect::<String>())
        }
    }

    node "Word Count" (type_id = "pluginWordCount", category = "Text") {
        inputs: [{key: "text", data_type: "string"}],
        outputs: [
            {key: "words", data_type: "number"},
            {key: "chars", data_type: "number"}
        ],
        execute: |inputs| {
            let text = inputs.get_string("text").unwrap_or_default();
            let words = text.split_whitespace().count();
            let chars = text.len();
            PluginOutputs::new()
                .set("words", serde_json::json!(words))
                .set("chars", serde_json::json!(chars))
        }
    }
}
