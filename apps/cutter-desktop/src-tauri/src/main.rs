#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    sync::Mutex,
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use sha2::{Digest, Sha256};
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
static FEEDBACK_UPLOAD_LOCK: Mutex<()> = Mutex::new(());

const UPDATE_MANIFEST_ENV: &str = "MIXLAB_CUTTER_UPDATE_MANIFEST";
const REPAIR_TOOL_EXECUTABLE_NAME: &str = "MixLab Cutter 修复工具.exe";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdateManifest {
    version: String,
    installer: String,
    sha256: String,
    #[serde(default)]
    size_bytes: Option<u64>,
    #[serde(default)]
    release_notes: Option<String>,
    #[serde(default)]
    min_supported_version: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateCheckResult {
    available: bool,
    current_version: String,
    latest_version: String,
    notes: Option<String>,
    size_bytes: Option<u64>,
    manifest: Option<UpdateManifest>,
}

fn version_parts(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn update_is_newer(current: &str, latest: &str) -> bool {
    let current_parts = version_parts(current);
    let latest_parts = version_parts(latest);
    let count = current_parts.len().max(latest_parts.len());
    for index in 0..count {
        let current_part = current_parts.get(index).copied().unwrap_or(0);
        let latest_part = latest_parts.get(index).copied().unwrap_or(0);
        if latest_part > current_part {
            return true;
        }
        if latest_part < current_part {
            return false;
        }
    }
    false
}

fn desktop_update_manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(override_path) = env::var(UPDATE_MANIFEST_ENV) {
        if !override_path.trim().is_empty() {
            return Ok(PathBuf::from(override_path));
        }
    }
    let config_path = desktop_config_file(app)?;
    let raw_config = read_desktop_config_from_path(&config_path)
        .map_err(|error| format!("读取桌面配置失败，无法检查更新：{error}"))?;
    let (config, _) = sanitize_desktop_config(raw_config);
    let public_root = PathBuf::from(config.public_library_root.trim());
    let parent = public_root
        .parent()
        .ok_or_else(|| "无法从公共素材库路径推导更新目录".to_string())?;
    Ok(parent.join("安装包").join("MixLab Cutter").join("update.json"))
}

fn read_update_manifest(app: &AppHandle) -> Result<UpdateManifest, String> {
    let path = desktop_update_manifest_path(app)?;
    let raw = fs::read_to_string(&path).map_err(|error| {
        format!("无法读取更新清单（{}）：{error}。请确认已连接 NAS 并检查公共素材库路径。", path.display())
    })?;
    serde_json::from_str(raw.trim_start_matches('﻿')).map_err(|error| format!("更新清单格式错误：{error}"))
}

fn update_installer_name_is_valid(installer_name: &str) -> bool {
    !installer_name.trim().is_empty()
        && Path::new(installer_name).file_name().and_then(|name| name.to_str()) == Some(installer_name)
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("无法读取安装包：{error}"))?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeedbackSubmission {
    category: String,
    message: String,
    #[serde(default)]
    expected: Option<String>,
    #[serde(default)]
    context: Value,
    #[serde(default)]
    events: Vec<Value>,
    #[serde(default)]
    screenshot_png_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FeedbackSubmitResult {
    feedback_id: String,
    delivered: bool,
    pending_count: usize,
}

fn feedback_root() -> PathBuf {
    env::var("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("MixLab Cutter").join("feedback"))
        .unwrap_or_else(|_| env::temp_dir().join("MixLab Cutter").join("feedback"))
}

fn feedback_nas_root() -> PathBuf {
    if let Ok(override_root) = env::var("MIXLAB_CUTTER_FEEDBACK_NAS_ROOT") {
        if !override_root.trim().is_empty() {
            return PathBuf::from(override_root);
        }
    }
    PathBuf::from(r"\\192.168.1.27\MixLab\CutterFeedback")
}

fn feedback_pending_dir() -> PathBuf {
    feedback_root().join("pending")
}

fn feedback_sent_dir() -> PathBuf {
    feedback_root().join("sent")
}

fn feedback_machine_suffix() -> u64 {
    let mut hasher = DefaultHasher::new();
    env::var("COMPUTERNAME").unwrap_or_default().hash(&mut hasher);
    env::var("USERNAME").unwrap_or_default().hash(&mut hasher);
    hasher.finish()
}

fn feedback_unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos() as u64)
        .unwrap_or(0);
    let machine = feedback_machine_suffix() % 10_000;
    let random = (nanos ^ (std::process::id() as u64).rotate_left(13)) % 10_000;
    format!("{machine:04}{random:04}")
}

fn feedback_id_for_directory(pending: &Path, sent: &Path) -> String {
    let now = time::OffsetDateTime::now_utc();
    let date = format!("{:04}{:02}{:02}", now.year(), u8::from(now.month()), now.day());
    for offset in 0..1000 {
        let suffix = feedback_unique_suffix();
        let suffix = if offset == 0 {
            suffix
        } else {
            format!("{:08}", (suffix.parse::<u64>().unwrap_or(0) + offset as u64) % 100_000_000)
        };
        let id = format!("FB-{date}-{suffix}");
        if !pending.join(&id).exists() && !sent.join(&id).exists() {
            return id;
        }
    }
    format!("FB-{date}-{:08}", (now.unix_timestamp().unsigned_abs() as u64) % 100_000_000)
}

fn copy_feedback_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| format!("创建反馈目录失败：{error}"))?;
    for entry in fs::read_dir(source).map_err(|error| format!("读取反馈目录失败：{error}"))? {
        let entry = entry.map_err(|error| format!("读取反馈文件失败：{error}"))?;
        let path = entry.path();
        let target = destination.join(entry.file_name());
        if path.is_dir() {
            copy_feedback_directory(&path, &target)?;
        } else {
            fs::copy(&path, &target).map_err(|error| format!("复制反馈文件失败：{error}"))?;
        }
    }
    Ok(())
}

