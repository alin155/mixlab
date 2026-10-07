#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{fs, net::TcpListener, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::{AppHandle, Manager, State};

struct Runtime { child: Mutex<Option<Child>>, connection: Connection }
#[derive(Clone, Serialize)]
struct Connection { api_base: String, token: String }

#[tauri::command]
fn runtime_connection(state: State<'_, Runtime>) -> Connection { state.connection.clone() }

fn start_engine(app: &AppHandle) -> Result<Runtime, String> {
    let state_root = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&state_root).map_err(|e| e.to_string())?;
    let port = {
        let socket = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        socket.local_addr().map_err(|e| e.to_string())?.port()
    };
    let token = uuid::Uuid::new_v4().to_string();
    #[cfg(not(debug_assertions))]
    let resource = app.path().resource_dir().map_err(|e| e.to_string())?;
    let mut command;
    #[cfg(debug_assertions)]
    {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
        command = Command::new(if cfg!(windows) { "node.exe" } else { "node" });
        command.args(["--import", "tsx"]).arg(repo.join("scripts/servers/smart-cutter-api-server.ts"));
        command.current_dir(&repo);
        command.env("MIXLAB_SMART_AI_ROOT", repo.join("apps/smart-cutter-desktop/src-tauri/runtime"));
        command.env("MIXLAB_SMART_AI_SCRIPT", repo.join("scripts/smart-cutter/ai-worker.py"));
    }
    #[cfg(not(debug_assertions))]
    {
        let executable = resource.join("binaries/node.exe");
        if !executable.is_file() { return Err("安装包缺少智能剪辑本机引擎，请重新安装完整版本".to_string()); }
        command = Command::new(executable);
        command.arg(resource.join("binaries/smart-cutter-api.bundle.mjs"));
        command.env("MIXLAB_SMART_AI_ROOT", resource.join("runtime"));
        command.env("MIXLAB_SMART_AI_SCRIPT", resource.join("runtime/ai-worker.py"));
        command.env("MIXLAB_SMART_PYTHON", resource.join("runtime/python/python.exe"));
        command.env("MIXLAB_SMART_FONTS", resource.join("runtime/fonts"));
        command.env("MIXLAB_FFMPEG_PATH", resource.join("binaries/ffmpeg.exe"));
        command.env("MIXLAB_FFPROBE_PATH", resource.join("binaries/ffprobe.exe"));
    }
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    #[cfg(unix)]
    { use std::os::unix::process::CommandExt; command.process_group(0); }
    let stdout = fs::OpenOptions::new().create(true).append(true).open(state_root.join("engine.log")).map_err(|e| e.to_string())?;
    let stderr = stdout.try_clone().map_err(|e| e.to_string())?;
    command.env("MIXLAB_SMART_STATE_ROOT", &state_root)
        .env("MIXLAB_SMART_PORT", port.to_string())
        .env("MIXLAB_SMART_API_TOKEN", &token)
        .env("MIXLAB_SMART_AUTH_MODE", "reviewed")
        .stdin(Stdio::null()).stdout(stdout).stderr(stderr);
    let child = command.spawn().map_err(|e| format!("本机引擎无法启动：{e}"))?;
    Ok(Runtime { child: Mutex::new(Some(child)), connection: Connection { api_base: format!("http://127.0.0.1:{port}"), token } })
}
fn stop_engine(runtime: &Runtime) {
    if let Ok(mut holder) = runtime.child.lock() {
        if let Some(mut child) = holder.take() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("taskkill.exe").args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .creation_flags(0x08000000).stdout(Stdio::null()).stderr(Stdio::null()).status();
            }
            #[cfg(unix)]
            unsafe { libc::kill(-(child.id() as i32), libc::SIGTERM); }
            let _ = child.wait();
        }
    }
}
fn main() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let runtime = start_engine(app.handle()).map_err(std::io::Error::other)?;
            app.manage(runtime); Ok(())
        })
        .invoke_handler(tauri::generate_handler![runtime_connection])
        .build(tauri::generate_context!())
        .expect("cannot initialize MixLab Smart Cutter");
    application.run(|app, event| {
        if let tauri::RunEvent::Exit = event { stop_engine(&app.state::<Runtime>()); }
    });
}
