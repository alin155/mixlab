import type {
  AdminIndexVersion,
  AdminPreprocessStatus
} from "../api.ts";

export function preprocessStatusLabel(status: AdminPreprocessStatus | string): string {
  const labels: Record<string, string> = {
    ready: "已可用",
    processing: "处理中",
    queued: "队列中",
    unprocessed: "未处理",
    failed: "处理失败",
    "index-required": "待发布索引",
    running: "处理中",
    done: "已完成"
  };

  return labels[status] ?? status;
}

export function jobStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    "build-keyframes": "生成关键帧",
    "extract-audio": "提取音频",
    asr: "语音识别",
    "publish-ready": "发布可用产物",
    "publish-index": "发布索引",
    "transcode-preview": "生成预览"
  };

  return labels[stage] ?? stage;
}

export function booleanLabel(value: boolean): string {
  return value ? "是" : "否";
}

export function runtimeSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    bundled: "内置",
    custom: "自定义",
    path: "系统路径",
    missing: "未配置",
    default: "默认",
    "dashscope-temporary": "临时上传"
  };

  return labels[source] ?? source;
}

export function audioModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    mp3_16k_mono_64k: "压缩单声道",
    wav_16k_mono_pcm_s16le: "无损单声道"
  };

  return labels[mode] ?? mode;
}

export function asrProviderLabel(provider: string): string {
  return provider === "dashscope" ? "阿里云百炼" : provider;
}

export function asrModelLabel(model: string): string {
  return model === "paraformer-v2" ? "通义语音识别模型" : model;
}

export function languageHintsLabel(hints: string[]): string {
  return hints.map((hint) => hint === "zh" ? "中文" : hint).join("、");
}

export function validationStatusLabel(status: AdminIndexVersion["validation_status"] | string): string {
  const labels: Record<string, string> = {
    pass: "通过",
    warn: "需关注",
    fail: "需处理"
  };

  return labels[status] ?? status;
}

export function indexStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: "已就绪",
    building: "构建中",
    "needs-publish": "待发布",
    error: "异常"
  };

  return labels[status] ?? status;
}

export function diagnosticLabel(label: string): string {
  const labels: Record<string, string> = {
    Manifest: "发布清单",
    FFmpeg: "音视频工具",
    FFprobe: "媒体探测工具",
    ASR: "语音识别",
    Doctor: "健康诊断"
  };

  return labels[label] ?? label;
}

export function chineseDiagnosticText(text: string): string {
  return text
    .replaceAll("DashScope API Key", "阿里云百炼接口密钥")
    .replaceAll("DashScope key", "阿里云百炼密钥")
    .replaceAll("DashScope ASR", "阿里云百炼语音识别")
    .replaceAll("DashScope", "阿里云百炼")
    .replaceAll("API Key", "接口密钥")
    .replaceAll("ASR", "语音识别")
    .replaceAll("语音识别 网络", "语音识别网络")
    .replaceAll("Doctor", "健康诊断")
    .replaceAll("FFprobe", "媒体探测工具")
    .replaceAll("FFmpeg", "音视频工具")
    .replaceAll("Manifest", "发布清单")
    .replaceAll("manifest.json", "发布清单文件")
    .replaceAll("source-video.json", "原视频协议文件")
    .replaceAll("index-required", "待发布索引")
    .replaceAll("ready", "已可用")
    .replaceAll("current.json", "当前索引指针")
    .replaceAll("current", "当前索引")
    .replaceAll("schema", "协议版本");
}
