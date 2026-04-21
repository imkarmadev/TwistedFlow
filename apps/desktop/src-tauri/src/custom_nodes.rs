//! Tauri commands for project-local custom node sources and builds.
//!
//! The desktop app owns plugin authoring directly. The CLI remains useful for
//! CI/CD and headless workflows, but the in-app Custom Nodes panel should not
//! depend on CLI argument compatibility at runtime.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Scaffold a new source plugin under `{project}/nodes-src/<name>/`.
#[tauri::command]
pub async fn create_custom_node_source(
    project_path: String,
    name: String,
) -> Result<String, String> {
    let project_dir = twistedflow_project::validate_project_dir(Path::new(&project_path))?;
    let nodes_src_dir = project_dir.join("nodes-src");
    std::fs::create_dir_all(&nodes_src_dir)
        .map_err(|e| format!("Failed to create nodes-src dir: {}", e))?;

    let folder_name = twistedflow_plugin_dev::sanitize_name(&name);
    if folder_name.is_empty() {
        return Err("Custom node name must contain at least one letter or number.".into());
    }

    let result =
        twistedflow_plugin_dev::scaffold_plugin(twistedflow_plugin_dev::ScaffoldPluginOptions {
            target_dir: nodes_src_dir.join(&folder_name),
            plugin_name: name.clone(),
            category: "Custom".to_string(),
            description: format!("Project-local custom node '{}'.", name),
            requested_nodes: vec![name],
            force: false,
            readme_kind: twistedflow_plugin_dev::ReadmeKind::DesktopProjectLocal,
        })?;

    Ok(result.source_dir.to_string_lossy().to_string())
}

/// Open an existing custom node source folder in the user's editor/file
/// association.
#[tauri::command]
pub fn open_custom_node_source(source_path: String) -> Result<(), String> {
    open_custom_node_source_with(source_path, "default".to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomNodeOpenTarget {
    pub id: String,
    pub label: String,
}

#[tauri::command]
pub fn list_custom_node_open_targets() -> Vec<CustomNodeOpenTarget> {
    available_open_targets()
}

#[tauri::command]
pub fn open_custom_node_source_with(source_path: String, target_id: String) -> Result<(), String> {
    let path = PathBuf::from(&source_path);
    if !path.exists() {
        return Err(format!("Source path does not exist: {}", path.display()));
    }
    open_source_path(&path, &target_id)
}

/// Build a project-local custom node directly from source and install the
/// validated `.wasm` into `{project}/nodes/`.
#[tauri::command]
pub async fn build_custom_node(
    project_path: String,
    source_path: String,
) -> Result<String, String> {
    let project_dir = twistedflow_project::validate_project_dir(Path::new(&project_path))?;
    let source_dir = PathBuf::from(&source_path);
    let install_dir = project_dir.join("nodes");

    let result = tokio::task::spawn_blocking(move || {
        twistedflow_plugin_dev::build_plugin(twistedflow_plugin_dev::BuildPluginOptions {
            source_dir,
            install_dir: Some(install_dir.clone()),
            debug: false,
        })
    })
    .await
    .map_err(|e| format!("Plugin build task failed: {}", e))??;

    let install_dir = result
        .installed_path
        .as_ref()
        .and_then(|path| path.parent().map(|dir| dir.to_path_buf()))
        .unwrap_or_else(|| project_dir.join("nodes"));
    let node_summary = result
        .nodes
        .iter()
        .map(|node| format!("{} ({})", node.name, node.type_id))
        .collect::<Vec<_>>()
        .join(", ");

    Ok(format!(
        "Built {} and installed {} node(s) to {}{}",
        result
            .installed_path
            .as_ref()
            .unwrap_or(&result.wasm_path)
            .display(),
        result.nodes.len(),
        install_dir.display(),
        if node_summary.is_empty() {
            String::new()
        } else {
            format!(": {}", node_summary)
        }
    ))
}

fn open_source_path(path: &Path, target_id: &str) -> Result<(), String> {
    match target_id {
        "default" => open::that(path)
            .map_err(|e| format!("Failed to open {}: {}", path.display(), e)),
        _ => {
            #[cfg(target_os = "macos")]
            {
                let app_name = mac_open_target_app_name(target_id).ok_or_else(|| {
                    format!("Unsupported open target '{}'.", target_id)
                })?;
                let status = std::process::Command::new("open")
                    .arg("-a")
                    .arg(app_name)
                    .arg(path)
                    .status()
                    .map_err(|e| format!("Failed to launch {}: {}", app_name, e))?;
                if status.success() {
                    Ok(())
                } else {
                    Err(format!("{} could not open {}", app_name, path.display()))
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                Err(format!(
                    "Explicit open target '{}' is not supported on this platform.",
                    target_id
                ))
            }
        }
    }
}

fn available_open_targets() -> Vec<CustomNodeOpenTarget> {
    let mut targets = vec![CustomNodeOpenTarget {
        id: "default".to_string(),
        label: "System Default".to_string(),
    }];

    #[cfg(target_os = "macos")]
    {
        for (id, label, app_name) in [
            ("vscode", "VS Code", "Visual Studio Code"),
            ("vscode-insiders", "VS Code Insiders", "Visual Studio Code - Insiders"),
            ("cursor", "Cursor", "Cursor"),
            ("zed", "Zed", "Zed"),
            ("finder", "Finder", "Finder"),
            ("terminal", "Terminal", "Terminal"),
            ("ghostty", "Ghostty", "Ghostty"),
            ("warp", "Warp", "Warp"),
            ("xcode", "Xcode", "Xcode"),
            ("idea", "IntelliJ IDEA", "IntelliJ IDEA"),
            ("rustrover", "RustRover", "RustRover"),
        ] {
            if mac_app_available(app_name) {
                targets.push(CustomNodeOpenTarget {
                    id: id.to_string(),
                    label: label.to_string(),
                });
            }
        }
    }

    targets
}

#[cfg(target_os = "macos")]
fn mac_open_target_app_name(target_id: &str) -> Option<&'static str> {
    match target_id {
        "vscode" => Some("Visual Studio Code"),
        "vscode-insiders" => Some("Visual Studio Code - Insiders"),
        "cursor" => Some("Cursor"),
        "zed" => Some("Zed"),
        "finder" => Some("Finder"),
        "terminal" => Some("Terminal"),
        "ghostty" => Some("Ghostty"),
        "warp" => Some("Warp"),
        "xcode" => Some("Xcode"),
        "idea" => Some("IntelliJ IDEA"),
        "rustrover" => Some("RustRover"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn mac_app_available(app_name: &str) -> bool {
    std::process::Command::new("open")
        .arg("-Ra")
        .arg(app_name)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