fn feedback_tail(value: &str, max_chars: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= max_chars {
        return value.to_string();
    }
    chars[chars.len() - max_chars..].iter().collect()
}

fn write_feedback_log_tails(directory: &Path) {
    let logs_dir = directory.join("logs");
    let _ = fs::create_dir_all(&logs_dir);
    let mut app_log = String::new();
    let mut api_log = String::new();
    let mut ffmpeg_log = String::new();
    if let Ok(appdata) = env::var("APPDATA") {
        let source_dir = PathBuf::from(appdata).join("MixLab Cutter").join("logs");
        if let Ok(entries) = fs::read_dir(source_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
                let Ok(text) = fs::read_to_string(&path) else {
                    continue;
                };
                if name.contains("cutter-api") || name.contains("sidecar") {
                    api_log.push_str(&text);
                    api_log.push('\n');
                }
                if name.contains("ffmpeg") {
                    ffmpeg_log.push_str(&text);
                    ffmpeg_log.push('\n');
                }
                if name.contains("desktop-host") || name.contains("app") || name.contains("mixlab-searchd") {
                    app_log.push_str(&text);
                    app_log.push('\n');
                }
            }
        }
    }
    if ffmpeg_log.trim().is_empty() {
        let filtered = api_log
            .lines()
            .filter(|line| {
                let lower = line.to_ascii_lowercase();
                lower.contains("ffmpeg") || lower.contains("ffprobe") || lower.contains("error")
            })
            .collect::<Vec<_>>()
            .join("\n");
        ffmpeg_log = if filtered.trim().is_empty() {
            format!("[本次会话未捕获 ffmpeg 专属行；以下为 cutter-api 尾部]\n{}", feedback_tail(&api_log, 4_000))
        } else {
            filtered
        };
    }
    if app_log.trim().is_empty() {
        app_log = api_log.clone();
    }
    let _ = fs::write(logs_dir.join("app.log"), feedback_tail(&app_log, 32_000));
    let _ = fs::write(logs_dir.join("cutter-api.log"), feedback_tail(&api_log, 32_000));
    let _ = fs::write(logs_dir.join("ffmpeg.log"), feedback_tail(&ffmpeg_log, 32_000));
}

fn feedback_upload_destination(inbox: &Path, feedback_id: &str) -> PathBuf {
    let original = inbox.join(feedback_id);
    if original.exists() {
        inbox.join(format!("{feedback_id}-{}", feedback_unique_suffix()))
    } else {
        original
    }
}

fn try_upload_feedback(directory: &Path, feedback_id: &str) -> Result<(), String> {
    let nas_root = feedback_nas_root();
    let inbox = nas_root.join("inbox");
    fs::create_dir_all(&inbox).map_err(|error| format!("NAS 收件箱不可用：{error}"))?;
    // Never delete an existing feedback package. A collision gets a conflict suffix
    // so both packages are preserved for Mac-side review.
    let destination = feedback_upload_destination(&inbox, feedback_id);
    let partial = inbox.join(format!("{feedback_id}-{}.partial", feedback_unique_suffix()));
    copy_feedback_directory(directory, &partial)?;
    if destination.exists() {
        let _ = fs::remove_dir_all(&partial);
        return Err("NAS 收件箱已存在同名反馈，已保留原包并改用冲突后缀失败".into());
    }
    fs::rename(&partial, &destination).map_err(|error| {
        let _ = fs::remove_dir_all(&partial);
        format!("NAS 收件箱写入失败：{error}")
    })?;
    Ok(())
}

