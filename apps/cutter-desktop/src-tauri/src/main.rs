#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
const CUTTER_API_SIDECAR_EXECUTABLE_NAME: &str = "cutter-api-sidecar-x86_64-pc-windows-msvc.exe";

#[cfg(not(windows))]
const CUTTER_API_SIDECAR_EXECUTABLE_NAME: &str = "cutter-api-sidecar";

#[cfg(windows)]
const SEARCHD_EXECUTABLE_NAME: &str = "mixlab-searchd-x86_64-pc-windows-msvc.exe";

#[cfg(not(windows))]
const SEARCHD_EXECUTABLE_NAME: &str = "mixlab-searchd";

const SEARCHD_HOST: &str = "127.0.0.1";
const SEARCHD_PORT: u16 = 3799;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CutterDesktopConfig {
    api_host: String,
    api_port: u16,
    public_library_root: String,
    local_workspace_root: String,
    log_root: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct DesktopDoctorCheck {
    id: String,
    label: String,
    status: String,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct DesktopDoctorResult {
    status: String,
    checks: Vec<DesktopDoctorCheck>,
}

fn desktop_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位桌面配置目录：{error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建桌面配置目录：{error}"))?;
    Ok(dir.join("cutter-desktop-config.json"))
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

#[tauri::command]
fn desktop_config_path(app: AppHandle) -> Result<String, String> {
    desktop_config_file(&app).map(path_string)
}

#[tauri::command]
fn desktop_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn desktop_log_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(app_data) = env::var("APPDATA") {
        return Ok(PathBuf::from(app_data).join("MixLab Cutter").join("logs"));
    }

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位桌面日志目录：{error}"))?;
    Ok(dir.join("logs"))
}

#[tauri::command]
fn desktop_log_dir(app: AppHandle) -> Result<String, String> {
    let dir = desktop_log_dir_path(&app)?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建桌面日志目录：{error}"))?;
    Ok(path_string(dir))
}

fn desktop_host_log(app: &AppHandle, event: &str, details: Value) {
    let Ok(dir) = desktop_log_dir_path(app) else {
        return;
    };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let line = json!({
        "at_ms": at_ms,
        "event": event,
        "details": details
    });

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("desktop-host.ndjson"))
    {
        let _ = writeln!(file, "{line}");
    }
}

fn tcp_port_accepts_connection(host: &str, port: u16) -> bool {
    let Ok(address) = format!("{host}:{port}").parse::<SocketAddr>() else {
        return false;
    };

    TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

fn health_response_is_ready(response: &str) -> bool {
    (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
        && response.contains("\"ok\":true")
}

fn http_health_endpoint_is_ready(host: &str, port: u16) -> bool {
    let Ok(address) = format!("{host}:{port}").parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok() && health_response_is_ready(&response)
}

fn bundled_binary_path_candidates(app: &AppHandle, executable_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(executable_name));
            candidates.push(parent.join("binaries").join(executable_name));
            candidates.push(parent.join("resources").join(executable_name));
            candidates.push(
                parent
                    .join("resources")
                    .join("binaries")
                    .join(executable_name),
            );
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(executable_name));
        candidates.push(resource_dir.join("binaries").join(executable_name));
        candidates.push(
            resource_dir
                .join("resources")
                .join("binaries")
                .join(executable_name),
        );
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(
            current_dir
                .join("apps")
                .join("cutter-desktop")
                .join("src-tauri")
                .join("binaries")
                .join(executable_name),
        );
        candidates.push(
            current_dir
                .join("src-tauri")
                .join("binaries")
                .join(executable_name),
        );
    }

    candidates
}

fn resolve_bundled_binary_path(
    app: &AppHandle,
    executable_name: &str,
    label: &str,
) -> Result<PathBuf, String> {
    let candidates = bundled_binary_path_candidates(app, executable_name);
    candidates
        .iter()
        .find(|candidate| candidate.is_file())
        .cloned()
        .ok_or_else(|| {
            let attempted = candidates
                .iter()
                .map(|candidate| candidate.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("；");
            format!("未找到{label}：{attempted}")
        })
}

fn resolve_cutter_api_sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_bundled_binary_path(app, CUTTER_API_SIDECAR_EXECUTABLE_NAME, "本机引擎 sidecar")
}

