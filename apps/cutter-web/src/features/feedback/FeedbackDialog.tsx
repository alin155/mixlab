import { Button } from "@mixlab/ui-foundation";
import { useState } from "react";
import {
  captureDesktopFeedbackScreenshot,
  resolveDesktopBridgeEnvironment,
  submitDesktopFeedback
} from "../../desktop-bridge.ts";
import {
  FEEDBACK_CATEGORIES,
  sanitizeFeedbackContext,
  type FeedbackCategory,
  type FeedbackEvent
} from "./feedback.ts";

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  context: Record<string, unknown>;
  events: FeedbackEvent[];
  appVersion?: string;
  buildCommit?: string;
}

interface SubmitResult {
  feedbackId: string;
  delivered: boolean;
}

export function FeedbackDialog({ open, onClose, context, events, appVersion, buildCommit }: FeedbackDialogProps) {
  const [category, setCategory] = useState<FeedbackCategory>("找不到");
  const [message, setMessage] = useState("");
  const [expected, setExpected] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [screenshotSkipped, setScreenshotSkipped] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const desktopAvailable = resolveDesktopBridgeEnvironment().desktop_available;

  if (!open) {
    return null;
  }

  function resetAndClose() {
    setCategory("找不到");
    setMessage("");
    setExpected("");
    setIncludeScreenshot(true);
    setError("");
    setScreenshotSkipped(false);
    setResult(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setError("请用一句话描述遇到的问题");
      return;
    }
    if (!desktopAvailable) {
      setError("反馈自动打包仅在 Windows 桌面端可用");
      return;
    }
    setSubmitting(true);
    setError("");
    let screenshot: string | undefined;
    if (includeScreenshot) {
      try {
        screenshot = (await captureDesktopFeedbackScreenshot()) ?? undefined;
        setScreenshotSkipped(!screenshot);
      } catch {
        setScreenshotSkipped(true);
      }
    }
    try {
      const submitted = await submitDesktopFeedback({
        category,
        message: trimmed,
        ...(expected.trim() ? { expected: expected.trim() } : {}),
        context: sanitizeFeedbackContext({
          ...context,
          ...(appVersion ? { app_version: appVersion } : {}),
          ...(buildCommit ? { build_commit: buildCommit } : {})
        }),
        events,
        ...(screenshot ? { screenshot_png_base64: screenshot } : {})
      });
      setResult({ feedbackId: submitted.feedbackId, delivered: submitted.delivered });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "反馈提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cutter-feedback-backdrop">
      <section aria-label="提交反馈" aria-modal="true" className="cutter-feedback-dialog ml-dialog" role="dialog">
        {result ? (
          <>
            <header className="ml-dialog-header">
              <h2 className="ml-dialog-title">反馈已提交</h2>
              <p className="ml-dialog-description">
                编号 <strong>{result.feedbackId}</strong>
              </p>
            </header>
            <div className="cutter-feedback-success">
              <p>{result.delivered ? "已自动发送到 NAS 收件箱。" : "已保存到本机，连接 NAS 后会自动发送。"}</p>
            </div>
            <footer className="ml-dialog-footer">
              <Button type="button" variant="primary" onClick={resetAndClose}>关闭</Button>
            </footer>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <header className="ml-dialog-header">
              <h2 className="ml-dialog-title">反馈问题</h2>
              <p className="ml-dialog-description">只描述哪里不对即可，我们会自动附带上下文、日志和截图。</p>
            </header>
            <div className="cutter-feedback-body">
              <fieldset className="cutter-feedback-categories">
                <legend>类别</legend>
                <div className="cutter-feedback-category-row">
                  {FEEDBACK_CATEGORIES.map((item) => (
                    <button
                      aria-pressed={category === item}
                      className={`cutter-feedback-category${category === item ? " is-selected" : ""}`}
                      key={item}
                      onClick={() => setCategory(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="cutter-feedback-field">
                <span>一句话描述（必填）</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setMessage(event.currentTarget.value)}
                  placeholder="例如：选中的字幕片段没有出现在剪切结果里"
                  required
                  rows={3}
                  value={message}
                />
              </label>
              <label className="cutter-feedback-field">
                <span>期望结果（可选）</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setExpected(event.currentTarget.value)}
                  placeholder="例如：希望只剪选中的这 3 句"
                  rows={2}
                  value={expected}
                />
              </label>
              <label className="cutter-feedback-checkbox">
                <input
                  checked={includeScreenshot}
                  onChange={(event) => setIncludeScreenshot(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>附带当前窗口截图（取消后不采集）</span>
              </label>
              {screenshotSkipped ? <p className="cutter-feedback-hint">截图暂不可用，本次反馈将继续提交。</p> : null}
              {error ? <p className="cutter-feedback-error" role="alert">{error}</p> : null}
            </div>
            <footer className="ml-dialog-footer">
              <Button disabled={submitting} type="button" variant="secondary" onClick={resetAndClose}>取消</Button>
              <Button disabled={submitting || !desktopAvailable} type="submit" variant="primary">
                {submitting ? "正在打包…" : "提交反馈"}
              </Button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
