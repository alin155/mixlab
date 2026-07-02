export type AdminPreprocessFailureKind =
  | "asr-timeout"
  | "missing-source"
  | "invalid-media"
  | "no-video-stream"
  | "no-speech"
  | "unknown";

function normalizedFailureMessage(message: string | undefined): string {
  return (message ?? "").trim().toLowerCase();
}

export function classifyAdminPreprocessFailure(message: string | undefined): AdminPreprocessFailureKind {
  const normalized = normalizedFailureMessage(message);

  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("did not complete within") ||
    normalized.includes("dashscope task timeout") ||
    normalized.includes("dashscope asr task timeout") ||
    (
      normalized.includes("dashscope asr task") &&
      normalized.includes("poll attempts")
    )
  ) {
    return "asr-timeout";
  }

  if (
    normalized.includes("no such file or directory") ||
    normalized.includes("source video file not found") ||
    normalized.includes("source file missing") ||
    normalized.includes("原视频不存在")
  ) {
    return "missing-source";
  }

  if (
    normalized.includes("moov atom not found") ||
    normalized.includes("invalid data found when processing input") ||
    normalized.includes("end of file") ||
    normalized.includes("truncated")
  ) {
    return "invalid-media";
  }

  if (
    normalized.includes("did not include a video stream") ||
    normalized.includes("does not include a video stream") ||
    normalized.includes("no video stream")
  ) {
    return "no-video-stream";
  }

  if (
    normalized.includes("asr_response_have_no_words") ||
    normalized.includes("have_no_words") ||
    normalized.includes("success_with_no_valid_fragment") ||
    normalized.includes("no valid fragment")
  ) {
    return "no-speech";
  }

  return "unknown";
}

export function isAdminPreprocessFailureRetryable(message: string | undefined): boolean {
  const kind = classifyAdminPreprocessFailure(message);
  return kind === "unknown" || kind === "asr-timeout";
}

export function adminPreprocessFailureSkipReason(message: string | undefined): string {
  const kind = classifyAdminPreprocessFailure(message);

  const labels = {
    "asr-timeout": "语音识别等待超时，可用长任务语音识别继续处理。",
    "missing-source": "源文件缺失，已跳过自动重试。",
    "invalid-media": "源文件损坏或格式不可读，已跳过自动重试。",
    "no-video-stream": "源文件没有可处理的视频流，已跳过自动重试。",
    "no-speech": "语音识别没有可用文案，已跳过自动重试。",
    unknown: "失败原因不明确，可以重新进入队列。"
  } satisfies Record<AdminPreprocessFailureKind, string>;

  return labels[kind];
}