fn pending_feedback_count() -> usize {
    fs::read_dir(feedback_pending_dir())
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| {
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    entry.path().is_dir() && !name.starts_with('.')
                })
                .count()
        })
        .unwrap_or(0)
}

fn feedback_sent_destination(sent: &Path, feedback_id: &str) -> PathBuf {
    let original = sent.join(feedback_id);
    if original.exists() {
        sent.join(format!("{feedback_id}-{}", feedback_unique_suffix()))
    } else {
        original
    }
}

fn move_feedback_to_sent(directory: &Path, feedback_id: &str) {
    let sent = feedback_sent_dir();
    let _ = fs::create_dir_all(&sent);
    let target = feedback_sent_destination(&sent, feedback_id);
    if fs::rename(directory, &target).is_err() {
        if copy_feedback_directory(directory, &target).is_ok() {
            let _ = fs::remove_dir_all(directory);
        }
    }
}

fn deliver_pending_feedback() -> (usize, usize) {
    let _upload_guard = FEEDBACK_UPLOAD_LOCK.lock().ok();
    let pending = feedback_pending_dir();
    let mut sent = 0usize;
    let mut remaining = 0usize;
    if let Ok(entries) = fs::read_dir(&pending) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(id) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if id.starts_with('.') {
                continue;
            }
            match try_upload_feedback(&path, &id) {
                Ok(()) => {
                    move_feedback_to_sent(&path, &id);
                    sent += 1;
                }
                Err(error) => {
                    remaining += 1;
                    let _ = fs::write(
                        path.join("upload-error.json"),
                        serde_json::to_vec_pretty(&json!({
                            "error": error,
                            "updated_at": chrono_like_timestamp(),
                        }))
                        .unwrap_or_default(),
                    );
                }
            }
        }
    }
    (sent, pending_feedback_count().max(remaining))
}

fn chrono_like_timestamp() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

#[tauri::command]
fn desktop_feedback_pending_count() -> usize {
    pending_feedback_count()
}

#[tauri::command]
async fn desktop_flush_feedback_queue() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (sent, pending) = deliver_pending_feedback();
        json!({ "sent": sent, "pending": pending })
    })
    .await
    .map_err(|error| format!("反馈队列任务失败：{error}"))
}

fn capture_feedback_screenshot_blocking() -> Result<Option<String>, String> {
    let path = env::temp_dir().join(format!("mixlab-feedback-window-{}.png", std::process::id()));
    let escaped_path = path.to_string_lossy().replace('\'', "''");
    let script = r#"Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct MixLabRect { public int Left; public int Top; public int Right; public int Bottom; }
public class MixLabWindow {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out MixLabRect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
}
'@
[MixLabWindow]::SetProcessDPIAware() | Out-Null
$p = Get-Process -Id __PID__ -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { exit 2 }
$r = New-Object MixLabRect
if (-not [MixLabWindow]::GetWindowRect($h, [ref]$r)) { exit 3 }
$w = $r.Right - $r.Left
$height = $r.Bottom - $r.Top
if ($w -le 0 -or $height -le 0) { exit 4 }
$bmp = New-Object System.Drawing.Bitmap $w, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [MixLabWindow]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()
if (-not $ok) { $bmp.Dispose(); exit 5 }
$bmp.Save('__PATH__', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"#;
    let script = script
        .replace("__PID__", &std::process::id().to_string())
        .replace("__PATH__", &escaped_path);
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = command.spawn().map_err(|error| format!("截图命令启动失败：{error}"))?;
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(100)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = fs::remove_file(&path);
                return Ok(None);
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = fs::remove_file(&path);
                return Err(format!("截图进程等待失败：{error}"));
            }
        }
    }
    if !path.is_file() {
        let _ = fs::remove_file(&path);
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|error| format!("读取截图失败：{error}"))?;
    let _ = fs::remove_file(&path);
    Ok(Some(BASE64.encode(bytes)))
}

#[tauri::command]
async fn desktop_capture_feedback_screenshot() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(capture_feedback_screenshot_blocking)
        .await
        .map_err(|error| format!("截图任务失败：{error}"))?
}

