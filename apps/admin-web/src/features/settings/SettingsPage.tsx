import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import { useEffect, useState } from "react";
import type {
  AdminDashboardData,
  AdminPathCheck,
  AdminSettingsConfigUpdate,
  AdminSourceFolder
} from "../../api.ts";
import {
  asrModelLabel,
  asrProviderLabel,
  audioModeLabel,
  chineseDiagnosticText,
  runtimeSourceLabel
} from "../../app/chinese.ts";
import {
  adminStatusTone,
  redactConfiguredSecret
} from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader } from "../shared.tsx";

type RuntimePolicy = AdminSettingsConfigUpdate["runtime_policy"];

const FIRST_RUN_CHECK_LABELS = new Set([
  ".mixlab-library",
  "library.json",
  "manifest.json"
]);

function isFirstRunProtocolCheck(check: AdminPathCheck): boolean {
  return (
    check.status !== "pass" &&
    (
      FIRST_RUN_CHECK_LABELS.has(check.label) ||
      check.path.endsWith("/.mixlab-library") ||
      check.path.endsWith("/.mixlab-library/library.json")
    )
  );
}

export function adminFirstRunInitializationChecks(data: AdminDashboardData): AdminPathCheck[] {
  return data.path_checks.filter(isFirstRunProtocolCheck);
}

function settingsPathCheckLabel(check: AdminPathCheck): string {
  const label = chineseDiagnosticText(check.label);

  if (label === "预处理产物库") {
    return "处理结果目录";
  }
  if (label === "预处理产物库可写") {
    return "处理结果目录可写";
  }

  return label;
}

