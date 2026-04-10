//! Template parser for `#{name}` tokens.
//!
//! Token grammar:
//!   #{ident}           → input pin "ident"
//!   #{ident.path.to}   → input pin "ident", consumer reads `.path.to` from value

use regex::Regex;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

static TOKEN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"#\{([A-Za-z_][A-Za-z0-9_]*)((?:\.[A-Za-z_][A-Za-z0-9_]*)*)\}").unwrap()
});

/// Extract unique pin names referenced by a template string.
pub fn input_pins_for(input: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for caps in TOKEN_RE.captures_iter(input) {
        let name = caps[1].to_string();
        if seen.insert(name.clone()) {
            out.push(name);
        }
    }
    out
}

/// Substitute pin values into a template string.
pub fn render_template(input: &str, values: &HashMap<String, Value>) -> String {
    TOKEN_RE
        .replace_all(input, |caps: &regex::Captures| {
            let name = &caps[1];
            let dotted = &caps[2];

            let root = match values.get(name) {
                Some(v) => v,
                None => return String::new(),
            };

            if dotted.is_empty() {
                return stringify_value(root);
            }

            // Walk dotted path
            let mut cur = root.clone();
            for seg in dotted[1..].split('.') {
                match cur.get(seg) {
                    Some(v) => cur = v.clone(),
                    None => return String::new(),
                }
            }
            stringify_value(&cur)
        })
        .into_owned()
}

fn stringify_value(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => serde_json::to_string(v).unwrap_or_default(),
    }
}