fn submit_feedback_blocking(app: AppHandle, submission: FeedbackSubmission) -> Result<FeedbackSubmitResult, String> {
    let pending = feedback_pending_dir();
    let sent = feedback_sent_dir();
    fs::create_dir_all(&pending).map_err(|error| format!("创建反馈队列失败：{error}"))?;
    fs::create_dir_all(&sent).map_err(|error| format!("创建反馈队列失败：{error}"))?;
    let feedback_id = feedback_id_for_directory(&pending, &sent);
    let staging = pending.join(format!(".{feedback_id}.building"));
    let directory = pending.join(&feedback_id);
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|error| format!("创建反馈包失败：{error}"))?;
    let created_at = chrono_like_timestamp();
    let app_version = env!("CARGO_PKG_VERSION").to_string();
    let build_commit = submission
        .context
        .get("build_commit")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let release_version = submission
        .context
        .get("release_version")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let feedback = json!({
        "schema_version": "1.0",
        "feedback_id": feedback_id,
        "created_at": created_at,
        "category": submission.category,
        "message": submission.message,
        "expected": submission.expected.clone().unwrap_or_default(),
        "app_version": app_version,
        "username": submission.context.get("username").and_then(Value::as_str).unwrap_or("unknown"),
        "build_commit": build_commit,
        "release_version": release_version,
        "page": submission.context.get("page").and_then(Value::as_str).unwrap_or("unknown"),
        "context": submission.context,
        "timings": submission.context.get("timings").cloned().unwrap_or_else(|| json!({})),
        "errors": submission.context.get("errors").cloned().unwrap_or_else(|| json!([])),
        "attachments": if submission.screenshot_png_base64.is_some() { json!(["screenshot.png", "events.jsonl"]) } else { json!(["events.jsonl"]) },
    });
    fs::write(staging.join("feedback.json"), serde_json::to_vec_pretty(&feedback).map_err(|error| error.to_string())?)
        .map_err(|error| format!("写入反馈包失败：{error}"))?;
    let context_bytes = serde_json::to_vec_pretty(&submission.context).map_err(|error| error.to_string())?;
    fs::write(staging.join("context.json"), context_bytes).map_err(|error| format!("写入反馈上下文失败：{error}"))?;
    let events = submission.events.iter().map(|event| event.to_string()).collect::<Vec<_>>().join("\n");
    fs::write(staging.join("events.jsonl"), format!("{events}\n")).map_err(|error| format!("写入操作轨迹失败：{error}"))?;
    if let Some(encoded) = submission.screenshot_png_base64.as_deref() {
        let bytes = BASE64.decode(encoded).map_err(|error| format!("截图数据无效：{error}"))?;
        fs::write(staging.join("screenshot.png"), bytes).map_err(|error| format!("写入截图失败：{error}"))?;
    }
    write_feedback_log_tails(&staging);
    fs::rename(&staging, &directory).map_err(|error| format!("反馈包入队失败：{error}"))?;
    let _upload_guard = FEEDBACK_UPLOAD_LOCK.lock().ok();
    let delivered = if directory.exists() {
        match try_upload_feedback(&directory, &feedback_id) {
            Ok(()) => {
                move_feedback_to_sent(&directory, &feedback_id);
                true
            }
            Err(error) => {
                let _ = fs::write(
                    directory.join("upload-error.json"),
                    serde_json::to_vec_pretty(&json!({ "error": error, "updated_at": chrono_like_timestamp() })).unwrap_or_default(),
                );
                false
            }
        }
    } else {
        true
    };
    let pending_count = pending_feedback_count();
    desktop_host_log(&app, "feedback_submitted", json!({ "feedback_id": feedback_id, "delivered": delivered }));
    Ok(FeedbackSubmitResult { feedback_id, delivered, pending_count })
}

#[tauri::command]
async fn desktop_submit_feedback(app: AppHandle, submission: FeedbackSubmission) -> Result<FeedbackSubmitResult, String> {
    tauri::async_runtime::spawn_blocking(move || submit_feedback_blocking(app, submission))
        .await
        .map_err(|error| format!("反馈打包任务失败：{error}"))?
}

