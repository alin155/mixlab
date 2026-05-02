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
  if (!hints.length) {
    return "未配置";
  }

  const labels: Record<string, string> = {
    zh: "中文",
    en: "英文"
  };

  return hints.map((hint) => labels[hint] ?? hint).join("、");
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
    "Public Library Root": "公共素材库根目录",
    "Source Videos": "原视频目录",
    ".mixlab-library Writable": "预处理产物库可写",
    "Library Counts": "素材库计数",
    "Source Video Manifests": "原视频发布清单",
    "Current Index": "当前索引",
    Manifest: "发布清单",
    FFmpeg: "音视频工具",
    FFprobe: "媒体探测工具",
    "ASR Config": "语音识别配置",
    ASR: "语音识别",
    "Local Clips": "本地剪辑片段",
    Doctor: "健康诊断"
  };

  return labels[label] ?? label;
}

const DIAGNOSTIC_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["Public Library Root", "公共素材库根目录"],
  ["Source Videos", "原视频目录"],
  [".mixlab-library Writable", "预处理产物库可写"],
  ["Library Counts", "素材库计数"],
  ["Source Video Manifests", "原视频发布清单"],
  ["Current Index", "当前索引"],
  ["ASR Config", "语音识别配置"],
  ["Local Clips", "本地剪辑片段"],
  ["DashScope API Key", "阿里云百炼接口密钥"],
  ["DashScope API key", "阿里云百炼接口密钥"],
  ["DashScope key", "阿里云百炼密钥"],
  ["DashScope ASR config", "阿里云百炼语音识别配置"],
  ["DashScope ASR", "阿里云百炼语音识别"],
  ["DashScope", "阿里云百炼"],
  [" is configured for ", "已配置用于"],
  ["API Key", "接口密钥"],
  ["API key", "接口密钥"],
  ["ASR model", "语音识别模型"],
  ["ASR config", "语音识别配置"],
  ["ASR", "语音识别"],
  ["Doctor", "健康诊断"],
  ["FFprobe", "媒体探测工具"],
  ["FFmpeg", "音视频工具"],
  ["Manifest", "发布清单"],
  ["manifest.json", "发布清单文件"],
  ["source-video.json", "原视频协议文件"],
  ["library.json is missing or unreadable", "library.json 缺失或不可读"],
  ["library.json 有效", "发布清单文件有效"],
  ["library.json 可读", "发布清单文件可读"],
  ["library.json 尚未创建", "发布清单文件尚未创建"],
  ["library counts are consistent", "素材库计数一致"],
  ["public library root is accessible", "公共素材库根目录可访问"],
  ["public library root is not accessible", "公共素材库根目录不可访问"],
  ["source-videos is readable", "原视频目录可读"],
  ["source-videos is not readable", "原视频目录不可读"],
  ["source-videos is missing or unreadable", "原视频目录缺失或不可读"],
  ["source-videos", "原视频目录"],
  ["source video manifests are valid", "个原视频发布清单有效"],
  [".mixlab-library is writable", "预处理产物库可写"],
  [".mixlab-library is not writable", "预处理产物库不可写"],
  [".mixlab-library", "预处理产物库"],
  ["current index is not available yet", "当前索引尚不可用"],
  ["current index is", "当前索引为"],
  ["ffmpeg is available from bundled", "内置音视频工具可用"],
  ["ffprobe is available from bundled", "内置媒体探测工具可用"],
  ["from bundled", "来自内置工具"],
  ["bundled", "内置"],
  ["network timeout", "网络超时"],
  ["unexpected 语音识别模型", "语音识别模型异常"],
  ["is not configured", "未配置"],
  ["is configured", "已配置"],
  ["config is present", "配置已存在"],
  ["no local clips found", "未发现本地剪辑片段"],
  ["local clip manifests are valid", "个本地剪辑片段清单有效"],
  ["index-required 与 ready 边界需发布", "待发布索引与已可用边界需发布"],
  ["index-required", "待发布索引"],
  ["current.json", "当前索引指针"],
  ["library.json", "发布清单文件"],
  ["EACCES", "权限不足"],
  ["ENOENT", "文件或目录不存在"],
  ["接口密钥 已配置", "接口密钥已配置"],
  ["接口密钥 未配置", "接口密钥未配置"]
];

export function chineseDiagnosticText(text: string): string {
  return DIAGNOSTIC_TEXT_REPLACEMENTS.reduce(
    (current, [from, to]) => current.replaceAll(from, to),
    text
  ).replaceAll("语音识别 网络", "语音识别网络");
}

export function strictChineseDiagnosticText(text: string): string {
  const translated = chineseDiagnosticText(text);
  const withoutAllowedBusinessIds = translated.replace(/\b[A-Z]{1,4}\d{3,}\b/g, "");
  if (/[A-Za-z]/.test(withoutAllowedBusinessIds)) {
    const businessIds = Array.from(new Set(translated.match(/\b[A-Z]{1,4}\d{3,}\b/g) ?? []));
    const prefix = businessIds.length ? `相关对象 ${businessIds.join("、")}；` : "";
    return `${prefix}原始诊断信息已隐藏，可导出诊断报告查看。`;
  }

  return translated;
}