fn resolve_searchd_path(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_bundled_binary_path(app, SEARCHD_EXECUTABLE_NAME, "本地搜索服务 searchd")
}

fn resource_file_path(app: &AppHandle, relative_path: &str) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let path = resource_dir.join(relative_path);
    path.is_file().then_some(path)
}

fn configure_bundled_runtime_env(app: &AppHandle, command: &mut Command) {
    if let Some(ffmpeg_path) = resource_file_path(app, "binaries/ffmpeg.exe") {
        command.env("MIXLAB_FFMPEG_PATH", ffmpeg_path);
    }

    if let Some(ffprobe_path) = resource_file_path(app, "binaries/ffprobe.exe") {
        command.env("MIXLAB_FFPROBE_PATH", ffprobe_path);
    }
}

fn spawn_hidden_process(command: &mut Command) -> Result<(), String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动进程：{error}"))
}

fn spawn_logged_process(
    app: &AppHandle,
    command: &mut Command,
    log_stem: &str,
) -> Result<u32, String> {
    command.stdin(Stdio::null());

    match desktop_log_dir_path(app).and_then(|dir| {
        fs::create_dir_all(&dir).map_err(|error| format!("无法创建桌面日志目录：{error}"))?;
        Ok(dir)
    }) {
        Ok(dir) => {
            let stdout = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join(format!("{log_stem}.stdout.log")))
                .map_err(|error| format!("无法创建 {log_stem} stdout 日志：{error}"))?;
            let stderr = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join(format!("{log_stem}.stderr.log")))
                .map_err(|error| format!("无法创建 {log_stem} stderr 日志：{error}"))?;
            command
                .stdout(Stdio::from(stdout))
                .stderr(Stdio::from(stderr));
        }
        Err(_) => {
            command.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map(|child| child.id())
        .map_err(|error| format!("无法启动进程：{error}"))
}

