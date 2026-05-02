import { GroupedForm, InspectorPanel, StatusRow } from "@mixlab/ui-foundation";
import type { CutterWorkbenchSettings } from "../../fixture-client.ts";

export function SettingsPage({ settings }: { settings: CutterWorkbenchSettings }) {
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
                { label: "音频预处理", value: settings.audio_mode }
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
