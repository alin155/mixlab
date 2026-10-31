import { useState } from "react";
import { Button } from "@mixlab/ui-foundation";
import {
  checkDesktopUpdate,
  downloadDesktopUpdate,
  installDesktopUpdate,
  readDesktopConfig,
  type CutterUpdateCheckResult
} from "../../desktop-bridge.ts";

function updateSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "未知大小";
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function SettingsUpdatePanel({ appVersion }: { appVersion?: string }) {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<CutterUpdateCheckResult | null>(null);

  async function handleCheck() {
    setChecking(true);
    setError("");
    setStatus("正在检查更新…");
    setUpdate(null);
    try {
      const config = await readDesktopConfig();
      const result = await checkDesktopUpdate({
        publicLibraryRoot: config?.public_library_root
      });
      if (result.available) {
        setUpdate(result);
        setStatus("");
      } else {
        setStatus(`已是最新版本 v${result.currentVersion || appVersion || ""}`);
      }
    } catch (checkError) {
      setStatus("");
      setError(checkError instanceof Error ? checkError.message : String(checkError));
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    if (!update || downloading) {
      return;
    }
    const confirmed = window.confirm(
      `将更新到 v${update.latestVersion}。

${update.releaseNotes || "本次更新包含最新修复与优化。"}

现在下载并安装吗？`
    );
    if (!confirmed) {
      return;
    }
    setDownloading(true);
    setError("");
    setStatus("正在下载并校验安装包…");
    try {
      const config = await readDesktopConfig();
      const download = await downloadDesktopUpdate({
        publicLibraryRoot: config?.public_library_root
      });
      const installConfirmed = window.confirm(
        `安装包下载并校验完成。

应用将退出并启动安装程序，安装完成后请重新打开 MixLab Cutter。是否继续？`
      );
      if (!installConfirmed) {
        setStatus("已取消安装");
        return;
      }
      await installDesktopUpdate({
        installerPath: download.installerPath,
        sha256: download.sha256
      });
      setStatus("正在启动安装程序…");
    } catch (installError) {
      setStatus("");
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="cutter-update-panel ml-data-surface" aria-label="软件更新">
      <div className="cutter-update-header">
        <div>
          <h2>软件更新</h2>
          <p>当前版本 {appVersion?.trim() ? `v${appVersion.trim()}` : "未知"}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={checking || downloading} onClick={handleCheck}>
          {checking ? "检查中…" : "检查更新"}
        </Button>
      </div>

      {status ? <p className="cutter-update-status">{status}</p> : null}
      {error ? <p className="cutter-update-error" role="alert">{error}</p> : null}

      {update ? (
        <div className="cutter-update-card">
          <div className="cutter-update-card-head">
            <strong>发现新版本 v{update.latestVersion}</strong>
            <span>{updateSizeLabel(update.sizeBytes)}</span>
          </div>
          {update.releaseNotes ? (
            <pre className="cutter-update-notes">{update.releaseNotes}</pre>
          ) : (
            <p className="cutter-update-notes">本次更新包含最新修复与优化。</p>
          )}
          <div className="cutter-update-actions">
            <Button type="button" variant="ghost" size="sm" disabled={downloading} onClick={() => setUpdate(null)}>
              稍后
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={downloading} onClick={handleInstall}>
              {downloading ? "更新中…" : "立即更新"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