#[tauri::command]
fn desktop_check_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let manifest = read_update_manifest(&app)?;
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let latest_version = manifest.version.trim().to_string();
    let available = update_is_newer(&current_version, &latest_version);
    desktop_host_log(&app, "update_check_completed", json!({ "current_version": current_version, "latest_version": latest_version, "available": available }));
    Ok(UpdateCheckResult {
        available,
        current_version,
        latest_version,
        notes: manifest.release_notes.clone(),
        size_bytes: manifest.size_bytes,
        manifest: if available { Some(manifest) } else { None },
    })
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_download_update(app: AppHandle, manifest: UpdateManifest) -> Result<String, String> {
    let installer_name = manifest.installer.trim();
    if !update_installer_name_is_valid(installer_name) {
        return Err("更新清单中的安装包名称不合法".into());
    }
    let manifest_path = desktop_update_manifest_path(&app)?;
    let source_dir = manifest_path.parent().ok_or_else(|| "无法定位更新清单目录".to_string())?;
    let source = source_dir.join(installer_name);
    if !source.is_file() {
        return Err(format!("更新安装包不存在：{}", source.display()));
    }
    let updates_dir = env::var("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("MixLab Cutter").join("updates"))
        .unwrap_or_else(|_| std::env::temp_dir().join("MixLab Cutter").join("updates"));
    fs::create_dir_all(&updates_dir).map_err(|error| format!("无法创建更新目录：{error}"))?;
    let destination = updates_dir.join(installer_name);
    let temporary = updates_dir.join(format!("{installer_name}.part"));
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    if let Err(error) = fs::copy(&source, &temporary) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("下载更新失败：{error}"));
    }
    let digest = match file_sha256(&temporary) {
        Ok(digest) => digest,
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
    };
    let expected = manifest.sha256.trim().to_ascii_lowercase();
    if digest.to_ascii_lowercase() != expected {
        let _ = fs::remove_file(&temporary);
        return Err(format!("SHA256 校验失败：期望 {expected}，实际 {digest}"));
    }
    if destination.exists() {
        let _ = fs::remove_file(&destination);
    }
    fs::rename(&temporary, &destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("保存更新安装包失败：{error}")
    })?;
    desktop_host_log(&app, "update_download_completed", json!({ "installer": path_string(destination.clone()), "sha256": manifest.sha256 }));
    Ok(path_string(destination))
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_install_update(app: AppHandle, installer_path: String, expected_sha256: String) -> Result<(), String> {
    let updates_dir = env::var("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("MixLab Cutter").join("updates"))
        .unwrap_or_else(|_| std::env::temp_dir().join("MixLab Cutter").join("updates"));
    let installer = PathBuf::from(installer_path.trim());
    if !installer.is_file() {
        return Err("更新安装包不存在，请重新检查更新".into());
    }
    if installer.parent() != Some(updates_dir.as_path()) {
        return Err("更新安装包路径不合法".into());
    }
    let expected_hash = expected_sha256.trim().to_ascii_lowercase();
    if expected_hash.len() != 64 {
        return Err("更新安装包缺少有效 SHA256".into());
    }
    let actual_hash = file_sha256(&installer)?;
    if actual_hash.to_ascii_lowercase() != expected_hash {
        return Err("更新安装包 SHA256 校验失败，已拒绝安装".into());
    }
    let helper = updates_dir.join(format!("install-update-{}.ps1", std::process::id()));
    let escaped_installer = installer.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference = 'SilentlyContinue'\nwhile (Get-Process -Id {} -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 500 }}\nStart-Process -FilePath '{}'\nRemove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force\n",
        std::process::id(),
        escaped_installer
    );
    fs::write(&helper, script).map_err(|error| format!("无法创建更新安装辅助脚本：{error}"))?;
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File"]);
    command.arg(&helper);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    command.spawn().map_err(|error| format!("无法启动更新安装程序：{error}"))?;
    desktop_host_log(&app, "update_install_started", json!({ "installer": path_string(installer.clone()) }));
    app.exit(0);
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

fn json_data_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get("data")
        .and_then(|data| data.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
}

fn path_matches(left: &str, right: &str) -> bool {
    !left.trim().is_empty()
        && !right.trim().is_empty()
        && normalized_for_compare(left) == normalized_for_compare(right)
}

fn release_cache_root_for_config(config: &CutterDesktopConfig) -> PathBuf {
    Path::new(&config.local_workspace_root).join("cache")
}

fn current_api_matches_desktop_config(host: &str, port: u16, config: &CutterDesktopConfig) -> bool {
    let Some(payload) = http_get_json_with_timeouts(
        host,
        port,
        "/health",
        Duration::from_millis(500),
        Duration::from_millis(1_000),
    ) else {
        return false;
    };

    let searchd_configured = payload
        .get("data")
        .and_then(|data| data.get("searchd_configured"))
        .and_then(Value::as_bool)
        == Some(true);
    let library_root = json_data_string(&payload, "library_root_path");
    let workspace_root = json_data_string(&payload, "workspace_root_path");

    searchd_configured
        && library_root
            .as_deref()
            .map(|path| path_matches(path, &config.public_library_root))
            .unwrap_or(false)
        && workspace_root
            .as_deref()
            .map(|path| path_matches(path, &config.local_workspace_root))
            .unwrap_or(false)
}

