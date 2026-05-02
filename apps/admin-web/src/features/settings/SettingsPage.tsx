import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import { useEffect, useState } from "react";
import type { AdminDashboardData } from "../../api.ts";
import {
  asrModelLabel,
  asrProviderLabel,
  audioModeLabel,
  booleanLabel,
  chineseDiagnosticText,
  languageHintsLabel,
  runtimeSourceLabel
} from "../../app/chinese.ts";
import {
  adminStatusTone,
  redactConfiguredSecret
} from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader } from "../shared.tsx";

export function SettingsPage({
  data,
  onInitializeLibrary,
  onScanSourceVideos,
  onTestAsrConfig
}: {
  data: AdminDashboardData;
  onInitializeLibrary?: () => void;
  onScanSourceVideos?: () => void;
  onTestAsrConfig?: () => void;
}) {
  const [audioMode, setAudioMode] = useState(data.runtime.asr.audio_mode);
  const toolState = data.runtime.ffmpeg.available && data.runtime.ffprobe.available ? "可用" : "需处理";

  useEffect(() => {
    setAudioMode(data.runtime.asr.audio_mode);
  }, [data.runtime.asr.audio_mode]);

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="设置" eyebrow="素材来源与运行策略" />
        <GroupedForm
          groups={[
            {
              title: "素材来源",
              rows: data.settings.source_folders.map((folder) => ({
                label: folder.name,
                value: `${folder.enabled ? "启用" : "停用"} · ${folder.path} · 已发现 ${folder.discovered_video_count ?? 0} 个 · 新增未处理 ${folder.new_unprocessed_count ?? 0} 个`
              }))
            },
            {
              title: "预处理产物库",
              rows: [
                { label: "素材库名称", value: data.settings.library_name },
                { label: "素材库编号", value: data.status.library_id },
                { label: "协议版本", value: data.status.protocol_version },
                { label: "存储模式", value: runtimeSourceLabel(data.settings.artifact_library.mode) },
                { label: "产物路径", value: data.settings.artifact_library.path },
                { label: "是否需要迁移", value: booleanLabel(data.settings.artifact_library.migration_required) }
              ]
            },
            {
              title: "运行策略",
              rows: [
                { label: "并发任务", value: data.settings.runtime_policy.concurrent_jobs },
                { label: "自动扫描", value: booleanLabel(data.settings.runtime_policy.auto_scan_enabled) },
                { label: "自动入队", value: booleanLabel(data.settings.runtime_policy.auto_queue_enabled) },
                { label: "自动发布索引", value: booleanLabel(data.settings.runtime_policy.auto_publish_index_enabled) },
                { label: "音频模式", value: audioModeLabel(data.settings.runtime_policy.audio_mode) },
                { label: "音视频工具", value: `${runtimeSourceLabel(data.runtime.ffmpeg.source)} · ${toolState}` }
              ]
            },
            {
              title: "语音识别配置",
              rows: [
                { label: "供应商", value: asrProviderLabel(data.runtime.asr.provider) },
                { label: "模型", value: asrModelLabel(data.runtime.asr.model) },
                { label: "当前音频模式", value: audioModeLabel(data.runtime.asr.audio_mode) },
                { label: "可选音频模式", value: "压缩单声道 / 无损单声道" },
                {
                  label: "音频模式预览",
                  value: (
                    <select
                      className="admin-select"
                      value={audioMode}
                      aria-label="选择音频模式"
                      onChange={(event) => setAudioMode(event.currentTarget.value as typeof audioMode)}
                    >
                      <option value="mp3_16k_mono_64k">压缩单声道</option>
                      <option value="wav_16k_mono_pcm_s16le">无损单声道</option>
                    </select>
                  )
                },
                { label: "预览结果", value: audioModeLabel(audioMode) },
                { label: "接口密钥", value: redactConfiguredSecret(data.runtime.asr.dashscope_api_key_configured) },
                { label: "语言提示", value: languageHintsLabel(data.runtime.asr.language_hints) },
                { label: "对象存储", value: "阿里云百炼临时上传" },
                { label: "最近失败", value: chineseDiagnosticText(data.runtime.asr.last_failure_reason) }
              ]
            }
          ]}
        />
      </div>
      <InspectorPanel title="路径与权限校验">
        <section className="admin-list-panel">
          {data.path_checks.map((item) => (
            <StatusRow
              tone={adminStatusTone(item.status)}
              label={chineseDiagnosticText(item.label)}
              detail={`${item.path} · ${chineseDiagnosticText(item.message)}`}
              value={item.status === "pass" ? "通过" : "处理"}
              key={item.label}
            />
          ))}
        </section>
        <p className="admin-note">
          接口密钥不写入代码、协议清单、日志或诊断报告。管理端只显示配置状态。
        </p>
        <section className="admin-action-stack">
          <AdminControlButton label="初始化素材库" state="m9b-api" reason="M9B 接入初始化接口。" variant="primary" onClick={onInitializeLibrary} />
          <AdminControlButton label="扫描源视频" state="m9b-api" reason="M9B 接入扫描接口。" onClick={onScanSourceVideos} />
          <AdminControlButton label="保存运行策略" state="m9b-api" reason="M9B 接入配置保存或环境提示。" variant="primary" />
          <AdminControlButton label="测试语音识别配置" state="m9b-api" reason="M9B 接入语音识别配置检测。" onClick={onTestAsrConfig} />
          <AdminControlButton label="编辑接口密钥" state="native-boundary" reason="密钥只通过本地环境或部署环境变量配置。" />
        </section>
      </InspectorPanel>
    </>
  );
}
