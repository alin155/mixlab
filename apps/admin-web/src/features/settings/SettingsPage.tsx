import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import { useEffect, useState } from "react";
import type {
  AdminDashboardData,
  AdminSettingsConfigUpdate,
  AdminSourceFolder
} from "../../api.ts";
import {
  asrModelLabel,
  asrProviderLabel,
  audioModeLabel,
  booleanLabel,
  chineseDiagnosticText,
  languageHintsLabel,
  runtimeSourceLabel
} from "../../app/chinese.ts";
import {
  adminStatusTone,
  redactConfiguredSecret
} from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader } from "../shared.tsx";

type RuntimePolicy = AdminSettingsConfigUpdate["runtime_policy"];

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
  onTestAsrConfig
}: {
  data: AdminDashboardData;
  onSaveAdminSettings?: (settings: AdminSettingsConfigUpdate) => void | Promise<void>;
  onTestAsrConfig?: () => void;
}) {
  const [libraryName, setLibraryName] = useState(data.settings.library_name);
  const [sourceFolders, setSourceFolders] = useState<AdminSourceFolder[]>(() =>
    data.settings.source_folders.map((folder) => ({ ...folder }))
  );
  const [runtimePolicy, setRuntimePolicy] = useState<RuntimePolicy>(() => ({
    ...data.settings.runtime_policy
  }));
  const toolState = data.runtime.ffmpeg.available && data.runtime.ffprobe.available ? "可用" : "需处理";

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

  const saveSettings = () => {
    onSaveAdminSettings?.({
      library_name: libraryName,
      source_folders: sourceFolders,
      runtime_policy: runtimePolicy
    });
  };

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="设置"
          eyebrow="素材来源与运行策略"
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
          <div className="ml-form-row">
            <span className="ml-form-label">素材库编号</span>
            <span>{data.status.library_id}</span>
          </div>
          <div className="ml-form-row">
            <span className="ml-form-label">协议版本</span>
            <span>{data.status.protocol_version}</span>
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
              title: "预处理产物库",
              rows: [
                { label: "存储模式", value: runtimeSourceLabel(data.settings.artifact_library.mode) },
                { label: "产物路径", value: data.settings.artifact_library.path },
                { label: "是否需要迁移", value: booleanLabel(data.settings.artifact_library.migration_required) }
              ]
            },
            {
              title: "运行策略",
              rows: [
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
              title: "语音识别配置",
              rows: [
                { label: "供应商", value: asrProviderLabel(data.runtime.asr.provider) },
                { label: "模型", value: asrModelLabel(data.runtime.asr.model) },
                { label: "当前音频模式", value: audioModeLabel(runtimePolicy.audio_mode) },
                { label: "可选音频模式", value: "压缩单声道 / 无损单声道" },
                { label: "接口密钥", value: redactConfiguredSecret(data.runtime.asr.dashscope_api_key_configured) },
                { label: "语言提示", value: languageHintsLabel(data.runtime.asr.language_hints) },
                { label: "对象存储", value: "阿里云百炼临时上传" },
                { label: "最近失败", value: chineseDiagnosticText(data.runtime.asr.last_failure_reason) }
              ]
            }
          ]}
        />
      </div>
      <InspectorPanel title="路径与权限校验">
        <section className="admin-list-panel">
          {data.path_checks.map((item) => (
            <StatusRow
              tone={adminStatusTone(item.status)}
              label={chineseDiagnosticText(item.label)}
              detail={`${item.path} · ${chineseDiagnosticText(item.message)}`}
              value={item.status === "pass" ? "通过" : "处理"}
              key={item.label}
            />
          ))}
        </section>
        <p className="admin-note">
          接口密钥不写入代码、协议清单、日志或诊断报告。管理端只显示配置状态。
        </p>
        <p className="admin-note">
          NAS Docker 部署时，在 admin-api 和 admin-worker 两个容器环境变量中填写 DASHSCOPE_API_KEY，保存后重启项目。
        </p>
        <p className="admin-note">
          两个容器必须使用同一个值；只配置管理接口时，健康诊断可能通过，但后台预处理仍不能转写。
        </p>
        <section className="admin-action-stack">
          <AdminControlButton
            label="保存设置"
            state="m9b-api"
            reason="M10 保存素材来源和运行策略。"
            variant="primary"
            onClick={onSaveAdminSettings ? saveSettings : undefined}
          />
          <AdminControlButton label="测试语音识别配置" state="m9b-api" reason="M9B 接入语音识别配置检测。" onClick={onTestAsrConfig} />
        </section>
      </InspectorPanel>
    </>
  );
}
