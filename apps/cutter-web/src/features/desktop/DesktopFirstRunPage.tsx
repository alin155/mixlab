import { Button } from "@mixlab/ui-foundation";

export type DesktopSetupStage =
  | "loading"
  | "choose-public-library"
  | "choose-workspace"
  | "doctor-ready"
  | "doctor-running"
  | "doctor-failed"
  | "engine-starting"
  | "ready";

export interface DesktopSetupConfig {
  api_host: "127.0.0.1";
  api_port: 3789;
  public_library_root: string;
  local_workspace_root: string;
  log_root?: string;
  ffmpeg_path?: string;
  ffprobe_path?: string;
}

export interface DesktopSetupDoctorCheck {
  id: string;
  label: string;
  status: "pass" | "fail";
  message?: string;
}

export interface DesktopSetupDoctorResult {
  status: "pass" | "fail";
  checks: DesktopSetupDoctorCheck[];
}

export interface DesktopSetupDiagnostics {
  app_version?: string;
  stage: string;
  api_address?: string;
  log_path?: string;
  public_library_root?: string;
  local_workspace_root?: string;
  ffmpeg_status?: string;
  latest_error_summary?: string;
}

function stageLabel(stage: DesktopSetupStage): string {
  const labels: Record<DesktopSetupStage, string> = {
    loading: "读取桌面配置",
    "choose-public-library": "选择公共素材库",
    "choose-workspace": "确认本地工作区",
    "doctor-ready": "运行 Doctor",
    "doctor-running": "Doctor 检查中",
    "doctor-failed": "需要处理",
    "engine-starting": "启动本机引擎",
    ready: "可进入工作台"
  };

  return labels[stage];
}

function CheckList({ result }: { result?: DesktopSetupDoctorResult }) {
  if (!result) {
    return (
      <div className="cutter-desktop-check-list ml-card ml-check-list is-empty">
        <strong>等待 Doctor 检查</strong>
        <span>选择公共素材库和本地工作区后，系统会验证目录结构和写入权限。</span>
      </div>
    );
  }

  return (
    <div className="cutter-desktop-check-list ml-card ml-check-list">
      {result.checks.map((check) => (
        <div className={`cutter-desktop-check ml-check-row is-${check.status}`} key={check.id}>
          <span>{check.status === "pass" ? "通过" : "失败"}</span>
          <strong>{check.label}</strong>
          {check.message ? <small>{check.message}</small> : null}
        </div>
      ))}
    </div>
  );
}

function Diagnostics({ diagnostics }: { diagnostics?: DesktopSetupDiagnostics }) {
  if (!diagnostics) {
    return null;
  }

  const rows = [
    ["应用版本", diagnostics.app_version],
    ["阶段", diagnostics.stage],
    ["API 地址", diagnostics.api_address],
    ["日志路径", diagnostics.log_path],
    ["公共素材库", diagnostics.public_library_root],
    ["本地工作区", diagnostics.local_workspace_root],
    ["FFmpeg", diagnostics.ffmpeg_status],
    ["错误摘要", diagnostics.latest_error_summary]
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <section className="cutter-desktop-diagnostics ml-card ml-diagnostics-panel" aria-label="桌面诊断">
      <h2>诊断信息</h2>
      <dl className="ml-diagnostics-list">
        {rows.map(([label, value]) => (
          <div className="ml-diagnostics-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DesktopFirstRunPage({
  config,
  stage,
  doctorResult,
  diagnostics,
  onChoosePublicLibrary,
  onChooseLocalWorkspace,
  onRunDoctor,
  onStartEngine,
  onRetry,
  onCopyDiagnostics,
  onOpenLogDirectory
}: {
  config: DesktopSetupConfig;
  stage: DesktopSetupStage;
  doctorResult?: DesktopSetupDoctorResult;
  diagnostics?: DesktopSetupDiagnostics;
  onChoosePublicLibrary: () => void;
  onChooseLocalWorkspace: () => void;
  onRunDoctor: () => void;
  onStartEngine: () => void;
  onRetry: () => void;
  onCopyDiagnostics: () => void;
  onOpenLogDirectory: () => void;
}) {
  const doctorPassed = doctorResult?.status === "pass";
  const canRunDoctor = Boolean(config.public_library_root && config.local_workspace_root);

  return (
    <main className="cutter-app cutter-desktop-first-run ml-entry-surface" data-appearance-mode="dark">
      <section className="cutter-desktop-first-run-shell ml-entry-shell">
        <header className="cutter-desktop-first-run-header ml-card ml-entry-header">
          <div>
            <p className="cutter-eyebrow ml-page-kicker ml-page-kicker--hero">M18.1 · Windows EXE</p>
            <h1 className="ml-page-title ml-page-title--hero">Windows 桌面版首启</h1>
            <p className="ml-page-description ml-page-description--hero">
              首次运行需要绑定公共素材库、本地工作区，并启动本机剪切引擎。
            </p>
          </div>
          <strong className="ml-entry-stage-badge">{stageLabel(stage)}</strong>
        </header>

        <section className="cutter-desktop-setup-grid ml-entry-step-grid">
          <article className="cutter-desktop-setup-card ml-card ml-entry-step-card">
            <span className="ml-entry-step-index">1</span>
            <h2>选择公共素材库</h2>
            <p>{config.public_library_root || "未选择"}</p>
            <Button type="button" variant="secondary" onClick={onChoosePublicLibrary}>选择公共素材库</Button>
          </article>
          <article className="cutter-desktop-setup-card ml-card ml-entry-step-card">
            <span className="ml-entry-step-index">2</span>
            <h2>确认本地工作区</h2>
            <p>{config.local_workspace_root || "未设置"}</p>
            <Button type="button" variant="secondary" onClick={onChooseLocalWorkspace}>选择本地工作区</Button>
          </article>
          <article className="cutter-desktop-setup-card ml-card ml-entry-step-card">
            <span className="ml-entry-step-index">3</span>
            <h2>运行 Doctor</h2>
            <p>检查素材库结构、本地写入权限和 ready 素材。</p>
            <Button type="button" disabled={!canRunDoctor || stage === "doctor-running"} variant="secondary" onClick={onRunDoctor}>
              运行 Doctor
            </Button>
          </article>
          <article className="cutter-desktop-setup-card ml-card ml-entry-step-card">
            <span className="ml-entry-step-index">4</span>
            <h2>启动本机引擎</h2>
            <p>固定监听 127.0.0.1:3789，网页端仍可独立运行。</p>
            <Button type="button" disabled={!doctorPassed || stage === "engine-starting"} variant="secondary" onClick={onStartEngine}>
              启动本机引擎
            </Button>
          </article>
        </section>

        <section className="cutter-desktop-first-run-body ml-entry-body">
          <CheckList result={doctorResult} />
          <aside className="cutter-desktop-first-run-side ml-entry-side">
            <Diagnostics diagnostics={diagnostics} />
            <div className="cutter-desktop-diagnostic-actions ml-entry-actions">
              <Button type="button" variant="secondary" onClick={onRetry}>重试</Button>
              <Button type="button" variant="secondary" onClick={onCopyDiagnostics}>复制诊断</Button>
              <Button type="button" variant="secondary" onClick={onOpenLogDirectory}>打开日志目录</Button>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
