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

export function SettingsPage({
  settings,
  runtimeStatus,
  apiBaseUrl = "",
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
  apiBaseUrl?: string;
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
        title: "真实模式联调状态",
        rows: [
          { label: "运行模式", value: runtimeStatus.mode_label },
          { label: "API 地址", value: apiBaseUrl || "未连接真实 API" },
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
          { label: "FFmpeg", value: `${runtimeStatus.ffmpeg_status} · ${runtimeStatus.ffmpeg_source}` }
        ]
      }
    : {
        title: "真实模式联调状态",
        rows: [
          { label: "运行模式", value: "界面演示模式" },
          { label: "API 地址", value: "未连接真实 API" }
        ]
      };

  return (
    <section className="cutter-page cutter-settings" data-page="settings">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">运行环境</p>
            <h1>设置</h1>
            <p>剪辑端本地路径、FFmpeg、默认剪切模式和 Doctor 检查。</p>
          </div>
        </header>

        <GroupedForm
          groups={[
            runtimeGroup,
            {
              title: "素材与工作区",
              rows: [
                { label: "公共素材库挂载", value: settings.public_library_mount },
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
              title: "剪切运行时",
              rows: [
                { label: "FFmpeg", value: settings.ffmpeg_path },
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
                { label: "并发数", value: settings.concurrency },
                { label: "音频预处理", value: settings.audio_mode },
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

      <InspectorPanel title="Doctor">
        <div className="cutter-settings-doctor">
          {settings.doctor.map((check) => (
            <StatusRow
              key={check.label}
              tone={check.status === "pass" ? "ready" : check.status === "warn" ? "warning" : "failed"}
              label={check.label}
              detail={check.message}
            />
          ))}
        </div>
      </InspectorPanel>
    </section>
  );
}
