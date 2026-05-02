import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import { useState } from "react";
import type { AdminDashboardData } from "../../api.ts";
import { redactConfiguredSecret } from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader } from "../shared.tsx";

export function SettingsPage({
  data,
  onTestAsrConfig
}: {
  data: AdminDashboardData;
  onTestAsrConfig?: () => void;
}) {
  const [audioMode, setAudioMode] = useState(data.runtime.asr.audio_mode);

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="设置" eyebrow="运行策略" />
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
                { label: "当前音频模式", value: data.runtime.asr.audio_mode },
                { label: "可选音频模式", value: "mp3_16k_mono_64k / wav_16k_mono_pcm_s16le" },
                {
                  label: "音频模式预览",
                  value: (
                    <select
                      className="admin-select"
                      value={audioMode}
                      aria-label="选择音频模式"
                      onChange={(event) => setAudioMode(event.currentTarget.value as typeof audioMode)}
                    >
                      <option value="mp3_16k_mono_64k">mp3_16k_mono_64k</option>
                      <option value="wav_16k_mono_pcm_s16le">wav_16k_mono_pcm_s16le</option>
                    </select>
                  )
                },
                { label: "预览结果", value: audioMode },
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
        <section className="admin-action-stack">
          <AdminControlButton label="保存运行策略" state="m9b-api" reason="M9B 接入配置保存或环境提示。" variant="primary" />
          <AdminControlButton label="测试 ASR 配置" state="m9b-api" reason="M9B 接入 ASR 配置检测。" onClick={onTestAsrConfig} />
          <AdminControlButton label="编辑 API Key" state="native-boundary" reason="密钥只通过 .env.local 或部署环境变量配置。" />
        </section>
      </InspectorPanel>
    </>
  );
}
