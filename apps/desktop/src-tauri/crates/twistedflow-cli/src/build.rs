//! `twistedflow build` — compiles a flow or project into a standalone binary.
//!
//! Generates a temporary Rust project that embeds the flow JSON,
//! runs `cargo build --release`, and copies the resulting binary.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Path to the twistedflow crates (resolved at compile time from this crate's location).
const CRATES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/..");

pub fn build(input: &Path, output: &str, release: bool) -> Result<(), String> {
    let input = if input.starts_with("~/") {
        PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(input.strip_prefix("~/").unwrap())
    } else {
        input.to_path_buf()
    };

    if input.is_dir() {
        build_project(&input, output, release)
    } else if input.is_file() {
        build_single_flow(&input, output, release)
    } else {
        Err(format!("Input not found: {}", input.display()))
    }
}

fn build_single_flow(flow_file: &Path, output: &str, release: bool) -> Result<(), String> {
    let flow_json = std::fs::read_to_string(flow_file)
        .map_err(|e| format!("Cannot read {}: {}", flow_file.display(), e))?;

    // Validate it parses
    let _: serde_json::Value = serde_json::from_str(&flow_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    let flow_name = flow_file.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("flow")
        .to_string();

    let flows = vec![("main".to_string(), flow_json)];
    let envs: HashMap<String, String> = HashMap::new();

    generate_and_compile(&flow_name, &flows, &envs, output, release)
}

fn build_project(project_dir: &Path, output: &str, release: bool) -> Result<(), String> {
    // Verify it's a TwistedFlow project
    if !project_dir.join("twistedflow.toml").exists() {
        return Err("Not a TwistedFlow project (missing twistedflow.toml)".into());
    }

    let project_name = std::fs::read_to_string(project_dir.join("twistedflow.toml"))
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("name"))
                .and_then(|l| l.split('=').nth(1))
                .map(|v| v.trim().trim_matches('"').to_string())
        })
        .unwrap_or_else(|| "project".into());

    // Collect all flows
    let flows_dir = project_dir.join("flows");
    let mut flows = Vec::new();
    if flows_dir.exists() {
        for entry in std::fs::read_dir(&flows_dir).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let name = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("flow")
                    .to_string()
                    .replace(".flow", "");
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;
                flows.push((name, content));
            }
        }
    }

    if flows.is_empty() {
        return Err("No flows found in project".into());
    }

    // Collect .env files
    let mut envs = HashMap::new();
    for entry in std::fs::read_dir(project_dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name == ".env" || name.starts_with(".env.") {
                let content = std::fs::read_to_string(&path).unwrap_or_default();
                let env_name = if name == ".env" {
                    "default".to_string()
                } else {
                    name.strip_prefix(".env.").unwrap_or(name).to_string()
                };
                envs.insert(env_name, content);
            }
        }
    }

    generate_and_compile(&project_name, &flows, &envs, output, release)
}

