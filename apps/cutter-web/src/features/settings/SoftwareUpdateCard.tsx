import { Button, Card } from "@mixlab/ui-foundation";
import { useEffect, useState } from "react";
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

export type UpdateNoteBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export function stripUpdateMarkdown(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/u, "")
    .replace(/^\s{0,3}>\s?/u, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, "$1")
    .replace(/[*`_~]/gu, "")
    .replace(/\s+$/u, "")
    .trim();
}

export function updateNoteBlocks(notes?: string): UpdateNoteBlock[] {
  if (!notes?.trim()) {
    return [];
  }

  const blocks: UpdateNoteBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join("\n") });
    paragraphLines = [];
  };
  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({ kind: "list", items: listItems });
    listItems = [];
  };

  for (const rawLine of notes.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || /^[-*_]{3,}$/u.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^[-*+]\s+/u.test(line)) {
      flushParagraph();
      const item = stripUpdateMarkdown(line.replace(/^[-*+]\s+/u, ""));
      if (item) listItems.push(item);
      continue;
    }
    if (/^\d+[.)]\s+/u.test(line)) {
      flushParagraph();
      const item = stripUpdateMarkdown(line.replace(/^\d+[.)]\s+/u, ""));
      if (item) listItems.push(item);
      continue;
    }
    const item = stripUpdateMarkdown(line);
    if (!item) {
      continue;
    }
    flushList();
    paragraphLines.push(item);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function updateNotesNeedToggle(notes?: string): boolean {
  const blocks = updateNoteBlocks(notes);
  const lineCount = blocks.reduce((count, block) => count + (block.kind === "list" ? block.items.length : block.text.split("\n").length), 0);
  return lineCount > 8 || blocks.reduce((count, block) => count + (block.kind === "list" ? block.items.join("").length : block.text.length), 0) > 520;
}

export function SoftwareUpdateCard({ appVersion }: { appVersion?: string }) {
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error">("idle");
  const [update, setUpdate] = useState<DesktopUpdateCheckResult | undefined>();
  const [installerPath, setInstallerPath] = useState("");
  const [installerHash, setInstallerHash] = useState("");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const desktopAvailable = resolveDesktopBridgeEnvironment().desktop_available;
  const noteBlocks = updateNoteBlocks(update?.notes);
  const showNotesToggle = updateNotesNeedToggle(update?.notes);

  useEffect(() => {
    setNotesExpanded(false);
  }, [update?.latest_version]);

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
            <div className="cutter-update-heading">
              <strong>发现新版本 v{update.latest_version}</strong>
              <span className="cutter-update-size">大小 {formatUpdateSize(update.size_bytes)}</span>
            </div>
            {noteBlocks.length > 0 ? (
              <section className="cutter-update-notes-section" aria-label="更新说明">
                <div className="cutter-update-notes-title">更新说明</div>
                <div className={`cutter-update-notes${notesExpanded ? " is-expanded" : ""}`}>
                  {noteBlocks.map((block, index) =>
                    block.kind === "list" ? (
                      <ul key={index}>
                        {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                      </ul>
                    ) : (
                      <p key={index}>{block.text}</p>
                    )
                  )}
                </div>
                {showNotesToggle ? (
                  <button
                    className="cutter-update-notes-toggle ml-table-text-button"
                    onClick={() => setNotesExpanded((current) => !current)}
                    type="button"
                  >
                    {notesExpanded ? "收起更新说明" : "展开全部更新说明"}
                  </button>
                ) : null}
              </section>
            ) : null}
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