function nextSourceFolderId(sourceFolders: AdminSourceFolder[]): string {
  let maxSuffix = BigInt(sourceFolders.length);

  for (const folder of sourceFolders) {
    const match = /^src_(\d+)$/.exec(folder.id);
    if (match) {
      const suffix = BigInt(match[1] ?? "0");
      if (suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }
  }

  return `src_${String(maxSuffix + 1n).padStart(3, "0")}`;
}

function defaultNewSourceFolder(data: AdminDashboardData, sourceFolders: AdminSourceFolder[]): AdminSourceFolder {
  const rootPath = data.status.root_path.replace(/\/$/, "") || "/Volumes/PublicLibrary";
  const suffix = sourceFolders.length + 1;
  return {
    id: nextSourceFolderId(sourceFolders),
    name: `新素材来源 ${suffix}`,
    path: `${rootPath}/source-videos-${suffix}`,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  };
}

export function SettingsPage({
  data,
  onSaveAdminSettings,
  onInitializeLibrary,
  onTestAsrConfig
}: {
  data: AdminDashboardData;
  onSaveAdminSettings?: (settings: AdminSettingsConfigUpdate) => void | Promise<void>;
  onInitializeLibrary?: () => void | Promise<void>;
  onTestAsrConfig?: () => void;
}) {
  const [libraryName, setLibraryName] = useState(data.settings.library_name);
  const [sourceFolders, setSourceFolders] = useState<AdminSourceFolder[]>(() =>
    data.settings.source_folders.map((folder) => ({ ...folder }))
  );
  const [runtimePolicy, setRuntimePolicy] = useState<RuntimePolicy>(() => ({
    ...data.settings.runtime_policy
  }));
  const [dashscopeApiKey, setDashscopeApiKey] = useState("");
  const toolState = data.runtime.ffmpeg.available && data.runtime.ffprobe.available ? "可用" : "需处理";
  const initializationChecks = adminFirstRunInitializationChecks(data);

  useEffect(() => {
    setLibraryName(data.settings.library_name);
    setSourceFolders(data.settings.source_folders.map((folder) => ({ ...folder })));
    setRuntimePolicy({ ...data.settings.runtime_policy });
  }, [data.settings]);

  const updateSourceFolder = (sourceFolderId: string, patch: Partial<AdminSourceFolder>) => {
    setSourceFolders((current) =>
      current.map((folder) => folder.id === sourceFolderId ? { ...folder, ...patch } : folder)
    );
  };

  const removeSourceFolder = (sourceFolderId: string) => {
    setSourceFolders((current) => current.filter((folder) => folder.id !== sourceFolderId));
  };

  const updateRuntimePolicy = (patch: Partial<RuntimePolicy>) => {
    setRuntimePolicy((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async () => {
    const nextApiKey = dashscopeApiKey.trim();
    await onSaveAdminSettings?.({
      library_name: libraryName,
      source_folders: sourceFolders,
      runtime_policy: runtimePolicy,
      ...(nextApiKey
        ? {
            asr: {
              dashscope_api_key: nextApiKey
            }
          }
        : {})
    });

    if (nextApiKey) {
      setDashscopeApiKey("");
    }
  };

  return (
    <>
      <div className="admin-main-column">
	        <AdminPageHeader
	          title="设置"
	          eyebrow="素材来源与预处理设置"
          action={(
            <AdminControlButton
              label="新增素材来源"
              state="local"
              reason="在当前页面新增一条素材来源，保存后写入设置。"
              onClick={() => setSourceFolders((current) => [...current, defaultNewSourceFolder(data, current)])}
            />
          )}
        />
        <section className="ml-form-group">
          <h2 className="ml-form-group-title">素材库基本信息</h2>
          <div className="ml-form-row">
            <span className="ml-form-label">素材库名称</span>
            <span>
              <input
                className="admin-text-input"
                aria-label="素材库名称"
                value={libraryName}
                onChange={(event) => setLibraryName(event.currentTarget.value)}
              />
            </span>
          </div>
        </section>
        <section className="ml-form-group">
          <h2 className="ml-form-group-title">素材来源</h2>
          <div className="admin-source-folder-list">
            {sourceFolders.map((folder) => (
              <section className="admin-source-folder-row" key={folder.id}>
                <label>
                  <span>来源名称</span>
                  <input
                    className="admin-text-input"
                    value={folder.name}
                    aria-label={`${folder.name} 来源名称`}
                    onChange={(event) => updateSourceFolder(folder.id, { name: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>文件夹路径</span>
                  <input
                    className="admin-text-input"
                    value={folder.path}
                    aria-label={`${folder.name} 文件夹路径`}
                    onChange={(event) => updateSourceFolder(folder.id, { path: event.currentTarget.value })}
                  />
                </label>
                <label className="admin-checkbox-row">
                  <input
                    type="checkbox"
                    checked={folder.enabled}
                    onChange={(event) => updateSourceFolder(folder.id, { enabled: event.currentTarget.checked })}
                  />
                  <span>启用素材来源</span>
                </label>
                <span className="admin-source-folder-meta">
                  已发现 {folder.discovered_video_count ?? 0} 个 · 新增未处理 {folder.new_unprocessed_count ?? 0} 个 · 最近扫描 {folder.last_scanned_at || "未扫描"}
                </span>
                {folder.id === "src_default" ? (
                  <span className="admin-inline-note">默认来源不可移除</span>
                ) : (
                  <AdminControlButton
                    label="移除"
                    state="local"
                    reason="从设置中移除该素材来源，保存后生效。"
                    onClick={() => removeSourceFolder(folder.id)}
                  />
                )}
              </section>
            ))}
          </div>
        </section>
	        <GroupedForm
	          groups={[
	            {
	              title: "预处理设置",
	              rows: [
	                { label: "产物路径", value: data.settings.artifact_library.path },
	                {
	                  label: "并发任务数",
	                  value: (
                    <input
                      className="admin-number-input"
                      aria-label="并发任务数"
                      type="number"
                      min={1}
                      value={runtimePolicy.concurrent_jobs}
                      onChange={(event) => updateRuntimePolicy({
                        concurrent_jobs: Math.max(1, Number(event.currentTarget.value) || 1)
                      })}
                    />
                  )
                },
                {
                  label: "音频模式",
                  value: (
                    <select
                      className="admin-select"
                      value={runtimePolicy.audio_mode}
                      aria-label="选择音频模式"
                      onChange={(event) => updateRuntimePolicy({
                        audio_mode: event.currentTarget.value as RuntimePolicy["audio_mode"]
                      })}
                    >
                      <option value="mp3_16k_mono_64k">压缩单声道</option>
                      <option value="wav_16k_mono_pcm_s16le">无损单声道</option>
                    </select>
                  )
	                },
	                { label: "音视频工具", value: `${runtimeSourceLabel(data.runtime.ffmpeg.source)} · ${toolState}` }
	              ]
	            },
	            {
	              title: "语音识别",
	              rows: [
	                { label: "供应商", value: asrProviderLabel(data.runtime.asr.provider) },
	                { label: "模型", value: asrModelLabel(data.runtime.asr.model) },
	                { label: "当前音频", value: audioModeLabel(runtimePolicy.audio_mode) },
	                { label: "密钥状态", value: redactConfiguredSecret(data.runtime.asr.dashscope_api_key_configured) },
	                {
	                  label: "填写密钥",
	                  value: (
                    <input
                      className="admin-text-input"
                      type="password"
                      aria-label="阿里云百炼接口密钥"
                      autoComplete="off"
                      placeholder="留空保持当前密钥"
                      value={dashscopeApiKey}
                      onChange={(event) => setDashscopeApiKey(event.currentTarget.value)}
	                    />
	                  )
	                }
	              ]
	            }
	          ]}
	        />
	      </div>
	      <InspectorPanel title="系统状态">
        {initializationChecks.length ? (
          <section className="admin-first-run-panel" aria-label="素材库初始化修复">
	            <header>
	              <span>初始化</span>
	              <strong>素材库目录待创建</strong>
	              <p>发现公共素材库文件缺失或不可写，初始化后再刷新系统状态。</p>
	            </header>
            <div className="admin-first-run-issues">
              {initializationChecks.map((item) => (
                <span key={`${item.label}-${item.path}`}>
                  {chineseDiagnosticText(item.label)}
                </span>
              ))}
            </div>
            <AdminControlButton
              label="初始化素材库"
              state="m9b-api"
              reason="创建 source-videos、.mixlab-library、索引目录和 library.json。"
              variant="primary"
              onClick={onInitializeLibrary}
            />
          </section>
        ) : null}
        <section className="admin-list-panel">
          {data.path_checks.map((item) => (
	            <StatusRow
	              tone={adminStatusTone(item.status)}
	              label={settingsPathCheckLabel(item)}
	              detail={`${item.path} · ${chineseDiagnosticText(item.message)}`}
	              value={item.status === "pass" ? "通过" : "处理"}
              key={item.label}
            />
          ))}
	        </section>
	        <p className="admin-note">
	          新密钥保存后生效，留空不会覆盖当前密钥；页面只显示密钥配置状态。
	        </p>
        <section className="admin-action-stack">
	          <AdminControlButton
	            label="保存设置"
	            state="m9b-api"
	            reason="保存素材来源和预处理参数。"
	            variant="primary"
            onClick={onSaveAdminSettings ? saveSettings : undefined}
          />
	          <AdminControlButton label="检查语音识别" state="m9b-api" reason="检查当前语音识别配置是否可用。" onClick={onTestAsrConfig} />
	        </section>
      </InspectorPanel>
    </>
  );
}