fn searchd_base_url() -> String {
    format!("http://{SEARCHD_HOST}:{SEARCHD_PORT}")
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_start_engine(app: AppHandle, config_path: String) -> Result<(), String> {
    desktop_host_log(
        &app,
        "engine_start_requested",
        json!({ "config_path": config_path }),
    );

    if http_health_endpoint_is_ready("127.0.0.1", 3789) {
        desktop_host_log(
            &app,
            "engine_already_ready",
            json!({ "api_address": "http://127.0.0.1:3789" }),
        );
        return Ok(());
    }

    if tcp_port_accepts_connection("127.0.0.1", 3789) {
        let message = "127.0.0.1:3789 已被其他进程占用，但 /health 不是 MixLab 本机引擎。请结束占用该端口的进程后重试。";
        desktop_host_log(&app, "engine_port_occupied", json!({ "error": message }));
        return Err(message.into());
    }

    if !Path::new(&config_path).is_file() {
        let message = format!("桌面配置文件不存在：{config_path}");
        desktop_host_log(&app, "engine_config_missing", json!({ "error": message }));
        return Err(message);
    }

    let config = match read_desktop_config_from_path(Path::new(&config_path)) {
        Ok(config) => config,
        Err(error) => {
            desktop_host_log(&app, "engine_config_invalid", json!({ "error": error }));
            return Err(error);
        }
    };

    if !http_health_endpoint_is_ready(SEARCHD_HOST, SEARCHD_PORT) {
        if tcp_port_accepts_connection(SEARCHD_HOST, SEARCHD_PORT) {
            let message = format!(
                "{SEARCHD_HOST}:{SEARCHD_PORT} 已被其他进程占用，但 /health 不是 MixLab 本地搜索服务。请结束占用该端口的进程后重试。"
            );
            desktop_host_log(&app, "searchd_port_occupied", json!({ "error": message }));
            return Err(message);
        }

        let searchd_path = match resolve_searchd_path(&app) {
            Ok(path) => path,
            Err(error) => {
                desktop_host_log(&app, "searchd_missing", json!({ "error": error }));
                return Err(error);
            }
        };
        let mut searchd_command = Command::new(&searchd_path);
        let searchd_cache_root = Path::new(&config.local_workspace_root).join(".mixlab-searchd");
        searchd_command
            .arg("--library-root")
            .arg(&config.public_library_root)
            .arg("--cache-root")
            .arg(&searchd_cache_root)
            .arg("--host")
            .arg(SEARCHD_HOST)
            .arg("--port")
            .arg(SEARCHD_PORT.to_string());
        if let Some(parent) = searchd_path.parent() {
            searchd_command.current_dir(parent);
        }

        match spawn_logged_process(&app, &mut searchd_command, "mixlab-searchd") {
            Ok(pid) => {
                desktop_host_log(
                    &app,
                    "searchd_spawned",
                    json!({ "pid": pid, "searchd_path": path_string(searchd_path), "library_root": config.public_library_root, "cache_root": path_string(searchd_cache_root) }),
                );
            }
            Err(error) => {
                desktop_host_log(&app, "searchd_spawn_failed", json!({ "error": error }));
                return Err(error);
            }
        }
    } else {
        desktop_host_log(
            &app,
            "searchd_already_ready",
            json!({ "searchd_base_url": searchd_base_url() }),
        );
    }

    let sidecar_path = match resolve_cutter_api_sidecar_path(&app) {
        Ok(path) => path,
        Err(error) => {
            desktop_host_log(&app, "engine_sidecar_missing", json!({ "error": error }));
            return Err(error);
        }
    };
    let mut command = Command::new(&sidecar_path);
    command.arg("--config").arg(&config_path);
    command.env("MIXLAB_SEARCHD_BASE_URL", searchd_base_url());
    configure_bundled_runtime_env(&app, &mut command);
    if let Some(parent) = sidecar_path.parent() {
        command.current_dir(parent);
    }

    match spawn_logged_process(&app, &mut command, "cutter-api-sidecar") {
        Ok(pid) => {
            desktop_host_log(
                &app,
                "engine_sidecar_spawned",
                json!({ "pid": pid, "sidecar_path": path_string(sidecar_path), "config_path": config_path, "searchd_base_url": searchd_base_url() }),
            );
            Ok(())
        }
        Err(error) => {
            desktop_host_log(
                &app,
                "engine_sidecar_spawn_failed",
                json!({ "error": error }),
            );
            Err(error)
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_open_directory(path_value: String) -> Result<(), String> {
    let trimmed = path_value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let target = PathBuf::from(trimmed);
    fs::create_dir_all(&target).map_err(|error| format!("无法创建目录：{error}"))?;

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&target);
        command
    };

    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new("explorer.exe");
        command.arg(&target);
        command
    };

    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };

    spawn_hidden_process(&mut command)
}

#[tauri::command]
fn desktop_default_workspace_root() -> String {
    let profile = env::var("USERPROFILE")
        .or_else(|_: env::VarError| {
            let drive = env::var("HOMEDRIVE")?;
            let home_path = env::var("HOMEPATH")?;
            Ok::<String, env::VarError>(format!("{drive}{home_path}"))
        })
        .or_else(|_: env::VarError| env::var("HOME"))
        .unwrap_or_else(|_| String::from("C:\\Users\\Default"));

    path_string(PathBuf::from(profile).join("Videos").join("MixLabLocal"))
}

fn read_desktop_config_from_path(path: &Path) -> Result<CutterDesktopConfig, String> {
    let raw = fs::read_to_string(path).map_err(|error| format!("无法读取桌面配置：{error}"))?;
    serde_json::from_str::<CutterDesktopConfig>(&raw)
        .map_err(|error| format!("桌面配置格式无效：{error}"))
}

