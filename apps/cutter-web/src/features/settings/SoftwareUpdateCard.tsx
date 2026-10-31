import { Button, Card } from "@mixlab/ui-foundation";
import { useState } from "react";
import {
  checkDesktopUpdate,
  downloadDesktopUpdate,
  installDesktopUpdate,
  resolveDesktopBridgeEnvironment,
  type DesktopUpdateCheckResult
} from "../../desktop-bridge.ts";

function formatUpdateSize(bytes?: number): string {
  if (typeof bytes !== "number" || bytes <= 0) {
    return "未知大小";
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SoftwareUpdateCard({ appVersion }: { appVersion?: string }) {
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error">("idle");
  const [update, setUpdate] = useState<DesktopUpdateCheckResult | undefined>();
  const [installerPath, setInstallerPath] = useState("");
  const [installerHash, setInstallerHash] = useState("");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const desktopAvailable = resolveDesktopBridgeEnvironment().desktop_available;

  async function handleCheck() {
    setStatus("checking");
    setError("");
    setDismissed(false);
    try {
      const result = await checkDesktopUpdate();
      setUpdate(result);
      setStatus(result.available ? "available" : "up-to-date");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError));
      setStatus("error");
    }
  }

  async function handleDownload() {
    if (!update?.manifest) {
      return;
    }
    setStatus("downloading");
    setError("");
    try {
      const path = await downloadDesktopUpdate(update.manifest);
      setInstallerPath(path);
      setInstallerHash(update.manifest.sha256);
      setStatus("ready");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
      setStatus("error");
    }
  }

  async function handleInstall() {
    if (!installerPath || !installerHash) {
      return;
    }
    try {
      await installDesktopUpdate(installerPath, installerHash);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setStatus("error");
    }
  }

  return (
    <Card
      actions={
        <Button
          disabled={!desktopAvailable || status === "checking" || status === "downloading"}
          onClick={() => void handleCheck()}
          type="button"
          variant="secondary"
        >
          {status === "checking" ? "检查中" : "检查更新"}
        </Button>
      }
      className="cutter-settings-update ml-card-section-offset"
      title="软件更新"
    >
      <div className="cutter-update-body">
        <div className="cutter-update-current">
          <span>当前版本</span>
          <strong>v{appVersion ?? update?.current_version ?? "—"}</strong>
        </div>
        {!desktopAvailable ? <p className="ml-metric-description">软件更新仅在 Windows 桌面端可用。</p> : null}
        {status === "idle" ? <p className="ml-metric-description">检查 NAS 上是否有新版本。</p> : null}
        {status === "up-to-date" ? <p className="ml-metric-description">当前已是最新版本。</p> : null}
        {status === "available" && update?.manifest && !dismissed ? (
          <div className="cutter-update-available">
            <strong>发现新版本 v{update.latest_version}</strong>
            <span>大小 {formatUpdateSize(update.size_bytes)}</span>
            {update.notes ? <p>{update.notes}</p> : null}
            <div className="cutter-update-actions">
              <Button type="button" variant="secondary" onClick={() => setDismissed(true)}>稍后</Button>
              <Button type="button" variant="primary" onClick={() => void handleDownload()}>立即更新</Button>
            </div>
          </div>
        ) : null}
        {status === "downloading" ? <p className="ml-metric-description">正在下载并校验更新…</p> : null}
        {status === "ready" ? (
          <div className="cutter-update-available">
            <strong>更新已下载并通过 SHA256 校验</strong>
            <div className="cutter-update-actions">
              <Button type="button" variant="secondary" onClick={() => setStatus("available")}>稍后</Button>
              <Button type="button" variant="primary" onClick={() => void handleInstall()}>立即安装</Button>
            </div>
          </div>
        ) : null}
        {status === "error" || error ? <p className="cutter-update-error" role="alert">{error}</p> : null}
      </div>
    </Card>
  );
}
