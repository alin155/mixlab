use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

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

#[tauri::command]
fn desktop_read_config(app: AppHandle) -> Result<Option<CutterDesktopConfig>, String> {
    let path = desktop_config_file(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("无法读取桌面配置：{error}"))?;
    let config = serde_json::from_str::<CutterDesktopConfig>(&raw)
        .map_err(|error| format!("桌面配置格式无效：{error}"))?;
    Ok(Some(config))
}

#[tauri::command]
fn desktop_write_config(app: AppHandle, config: CutterDesktopConfig) -> Result<CutterDesktopConfig, String> {
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

fn check_ready_materials(current_json_path: &Path) -> DesktopDoctorCheck {
    match fs::read_to_string(current_json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|json| count_ready_materials(&json))
    {
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

    checks.push(if path_is_same_or_child(&config.local_workspace_root, &config.public_library_root) {
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
        check_directory("root", "公共素材库目录", public_root, "公共素材库目录不存在或不可读"),
        check_directory("source_videos", "source-videos", &source_videos, "source-videos 不存在或不可读"),
        check_directory("mixlab_library", ".mixlab-library", &mixlab_library, ".mixlab-library 不存在或不可读"),
        check_file("current_index", "current.json", &current_index, "current.json 不存在或不可读"),
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            desktop_config_path,
            desktop_log_dir,
            desktop_default_workspace_root,
            desktop_read_config,
            desktop_write_config,
            desktop_run_doctor
        ])
        .run(tauri::generate_context!())
        .expect("failed to run MixLab Cutter desktop app");
}
