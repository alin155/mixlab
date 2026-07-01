import { Badge, InspectorPanel, Table, type BadgeTone, type TableColumn } from "@mixlab/ui-foundation";
import type {
  AdminDashboardData,
  AdminRuntimeDiagnosticsHistoryResponse,
  AdminRuntimeEndpointMeta
} from "../../api.ts";
import { strictChineseDiagnosticText } from "../../app/chinese.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import {
  AdminControlButton,
  EmptyState,
  AdminInfoGroups,
  AdminPageHeader,
  AdminStatusLine,
  MetricBand
} from "../shared.tsx";

interface DoctorExplanation {
  name: string;
  purpose: string;
  impact: string;
  suggestion: string;
}

const DOCTOR_EXPLANATIONS: Record<string, DoctorExplanation> = {
  "public-root": {
    name: "公共素材库根目录",
    purpose: "确认管理端能访问公共素材库根目录。",
    impact: "不可访问时无法扫描、预处理和发布素材。",
    suggestion: "检查移动硬盘或网络盘是否挂载，并确认目录权限。"
  },
  "source-videos-readable": {
    name: "素材来源可读性",
    purpose: "确认原视频目录可以被管理端读取。",
    impact: "不可读时无法扫描新增视频，也无法建立预处理队列。",
    suggestion: "检查素材来源目录是否存在、是否挂载，以及读取权限。"
  },
  "mixlab-library-writable": {
    name: "预处理产物库可写性",
    purpose: "确认文案、索引、封面、日志等产物可以写入。",
    impact: "不可写时预处理任务无法完成，已处理素材也无法发布。",
    suggestion: "检查磁盘剩余空间、目录权限和移动硬盘写入状态。"
  },
  "preprocess-logs-writable": {
    name: "预处理日志目录可写性",
    purpose: "确认预处理任务日志目录可以创建和写入。",
    impact: "不可写时管理端无法追踪任务阶段、失败原因和恢复线索。",
    suggestion: "检查 .mixlab-library/logs 的目录权限和公共素材库所在磁盘状态。"
  },
  manifest: {
    name: "发布清单",
    purpose: "确认素材库清单和原视频协议文件有效。",
    impact: "清单损坏时剪辑端可能看不到可用素材。",
    suggestion: "重新扫描源视频，必要时从最近备份恢复协议文件。"
  },
  "library-counts": {
    name: "素材库计数",
    purpose: "确认素材库统计字段和实际状态一致。",
    impact: "计数异常会让总览、队列和剪辑端可见数量失真。",
    suggestion: "重新扫描并上线到剪辑端，必要时检查 library.json。"
  },
  "source-video-manifests": {
    name: "原视频发布清单",
    purpose: "确认每个原视频的协议文件和产物路径有效。",
    impact: "单个清单异常会让对应原视频不可见、不可搜索或无法剪切。",
    suggestion: "打开原视频详情定位缺失产物，对异常视频重新预处理。"
  },
  "current-index": {
    name: "当前索引",
    purpose: "确认剪辑端搜索使用的当前索引存在且可读取。",
    impact: "当前索引异常时，已可用原视频可能无法被搜索到。",
    suggestion: "上线到剪辑端，或重新运行系统检查。"
  },
  "preprocess-logs": {
    name: "预处理任务日志",
    purpose: "确认已进入预处理生命周期的视频都有可读任务日志。",
    impact: "日志缺失时不影响已发布素材搜索，但会削弱失败定位、恢复和审计能力。",
    suggestion: "对缺失日志的视频重新入队，或确认历史迁移脚本是否保留任务日志。"
  },
  artifacts: {
    name: "视频产物",
    purpose: "确认文案、封面、关键帧等预处理产物完整。",
    impact: "产物缺失时原视频不可搜索或详情页不完整。",
    suggestion: "对缺失产物的视频重新进入预处理队列。"
  },
  ffmpeg: {
    name: "音视频工具",
    purpose: "确认本机可执行音视频提取和剪切任务。",
    impact: "工具不可用时无法提取音频、生成封面或执行本地剪切。",
    suggestion: "检查内置工具或系统路径配置。"
  },
  ffprobe: {
    name: "媒体探测工具",
    purpose: "确认系统可以读取视频编码、时长和分辨率信息。",
    impact: "探测失败时预处理无法准确生成元数据。",
    suggestion: "检查媒体探测工具路径和视频文件可读性。"
  },
  asr: {
    name: "语音识别配置",
    purpose: "确认语音识别所需配置可用且不会暴露密钥。",
    impact: "配置异常时新视频无法生成文案，也无法进入搜索索引。",
    suggestion: "检查阿里云百炼接口密钥和临时上传能力。"
  },
  "asr-config": {
    name: "语音识别配置",
    purpose: "确认语音识别所需模型和密钥配置正确。",
    impact: "配置异常时新视频无法生成文案，也无法进入搜索索引。",
    suggestion: "检查阿里云百炼接口密钥、模型名和临时上传配置。"
  },
  counts: {
    name: "状态计数",
    purpose: "确认素材状态统计与当前索引边界一致。",
    impact: "状态不一致时，剪辑端看到的素材和搜索结果可能不同步。",
    suggestion: "上线到剪辑端，并重新运行系统检查。"
  },
  "local-clips": {
    name: "本地剪辑片段",
    purpose: "确认本地剪切后生成的片段清单和媒体文件有效。",
    impact: "本地剪辑片段属于剪辑端本地工作区，不会阻断公共素材库扫描、预处理和发布，但会影响剪辑师复用本地片段。",
    suggestion: "让对应剪辑端重新生成缺失片段，或在后续本地素材库管理中清理失效片段。"
  }
};

