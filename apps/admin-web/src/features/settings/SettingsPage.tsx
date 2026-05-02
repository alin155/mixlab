import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { redactConfiguredSecret } from "../../app/view-model.ts";
import { AdminPageHeader } from "../shared.tsx";

export function SettingsPage({ data }: { data: AdminDashboardData }) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="设置" eyebrow="运行时依赖与 ASR 配置" />
        <GroupedForm
          groups={[
            {
              title: "FFmpeg / FFprobe",
              rows: [
                { label: "FFmpeg", value: `${data.runtime.ffmpeg.source} · ${data.runtime.ffmpeg.version}` },
                { label: "FFprobe", value: `${data.runtime.ffprobe.source} · ${data.runtime.ffprobe.version}` },
                { label: "检测结果", value: data.runtime.ffmpeg.available && data.runtime.ffprobe.available ? "可用" : "需处理" }
              ]
            },
            {
              title: "ASR 配置",
              rows: [
                { label: "供应商", value: data.runtime.asr.provider_label },
                { label: "模型", value: data.runtime.asr.model },
                { label: "音频模式", value: data.runtime.asr.audio_mode },
                { label: "API Key", value: redactConfiguredSecret(data.runtime.asr.dashscope_api_key_configured) },
                { label: "语言提示", value: data.runtime.asr.language_hints.join(", ") },
                { label: "对象存储", value: "DashScope 临时上传" },
                { label: "最近失败", value: data.runtime.asr.last_failure_reason }
              ]
            }
          ]}
        />
      </div>
      <InspectorPanel title="安全边界">
        <p className="admin-note">
          API Key 不写入代码、manifest、日志或 Doctor 报告。管理端只显示配置状态。
        </p>
        <button className="admin-primary-button" type="button">测试 ASR 提交</button>
      </InspectorPanel>
    </>
  );
}
