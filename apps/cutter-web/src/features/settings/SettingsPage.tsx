import { GroupedForm, InspectorPanel, StatusRow } from "@mixlab/ui-foundation";
import type { CutterRuntimeStatus } from "../../api.ts";
import type { CutterWorkbenchSettings } from "../../fixture-client.ts";
import {
  appearanceModeLabel,
  type CutterAppearanceMode
} from "../../state/appearance.ts";

export function SettingsPage({
  settings,
  runtimeStatus,
  apiBaseUrl = "",
  appearanceMode,
  onSetAppearanceMode
}: {
  settings: CutterWorkbenchSettings;
  runtimeStatus?: CutterRuntimeStatus;
  apiBaseUrl?: string;
  appearanceMode: CutterAppearanceMode;
  onSetAppearanceMode: (mode: CutterAppearanceMode) => void;
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
                { label: "本地工作区", value: settings.local_workspace }
              ]
            },
            {
              title: "剪切运行时",
              rows: [
                { label: "FFmpeg", value: settings.ffmpeg_path },
                { label: "默认剪切模式", value: settings.default_cut_mode },
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
                      <option value="system">{appearanceModeLabel("system")}</option>
                      <option value="default">{appearanceModeLabel("default")}</option>
                      <option value="night">{appearanceModeLabel("night")}</option>
                      <option value="comfort">{appearanceModeLabel("comfort")}</option>
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