#[tauri::command]
fn desktop_read_config(app: AppHandle) -> Result<Option<CutterDesktopConfig>, String> {
    let path = desktop_config_file(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    read_desktop_config_from_path(&path).map(Some)
}

#[tauri::command]
fn desktop_write_config(
    app: AppHandle,
    config: CutterDesktopConfig,
) -> Result<CutterDesktopConfig, String> {
    let path = desktop_config_file(&app)?;
    let raw = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("无法序列化桌面配置：{error}"))?;
    fs::write(&path, format!("{raw}\n")).map_err(|error| format!("无法保存桌面配置：{error}"))?;
    Ok(config)
}

fn check_directory(id: &str, label: &str, path: &Path, fail_message: &str) -> DesktopDoctorCheck {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => DesktopDoctorCheck {
            id: id.into(),
            label: label.into(),
            status: "pass".into(),
            message: None,
        },
        Ok(_) => DesktopDoctorCheck {
            id: id.into(),
            label: label.into(),
            status: "fail".into(),
            message: Some(format!("{fail_message}：不是目录")),
        },
        Err(error) => DesktopDoctorCheck {
            id: id.into(),
            label: label.into(),
            status: "fail".into(),
            message: Some(format!("{fail_message}：{error}")),
        },
    }
}

fn check_file(id: &str, label: &str, path: &Path, fail_message: &str) -> DesktopDoctorCheck {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => DesktopDoctorCheck {
            id: id.into(),
            label: label.into(),
            status: "pass".into(),
            message: None,
        },
        Ok(_) => DesktopDoctorCheck {
            id: id.into(),
            label: label.into(),
            status: "fail".into(),
            message: Some(format!("{fail_message}：不是文件")),
        },
        Err(error) => DesktopDoctorCheck {
            id: id.into(),
            label: label.into(),
            status: "fail".into(),
            message: Some(format!("{fail_message}：{error}")),
        },
    }
}

fn count_ready_materials(value: &Value) -> usize {
    match value {
        Value::Array(items) => items.iter().map(count_ready_materials).sum(),
        Value::Object(map) => {
            let self_ready = map
                .get("status")
                .and_then(Value::as_str)
                .map(|status| status == "ready")
                .unwrap_or(false) as usize;
            self_ready + map.values().map(count_ready_materials).sum::<usize>()
        }
        _ => 0,
    }
}

fn current_index_ready_material_count(current_json_path: &Path, json: &Value) -> Option<usize> {
    let current_version = json.get("current_version").and_then(Value::as_str)?;
    let index_manifest_path = current_json_path
        .parent()?
        .join(current_version)
        .join("index-manifest.json");
    let manifest = fs::read_to_string(index_manifest_path).ok()?;
    let manifest_json = serde_json::from_str::<Value>(&manifest).ok()?;
    manifest_json
        .get("ready_video_count")
        .and_then(Value::as_u64)
        .map(|count| count as usize)
}

fn check_ready_materials(current_json_path: &Path) -> DesktopDoctorCheck {
    match fs::read_to_string(current_json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|json| {
            current_index_ready_material_count(current_json_path, &json)
                .unwrap_or_else(|| count_ready_materials(&json))
        }) {
        Some(count) if count > 0 => DesktopDoctorCheck {
            id: "ready_materials".into(),
            label: "ready 素材".into(),
            status: "pass".into(),
            message: None,
        },
        Some(_) => DesktopDoctorCheck {
            id: "ready_materials".into(),
            label: "ready 素材".into(),
            status: "fail".into(),
            message: Some("没有可供剪辑端使用的 ready 素材".into()),
        },
        None => DesktopDoctorCheck {
            id: "ready_materials".into(),
            label: "ready 素材".into(),
            status: "fail".into(),
            message: Some("current.json 无法解析".into()),
        },
    }
}

