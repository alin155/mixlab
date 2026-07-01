import { Badge, InspectorPanel } from "@mixlab/ui-foundation";
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
  runtimeSourceLabel,
  strictChineseDiagnosticText
} from "../../app/chinese.ts";
import {
  adminStatusTone,
  redactConfiguredSecret
} from "../../app/view-model.ts";
import { doctorExplanation } from "../doctor/DoctorPage.tsx";
import {
  AdminControlButton,
  AdminInfoGroups,
  AdminPageHeader,
  AdminStatusLine,
  MetricBand
} from "../shared.tsx";

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
  pathChecksError = "",
  runtimeSettingsError = "",
  onSaveAdminSettings,
  onInitializeLibrary,
  onTestAsrConfig,
  onRunDoctor,
  onExportDoctor
}: {
  data: AdminDashboardData;
  pathChecksError?: string;
  runtimeSettingsError?: string;
  onSaveAdminSettings?: (settings: AdminSettingsConfigUpdate) => void | Promise<void>;
  onInitializeLibrary?: () => void | Promise<void>;
  onTestAsrConfig?: () => void;
  onRunDoctor?: () => void;
  onExportDoctor?: () => void;
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
  const enabledSourceFolderCount = sourceFolders.filter((folder) => folder.enabled).length;
  const pathIssueCount = data.path_checks.filter((check) => check.status !== "pass").length;
  const runtimeProbeState = toolState === "可用" && data.runtime.asr.dashscope_api_key_configured
    ? "通过"
    : "需关注";

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
      <div className="admin-main-column admin-settings-console">
        <AdminPageHeader
          title="设置"
          eyebrow="素材来源与预处理设置"
          description="管理素材来源、预处理并发和语音识别配置。"
          action={(
            <AdminControlButton
              label="新增素材来源"
              state="local"
              reason="在当前页面新增一条素材来源，保存后写入设置。"
              onClick={() => setSourceFolders((current) => [...current, defaultNewSourceFolder(data, current)])}
            />
          )}
        />
        <MetricBand
          items={[
            { label: "素材来源", value: sourceFolders.length, caption: "当前配置数量" },
            { label: "启用来源", value: enabledSourceFolderCount, caption: "保存后生效" },
            { label: "并发任务", value: runtimePolicy.concurrent_jobs, caption: "预处理运行策略" },
            { label: "路径问题", value: pathIssueCount, caption: "路径检查需关注" }
          ]}
        />
        <section className="admin-settings-route-contract" aria-label="设置保存说明">
          <div>
            <span>设置表单</span>
            <strong>本地编辑</strong>
            <p>点击保存后才生效</p>
          </div>
          <div>
            <span>路径检查</span>
            <strong>只检查路径</strong>
            <p>不会枚举全部素材</p>
          </div>
          <div>
            <span>运行状态</span>
            <strong>密钥隐藏</strong>
            <p>只显示配置状态，不显示密钥值</p>
          </div>
        </section>
        <section className="admin-list-section admin-settings-form-surface" aria-label="设置表单">
          <header className="admin-section-header">
            <div>
              <h2>设置表单</h2>
              <p>素材库名称、素材来源和运行策略先在本页面本地编辑，点击保存后才写入管理配置。</p>
            </div>
            <Badge tone="info">本地编辑</Badge>
          </header>
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
          <section className="ml-form-group" aria-label="素材来源设置">
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
        </section>
        <section className="admin-list-section admin-settings-runtime-surface" aria-label="运行策略">
          <header className="admin-section-header">
            <div>
              <h2>运行策略</h2>
              <p>预处理并发、音频格式和语音识别密钥状态来自运行时配置；密钥值不会回显。</p>
            </div>
            <Badge tone={runtimeProbeState === "通过" ? "success" : "warning"}>{runtimeProbeState}</Badge>
          </header>
          {runtimeSettingsError ? (
            <AdminStatusLine
              tone="failed"
              label="运行时状态加载失败"
              detail={runtimeSettingsError}
              value="局部错误"
            />
          ) : null}
          <AdminInfoGroups
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
        </section>
        <section className="admin-settings-diagnostics" aria-label="系统诊断">
          <header className="admin-section-header admin-section-header-row">
            <div>
              <h2>系统诊断</h2>
              <p>检查素材库路径、索引、预处理产物和本机工具状态。</p>
            </div>
            <AdminControlButton
              label="重新检查"
              state="m9b-api"
              reason="重新检查路径、索引、工具和预处理产物。"
              variant="primary"
              onClick={onRunDoctor}
            />
          </header>
          <MetricBand
            items={[
              { label: "通过", value: data.doctor.summary.pass, caption: "检查通过" },
              { label: "警告", value: data.doctor.summary.warn, caption: "需要关注" },
              { label: "失败", value: data.doctor.summary.fail, caption: "需要处理" }
            ]}
          />
          <section className="admin-list-panel admin-settings-doctor-list">
            {data.doctor.checks.map((item) => {
              const explanation = doctorExplanation(item.check_id, item.label);
              return (
                <AdminStatusLine
                  tone={adminStatusTone(item.status)}
                  label={explanation.name}
                  detail={strictChineseDiagnosticText(item.message)}
                  value={item.status === "pass" ? "通过" : item.status === "warn" ? "需关注" : "需处理"}
                  key={item.check_id}
                />
              );
            })}
          </section>
          <div className="admin-action-row">
            <AdminControlButton
              label="导出检查报告"
              state="m9b-api"
              reason="导出当前检查结果，便于排障留档。"
              onClick={onExportDoctor}
            />
          </div>
        </section>
      </div>
      <InspectorPanel title="设置概览" subtitle="系统状态">
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
        <section className="admin-list-panel" aria-label="路径检查">
          {pathChecksError ? (
            <AdminStatusLine
              tone="failed"
              label="路径检查加载失败"
              detail={pathChecksError}
              value="局部错误"
            />
          ) : null}
          {data.path_checks.map((item) => (
            <AdminStatusLine
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
        <AdminInfoGroups
          groups={[
            {
              title: "保存说明",
              rows: [
                { label: "编辑方式", value: "本页面先编辑，点击保存后才写入配置" },
                { label: "路径检查", value: "只检查路径是否可用，不会扫描全部素材" },
                { label: "语音识别密钥", value: "页面只显示是否配置，不显示密钥内容" },
                { label: "保存影响", value: "影响后续处理，不会重跑已完成素材" }
              ]
            }
          ]}
        />
        <section className="admin-action-stack">
          <AdminControlButton
            label="保存设置"
            state="m9b-api"
            reason="保存素材来源和预处理参数。"
            variant="primary"
            onClick={onSaveAdminSettings ? saveSettings : undefined}
          />
          <AdminControlButton
            label="检查语音识别"
            state="m9b-api"
            reason="检查当前语音识别配置是否可用。"
            onClick={onTestAsrConfig}
          />
        </section>
      </InspectorPanel>
    </>
  );
}
