#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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
const SEARCHD_PORT: u16 = 3790;
const SEARCHD_READY_TIMEOUT_MS: u64 = 30_000;
const SEARCHD_HEALTH_READ_TIMEOUT_MS: u64 = 20_000;
const SEARCHD_API_TIMEOUT_MS: &str = "20000";

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

fn desktop_searchd_cache_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        return Ok(PathBuf::from(local_app_data)
            .join("MixLab Cutter")
            .join("cache")
            .join("searchd"));
    }

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位本地搜索索引缓存目录：{error}"))?;
    Ok(dir.join("cache").join("searchd"))
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

fn http_health_endpoint_is_ready_with_timeouts(
    host: &str,
    port: u16,
    connect_timeout: Duration,
    io_timeout: Duration,
) -> bool {
    let Ok(address) = format!("{host}:{port}").parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, connect_timeout) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(io_timeout));
    let _ = stream.set_write_timeout(Some(io_timeout));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok() && health_response_is_ready(&response)
}

fn http_health_endpoint_is_ready(host: &str, port: u16) -> bool {
    http_health_endpoint_is_ready_with_timeouts(
        host,
        port,
        Duration::from_millis(250),
        Duration::from_millis(500),
    )
}

fn http_get_json_with_timeouts(
    host: &str,
    port: u16,
    path: &str,
    connect_timeout: Duration,
    io_timeout: Duration,
) -> Option<Value> {
    let Ok(address) = format!("{host}:{port}").parse::<SocketAddr>() else {
        return None;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, connect_timeout) else {
        return None;
    };

    let _ = stream.set_read_timeout(Some(io_timeout));
    let _ = stream.set_write_timeout(Some(io_timeout));
    let request =
        format!("GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return None;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err()
        || !(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
    {
        return None;
    }

    let body = response
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .unwrap_or(response.as_str());
    serde_json::from_str::<Value>(body).ok()
}

fn current_api_has_searchd_backend(host: &str, port: u16) -> bool {
    if let Some(payload) = http_get_json_with_timeouts(
        host,
        port,
        "/health",
        Duration::from_millis(500),
        Duration::from_millis(1_000),
    ) {
        if payload
            .get("data")
            .and_then(|data| data.get("searchd_configured"))
            .and_then(Value::as_bool)
            == Some(true)
        {
            return true;
        }
    }

    let Some(payload) = http_get_json_with_timeouts(
        host,
        port,
        "/cutter/runtime-status",
        Duration::from_millis(500),
        Duration::from_millis(2_500),
    ) else {
        return false;
    };

    let search_backend = payload
        .get("data")
        .and_then(|data| data.get("search_backend"));
    let mode = search_backend
        .and_then(|backend| backend.get("mode"))
        .and_then(Value::as_str);

    mode == Some("searchd")
}

#[cfg(windows)]
fn stop_windows_process_tree(process_name: &str) {
    let mut command = Command::new("taskkill.exe");
    command.arg("/F").arg("/T").arg("/IM").arg(process_name);
    command.stdout(Stdio::null()).stderr(Stdio::null());
    command.creation_flags(CREATE_NO_WINDOW);
    let _ = command.status();
}

#[cfg(not(windows))]
fn stop_windows_process_tree(_process_name: &str) {}

fn wait_for_health_endpoint(
    app: &AppHandle,
    event_prefix: &str,
    host: &str,
    port: u16,
    timeout: Duration,
    io_timeout: Duration,
) -> bool {
    let started = Instant::now();
    let mut attempt = 0_u32;

    loop {
        attempt += 1;
        if http_health_endpoint_is_ready_with_timeouts(
            host,
            port,
            Duration::from_millis(500),
            io_timeout,
        ) {
            desktop_host_log(
                app,
                &format!("{event_prefix}_ready"),
                json!({ "attempt": attempt, "elapsed_ms": started.elapsed().as_millis() }),
            );
            return true;
        }

        if started.elapsed() >= timeout {
            desktop_host_log(
                app,
                &format!("{event_prefix}_ready_timeout"),
                json!({ "attempt": attempt, "elapsed_ms": started.elapsed().as_millis() }),
            );
            return false;
        }

        thread::sleep(Duration::from_millis(500));
    }
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

fn spawn_visible_process(command: &mut Command) -> Result<(), String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

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

fn spawn_searchd(app: &AppHandle, config: &CutterDesktopConfig) -> Result<(), String> {
    let searchd_path = match resolve_searchd_path(app) {
        Ok(path) => path,
        Err(error) => {
            desktop_host_log(app, "searchd_missing", json!({ "error": error }));
            return Err(error);
        }
    };
    let mut searchd_command = Command::new(&searchd_path);
    let release_cache_root = Path::new(&config.local_workspace_root).join("cache");
    let searchd_cache_root = desktop_searchd_cache_dir_path(app)?;
    fs::create_dir_all(&searchd_cache_root)
        .map_err(|error| format!("无法创建本地搜索索引缓存目录：{error}"))?;
    searchd_command
        .arg("--library-root")
        .arg(&config.public_library_root)
        .arg("--release-root")
        .arg(&release_cache_root)
        .arg("--cache-root")
        .arg(&searchd_cache_root)
        .arg("--host")
        .arg(SEARCHD_HOST)
        .arg("--port")
        .arg(SEARCHD_PORT.to_string());
    if let Some(parent) = searchd_path.parent() {
        searchd_command.current_dir(parent);
    }

    match spawn_logged_process(app, &mut searchd_command, "mixlab-searchd") {
        Ok(pid) => {
            desktop_host_log(
                app,
                "searchd_spawned",
                json!({ "pid": pid, "searchd_path": path_string(searchd_path), "library_root": config.public_library_root, "release_root": path_string(release_cache_root), "cache_root": path_string(searchd_cache_root) }),
            );
            Ok(())
        }
        Err(error) => {
            desktop_host_log(app, "searchd_spawn_failed", json!({ "error": error }));
            Err(error)
        }
    }
}

fn wait_for_searchd_ready(app: &AppHandle) -> bool {
    wait_for_health_endpoint(
        app,
        "searchd",
        SEARCHD_HOST,
        SEARCHD_PORT,
        Duration::from_millis(SEARCHD_READY_TIMEOUT_MS),
        Duration::from_millis(SEARCHD_HEALTH_READ_TIMEOUT_MS),
    )
}

fn ensure_searchd_started(app: &AppHandle, config: &CutterDesktopConfig) -> Result<bool, String> {
    let mut searchd_is_ready = http_health_endpoint_is_ready(SEARCHD_HOST, SEARCHD_PORT);
    if searchd_is_ready {
        desktop_host_log(
            app,
            "searchd_already_ready",
            json!({ "searchd_base_url": searchd_base_url() }),
        );
        return Ok(true);
    }

    if tcp_port_accepts_connection(SEARCHD_HOST, SEARCHD_PORT) {
        desktop_host_log(
            app,
            "searchd_port_accepts_connection",
            json!({ "searchd_base_url": searchd_base_url(), "message": "端口已打开但健康检查尚未完成，按本地搜索服务预热中处理" }),
        );
        searchd_is_ready = wait_for_searchd_ready(app);
        if searchd_is_ready {
            return Ok(true);
        }

        desktop_host_log(
            app,
            "searchd_unhealthy_restart",
            json!({ "searchd_base_url": searchd_base_url(), "message": "本地搜索服务长时间未完成预热，准备重启 searchd" }),
        );
        stop_windows_process_tree(SEARCHD_EXECUTABLE_NAME);
        thread::sleep(Duration::from_millis(800));
    } else {
        desktop_host_log(
            app,
            "searchd_port_closed",
            json!({ "searchd_base_url": searchd_base_url() }),
        );
    }

    spawn_searchd(app, config)?;
    Ok(wait_for_searchd_ready(app))
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_start_engine(app: AppHandle, config_path: String) -> Result<(), String> {
    desktop_host_log(
        &app,
        "engine_start_requested",
        json!({ "config_path": config_path }),
    );

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

    if http_health_endpoint_is_ready("127.0.0.1", 3789) {
        if current_api_has_searchd_backend("127.0.0.1", 3789) {
            let searchd_is_ready = ensure_searchd_started(&app, &config)?;
            desktop_host_log(
                &app,
                "engine_already_ready",
                json!({
                    "api_address": "http://127.0.0.1:3789",
                    "searchd_base_url": searchd_base_url(),
                    "searchd_ready": searchd_is_ready,
                }),
            );
            return Ok(());
        }

        desktop_host_log(
            &app,
            "engine_existing_without_searchd",
            json!({ "api_address": "http://127.0.0.1:3789", "message": "检测到旧本机引擎未接入 searchd，准备重启本机引擎" }),
        );
        stop_windows_process_tree(CUTTER_API_SIDECAR_EXECUTABLE_NAME);
        stop_windows_process_tree(SEARCHD_EXECUTABLE_NAME);
        thread::sleep(Duration::from_millis(800));
    }

    if tcp_port_accepts_connection("127.0.0.1", 3789) {
        let message = "127.0.0.1:3789 已被其他进程占用，但 /health 不是 MixLab 本机引擎。请结束占用该端口的进程后重试。";
        desktop_host_log(&app, "engine_port_occupied", json!({ "error": message }));
        return Err(message.into());
    }

    let searchd_is_ready = ensure_searchd_started(&app, &config)?;

    let sidecar_path = match resolve_cutter_api_sidecar_path(&app) {
        Ok(path) => path,
        Err(error) => {
            desktop_host_log(&app, "engine_sidecar_missing", json!({ "error": error }));
            return Err(error);
        }
    };
    let mut command = Command::new(&sidecar_path);
    let searchd_cache_root = desktop_searchd_cache_dir_path(&app)?;
    command.arg("--config").arg(&config_path);
    command.env("MIXLAB_SEARCHD_BASE_URL", searchd_base_url());
    command.env("MIXLAB_SEARCHD_TIMEOUT_MS", SEARCHD_API_TIMEOUT_MS);
    command.env("MIXLAB_CUTTER_SEARCHD_CACHE_ROOT", &searchd_cache_root);
    configure_bundled_runtime_env(&app, &mut command);
    if let Some(parent) = sidecar_path.parent() {
        command.current_dir(parent);
    }

    match spawn_logged_process(&app, &mut command, "cutter-api-sidecar") {
        Ok(pid) => {
            desktop_host_log(
                &app,
                "engine_sidecar_spawned",
                json!({ "pid": pid, "sidecar_path": path_string(sidecar_path), "config_path": config_path, "searchd_base_url": searchd_base_url(), "searchd_ready": searchd_is_ready, "searchd_timeout_ms": SEARCHD_API_TIMEOUT_MS, "searchd_cache_root": path_string(searchd_cache_root) }),
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

#[cfg(windows)]
fn windows_explorer_path() -> PathBuf {
    env::var("SystemRoot")
        .or_else(|_: env::VarError| env::var("WINDIR"))
        .map(|root| PathBuf::from(root).join("explorer.exe"))
        .unwrap_or_else(|_| PathBuf::from("explorer.exe"))
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_open_directory(app: AppHandle, path_value: String) -> Result<(), String> {
    let trimmed = path_value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let target = PathBuf::from(trimmed);
    fs::create_dir_all(&target).map_err(|error| format!("无法创建目录：{error}"))?;
    desktop_host_log(
        &app,
        "open_directory_requested",
        json!({ "path": path_string(target.clone()) }),
    );

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&target);
        command
    };

    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new(windows_explorer_path());
        command.arg(&target);
        command
    };

    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };

    match spawn_visible_process(&mut command) {
        Ok(()) => {
            desktop_host_log(
                &app,
                "open_directory_spawned",
                json!({ "path": path_string(target) }),
            );
            Ok(())
        }
        Err(error) => {
            desktop_host_log(
                &app,
                "open_directory_failed",
                json!({ "path": path_string(target), "error": error }),
            );
            Err(error)
        }
    }
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

fn read_json_file(path: &Path, label: &str) -> Result<Value, String> {
    let raw =
        fs::read_to_string(path).map_err(|error| format!("{label} 不存在或不可读：{error}"))?;
    serde_json::from_str::<Value>(&raw).map_err(|error| format!("{label} 无法解析：{error}"))
}

fn current_index_manifest_path(current_json_path: &Path) -> Result<PathBuf, String> {
    let current = read_json_file(current_json_path, "current.json")?;
    let current_version = current
        .get("current_version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .ok_or_else(|| "current.json 缺少 current_version".to_string())?;
    let index_root = current_json_path
        .parent()
        .ok_or_else(|| "current.json 路径缺少索引目录".to_string())?;

    Ok(index_root.join(current_version).join("index-manifest.json"))
}

fn first_index_source_video_id(index_manifest: &Value) -> Option<String> {
    index_manifest
        .get("source_video_ids")
        .and_then(Value::as_array)
        .and_then(|ids| ids.iter().find_map(Value::as_str))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(String::from)
}

fn source_video_relative_path(source_manifest: &Value) -> Option<&str> {
    source_manifest
        .get("source_folder_relative_path")
        .and_then(Value::as_str)
        .or_else(|| source_manifest.get("relative_path").and_then(Value::as_str))
        .map(str::trim)
        .filter(|relative_path| !relative_path.is_empty())
}

fn resolve_safe_source_video_path(
    source_videos_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let normalized = relative_path.trim().replace('\\', "/");
    let relative = Path::new(&normalized);

    if normalized.is_empty() || relative.is_absolute() {
        return Err(format!("源视频相对路径非法：{relative_path}"));
    }

    let mut resolved = source_videos_root.to_path_buf();
    for component in relative.components() {
        match component {
            Component::Normal(part) => resolved.push(part),
            Component::CurDir => {}
            _ => return Err(format!("源视频相对路径非法：{relative_path}")),
        }
    }

    Ok(resolved)
}

fn sample_source_video_path(
    public_root: &Path,
    current_json_path: &Path,
) -> Result<PathBuf, String> {
    let index_manifest_path = current_index_manifest_path(current_json_path)?;
    let index_manifest = read_json_file(&index_manifest_path, "index-manifest.json")?;
    let source_video_id = first_index_source_video_id(&index_manifest)
        .ok_or_else(|| "index-manifest.json 缺少可抽样的 source_video_ids".to_string())?;
    let source_manifest_path = public_root
        .join(".mixlab-library")
        .join("videos")
        .join(&source_video_id)
        .join("source-video.json");
    let source_manifest = read_json_file(&source_manifest_path, "source-video.json")?;
    let relative_path = source_video_relative_path(&source_manifest)
        .ok_or_else(|| format!("抽样素材 {source_video_id} 缺少源视频相对路径"))?;

    resolve_safe_source_video_path(&public_root.join("source-videos"), relative_path)
}

fn check_sample_source_video(public_root: &Path, current_json_path: &Path) -> DesktopDoctorCheck {
    match sample_source_video_path(public_root, current_json_path) {
        Ok(source_path) => match fs::metadata(&source_path) {
            Ok(metadata) if metadata.is_file() => DesktopDoctorCheck {
                id: "sample_source_video".into(),
                label: "抽样源视频".into(),
                status: "pass".into(),
                message: None,
            },
            Ok(_) => DesktopDoctorCheck {
                id: "sample_source_video".into(),
                label: "抽样源视频".into(),
                status: "fail".into(),
                message: Some(format!("抽样源视频不是文件：{}", source_path.display())),
            },
            Err(error) => DesktopDoctorCheck {
                id: "sample_source_video".into(),
                label: "抽样源视频".into(),
                status: "fail".into(),
                message: Some(format!(
                    "抽样源视频不可读：{}。请确认 Windows 选择的是 PublicLibrary 根目录，并且 source-videos 已共享可读。{error}",
                    source_path.display()
                )),
            },
        },
        Err(message) => DesktopDoctorCheck {
            id: "sample_source_video".into(),
            label: "抽样源视频".into(),
            status: "fail".into(),
            message: Some(message),
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
        check_sample_source_video(public_root, &current_index),
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

    #[test]
    fn doctor_accepts_sample_source_video_from_current_index() {
        let root = temp_library_root("sample-source-video");
        let index_root = root
            .join(".mixlab-library")
            .join("indexes")
            .join("source-transcript-index");
        let version_root = index_root.join("v000001");
        let source_manifest_root = root.join(".mixlab-library").join("videos").join("V000001");
        let source_file = root
            .join("source-videos")
            .join("王牧笛")
            .join("1.房产置换与资产优化.mp4");

        fs::create_dir_all(&version_root).expect("create index version root");
        fs::create_dir_all(&source_manifest_root).expect("create source manifest root");
        fs::create_dir_all(source_file.parent().expect("source file parent"))
            .expect("create source file parent");
        fs::write(
            index_root.join("current.json"),
            r#"{"library_id":"lib_main_001","current_version":"v000001"}"#,
        )
        .expect("write current pointer");
        fs::write(
            version_root.join("index-manifest.json"),
            r#"{"schema_version":"1.0","ready_video_count":1,"source_video_ids":["V000001"]}"#,
        )
        .expect("write index manifest");
        fs::write(
            source_manifest_root.join("source-video.json"),
            r#"{"source_video_id":"V000001","source_folder_relative_path":"王牧笛/1.房产置换与资产优化.mp4"}"#,
        )
        .expect("write source manifest");
        fs::write(&source_file, b"video").expect("write source video");

        let check = check_sample_source_video(&root, &index_root.join("current.json"));

        fs::remove_dir_all(root).ok();
        assert_eq!(check.status, "pass");
    }

    #[test]
    fn doctor_reports_missing_sample_source_video() {
        let root = temp_library_root("missing-sample-source-video");
        let index_root = root
            .join(".mixlab-library")
            .join("indexes")
            .join("source-transcript-index");
        let version_root = index_root.join("v000001");
        let source_manifest_root = root.join(".mixlab-library").join("videos").join("V000001");

        fs::create_dir_all(&version_root).expect("create index version root");
        fs::create_dir_all(&source_manifest_root).expect("create source manifest root");
        fs::write(
            index_root.join("current.json"),
            r#"{"library_id":"lib_main_001","current_version":"v000001"}"#,
        )
        .expect("write current pointer");
        fs::write(
            version_root.join("index-manifest.json"),
            r#"{"schema_version":"1.0","ready_video_count":1,"source_video_ids":["V000001"]}"#,
        )
        .expect("write index manifest");
        fs::write(
            source_manifest_root.join("source-video.json"),
            r#"{"source_video_id":"V000001","source_folder_relative_path":"missing.mp4"}"#,
        )
        .expect("write source manifest");

        let check = check_sample_source_video(&root, &index_root.join("current.json"));

        fs::remove_dir_all(root).ok();
        assert_eq!(check.status, "fail");
        assert!(check
            .message
            .unwrap_or_default()
            .contains("抽样源视频不可读"));
    }
}