fn normalized_for_compare(path: &str) -> String {
    path.replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn path_is_same_or_child(candidate: &str, parent: &str) -> bool {
    let candidate = normalized_for_compare(candidate);
    let parent = normalized_for_compare(parent);
    candidate == parent || candidate.starts_with(&format!("{parent}\\"))
}

fn check_workspace(config: &CutterDesktopConfig) -> Vec<DesktopDoctorCheck> {
    let workspace = Path::new(&config.local_workspace_root);
    let mut checks = Vec::new();

    if let Err(error) = fs::create_dir_all(workspace) {
        checks.push(DesktopDoctorCheck {
            id: "workspace_root".into(),
            label: "本地工作区".into(),
            status: "fail".into(),
            message: Some(format!("本地工作区无法创建：{error}")),
        });
    } else {
        checks.push(check_directory(
            "workspace_root",
            "本地工作区",
            workspace,
            "本地工作区不存在或不可读",
        ));
    }

    let probe_path = workspace.join(".mixlab-desktop-write-test.tmp");
    let writable = fs::write(&probe_path, b"ok")
        .and_then(|_| fs::remove_file(&probe_path))
        .is_ok();
    checks.push(if writable {
        DesktopDoctorCheck {
            id: "writable".into(),
            label: "可写".into(),
            status: "pass".into(),
            message: None,
        }
    } else {
        DesktopDoctorCheck {
            id: "writable".into(),
            label: "可写".into(),
            status: "fail".into(),
            message: Some("本地工作区不可写".into()),
        }
    });

    checks.push(
        if path_is_same_or_child(&config.local_workspace_root, &config.public_library_root) {
            DesktopDoctorCheck {
                id: "outside_public_library".into(),
                label: "不在公共素材库内".into(),
                status: "fail".into(),
                message: Some("本地工作区不能放在公共素材库内".into()),
            }
        } else {
            DesktopDoctorCheck {
                id: "outside_public_library".into(),
                label: "不在公共素材库内".into(),
                status: "pass".into(),
                message: None,
            }
        },
    );

    checks
}

#[tauri::command]
fn desktop_run_doctor(config: CutterDesktopConfig) -> DesktopDoctorResult {
    let public_root = Path::new(&config.public_library_root);
    let source_videos = public_root.join("source-videos");
    let mixlab_library = public_root.join(".mixlab-library");
    let current_index = mixlab_library
        .join("indexes")
        .join("source-transcript-index")
        .join("current.json");
    let mut checks = vec![
        check_directory(
            "root",
            "公共素材库目录",
            public_root,
            "公共素材库目录不存在或不可读",
        ),
        check_directory(
            "source_videos",
            "source-videos",
            &source_videos,
            "source-videos 不存在或不可读",
        ),
        check_directory(
            "mixlab_library",
            ".mixlab-library",
            &mixlab_library,
            ".mixlab-library 不存在或不可读",
        ),
        check_file(
            "current_index",
            "current.json",
            &current_index,
            "current.json 不存在或不可读",
        ),
        check_ready_materials(&current_index),
    ];
    checks.extend(check_workspace(&config));

    let status = if checks.iter().all(|check| check.status == "pass") {
        "pass"
    } else {
        "fail"
    };

    DesktopDoctorResult {
        status: status.into(),
        checks,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            desktop_config_path,
            desktop_app_version,
            desktop_log_dir,
            desktop_default_workspace_root,
            desktop_read_config,
            desktop_write_config,
            desktop_run_doctor,
            desktop_start_engine,
            desktop_open_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run MixLab Cutter desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_library_root(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "mixlab-cutter-desktop-{name}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create temp library root");
        root
    }

    #[test]
    fn doctor_accepts_m19_current_index_pointer_with_ready_manifest() {
        let root = temp_library_root("current-index-pointer");
        let index_root = root
            .join(".mixlab-library")
            .join("indexes")
            .join("source-transcript-index");
        let version_root = index_root.join("v000001");
        fs::create_dir_all(&version_root).expect("create index version root");
        fs::write(
            index_root.join("current.json"),
            r#"{"library_id":"lib_main_001","current_version":"v000001"}"#,
        )
        .expect("write current pointer");
        fs::write(
            version_root.join("index-manifest.json"),
            r#"{"schema_version":"1.0","ready_video_count":3}"#,
        )
        .expect("write index manifest");

        let check = check_ready_materials(&index_root.join("current.json"));

        fs::remove_dir_all(root).ok();
        assert_eq!(check.status, "pass");
    }
}