fn generate_and_compile(
    name: &str,
    flows: &[(String, String)],
    envs: &HashMap<String, String>,
    output: &str,
    release: bool,
) -> Result<(), String> {
    let tmp = tempfile::tempdir().map_err(|e| format!("Tempdir error: {}", e))?;
    let project_dir = tmp.path();

    eprintln!("Generating build project...");

    // Create src dir
    std::fs::create_dir_all(project_dir.join("src")).map_err(|e| e.to_string())?;

    // Generate Cargo.toml
    let engine_path = format!("{}/twistedflow-engine", CRATES_DIR).replace('\\', "/");
    let nodes_path = format!("{}/twistedflow-nodes", CRATES_DIR).replace('\\', "/");

    let cargo_toml = format!(
        r#"[package]
name = "{name}"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "{name}"
path = "src/main.rs"

[dependencies]
twistedflow-engine = {{ path = "{engine_path}" }}
twistedflow-nodes = {{ path = "{nodes_path}" }}
serde_json = "1"
tokio = {{ version = "1", features = ["rt-multi-thread", "macros", "signal"] }}
tokio-util = "0.7"
reqwest = {{ version = "0.12", default-features = false, features = ["rustls-tls"] }}
"#,
        name = sanitize(name),
        engine_path = engine_path,
        nodes_path = nodes_path,
    );

    std::fs::write(project_dir.join("Cargo.toml"), cargo_toml).map_err(|e| e.to_string())?;

    // Generate main.rs
    let main_rs = generate_main_rs(flows, envs);
    std::fs::write(project_dir.join("src/main.rs"), main_rs).map_err(|e| e.to_string())?;

    // Run cargo build
    let _release = release;
    eprintln!("Compiling {} (this may take a moment)...", name);

    let mut cmd = Command::new("cargo");
    cmd.arg("build").current_dir(project_dir);
    if release {
        cmd.arg("--release");
    }

    let status = cmd.status().map_err(|e| format!("cargo build failed: {}", e))?;
    if !status.success() {
        return Err("Compilation failed".into());
    }

    // Copy binary
    let profile_dir = if release { "release" } else { "debug" };
    let bin_name = sanitize(name);
    let built_binary = project_dir
        .join("target")
        .join(profile_dir)
        .join(&bin_name);

    let output_path = if output.starts_with('/') || output.starts_with("./") {
        PathBuf::from(output)
    } else {
        std::env::current_dir().unwrap_or_default().join(output)
    };

    std::fs::copy(&built_binary, &output_path)
        .map_err(|e| format!("Failed to copy binary: {}", e))?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&output_path, std::fs::Permissions::from_mode(0o755)).ok();
    }

    eprintln!("Built: {}", output_path.display());
    Ok(())
}

