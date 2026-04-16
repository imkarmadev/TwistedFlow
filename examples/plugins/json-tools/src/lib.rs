//! json-tools — TwistedFlow plugin demonstrating multi-node plugins,
//! object handling, and the `host::log` callback.

use twistedflow_plugin::*;

nodes! {
    node "JSON Pretty" (type_id = "pluginJsonPretty", category = "JSON") {
        inputs: [{ key: "json", data_type: "string" }],
        outputs: [{ key: "result", data_type: "string" }],
        execute: |inputs| {
            let src = inputs.get_string("json").unwrap_or_default();
            match serde_json::from_str::<Value>(&src) {
                Ok(v) => {
                    let pretty = serde_json::to_string_pretty(&v).unwrap_or(src.clone());
                    host::log(&format!("pretty: {} → {} bytes", src.len(), pretty.len()));
                    PluginOutputs::new().set("result", pretty)
                }
                Err(e) => {
                    host::log(&format!("invalid JSON: {}", e));
                    PluginOutputs::new().set("result", src)
                }
            }
        }
    }

    node "JSON Minify" (type_id = "pluginJsonMinify", category = "JSON") {
        inputs: [{ key: "json", data_type: "string" }],
        outputs: [{ key: "result", data_type: "string" }],
        execute: |inputs| {
            let src = inputs.get_string("json").unwrap_or_default();
            match serde_json::from_str::<Value>(&src) {
                Ok(v) => {
                    let min = serde_json::to_string(&v).unwrap_or(src.clone());
                    host::log(&format!("minified: {} → {} bytes", src.len(), min.len()));
                    PluginOutputs::new().set("result", min)
                }
                Err(e) => {
                    host::log(&format!("invalid JSON: {}", e));
                    PluginOutputs::new().set("result", src)
                }
            }
        }
    }

    node "JSON Path" (type_id = "pluginJsonPath", category = "JSON") {
        inputs: [
            { key: "json", data_type: "string" },
            { key: "path", data_type: "string" }
        ],
        outputs: [
            { key: "result", data_type: "unknown" },
            { key: "found", data_type: "boolean" }
        ],
        execute: |inputs| {
            let src = inputs.get_string("json").unwrap_or_default();
            let path = inputs.get_string("path").unwrap_or_default();
            let v: Value = serde_json::from_str(&src).unwrap_or(Value::Null);
            match walk_path(&v, &path) {
                Some(found) => {
                    host::log(&format!("path '{}' found", path));
                    PluginOutputs::new()
                        .set_value("result", found.clone())
                        .set("found", true)
                }
                None => {
                    host::log(&format!("path '{}' not found", path));
                    PluginOutputs::new()
                        .set_value("result", Value::Null)
                        .set("found", false)
                }
            }
        }
    }
}

/// Walk a dot-path like `foo.bar.0.baz` through a JSON value.
fn walk_path<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
    if path.is_empty() {
        return Some(v);
    }
    let mut cur = v;
    for part in path.split('.') {
        cur = match cur {
            Value::Object(map) => map.get(part)?,
            Value::Array(arr) => {
                let idx: usize = part.parse().ok()?;
                arr.get(idx)?
            }
            _ => return None,
        };
    }
    Some(cur)
}
