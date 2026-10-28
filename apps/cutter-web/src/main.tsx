import "@mixlab/ui-foundation/tokens.css";
import "@mixlab/ui-foundation/layout.css";
import "./styles.css";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { CutterApp } from "./app/CutterApp.tsx";
import {
  clearCutterTransientUiState,
  cutterStorageKeyInventory
} from "./state/cutter-cache.ts";
import {
  buildCutterCrashDiagnostics,
  formatCutterCrashDiagnostics
} from "./state/crash-recovery.ts";

interface CutterErrorBoundaryState {
  error: unknown;
  componentStack: string;
  showDiagnostics: boolean;
}

const CLEANUP_HINT =
  "清理仅移除界面偏好（显示模式、默认筛选等），不会删除项目、待剪清单、本地素材记录或登录状态。";

/**
 * Last line of defense for render-time crashes (e.g. corrupted persisted
 * state). Keeps the window usable: reload, export diagnostics, or clear ONLY
 * transient UI preferences so the user never loses projects/cut list.
 */
export class CutterErrorBoundary extends Component<
  { children: ReactNode },
  CutterErrorBoundaryState
> {
  state: CutterErrorBoundaryState = {
    error: null,
    componentStack: "",
    showDiagnostics: false
  };

  static getDerivedStateFromError(error: unknown): Partial<CutterErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  private diagnosticsText(): string {
    const error = this.state.error;
    return formatCutterCrashDiagnostics(
      buildCutterCrashDiagnostics({
        error: error instanceof Error ? error : new Error(String(error)),
        route: typeof window === "undefined" ? "" : window.location.hash,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        componentStack: this.state.componentStack,
        storageKeys: cutterStorageKeyInventory(),
        appVersion: import.meta.env?.VITE_MIXLAB_BUILD_COMMIT ?? ""
      })
    );
  }

  private handleCopyDiagnostics = (): void => {
    const diagnostics = this.diagnosticsText();
    this.setState({ showDiagnostics: true });
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard) {
      void clipboard.writeText(diagnostics).catch(() => undefined);
    }
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleClearUiState = (): void => {
    clearCutterTransientUiState();
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const message = this.state.error instanceof Error
      ? this.state.error.message
      : String(this.state.error);
    const diagnostics = this.state.showDiagnostics ? this.diagnosticsText() : "";

    return (
      <main className="cutter-crash-recovery" role="alert">
        <section className="cutter-crash-recovery-card">
          <p className="cutter-crash-recovery-kicker">MixLab Cutter</p>
          <h1 className="cutter-crash-recovery-title">界面异常</h1>
          <p className="cutter-crash-recovery-copy">
            剪辑工作台遇到异常，已停止渲染以避免影响数据。可以先重新加载；若持续异常，请导出诊断信息交给管理员。
          </p>
          <pre className="cutter-crash-recovery-message">{message}</pre>
          <div className="cutter-crash-recovery-actions">
            <button className="cutter-crash-recovery-action is-primary" onClick={this.handleReload} type="button">
              重新加载
            </button>
            <button className="cutter-crash-recovery-action" onClick={this.handleCopyDiagnostics} type="button">
              导出诊断
            </button>
            <button className="cutter-crash-recovery-action is-danger" onClick={this.handleClearUiState} type="button">
              清理本地界面状态
            </button>
          </div>
          <p className="cutter-crash-recovery-hint">{CLEANUP_HINT}</p>
          {this.state.showDiagnostics ? (
            <pre className="cutter-crash-recovery-diagnostics">{diagnostics}</pre>
          ) : null}
        </section>
      </main>
    );
  }
}

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("cutter root not found");
}

createRoot(root).render(
  <CutterErrorBoundary>
    <CutterApp />
  </CutterErrorBoundary>
);