fn generate_main_rs(flows: &[(String, String)], envs: &HashMap<String, String>) -> String {
    let mut flow_entries = String::new();
    for (name, json) in flows {
        let escaped = json.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
        flow_entries.push_str(&format!(
            "        (\"{name}\", \"{escaped}\"),\n",
            name = name,
            escaped = escaped,
        ));
    }

    let mut env_entries = String::new();
    for (name, content) in envs {
        let escaped = content.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
        env_entries.push_str(&format!(
            "        (\"{name}\", \"{escaped}\"),\n",
            name = name,
            escaped = escaped,
        ));
    }

    let _has_multiple_flows = flows.len() > 1;

    format!(
        r##"//! Auto-generated by `twistedflow build`. Do not edit.
extern crate twistedflow_nodes;

use std::collections::HashMap;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use twistedflow_engine::{{
    FlowFile, GraphIndex, LogEntry, RunFlowOpts, StatusEvent,
    build_registry, load_wasm_plugins, DEFAULT_PLUGINS_DIR,
}};
use serde_json::Value;

fn flows() -> Vec<(&'static str, &'static str)> {{
    vec![
{flow_entries}    ]
}}

fn envs() -> Vec<(&'static str, &'static str)> {{
    vec![
{env_entries}    ]
}}

fn parse_dotenv(content: &str) -> HashMap<String, Value> {{
    let mut map = HashMap::new();
    for line in content.lines() {{
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {{ continue; }}
        if let Some((key, value)) = line.split_once('=') {{
            let key = key.trim().to_string();
            let value = value.trim().trim_matches('"').trim_matches('\'').to_string();
            if !key.is_empty() {{
                map.insert(key, Value::String(value));
            }}
        }}
    }}
    map
}}

#[tokio::main]
async fn main() {{
    let args: Vec<String> = std::env::args().collect();

    // Parse --flow, --env, --list-flows flags
    let mut flow_name: Option<String> = None;
    let mut env_name = "default".to_string();
    let mut quiet = false;
    let mut i = 1;
    while i < args.len() {{
        match args[i].as_str() {{
            "--flow" => {{ i += 1; flow_name = args.get(i).cloned(); }}
            "--env" => {{ i += 1; env_name = args.get(i).cloned().unwrap_or("default".into()); }}
            "--quiet" | "-q" => {{ quiet = true; }}
            "--list-flows" => {{
                for (name, _) in flows() {{ println!("  {{}}", name); }}
                return;
            }}
            "--help" | "-h" => {{
                eprintln!("Usage: {{}} [--flow NAME] [--env NAME] [--list-flows] [-q]", args[0]);
                return;
            }}
            _ => {{}}
        }}
        i += 1;
    }}

    let all_flows = flows();
    let flow_json = if let Some(ref name) = flow_name {{
        all_flows.iter().find(|(n, _)| *n == name.as_str()).map(|(_, j)| *j)
    }} else {{
        all_flows.first().map(|(_, j)| *j)
    }};

    let flow_json = match flow_json {{
        Some(j) => j,
        None => {{
            eprintln!("Flow not found. Available: {{:?}}", all_flows.iter().map(|(n,_)| *n).collect::<Vec<_>>());
            std::process::exit(1);
        }}
    }};

    // Parse flow
    let flow_file = match FlowFile::parse(flow_json) {{
        Ok(f) => f,
        Err(e) => {{ eprintln!("Error: {{}}", e); std::process::exit(1); }}
    }};

    if !quiet {{ eprintln!("Running: {{}}", flow_file.name); }}

    let graph = flow_file.to_graph();
    let index = Arc::new(GraphIndex::build(&graph));

    // Registry
    let mut registry = build_registry();
    let wasm_nodes = load_wasm_plugins(&[DEFAULT_PLUGINS_DIR]);
    for (type_id, node, _) in wasm_nodes {{ registry.insert(type_id, node); }}

    // Environment
    let env_vars: Option<HashMap<String, Value>> = {{
        let all_envs = envs();
        all_envs.iter()
            .find(|(n, _)| *n == env_name.as_str())
            .map(|(_, content)| parse_dotenv(content))
    }};

    let context = twistedflow_engine::ExecContext {{
        project_base_url: None,
        env_base_url: None,
        project_headers: None,
        env_headers: None,
        env_vars,
        auth: None,
    }};

    let quiet_s = quiet;
    let on_status: Box<dyn Fn(&str, StatusEvent) + Send + Sync> =
        Box::new(move |node_id, event| {{
            if quiet_s && event.status != "error" {{ return; }}
            if event.status == "error" {{
                eprintln!("  ✗ {{}} — {{}}", node_id, event.error.as_deref().unwrap_or("error"));
            }} else if event.status == "ok" && !quiet_s {{
                eprintln!("  ✓ {{}}", node_id);
            }}
        }});

    let quiet_l = quiet;
    let on_log: Box<dyn Fn(LogEntry) + Send + Sync> = Box::new(move |entry| {{
        if quiet_l {{ return; }}
        let val = match &entry.value {{
            Value::String(s) => s.clone(),
            other => serde_json::to_string_pretty(other).unwrap_or_default(),
        }};
        println!("[{{}}] {{}}", entry.label, val);
    }});

    let http_client = reqwest::Client::builder()
        .user_agent("TwistedFlow-Built/0.1")
        .build().expect("HTTP client");

    let cancel = CancellationToken::new();
    let cancel_c = cancel.clone();
    tokio::spawn(async move {{
        tokio::signal::ctrl_c().await.ok();
        cancel_c.cancel();
    }});

    let opts = Arc::new(RunFlowOpts {{
        index, context, on_status, on_log, cancel, http_client, registry,
    }});

    match twistedflow_engine::run_flow(opts).await {{
        Ok(()) => {{ if !quiet {{ eprintln!("Done"); }} }}
        Err(e) => {{ eprintln!("Error: {{}}", e); std::process::exit(1); }}
    }}
}}
"##,
        flow_entries = flow_entries,
        env_entries = env_entries,
    )
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
}