fn searchd_matches_desktop_config(config: &CutterDesktopConfig) -> bool {
    let Some(payload) = http_get_json_with_timeouts(
        SEARCHD_HOST,
        SEARCHD_PORT,
        "/health",
        Duration::from_millis(500),
        Duration::from_millis(1_000),
    ) else {
        return false;
    };

    let Some(library_root) = json_data_string(&payload, "library_root") else {
        return false;
    };
    let Some(release_root) = json_data_string(&payload, "release_root") else {
        return false;
    };
    let expected_release_root = path_string(release_cache_root_for_config(config));

    path_matches(&library_root, &config.public_library_root)
        && path_matches(&release_root, &expected_release_root)
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

fn engine_sidecar_process_names() -> [&'static str; 2] {
    [CUTTER_API_SIDECAR_EXECUTABLE_NAME, SEARCHD_EXECUTABLE_NAME]
}

/// 应用退出/窗口关闭时回收本机引擎子进程，避免 sidecar 在 3789/3790 上成为孤儿。
fn stop_engine_sidecars() {
    for process_name in engine_sidecar_process_names() {
        stop_windows_process_tree(process_name);
    }
}

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
    let release_cache_root = release_cache_root_for_config(config);
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
        if searchd_matches_desktop_config(config) {
            desktop_host_log(
                app,
                "searchd_already_ready",
                json!({ "searchd_base_url": searchd_base_url() }),
            );
            return Ok(true);
        }

        desktop_host_log(
            app,
            "searchd_config_mismatch_restart",
            json!({ "searchd_base_url": searchd_base_url(), "message": "本地搜索服务配置与当前桌面配置不一致，准备重启 searchd" }),
        );
        stop_windows_process_tree(SEARCHD_EXECUTABLE_NAME);
        thread::sleep(Duration::from_millis(800));
        searchd_is_ready = false;
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

    let raw_config = match read_desktop_config_from_path(Path::new(&config_path)) {
        Ok(config) => config,
        Err(error) => {
            desktop_host_log(&app, "engine_config_invalid", json!({ "error": error }));
            return Err(error);
        }
    };
    let (config, correction) = sanitize_desktop_config(raw_config);
    if let Some(reason) = correction {
        let path = Path::new(&config_path);
        if let Err(error) = write_desktop_config_to_path(path, &config) {
            desktop_host_log(
                &app,
                "engine_config_autocorrect_failed",
                json!({ "error": error, "reason": reason }),
            );
            return Err(error);
        }
        desktop_host_log(
            &app,
            "engine_config_autocorrected",
            json!({ "reason": reason, "local_workspace_root": config.local_workspace_root }),
        );
    }

    if http_health_endpoint_is_ready("127.0.0.1", 3789) {
        if current_api_matches_desktop_config("127.0.0.1", 3789, &config) {
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

        let message = if current_api_has_searchd_backend("127.0.0.1", 3789) {
            "检测到旧本机引擎配置与当前桌面配置不一致，准备重启本机引擎"
        } else {
            "检测到旧本机引擎未接入 searchd，准备重启本机引擎"
        };
        desktop_host_log(
            &app,
            "engine_existing_not_reusable",
            json!({ "api_address": "http://127.0.0.1:3789", "message": message }),
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

#[tauri::command]
fn desktop_launch_repair_tool(app: AppHandle, source: Option<String>) -> Result<String, String> {
    let launch_source = source.unwrap_or_else(|| "manual".to_string());
    if launch_source != "manual" && launch_source != "auto" {
        return Err("无效的修复工具启动来源".to_string());
    }

    let candidates = bundled_binary_path_candidates(&app, REPAIR_TOOL_EXECUTABLE_NAME);
    let repair_tool = candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| "修复工具未安装，请联系管理员".to_string())?;

    let mut command = Command::new(&repair_tool);
    if let Some(parent) = repair_tool.parent() {
        command.current_dir(parent);
    }
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map_err(|error| format!("启动修复工具失败：{error}"))?;

    desktop_host_log(
        &app,
        "repair_tool_launched",
        json!({
            "source": launch_source,
            "path": repair_tool.display().to_string()
        }),
    );
    Ok(repair_tool.display().to_string())
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

fn desktop_workspace_overlaps_public_library(config: &CutterDesktopConfig) -> bool {
    let public_root = config.public_library_root.trim();
    let workspace_root = config.local_workspace_root.trim();
    if public_root.is_empty() || workspace_root.is_empty() {
        return false;
    }

    path_is_same_or_child(workspace_root, public_root)
        || path_is_same_or_child(public_root, workspace_root)
}

fn sanitize_desktop_config(config: CutterDesktopConfig) -> (CutterDesktopConfig, Option<String>) {
    if !desktop_workspace_overlaps_public_library(&config) {
        return (config, None);
    }

    let mut next = config;
    next.local_workspace_root = desktop_default_workspace_root();
    (
        next,
        Some("本地工作区不能与公共素材库相同或互相包含，已恢复默认本地工作区".into()),
    )
}

fn write_desktop_config_to_path(path: &Path, config: &CutterDesktopConfig) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(config)
        .map_err(|error| format!("无法序列化桌面配置：{error}"))?;
    fs::write(path, format!("{raw}\n")).map_err(|error| format!("无法保存桌面配置：{error}"))
}

#[tauri::command]
fn desktop_read_config(app: AppHandle) -> Result<Option<CutterDesktopConfig>, String> {
    let path = desktop_config_file(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw_config = read_desktop_config_from_path(&path)?;
    let (config, correction) = sanitize_desktop_config(raw_config);
    if let Some(reason) = correction {
        write_desktop_config_to_path(&path, &config)?;
        desktop_host_log(
            &app,
            "desktop_config_autocorrected",
            json!({ "reason": reason, "local_workspace_root": config.local_workspace_root }),
        );
    }
    Ok(Some(config))
}

#[tauri::command]
fn desktop_write_config(
    app: AppHandle,
    config: CutterDesktopConfig,
) -> Result<CutterDesktopConfig, String> {
    if desktop_workspace_overlaps_public_library(&config) {
        return Err("本地工作区不能与公共素材库相同或互相包含，请选择 Windows 本机目录。".into());
    }

    let path = desktop_config_file(&app)?;
    write_desktop_config_to_path(&path, &config)?;
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

    checks.push(if desktop_workspace_overlaps_public_library(config) {
        DesktopDoctorCheck {
            id: "outside_public_library".into(),
            label: "不在公共素材库内".into(),
            status: "fail".into(),
            message: Some("本地工作区不能与公共素材库相同或互相包含".into()),
        }
    } else {
        DesktopDoctorCheck {
            id: "outside_public_library".into(),
            label: "不在公共素材库内".into(),
            status: "pass".into(),
            message: None,
        }
    });

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
    let app = tauri::Builder::default()
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
            desktop_open_directory,
            desktop_launch_repair_tool,
            desktop_check_update,
            desktop_download_update,
            desktop_install_update,
            desktop_capture_feedback_screenshot,
            desktop_submit_feedback,
            desktop_feedback_pending_count,
            desktop_flush_feedback_queue
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                stop_engine_sidecars();
                desktop_host_log(
                    window.app_handle(),
                    "app_window_close_cleanup",
                    json!({ "message": "terminating cutter-api sidecar and searchd" }),
                );
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build MixLab Cutter desktop app");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            stop_engine_sidecars();
            desktop_host_log(
                app_handle,
                "app_exit_cleanup",
                json!({ "message": "terminating cutter-api sidecar and searchd" }),
            );
        }
    });
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
    fn engine_cleanup_targets_both_sidecars() {
        let names = engine_sidecar_process_names();
        assert_eq!(names.len(), 2);
        assert!(names[0].contains("cutter-api-sidecar"));
        assert!(names[1].contains("mixlab-searchd"));
    }

    #[test]
    fn desktop_workspace_overlap_rejects_public_library_roots() {
        let same_root = CutterDesktopConfig {
            api_host: "127.0.0.1".into(),
            api_port: 3789,
            public_library_root: r"\\NAS\MixLab\PublicLibrary".into(),
            local_workspace_root: r"\\NAS\MixLab\PublicLibrary".into(),
            log_root: None,
            ffmpeg_path: None,
            ffprobe_path: None,
        };
        assert!(desktop_workspace_overlaps_public_library(&same_root));

        let parent_root = CutterDesktopConfig {
            local_workspace_root: r"\\NAS\MixLab".into(),
            ..same_root.clone()
        };
        assert!(desktop_workspace_overlaps_public_library(&parent_root));

        let local_root = CutterDesktopConfig {
            local_workspace_root: r"C:\Users\Allen\Videos\MixLabLocal".into(),
            ..same_root
        };
        assert!(!desktop_workspace_overlaps_public_library(&local_root));
    }

    #[test]
    fn sanitize_desktop_config_recovers_overlapping_workspace() {
        let (config, correction) = sanitize_desktop_config(CutterDesktopConfig {
            api_host: "127.0.0.1".into(),
            api_port: 3789,
            public_library_root: r"\\NAS\MixLab\PublicLibrary".into(),
            local_workspace_root: r"\\NAS\MixLab\PublicLibrary".into(),
            log_root: None,
            ffmpeg_path: None,
            ffprobe_path: None,
        });

        assert!(correction
            .unwrap_or_default()
            .contains("已恢复默认本地工作区"));
        assert!(!desktop_workspace_overlaps_public_library(&config));
        assert!(config.local_workspace_root.contains("MixLabLocal"));
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

    #[test]
    fn update_version_comparison_handles_numeric_segments() {
        assert!(update_is_newer("0.18.26", "0.18.27"));
        assert!(update_is_newer("0.18.9", "0.18.10"));
        assert!(!update_is_newer("0.18.27", "0.18.27"));
        assert!(!update_is_newer("0.18.27", "0.18.26"));
    }

    #[test]
    fn update_manifest_rejects_nested_installer_name() {
        assert!(update_installer_name_is_valid("MixLab Cutter_0.18.27_x64-setup.exe"));
        assert!(!update_installer_name_is_valid(r"..\\evil.exe"));
        assert!(!update_installer_name_is_valid("sub/evil.exe"));
        assert!(!update_installer_name_is_valid(""));
    }

    #[test]
    fn update_manifest_parses_and_hash_matches_file() {
        let manifest: UpdateManifest = serde_json::from_str(r#"{"version":"0.18.27","installer":"MixLab Cutter_0.18.27_x64-setup.exe","sha256":"abc","size_bytes":123,"release_notes":"notes"}"#).expect("manifest parse");
        assert_eq!(manifest.version, "0.18.27");
        assert_eq!(manifest.size_bytes, Some(123));
        assert_eq!(manifest.release_notes.as_deref(), Some("notes"));

        let root = temp_library_root("update-hash");
        let file = root.join("installer.exe");
        fs::write(&file, b"mixlab").expect("write installer");
        let digest = file_sha256(&file).expect("hash");
        fs::remove_dir_all(root).ok();
        assert_eq!(digest, "6ee040147a5059533e22f613ccdcb1eb433c7eb3a50e2385f92a44ad0fff24d3");
    }


    #[test]
    fn feedback_ids_are_unique_across_calls() {
        let root = temp_library_root("feedback-unique");
        let pending = root.join("pending");
        let sent = root.join("sent");
        fs::create_dir_all(&pending).expect("create pending");
        fs::create_dir_all(&sent).expect("create sent");
        let first = feedback_id_for_directory(&pending, &sent);
        let second = feedback_id_for_directory(&pending, &sent);
        fs::remove_dir_all(root).ok();
        assert_ne!(first, second);
        assert!(first.starts_with("FB-"));
        assert!(first.len() >= 16);
    }

    #[test]
    fn feedback_upload_uses_conflict_suffix_without_touching_existing_package() {
        let root = temp_library_root("feedback-conflict");
        let inbox = root.join("inbox");
        let existing = inbox.join("FB-20261102-1234");
        fs::create_dir_all(&existing).expect("create existing");
        fs::write(existing.join("feedback.json"), "{}").expect("write existing");
        let destination = feedback_upload_destination(&inbox, "FB-20261102-1234");
        let conflict_suffix = destination
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with("FB-20261102-1234-"));
        let existing_still_there = existing.join("feedback.json").is_file();
        fs::remove_dir_all(root).ok();
        assert!(conflict_suffix);
        assert!(existing_still_there);
    }


    #[test]
    fn feedback_upload_preserves_existing_package_on_conflict() {
        let root = temp_library_root("feedback-actual-conflict");
        let source = root.join("source");
        let nas_root = root.join("nas");
        let inbox = nas_root.join("inbox");
        let feedback_id = "FB-20261102-7777";
        let existing = inbox.join(feedback_id);
        fs::create_dir_all(&existing).expect("create existing");
        fs::write(existing.join("marker.txt"), "original").expect("write existing marker");
        fs::create_dir_all(&source).expect("create source");
        fs::write(source.join("feedback.json"), "{}").expect("write source");
        std::env::set_var("MIXLAB_CUTTER_FEEDBACK_NAS_ROOT", nas_root.to_string_lossy().to_string());
        let result = try_upload_feedback(&source, feedback_id);
        std::env::remove_var("MIXLAB_CUTTER_FEEDBACK_NAS_ROOT");
        let original_intact = fs::read_to_string(existing.join("marker.txt")).unwrap_or_default() == "original";
        let uploaded = fs::read_dir(&inbox)
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|entry| entry.file_name().to_string_lossy().starts_with("FB-20261102-7777-"))
                    .count()
            })
            .unwrap_or(0);
        fs::remove_dir_all(root).ok();
        assert!(result.is_ok());
        assert!(original_intact);
        assert_eq!(uploaded, 1);
    }


    #[test]
    fn feedback_sent_destination_preserves_existing_archive() {
        let root = temp_library_root("feedback-sent-conflict");
        let sent = root.join("sent");
        let existing = sent.join("FB-20261102-8888");
        fs::create_dir_all(&existing).expect("create sent archive");
        fs::write(existing.join("marker.txt"), "kept").expect("write marker");
        let destination = feedback_sent_destination(&sent, "FB-20261102-8888");
        let preserved = fs::read_to_string(existing.join("marker.txt")).unwrap_or_default() == "kept";
        let suffixed = destination
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with("FB-20261102-8888-"));
        fs::remove_dir_all(root).ok();
        assert!(preserved);
        assert!(suffixed);
    }

}