type DoctorCheckRow = AdminDashboardData["doctor"]["checks"][number];

export function doctorExplanation(checkId: string, label: string): DoctorExplanation {
  return DOCTOR_EXPLANATIONS[checkId] ?? {
    name: "未知检查项",
    purpose: "该检查项用于确认系统运行条件。",
    impact: "异常时可能影响素材管理、预处理或剪辑端使用。",
    suggestion: "查看检查详情并结合日志定位问题。"
  };
}

function doctorStatusLabel(status: DoctorCheckRow["status"]): string {
  return status === "pass" ? "通过" : status === "warn" ? "需关注" : "需处理";
}

function doctorStatusTone(status: DoctorCheckRow["status"]): BadgeTone {
  return status === "pass" ? "success" : status === "warn" ? "warning" : "danger";
}

type RuntimeDiagnosticEntry = AdminRuntimeDiagnosticsHistoryResponse["entries"][number];

function runtimeDurationLabel(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

function runtimeEndpointLabel(endpoint: string): string {
  const labels: Record<string, string> = {
    "/api/admin/dashboard/metrics": "总览指标",
    "/api/admin/source-videos": "素材列表",
    "/api/admin/preprocess/jobs": "预处理队列",
    "/api/admin/index/versions": "索引版本",
    "/api/admin/runtime/diagnostics/history": "加载速度记录"
  };

  return labels[endpoint] ?? endpoint;
}

function runtimeScanModeLabel(scanMode: AdminRuntimeEndpointMeta["scan_mode"]): string {
  const labels: Record<AdminRuntimeEndpointMeta["scan_mode"], string> = {
    "no-scan": "不扫描",
    "single-id": "单条读取",
    "paged-list": "分页读取",
    "folder-scan": "目录扫描",
    "status-scan": "状态扫描",
    "full-reconcile": "全量对账"
  };

  return labels[scanMode];
}

function runtimeDataSourceLabel(dataSource: AdminRuntimeEndpointMeta["data_source"]): string {
  const labels: Partial<Record<AdminRuntimeEndpointMeta["data_source"], string>> = {
    "admin-read-model": "同步数据",
    "current-index": "当前索引",
    "doctor-probes": "系统检查",
    "index-version-packages": "索引版本包",
    "library-manifest": "素材库清单",
    "operation-log": "操作记录",
    "runtime-telemetry": "运行负荷",
    "source-video-manifest": "原视频清单",
    "usage-events": "使用事件"
  };

  return labels[dataSource] ?? dataSource;
}

function runtimeCacheLabel(status: AdminRuntimeEndpointMeta["cache_status"]): string {
  const labels: Record<AdminRuntimeEndpointMeta["cache_status"], string> = {
    hit: "命中",
    miss: "未命中",
    pending: "刷新中",
    "not-applicable": "不适用",
    unknown: "未知"
  };

  return labels[status];
}

function runtimeResultTone(runtime: AdminRuntimeEndpointMeta): BadgeTone {
  if (runtime.slow || runtime.duration_ms >= 1_000 || runtime.repair_reason) {
    return "danger";
  }

  if (runtime.duration_ms >= 500 || runtime.fallback_reason) {
    return "warning";
  }

  return "success";
}

function runtimeResultLabel(runtime: AdminRuntimeEndpointMeta): string {
  if (runtime.slow) {
    return "慢";
  }

  if (runtime.repair_reason) {
    return "修复";
  }

  if (runtime.fallback_reason) {
    return "降级";
  }

  return "正常";
}

function runtimeReasonLabel(runtime: AdminRuntimeEndpointMeta): string {
  if (runtime.slow_reason) {
    return "加载超过目标耗时";
  }

  if (runtime.repair_reason) {
    return "系统已自动修复";
  }

  if (runtime.fallback_reason) {
    return "已切换备用读取";
  }

  return "未发现异常";
}

function runtimeComponentLabel(name: string): string {
  const labels: Record<string, string> = {
    production_summary: "生产汇总",
    runtime_load: "运行负荷",
    material_summary: "素材汇总",
    usage_metrics: "使用统计",
    transcript_summary: "文案统计"
  };

  return labels[name] ?? name;
}

function runtimeComponentSummary(runtime: AdminRuntimeEndpointMeta): string {
  if (!runtime.components?.length) {
    return "未记录步骤耗时";
  }

  return [...runtime.components]
    .sort((left, right) => right.duration_ms - left.duration_ms)
    .slice(0, 3)
    .map((component) => `${runtimeComponentLabel(component.name)} ${runtimeDurationLabel(component.duration_ms)}`)
    .join(" · ");
}

export function DoctorPage({
  data,
  doctorReportError = "",
  runtimeDiagnostics,
  runtimeDiagnosticsLoading = false,
  runtimeDiagnosticsError = "",
  onRunDoctor,
  onExportDoctor
}: {
  data: AdminDashboardData;
  doctorReportError?: string;
  runtimeDiagnostics?: AdminRuntimeDiagnosticsHistoryResponse | null;
  runtimeDiagnosticsLoading?: boolean;
  runtimeDiagnosticsError?: string;
  onRunDoctor?: () => void;
  onExportDoctor?: () => void;
}) {
  const attentionCount = data.doctor.summary.warn + data.doctor.summary.fail;
  const reportTone: BadgeTone = data.doctor.summary.fail > 0
    ? "danger"
    : data.doctor.summary.warn > 0
      ? "warning"
      : "success";
  const reportStatus = data.doctor.summary.fail > 0
    ? "需处理"
    : data.doctor.summary.warn > 0
      ? "需关注"
      : "通过";
  const diagnosticColumns: Array<TableColumn<DoctorCheckRow>> = [
    {
      id: "name",
      header: "检查项",
      render: (item) => doctorExplanation(item.check_id, item.label).name
    },
    {
      id: "status",
      header: "状态",
      render: (item) => <Badge tone={doctorStatusTone(item.status)}>{doctorStatusLabel(item.status)}</Badge>
    },
    {
      id: "purpose",
      header: "检查目的",
      render: (item) => doctorExplanation(item.check_id, item.label).purpose
    },
    {
      id: "detail",
      header: "检查详情",
      render: (item) => strictChineseDiagnosticText(item.message)
    }
  ];
  const runtimeEntries = runtimeDiagnostics?.entries ?? [];
  const slowRuntimeCount = runtimeEntries.filter((entry) => entry.runtime.slow).length;
  const fallbackRuntimeCount = runtimeEntries.filter((entry) =>
    Boolean(entry.runtime.fallback_reason || entry.runtime.repair_reason)
  ).length;
  const latestRuntimeEntry = runtimeEntries[0] ?? null;
  const runtimeColumns: Array<TableColumn<RuntimeDiagnosticEntry>> = [
    {
      id: "endpoint",
      header: "页面",
      render: (item) => (
        <div>
          <strong>{runtimeEndpointLabel(item.runtime.endpoint)}</strong>
        </div>
      )
    },
    {
      id: "duration",
      header: "耗时",
      render: (item) => (
        <Badge tone={runtimeResultTone(item.runtime)}>
          {runtimeDurationLabel(item.runtime.duration_ms)}
        </Badge>
      )
    },
    {
      id: "source",
      header: "读取方式",
      render: (item) =>
        `${runtimeScanModeLabel(item.runtime.scan_mode)} · ${runtimeDataSourceLabel(item.runtime.actual_data_source)}`
    },
    {
      id: "cache",
      header: "同步",
      render: (item) => runtimeCacheLabel(item.runtime.cache_status)
    },
    {
      id: "reason",
      header: "状态",
      render: (item) => runtimeReasonLabel(item.runtime)
    },
    {
      id: "components",
      header: "步骤耗时",
      render: (item) => runtimeComponentSummary(item.runtime)
    }
  ];

  return (
    <>
      <div className="admin-main-column admin-doctor-console">
        <AdminPageHeader
          title="系统状态"
          eyebrow="检查系统状态"
          description="集中查看路径、索引、工具和素材处理是否正常。"
          action={(
            <div className="admin-page-header-actions">
              <AdminControlButton label="重新检查" state="m9b-api" reason="重新检查路径、索引、工具和预处理产物。" variant="primary" onClick={onRunDoctor} />
              <AdminControlButton label="导出检查报告" state="m9b-api" reason="导出当前检查结果，便于排障留档。" onClick={onExportDoctor} />
            </div>
          )}
        />
        <MetricBand
          items={[
            { label: "通过", value: data.doctor.summary.pass, caption: "检查通过" },
            { label: "警告", value: data.doctor.summary.warn, caption: "需要关注" },
            { label: "失败", value: data.doctor.summary.fail, caption: "需要处理" },
            { label: "需处理项", value: attentionCount, caption: "警告与失败合计" }
          ]}
        />
        <section className="admin-list-section admin-runtime-diagnostics-history" aria-label="加载速度记录">
          <header className="admin-section-header">
            <div>
              <h2>加载速度记录</h2>
              <p>查看管理端页面最近是否加载过慢，方便判断卡顿是否还在发生。</p>
            </div>
            <Badge tone={slowRuntimeCount > 0 ? "warning" : "success"}>
              {slowRuntimeCount > 0 ? `${slowRuntimeCount} 个加载较慢` : "加载正常"}
            </Badge>
          </header>
          <MetricBand
            items={[
              { label: "最近样本", value: runtimeEntries.length, caption: "历史记录" },
              { label: "加载较慢", value: slowRuntimeCount, caption: "超过目标" },
              { label: "降级或修复", value: fallbackRuntimeCount, caption: "需关注" },
              {
                label: "异常行",
                value: runtimeDiagnostics?.malformed_line_count ?? 0,
                caption: "历史文件容错"
              }
            ]}
          />
          {runtimeDiagnosticsError ? (
            <AdminStatusLine
              tone="failed"
              label="加载速度记录读取失败"
              detail={runtimeDiagnosticsError}
              value="局部错误"
            />
          ) : null}
          {runtimeDiagnostics?.malformed_line_count ? (
            <AdminStatusLine
              tone="warning"
              label="历史文件存在异常行"
              detail="管理端已跳过无法解析的运行时诊断记录，页面继续显示有效样本。"
              value={runtimeDiagnostics.malformed_line_count}
            />
          ) : null}
          {runtimeDiagnosticsLoading && !runtimeDiagnostics ? (
            <EmptyState title="正在读取加载速度记录" detail="该请求只读取最近记录，不会触发全库扫描。" />
          ) : runtimeEntries.length > 0 ? (
            <Table
              columns={runtimeColumns}
              rows={runtimeEntries}
              getRowKey={(item) => `${item.recorded_at}-${item.runtime.endpoint}`}
              stickyHeader
            />
          ) : (
            <EmptyState title="暂无加载速度记录" detail="系统状态仍可使用；后续页面请求会逐步写入加载样本。" />
          )}
        </section>
        <section className="admin-list-section admin-doctor-report-surface" aria-label="诊断报告">
          <header className="admin-section-header">
            <div>
              <h2>诊断报告</h2>
              <p>系统检查只在本路由读取系统探针结果，用于定位路径、索引、工具和产物问题。</p>
            </div>
            <Badge tone={reportTone}>{reportStatus}</Badge>
          </header>
          {doctorReportError ? (
            <AdminStatusLine
              tone="failed"
              label="诊断报告加载失败"
              detail={doctorReportError}
              value="局部错误"
            />
          ) : null}
          <Table
            columns={diagnosticColumns}
            rows={data.doctor.checks}
            getRowKey={(item) => item.check_id}
            stickyHeader
          />
        </section>
        <section className="admin-list-panel" aria-label="检查摘要">
          {data.doctor.checks.map((item) => (
            <AdminStatusLine
              tone={adminStatusTone(item.status)}
              label={doctorExplanation(item.check_id, item.label).name}
              detail={`${doctorExplanation(item.check_id, item.label).name} · ${strictChineseDiagnosticText(item.message)}`}
              value={doctorStatusLabel(item.status)}
              key={item.check_id}
            />
          ))}
        </section>
        <section className="admin-list-section">
          <header className="admin-section-header">
            <h2>检查结果</h2>
            <p>每个检查项都说明检查目的、失败影响和处理建议；原始技术信息可导出报告查看。</p>
          </header>
          <AdminInfoGroups
            groups={data.doctor.checks.map((item) => {
              const explanation = doctorExplanation(item.check_id, item.label);
              return {
                title: explanation.name,
                rows: [
                  { label: "检查目的", value: explanation.purpose },
                  { label: "失败影响", value: explanation.impact },
                  { label: "处理建议", value: explanation.suggestion },
                  { label: "检查详情", value: strictChineseDiagnosticText(item.message) }
                ]
              };
            })}
          />
        </section>
      </div>
      <InspectorPanel title="检查报告" subtitle="系统检查">
        <AdminInfoGroups
          groups={[
            {
              title: "报告",
              rows: [
                { label: "生成时间", value: data.doctor.generated_at },
                { label: "报告版本", value: data.doctor.schema_version },
                { label: "库路径", value: data.doctor.library_root },
                { label: "通过", value: data.doctor.summary.pass },
                { label: "警告", value: data.doctor.summary.warn },
                { label: "失败", value: data.doctor.summary.fail }
              ]
            },
            {
              title: "加载速度记录",
              rows: [
                { label: "最近样本", value: runtimeEntries.length },
                { label: "加载较慢", value: slowRuntimeCount },
                { label: "降级或修复", value: fallbackRuntimeCount },
                { label: "异常行", value: runtimeDiagnostics?.malformed_line_count ?? 0 },
                {
                  label: "最近接口",
                  value: latestRuntimeEntry
                    ? runtimeEndpointLabel(latestRuntimeEntry.runtime.endpoint)
                    : "暂无记录"
                },
                {
                  label: "最近耗时",
                  value: latestRuntimeEntry
                    ? runtimeDurationLabel(latestRuntimeEntry.runtime.duration_ms)
                    : "-"
                },
                {
                  label: "最近读取",
                  value: latestRuntimeEntry
                    ? runtimeDataSourceLabel(latestRuntimeEntry.runtime.actual_data_source)
                    : "-"
                }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
