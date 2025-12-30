mod window_customizer;

use std::{
    collections::VecDeque,
    net::{SocketAddr, TcpListener},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, LogicalSize, Manager, RunEvent, WebviewUrl, WebviewWindow, path::BaseDirectory};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::net::TcpSocket;

use crate::window_customizer::PinchZoomDisablePlugin;

#[derive(Clone)]
struct ServerState(Arc<Mutex<Option<CommandChild>>>);

#[derive(Clone)]
struct LogState(Arc<Mutex<VecDeque<String>>>);

const MAX_LOG_ENTRIES: usize = 200;
const DEFAULT_SKILLS_PORT: u32 = 4097;

#[tauri::command]
fn kill_sidecar(app: AppHandle) {
    let Some(server_state) = app.try_state::<ServerState>() else {
        println!("Server not running");
        return;
    };

    let Some(server_state) = server_state
        .0
        .lock()
        .expect("Failed to acquire mutex lock")
        .take()
    else {
        println!("Server state missing");
        return;
    };

    let _ = server_state.kill();

    println!("Killed server");
}

#[tauri::command]
async fn copy_logs_to_clipboard(app: AppHandle) -> Result<(), String> {
    let log_state = app.try_state::<LogState>().ok_or("Log state not found")?;

    let logs = log_state
        .0
        .lock()
        .map_err(|_| "Failed to acquire log lock")?;

    let log_text = logs.iter().cloned().collect::<Vec<_>>().join("");

    app.clipboard()
        .write_text(log_text)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_logs(app: AppHandle) -> Result<String, String> {
    let log_state = app.try_state::<LogState>().ok_or("Log state not found")?;

    let logs = log_state
        .0
        .lock()
        .map_err(|_| "Failed to acquire log lock")?;

    Ok(logs.iter().cloned().collect::<Vec<_>>().join(""))
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_port(key: &str) -> Option<u32> {
    env_string(key).and_then(|value| value.parse().ok())
}

fn find_free_port() -> u32 {
    TcpListener::bind("127.0.0.1:0")
        .expect("Failed to bind to find free port")
        .local_addr()
        .expect("Failed to get local address")
        .port() as u32
}

fn path_to_file_url(path: &Path) -> Option<String> {
    let path = path.canonicalize().ok()?;
    #[cfg(target_os = "windows")]
    {
        let path = path.to_string_lossy().replace('\\', "/");
        return Some(format!("file:///{}", path));
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Some(format!("file://{}", path.to_string_lossy()));
    }
}

fn find_orchestrator_plugin_path() -> Option<PathBuf> {
    if let Some(value) = env_string("OPENCODE_DESKTOP_PLUGIN_PATH") {
        let candidate = PathBuf::from(value);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let Ok(current) = std::env::current_dir() else {
        return None;
    };

    for ancestor in current.ancestors().take(6) {
        let dist = ancestor
            .join("packages")
            .join("orchestrator")
            .join("dist")
            .join("index.js");
        if dist.is_file() {
            return Some(dist);
        }

        let src = ancestor
            .join("packages")
            .join("orchestrator")
            .join("src")
            .join("index.ts");
        if src.is_file() {
            return Some(src);
        }
    }

    None
}

fn build_opencode_config_content() -> Option<String> {
    if env_string("OPENCODE_CONFIG_CONTENT").is_some() {
        return None;
    }

    let plugin_path = find_orchestrator_plugin_path()?;
    let plugin_url = path_to_file_url(&plugin_path)?;
    let payload = serde_json::json!({ "plugin": [plugin_url] });
    serde_json::to_string(&payload).ok()
}

fn get_sidecar_port() -> u32 {
    option_env!("OPENCODE_PORT")
        .and_then(|value| value.parse().ok())
        .or_else(|| env_port("OPENCODE_PORT"))
        .unwrap_or_else(find_free_port)
}

fn get_skills_port_override() -> Option<u32> {
    option_env!("OPENCODE_SKILLS_PORT")
        .and_then(|value| value.parse().ok())
        .or_else(|| option_env!("OPENCODE_SKILLS_API_PORT").and_then(|value| value.parse().ok()))
        .or_else(|| env_port("OPENCODE_SKILLS_PORT"))
        .or_else(|| env_port("OPENCODE_SKILLS_API_PORT"))
}

fn get_opencode_base_override() -> Option<String> {
    env_string("OPENCODE_DESKTOP_BASE_URL")
}

fn get_skills_base_override() -> Option<String> {
    env_string("OPENCODE_DESKTOP_SKILLS_URL")
}

fn get_orchestrator_bridge_port_override() -> Option<u32> {
    option_env!("OPENCODE_ORCH_BRIDGE_PORT")
        .and_then(|value| value.parse().ok())
        .or_else(|| env_port("OPENCODE_ORCH_BRIDGE_PORT"))
}

fn get_user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
}

fn spawn_sidecar(app: &AppHandle, port: u32, skills_port: u32, orchestrator_port: Option<u32>) -> CommandChild {
    let log_state = app.state::<LogState>();
    let log_state_clone = log_state.inner().clone();
    let config_override = build_opencode_config_content();

    let state_dir = app
        .path()
        .resolve("", BaseDirectory::AppLocalData)
        .expect("Failed to resolve app local data dir");

    #[cfg(target_os = "windows")]
    let (mut rx, child) = {
        let mut command = app.shell().sidecar("opencode-cli").unwrap();
        command
            .env("OPENCODE_EXPERIMENTAL_ICON_DISCOVERY", "true")
            .env("OPENCODE_CLIENT", "desktop")
            .env("OPENCODE_SKILLS_PORT", skills_port.to_string())
            .env("OPENCODE_SKILLS_API_PORT", skills_port.to_string())
            .env("XDG_STATE_HOME", &state_dir);
        if let Some(port) = orchestrator_port {
            command.env("OPENCODE_ORCH_BRIDGE_PORT", port.to_string());
        }
        if let Some(config_override) = config_override.as_ref() {
            command.env("OPENCODE_CONFIG_CONTENT", config_override);
        }
        command
            .args(["serve", &format!("--port={port}")])
            .spawn()
            .expect("Failed to spawn opencode")
    };

    #[cfg(not(target_os = "windows"))]
    let (mut rx, child) = {
        let sidecar_path = tauri::utils::platform::current_exe()
            .expect("Failed to get current exe")
            .parent()
            .expect("Failed to get parent dir")
            .join("opencode-cli");
        let shell = get_user_shell();
        let mut command = app.shell().command(&shell);
        command
            .env("OPENCODE_EXPERIMENTAL_ICON_DISCOVERY", "true")
            .env("OPENCODE_CLIENT", "desktop")
            .env("OPENCODE_SKILLS_PORT", skills_port.to_string())
            .env("OPENCODE_SKILLS_API_PORT", skills_port.to_string())
            .env("XDG_STATE_HOME", &state_dir);
        if let Some(port) = orchestrator_port {
            command.env("OPENCODE_ORCH_BRIDGE_PORT", port.to_string());
        }
        if let Some(config_override) = config_override.as_ref() {
            command.env("OPENCODE_CONFIG_CONTENT", config_override);
        }
        command
            .args([
                "-il",
                "-c",
                &format!("{} serve --port={}", sidecar_path.display(), port),
            ])
            .spawn()
            .expect("Failed to spawn opencode")
    };

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    print!("{line}");

                    // Store log in shared state
                    if let Ok(mut logs) = log_state_clone.0.lock() {
                        logs.push_back(format!("[STDOUT] {}", line));
                        // Keep only the last MAX_LOG_ENTRIES
                        while logs.len() > MAX_LOG_ENTRIES {
                            logs.pop_front();
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprint!("{line}");

                    // Store log in shared state
                    if let Ok(mut logs) = log_state_clone.0.lock() {
                        logs.push_back(format!("[STDERR] {}", line));
                        // Keep only the last MAX_LOG_ENTRIES
                        while logs.len() > MAX_LOG_ENTRIES {
                            logs.pop_front();
                        }
                    }
                }
                _ => {}
            }
        }
    });

    child
}

