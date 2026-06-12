import { GroupedForm, InspectorPanel, StatusRow } from "@mixlab/ui-foundation";
import type { CutterRuntimeStatus } from "../../api.ts";
import type { CutterWorkbenchSettings } from "../../fixture-client.ts";
import {
  appearanceModeLabel,
  type CutterAppearanceMode
} from "../../state/appearance.ts";
import type { CutMode } from "../../state/cut-list.ts";
import type { MaterialSearchSourceFilter } from "../../state/material-locator.ts";
import type { VideoOrientationFilter } from "../../state/video-orientation.ts";

const defaultCutModeOptions: Array<{ value: CutMode; label: string }> = [
  { value: "copy", label: "极速剪切" },
  { value: "precise", label: "精准剪切" }
];

const sourceFilterOptions: Array<{ value: MaterialSearchSourceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "local", label: "本地素材" },
  { value: "public", label: "公共原素材" }
];

const orientationFilterOptions: Array<{ value: VideoOrientationFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" }
];

type SettingsDoctorCheck = CutterWorkbenchSettings["doctor"][number];

function settingsDoctorLabel(check: SettingsDoctorCheck): string {
  if (check.label.includes("公共素材库")) {
    return "公共素材库";
  }

  if (check.label.includes("本地工作区")) {
    return "本地工作区";
  }

  if (check.label.includes("FFmpeg")) {
    return "剪切工具";
  }

  return check.label;
}

function settingsDoctorDetail(check: SettingsDoctorCheck): string {
  if (check.label.includes("公共素材库")) {
    return check.status === "pass" ? "可以读取已发布素材" : "请确认公共素材库目录可用";
  }

  if (check.label.includes("本地工作区")) {
    return check.status === "pass" ? "可以保存剪切任务和本地素材" : "请确认本地工作区可写";
  }

  if (check.label.includes("FFmpeg")) {
    return check.status === "pass" ? "剪切工具可用" : "请确认剪切工具可用";
  }

  return check.message;
}

export function SettingsPage({
  settings,
  runtimeStatus,
  appearanceMode,
  defaultCutMode = settings.default_cut_mode,
  defaultSourceFilter = "all",
  defaultOrientationFilter = "all",
  onSetAppearanceMode,
  onSetDefaultCutMode,
  onSetDefaultSourceFilter,
  onSetDefaultOrientationFilter
}: {
  settings: CutterWorkbenchSettings;
  runtimeStatus?: CutterRuntimeStatus;
  appearanceMode: CutterAppearanceMode;
  defaultCutMode?: CutMode;
  defaultSourceFilter?: MaterialSearchSourceFilter;
  defaultOrientationFilter?: VideoOrientationFilter;
  onSetAppearanceMode: (mode: CutterAppearanceMode) => void;
  onSetDefaultCutMode?: (mode: CutMode) => void;
  onSetDefaultSourceFilter?: (filter: MaterialSearchSourceFilter) => void;
  onSetDefaultOrientationFilter?: (filter: VideoOrientationFilter) => void;
}) {
  const runtimeGroup = runtimeStatus
      ? {
        title: "服务状态",
        rows: [
          { label: "连接", value: runtimeStatus.api_ready ? "可用" : "不可用" },
          {
            label: "当前剪辑师",
            value: runtimeStatus.current_user.display_name || runtimeStatus.current_user.username
          },
          { label: "可用原素材", value: `${runtimeStatus.available_video_count}` },
          {
            label: "本地工作区",
            value: runtimeStatus.workspace_enabled ? runtimeStatus.workspace_root_label : "未启用"
          },
          { label: "本地素材数", value: `${runtimeStatus.local_clip_count}` },
          { label: "剪切工具", value: runtimeStatus.ffmpeg_status }
        ]
      }
    : {
        title: "服务状态",
        rows: [
          { label: "连接", value: "未连接" },
          { label: "素材库", value: "待连接" }
        ]
      };

  return (
    <section className="cutter-page cutter-settings" data-page="settings">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">运行环境</p>
            <h1>设置</h1>
            <p>管理本地工作区、默认剪切方式和界面显示。</p>
          </div>
        </header>

        <GroupedForm
          groups={[
            runtimeGroup,
            {
              title: "素材与工作区",
              rows: [
                { label: "公共素材库", value: settings.public_library_mount },
                { label: "本地工作区", value: settings.local_workspace },
                {
                  label: "默认素材来源",
                  value: (
                    <select
                      className="cutter-appearance-select"
                      name="defaultSourceFilter"
                      value={defaultSourceFilter}
                      onChange={(event) =>
                        onSetDefaultSourceFilter?.(event.currentTarget.value as MaterialSearchSourceFilter)
                      }
                    >
                      {sourceFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )
                },
                {
                  label: "默认视频类型",
                  value: (
                    <select
                      className="cutter-appearance-select"
                      name="defaultOrientationFilter"
                      value={defaultOrientationFilter}
                      onChange={(event) =>
                        onSetDefaultOrientationFilter?.(event.currentTarget.value as VideoOrientationFilter)
                      }
                    >
                      {orientationFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )
                }
              ]
            },
            {
              title: "剪切偏好",
              rows: [
                { label: "剪切工具路径", value: settings.ffmpeg_path },
                {
                  label: "默认剪切模式",
                  value: (
                    <div className="cutter-cut-mode-toggle cutter-settings-cut-mode-toggle" role="group" aria-label="默认剪切模式">
                      {defaultCutModeOptions.map((option) => (
                        <button
                          className={defaultCutMode === option.value ? "is-active" : ""}
                          type="button"
                          key={option.value}
                          aria-pressed={defaultCutMode === option.value}
                          onClick={() => onSetDefaultCutMode?.(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )
                },
                { label: "同时剪切数", value: settings.concurrency },
                { label: "音频处理", value: settings.audio_mode },
                {
                  label: "显示模式",
                  value: (
                    <select
                      className="cutter-appearance-select"
                      value={appearanceMode}
                      onChange={(event) =>
                        onSetAppearanceMode(event.currentTarget.value as CutterAppearanceMode)
                      }
                    >
                      <option value="dark">{appearanceModeLabel("dark")}</option>
                      <option value="light">{appearanceModeLabel("light")}</option>
                      <option value="system">{appearanceModeLabel("system")}</option>
                    </select>
                  )
                }
              ]
            }
          ]}
        />
      </div>

      <InspectorPanel title="环境检查">
        <div className="cutter-settings-doctor">
          {settings.doctor.map((check) => (
            <StatusRow
              key={check.label}
              tone={check.status === "pass" ? "ready" : check.status === "warn" ? "warning" : "failed"}
              label={settingsDoctorLabel(check)}
              detail={settingsDoctorDetail(check)}
            />
          ))}
        </div>
      </InspectorPanel>
    </section>
  );
}