async fn is_server_running(port: u32) -> bool {
    TcpSocket::new_v4()
        .unwrap()
        .connect(SocketAddr::new(
            "127.0.0.1".parse().expect("Failed to parse IP"),
            port as u16,
        ))
        .await
        .is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let updater_enabled = option_env!("TAURI_SIGNING_PRIVATE_KEY").is_some();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(PinchZoomDisablePlugin)
        .invoke_handler(tauri::generate_handler![
            kill_sidecar,
            copy_logs_to_clipboard,
            get_logs
        ])
        .setup(move |app| {
            let app = app.handle().clone();

            // Initialize log state
            app.manage(LogState(Arc::new(Mutex::new(VecDeque::new()))));

            tauri::async_runtime::spawn(async move {
                let base_override = get_opencode_base_override();
                let skills_base_override = get_skills_base_override();

                let port = if base_override.is_some() {
                    None
                } else {
                    Some(get_sidecar_port())
                };

                let should_spawn_sidecar = match port {
                    Some(port) => !is_server_running(port).await,
                    None => false,
                };

                let skills_port_override = get_skills_port_override();
                let mut skills_port = skills_port_override.unwrap_or(DEFAULT_SKILLS_PORT);
                let orchestrator_port_override = get_orchestrator_bridge_port_override();
                let mut orchestrator_port = orchestrator_port_override;

                if should_spawn_sidecar && skills_port_override.is_none() {
                    let preferred = DEFAULT_SKILLS_PORT;
                    let port_conflict = port == Some(preferred) || is_server_running(preferred).await;
                    if port_conflict {
                        skills_port = find_free_port();
                        while Some(skills_port) == port {
                            skills_port = find_free_port();
                        }
                    } else {
                        skills_port = preferred;
                    }
                }

                if should_spawn_sidecar && orchestrator_port.is_none() {
                    let mut candidate = find_free_port();
                    while Some(candidate) == port || candidate == skills_port {
                        candidate = find_free_port();
                    }
                    orchestrator_port = Some(candidate);
                }

                let child = if should_spawn_sidecar {
                    let child = spawn_sidecar(&app, port.expect("Sidecar port missing"), skills_port, orchestrator_port);

                    let timestamp = Instant::now();
                    loop {
                        if timestamp.elapsed() > Duration::from_secs(7) {
                            let res = app.dialog()
                              .message("Failed to spawn OpenCode Server. Copy logs using the button below and send them to the team for assistance.")
                              .title("Startup Failed")
                              .buttons(MessageDialogButtons::OkCancelCustom("Copy Logs And Exit".to_string(), "Exit".to_string()))
                              .blocking_show_with_result();

                            if matches!(&res, MessageDialogResult::Custom(name) if name == "Copy Logs And Exit") {
                                match copy_logs_to_clipboard(app.clone()).await {
                                    Ok(()) => println!("Logs copied to clipboard successfully"),
                                    Err(e) => println!("Failed to copy logs to clipboard: {}", e),
                                }
                            }

                            app.exit(1);

                            return;
                        }

                        tokio::time::sleep(Duration::from_millis(10)).await;

                        if is_server_running(port.expect("Sidecar port missing")).await {
                            // give the server a little bit more time to warm up
                            tokio::time::sleep(Duration::from_millis(10)).await;

                            break;
                        }
                    }

                    println!("Server ready after {:?}", timestamp.elapsed());

                    Some(child)
                } else {
                    None
                };

                let primary_monitor = app.primary_monitor().ok().flatten();
                let size = primary_monitor
                    .map(|m| m.size().to_logical(m.scale_factor()))
                    .unwrap_or(LogicalSize::new(1920, 1080));

                let base_url = base_override
                    .clone()
                    .or_else(|| port.map(|value| format!("http://127.0.0.1:{value}")));
                let skills_base_url = skills_base_override
                    .clone()
                    .or_else(|| Some(format!("http://127.0.0.1:{skills_port}")));
                let orchestrator_events_url = orchestrator_port.map(|value| format!("http://127.0.0.1:{value}"));
                let port_json = serde_json::to_string(&port).unwrap_or_else(|_| "null".to_string());
                let skills_port_json =
                    serde_json::to_string(&skills_port).unwrap_or_else(|_| "null".to_string());
                let orchestrator_port_json =
                    serde_json::to_string(&orchestrator_port).unwrap_or_else(|_| "null".to_string());
                let base_url_json =
                    serde_json::to_string(&base_url).unwrap_or_else(|_| "null".to_string());
                let skills_base_url_json =
                    serde_json::to_string(&skills_base_url).unwrap_or_else(|_| "null".to_string());
                let orchestrator_events_url_json =
                    serde_json::to_string(&orchestrator_events_url).unwrap_or_else(|_| "null".to_string());

                let mut window_builder =
                    WebviewWindow::builder(&app, "main", WebviewUrl::App("/".into()))
                        .title("OpenCode")
                        .inner_size(size.width as f64, size.height as f64)
                        .decorations(true)
                        .zoom_hotkeys_enabled(true)
                        .disable_drag_drop_handler()
                        .initialization_script(format!(
                            r#"
                          window.__OPENCODE__ ??= {{}};
                          window.__OPENCODE__.updaterEnabled = {updater_enabled};
                          window.__OPENCODE__.port = {port_json};
                          window.__OPENCODE__.skillsPort = {skills_port_json};
                          window.__OPENCODE__.baseUrl = {base_url_json};
                          window.__OPENCODE__.skillsBase = {skills_base_url_json};
                          window.__OPENCODE__.orchestratorEventsPort = {orchestrator_port_json};
                          window.__OPENCODE__.orchestratorEventsUrl = {orchestrator_events_url_json};
                        "#
                        ));

                #[cfg(target_os = "macos")]
                {
                    window_builder = window_builder
                        .title_bar_style(tauri::TitleBarStyle::Overlay)
                        .hidden_title(true);
                }

                window_builder.build().expect("Failed to create window");

                app.manage(ServerState(Arc::new(Mutex::new(child))));
            });

            Ok(())
        });

    if updater_enabled {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                println!("Received Exit");

                kill_sidecar(app.clone());
            }
        });
}
