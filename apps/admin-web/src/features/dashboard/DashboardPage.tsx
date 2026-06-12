import {
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData, AdminPreprocessJob, UsageMetrics } from "../../api.ts";
import {
  createAdminSmartScanReport,
  type AdminSmartScanAction,
  type AdminSmartScanReport
} from "../../api.ts";
import {
  chineseDiagnosticText,
  indexStatusLabel,
  jobStageLabel
} from "../../app/chinese.ts";
import {
  adminStatusTone,
  formatAdminDuration,
  formatAdminFileSize
} from "../../app/view-model.ts";
import {
  AdminControlButton,
  AdminPageHeader,
  CountStrip,
  DiskUsage
} from "../shared.tsx";

function compactDateTimeLabel(value: string): string {
  const normalized = value.trim().replace("T", " ");

  if (!normalized) {
    return "暂无估算";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(normalized);
  if (match) {
    return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
  }

  return normalized.length > 16 ? `${normalized.slice(0, 16)}...` : normalized;
}

function DashboardPanel({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; value: string | number }>;
}) {
  return (
    <article className="admin-dashboard-panel">
      <h2>{title}</h2>
      <dl>
        {rows.map((row) => (
          <div className="admin-dashboard-panel-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function hoursLabel(ms: number): string {
  return `${Math.round(ms / 3_600_000)}h`;
}

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

const TARGET_CUTTER_SEAT_COUNT = 50;
const SEARCH_LATENCY_HEALTHY_MS = 120;
const SEARCH_LATENCY_ATTENTION_MS = 500;
const LOCAL_SEARCH_HEALTHY_PERCENT = 95;
const LOCAL_SEARCH_ATTENTION_PERCENT = 80;

type AdminCorePathTone = "healthy" | "attention" | "blocked";

export interface AdminCorePathHealthRow {
  label: string;
  value: string;
  detail: string;
  tone: AdminCorePathTone;
}

export interface AdminCorePathHealth {
  tone: AdminCorePathTone;
  status_label: string;
  title: string;
  detail: string;
  rows: AdminCorePathHealthRow[];
}

function usageRatePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

function boundedUsageRatePercent(numerator: number, denominator: number): number {
  return Math.min(100, usageRatePercent(numerator, denominator));
}

function usageRateLabel(numerator: number, denominator: number): string {
  return denominator > 0 ? `${boundedUsageRatePercent(numerator, denominator)}%` : "暂无数据";
}

function usageSampleGapLabel(numerator: number, denominator: number, denominatorLabel: string): string {
  if (denominator <= 0 || numerator <= denominator) {
    return "";
  }

  return ` · ${denominatorLabel}样本 ${denominator} 次 · 样本缺口 ${numerator - denominator}`;
}

function searchLatencyLabel(value: number): string {
  return value > 0 ? `${value}ms` : "暂无数据";
}

function coreSearchRequestCount(usage: UsageMetrics): number {
  return usage.core_search_request_count ?? usage.search_request_count;
}

function coreSearchdSearchCount(usage: UsageMetrics): number {
  return usage.core_searchd_search_count ?? usage.searchd_search_count;
}

function coreSearchLatencyP95Ms(usage: UsageMetrics): number {
  return usage.core_search_latency_p95_ms ?? usage.search_latency_p95_ms;
}

function coreSearchFailureCount(usage: UsageMetrics): number {
  return usage.core_search_failure_count ?? usage.search_failure_count;
}

function localSearchCoverageLabel(usage: UsageMetrics): string {
  const requestCount = coreSearchRequestCount(usage);

  return requestCount > 0
    ? `${usageRatePercent(coreSearchdSearchCount(usage), requestCount)}%`
    : "暂无数据";
}

function searchBackendDetail(usage: UsageMetrics): string {
  const issues = [
    coreSearchFailureCount(usage) > 0 ? `失败 ${coreSearchFailureCount(usage)}` : "",
    (usage.core_sqlite_index_search_count ?? usage.sqlite_index_search_count) > 0
      ? `备用索引 ${usage.core_sqlite_index_search_count ?? usage.sqlite_index_search_count}`
      : "",
    (usage.core_fallback_search_count ?? usage.fallback_search_count) > 0
      ? `补充读取 ${usage.core_fallback_search_count ?? usage.fallback_search_count}`
      : "",
    (usage.core_search_backend_unknown_count ?? usage.search_backend_unknown_count) > 0
      ? `未知 ${usage.core_search_backend_unknown_count ?? usage.search_backend_unknown_count}`
      : ""
  ].filter(Boolean);

  return issues.length ? issues.join(" · ") : "搜索服务正常覆盖";
}

function worseCorePathTone(
  left: AdminCorePathTone,
  right: AdminCorePathTone
): AdminCorePathTone {
  if (left === "blocked" || right === "blocked") {
    return "blocked";
  }

  if (left === "attention" || right === "attention") {
    return "attention";
  }

  return "healthy";
}

function corePathStatusLabel(tone: AdminCorePathTone): string {
  if (tone === "blocked") {
    return "需要处理";
  }

  if (tone === "attention") {
    return "需要观察";
  }

  return "剪辑端可用";
}

function corePathTitle(tone: AdminCorePathTone): string {
  if (tone === "blocked") {
    return "搜索到剪切有风险，请先处理关键项";
  }

  if (tone === "attention") {
    return "搜索到剪切可用，部分指标需要观察";
  }

  return "搜索到剪切已满足团队主路径";
}

export function adminCorePathHealth(data: AdminDashboardData): AdminCorePathHealth {
  const usage = data.metrics.usage;
  const localCoveragePercent = usageRatePercent(
    coreSearchdSearchCount(usage),
    coreSearchRequestCount(usage)
  );
  const searchLatencyP95Ms = coreSearchLatencyP95Ms(usage);
  const hasSearchSamples = coreSearchRequestCount(usage) > 0;
  const hasLatencySamples = searchLatencyP95Ms > 0;
  const searchFailureCount = coreSearchFailureCount(usage);
  const severeSearchFailure = searchFailureCount > 0 && (
    !hasSearchSamples ||
    usageRatePercent(searchFailureCount, coreSearchRequestCount(usage)) >= 50
  );
  const hasSearchBackendEscapes =
    searchFailureCount > 0 ||
    (usage.core_sqlite_index_search_count ?? usage.sqlite_index_search_count) > 0 ||
    (usage.core_fallback_search_count ?? usage.fallback_search_count) > 0 ||
    (usage.core_search_backend_unknown_count ?? usage.search_backend_unknown_count) > 0;
  const searchTone: AdminCorePathTone =
    severeSearchFailure
      ? "blocked"
      : !hasSearchSamples || !hasLatencySamples
        ? "attention"
        : hasSearchBackendEscapes ||
          localCoveragePercent < LOCAL_SEARCH_HEALTHY_PERCENT ||
          searchLatencyP95Ms > SEARCH_LATENCY_HEALTHY_MS
          ? "attention"
          : "healthy";

  const transcriptTone: AdminCorePathTone =
    data.status.ready_video_count <= 0 ||
    data.metrics.transcript.segment_count <= 0 ||
    !data.indexes.current_version
      ? "blocked"
      : data.status.index_status !== "ready" || data.status.index_required_video_count > 0
        ? "attention"
        : "healthy";

  const cutSuccessPercent = usageRatePercent(
    usage.cut_success_count,
    usage.cut_submission_count
  );
  const cutTone: AdminCorePathTone = usage.cut_submission_count <= 0
    ? "attention"
    : cutSuccessPercent < 70 || usage.cut_failure_count > usage.cut_success_count
      ? "blocked"
      : cutSuccessPercent < 85 || usage.cut_failure_count > 0
        ? "attention"
        : "healthy";

  const remainingSeats = Math.max(0, TARGET_CUTTER_SEAT_COUNT - usage.active_user_count);
  const capacityTone: AdminCorePathTone = usage.active_user_count <= 0
    ? "attention"
    : "healthy";

  const rows: AdminCorePathHealthRow[] = [
    {
      label: "关键词定位",
      value: hasLatencySamples ? `p95 ${searchLatencyLabel(searchLatencyP95Ms)}` : "暂无样本",
      detail: `最近 ${coreSearchRequestCount(usage)} 次搜索 · 本地搜索 ${localSearchCoverageLabel(usage)} · ${searchBackendDetail(usage)}`,
      tone: searchTone
    },
    {
      label: "完整文案",
      value: `${data.metrics.transcript.segment_count.toLocaleString("zh-CN")} 段`,
      detail: `${data.status.ready_video_count} 个可用视频 · 当前索引 ${data.indexes.current_version || "暂无"} · 待发布 ${data.status.index_required_video_count}`,
      tone: transcriptTone
    },
    {
      label: "选段剪切",
      value: usage.cut_submission_count > 0 ? `${cutSuccessPercent}% 成功` : "暂无样本",
      detail: `${usage.add_to_cut_list_count} 次加入待剪 · ${usage.cut_success_count}/${usage.cut_submission_count} 个任务完成 · 本地复用 ${usage.reuse_local_clip_count}`,
      tone: cutTone
    },
    {
      label: "50 人容量",
      value: `${usage.active_user_count}/${TARGET_CUTTER_SEAT_COUNT}`,
      detail: usage.active_user_count >= TARGET_CUTTER_SEAT_COUNT
        ? `已达到团队基准，超出 ${usage.active_user_count - TARGET_CUTTER_SEAT_COUNT} 位`
        : `还可承载 ${remainingSeats} 位剪辑师`,
      tone: capacityTone
    }
  ];

  const tone = rows.reduce<AdminCorePathTone>(
    (current, row) => worseCorePathTone(current, row.tone),
    "healthy"
  );

  return {
    tone,
    status_label: corePathStatusLabel(tone),
    title: corePathTitle(tone),
    detail: `本地搜索 ${localSearchCoverageLabel(usage)} · p95 ${searchLatencyLabel(searchLatencyP95Ms)} · ${usage.active_user_count}/${TARGET_CUTTER_SEAT_COUNT} 剪辑师`,
    rows
  };
}

export function adminUsageFunnelRows(usage: UsageMetrics): Array<{
  label: string;
  value: string;
  detail: string;
  percent: number;
}> {
  const remainingSeats = Math.max(0, TARGET_CUTTER_SEAT_COUNT - usage.active_user_count);

  return [
    {
      label: "搜索命中率",
      value: usageRateLabel(usage.search_hit_count, usage.search_request_count),
      detail: `${usage.search_hit_count} / ${usage.search_request_count} 次搜索命中${usageSampleGapLabel(usage.search_hit_count, usage.search_request_count, "搜索")}`,
      percent: boundedUsageRatePercent(usage.search_hit_count, usage.search_request_count)
    },
    {
      label: "文案选区率",
      value: usageRateLabel(usage.transcript_selection_count, usage.search_hit_count),
      detail: `${usage.transcript_selection_count} 次从命中进入文案选区${usageSampleGapLabel(usage.transcript_selection_count, usage.search_hit_count, "命中")}`,
      percent: boundedUsageRatePercent(usage.transcript_selection_count, usage.search_hit_count)
    },
    {
      label: "加入待剪率",
      value: usageRateLabel(usage.add_to_cut_list_count, usage.transcript_selection_count),
      detail: `${usage.add_to_cut_list_count} 次选区进入待剪清单${usageSampleGapLabel(usage.add_to_cut_list_count, usage.transcript_selection_count, "选区")}`,
      percent: boundedUsageRatePercent(usage.add_to_cut_list_count, usage.transcript_selection_count)
    },
    {
      label: "剪切成功率",
      value: usageRateLabel(usage.cut_success_count, usage.cut_submission_count),
      detail: `${usage.cut_success_count} / ${usage.cut_submission_count} 个剪切任务完成${usageSampleGapLabel(usage.cut_success_count, usage.cut_submission_count, "任务")}`,
      percent: boundedUsageRatePercent(usage.cut_success_count, usage.cut_submission_count)
    },
    {
      label: "50 人容量",
      value: `${usage.active_user_count}/${TARGET_CUTTER_SEAT_COUNT}`,
      detail: usage.active_user_count >= TARGET_CUTTER_SEAT_COUNT
        ? `已达到团队基准，超出 ${usage.active_user_count - TARGET_CUTTER_SEAT_COUNT} 位`
        : `还可承载 ${remainingSeats} 位剪辑师`,
      percent: boundedUsageRatePercent(usage.active_user_count, TARGET_CUTTER_SEAT_COUNT)
    }
  ];
}

function statusToneText(tone: "healthy" | "attention" | "blocked"): string {
  if (tone === "blocked") {
    return "需处理";
  }

  if (tone === "attention") {
    return "需观察";
  }

  return "正常";
}

function recentJobDetail(
  job: AdminPreprocessJob,
  queuePosition: number,
  averageProcessMs: number,
  supervisorRunning = true
): string {
  const title = chineseDiagnosticText(job.title);

  if (job.status === "queued") {
    const estimatedDuration = averageProcessMs > 0
      ? formatAdminDuration(averageProcessMs)
      : "等待估算";

    return `${title} · 等待处理 · 排队第 ${queuePosition} 位 · 预计耗时 ${estimatedDuration}`;
  }

  if (job.status === "running") {
    return supervisorRunning
      ? `${title} · ${jobStageLabel(job.stage)} · 已用时 ${formatAdminDuration(job.elapsed_ms)}`
      : `${title} · 待恢复 · ${jobStageLabel(job.stage)} · 已停留 ${formatAdminDuration(job.elapsed_ms)}`;
  }

  if (job.status === "failed") {
    return `${title} · ${jobStageLabel(job.stage)}${job.error_message ? ` · ${chineseDiagnosticText(job.error_message)}` : ""}`;
  }

  return `${title} · ${jobStageLabel(job.stage)} · 已完成`;
}

export function DashboardPage({
  data,
  onRetryFailedVideos,
  onRunSmartScan,
  onApplySmartScanPrimaryAction,
  smartScanReport
}: {
  data: AdminDashboardData;
  onRetryFailedVideos?: () => void;
  onRunSmartScan?: () => void;
  onApplySmartScanPrimaryAction?: (action: AdminSmartScanAction) => void;
  smartScanReport?: AdminSmartScanReport;
}) {
  const report = smartScanReport ?? createAdminSmartScanReport(data);
  const dashboardWriteState = "m9b-api" as const;
  const averageProcessMs = data.metrics.production.average_video_process_ms;
  const runtimeLoad = data.metrics.runtime_load;
  const currentIndex = data.indexes.versions.find((version) => version.is_current);
  const usageFunnelRows = adminUsageFunnelRows(data.metrics.usage);
  const corePathHealth = adminCorePathHealth(data);
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";
  const readyRatio = data.status.video_count > 0
    ? Math.round((data.status.ready_video_count / data.status.video_count) * 100)
    : 0;
  const queuedPositionByJobId = new Map(
    data.jobs.jobs
      .filter((job) => job.status === "queued")
      .map((job, index) => [job.job_id, index + 1])
  );
  const productionBars = [
    { label: "可用", value: data.status.ready_video_count, total: data.status.video_count },
    {
      label: supervisorRunning || data.status.processing_video_count === 0 ? "处理中" : "待恢复",
      value: data.status.processing_video_count,
      total: data.status.video_count
    },
    { label: "队列中", value: data.status.queued_video_count, total: data.status.video_count },
    { label: "待处理", value: data.status.unprocessed_video_count, total: data.status.video_count },
    { label: "失败", value: data.status.failed_video_count, total: data.status.video_count }
  ];
  const preprocessHealthDetail = supervisorRunning
    ? `${data.jobs.active_count} 正在处理 / ${data.jobs.queued_count} 队列中`
    : data.jobs.active_count > 0
      ? `${data.jobs.active_count} 个待恢复 / ${data.jobs.queued_count} 队列中`
      : `${data.jobs.queued_count} 队列中`;
  const preprocessHealthTone: AdminCorePathTone = data.jobs.failed_count > 0
    ? "blocked"
    : data.jobs.active_count > 0 && !supervisorRunning
      ? "blocked"
      : data.jobs.active_count > 0
        ? "healthy"
        : "attention";
  const healthRows = [
    {
      label: "预处理流水线",
      value: data.jobs.supervisor.state_label,
      detail: preprocessHealthDetail,
      tone: preprocessHealthTone
    },
    {
      label: "索引发布",
      value: data.indexes.current_version || "暂无索引",
      detail: data.status.index_required_video_count > 0
        ? `${data.status.index_required_video_count} 个视频等待自动增量发布`
        : "当前可搜索索引已同步",
      tone: data.status.index_required_video_count > 0 ? "attention" : "healthy"
    },
    {
      label: "系统检查",
      value: data.doctor.summary.fail > 0 ? "存在失败项" : data.doctor.summary.warn > 0 ? "存在警告项" : "通过",
      detail: `通过 ${data.doctor.summary.pass} / 警告 ${data.doctor.summary.warn} / 失败 ${data.doctor.summary.fail}`,
      tone: data.doctor.summary.fail > 0 ? "blocked" : data.doctor.summary.warn > 0 ? "attention" : "healthy"
    },
    {
      label: "系统负荷",
      value: statusToneText(runtimeLoad.overall_status),
      detail: data.jobs.observability.load_advice,
      tone: runtimeLoad.overall_status
    }
  ] as const;
  const warningRows = [
    ...report.suggestions.map((item) => ({
      label: item.label,
      detail: item.detail,
      tone: report.severity
    })),
    ...data.jobs.jobs
      .filter((job) => job.status === "failed")
      .slice(0, 2)
      .map((job) => ({
        label: `${job.source_video_id} 处理失败`,
        detail: recentJobDetail(job, queuedPositionByJobId.get(job.job_id) ?? 1, averageProcessMs, supervisorRunning),
        tone: "blocked" as const
      }))
  ].slice(0, 5);

  return (
    <>
      <div className="admin-main-column">
        <section className="admin-console-hero" aria-label="仪表盘总览">
          <AdminPageHeader
            title="公共素材库仪表盘"
            eyebrow="Admin / Dashboard"
            description="让管理员先判断“剪辑团队现在能不能用”，再看到一个最重要的下一步。"
            action={
              <section className="admin-action-row" aria-label="仪表盘操作">
                <AdminControlButton
                  label="局部刷新"
                  state={dashboardWriteState}
                  reason="扫描素材来源、检查系统状态并生成下一步建议。"
                  onClick={onRunSmartScan}
                />
                {report.primary_action !== "none" ? (
                  <AdminControlButton
                    label={report.primary_label}
                    state={dashboardWriteState}
                    reason="执行建议的下一步动作。"
                    variant="primary"
                    onClick={
                      onApplySmartScanPrimaryAction
                        ? () => onApplySmartScanPrimaryAction(report.primary_action)
                        : undefined
                    }
                  />
                ) : null}
              </section>
            }
          />
        </section>
        <section className={`admin-dashboard-alert is-${report.severity}`} aria-label="当前最重要状态">
          <span className={`admin-status-badge is-${report.severity === "blocked" ? "failed" : report.severity === "attention" ? "warning" : "ready"}`}>
            {report.severity === "blocked" ? "需要处理" : report.severity === "attention" ? "需要处理" : "可服务"}
          </span>
          <div>
            <strong>{report.title}</strong>
            <p>{report.detail}</p>
          </div>
        </section>
        <section className="admin-kpi-grid" aria-label="关键生产指标">
          {[
            { label: "可搜索总时长", value: hoursLabel(data.metrics.material.ready_duration_ms), detail: `总时长 ${hoursLabel(data.metrics.material.total_duration_ms)}` },
            { label: "可用视频", value: data.status.ready_video_count, detail: `占全部 ${readyRatio}%` },
            { label: "句子片段", value: data.metrics.transcript.segment_count.toLocaleString("zh-CN"), detail: `${data.metrics.transcript.transcript_video_count} 个视频有文案` },
            { label: "当前索引", value: data.indexes.current_version, detail: currentIndex ? `协议 ${currentIndex.schema_version}` : "暂无版本详情" },
            { label: "失败任务", value: data.jobs.failed_count, detail: data.jobs.failed_count > 0 ? "可重试处理" : "当前无阻塞" },
            {
              label: "活跃剪辑师",
              value: `${data.metrics.usage.active_user_count}/${TARGET_CUTTER_SEAT_COUNT}`,
              detail: `最近 ${coreSearchRequestCount(data.metrics.usage)} 次搜索 · p95 ${searchLatencyLabel(coreSearchLatencyP95Ms(data.metrics.usage))} · 本地搜索 ${localSearchCoverageLabel(data.metrics.usage)}`
            }
          ].map((item) => (
            <article className="admin-kpi-tile" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </section>
        <section className="admin-dashboard-split" aria-label="下一步与核心链路">
          <section className={`admin-smart-scan-card is-${report.severity}`} aria-label="下一步建议">
            <header>
              <h2>下一步建议</h2>
              <span className={`admin-status-badge is-${report.severity === "blocked" ? "failed" : report.severity === "attention" ? "warning" : "ready"}`}>
                {report.severity === "blocked" ? "优先处理" : report.severity === "attention" ? "待处理" : "无需处理"}
              </span>
            </header>
            <div className="admin-smart-scan-copy">
              <h3>{report.title}</h3>
              <p>{report.detail}</p>
              {report.primary_action !== "none" ? (
                <div className="admin-action-row">
                  <AdminControlButton
                    label={report.primary_label}
                    state={dashboardWriteState}
                    reason="执行建议的下一步动作。"
                    variant="primary"
                    onClick={
                      onApplySmartScanPrimaryAction
                        ? () => onApplySmartScanPrimaryAction(report.primary_action)
                        : undefined
                    }
                  />
                </div>
              ) : null}
            </div>
          </section>
          <section className={`admin-core-path-card is-${corePathHealth.tone}`} aria-label="核心链路健康">
            <header>
              <div>
                <p>核心链路健康</p>
                <h2>{corePathHealth.title}</h2>
                <span>{corePathHealth.detail}</span>
              </div>
              <strong>{corePathHealth.status_label}</strong>
            </header>
            <div className="admin-core-path-list">
              {corePathHealth.rows.map((row) => (
                <div className={`admin-core-path-row is-${row.tone}`} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <p>{row.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
        <section className="admin-ops-grid" aria-label="生产健康">
          <article className="admin-console-panel">
            <header className="admin-section-header">
              <h2>生产吞吐</h2>
              <p>当前公共素材库从原视频到可搜索索引的流转状态。</p>
            </header>
            <div className="admin-throughput-bars">
              {productionBars.map((item) => {
                const width = item.total > 0 ? Math.max(3, Math.round((item.value / item.total) * 100)) : 0;

                return (
                  <div className="admin-throughput-row" key={item.label}>
                    <span>{item.label}</span>
                    <div className="admin-throughput-track">
                      <i style={{ width: `${width}%` }} />
                    </div>
                    <strong>{item.value}</strong>
                  </div>
                );
              })}
            </div>
          </article>
          <article className="admin-console-panel">
            <header className="admin-section-header">
              <h2>生产健康</h2>
              <p>影响剪辑端搜索可靠性的关键状态。</p>
            </header>
            <div className="admin-health-list">
              {healthRows.map((row) => (
                <div className={`admin-health-row is-${row.tone}`} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <p>{row.detail}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
        <section className="admin-dashboard-grid" aria-label="仪表盘关键指标">
          <DashboardPanel
            title="素材规模"
            rows={[
              { label: "原视频总时长", value: formatAdminDuration(data.metrics.material.total_duration_ms) },
              { label: "可用总时长", value: formatAdminDuration(data.metrics.material.ready_duration_ms) },
              { label: "未处理时长", value: formatAdminDuration(data.metrics.material.unprocessed_duration_ms) },
              { label: "原视频容量", value: formatAdminFileSize(data.metrics.material.total_size_bytes) }
            ]}
          />
          <DashboardPanel
            title="文案与索引"
            rows={[
              { label: "文案视频", value: data.metrics.transcript.transcript_video_count },
              { label: "文案总字数", value: data.metrics.transcript.character_count },
              { label: "文案段落", value: data.metrics.transcript.segment_count },
              { label: "当前索引", value: data.metrics.transcript.current_index_version }
            ]}
          />
          <DashboardPanel
            title="预处理产能"
            rows={[
              { label: "今日完成", value: data.metrics.production.completed_today_count },
              { label: "今日失败", value: data.metrics.production.failed_today_count },
              { label: "平均耗时", value: formatAdminDuration(data.metrics.production.average_video_process_ms) },
              { label: "预计完成", value: compactDateTimeLabel(data.metrics.production.estimated_queue_done_at) }
            ]}
          />
          <DashboardPanel
            title="剪辑端使用"
            rows={[
              { label: "搜索请求", value: data.metrics.usage.search_request_count },
              { label: "命中搜索", value: data.metrics.usage.search_hit_count },
              { label: "搜索 p95", value: searchLatencyLabel(coreSearchLatencyP95Ms(data.metrics.usage)) },
              { label: "本地搜索覆盖", value: localSearchCoverageLabel(data.metrics.usage) },
              { label: "补充读取", value: data.metrics.usage.core_fallback_search_count ?? data.metrics.usage.fallback_search_count },
              { label: "搜索失败", value: coreSearchFailureCount(data.metrics.usage) },
              { label: "加入待剪", value: data.metrics.usage.add_to_cut_list_count },
              { label: "活跃剪辑师", value: data.metrics.usage.active_user_count }
            ]}
          />
          <article className="admin-dashboard-panel admin-usage-funnel-panel" aria-label="剪辑端转化">
            <h2>剪辑端转化</h2>
            <div className="admin-usage-funnel">
              {usageFunnelRows.map((row) => (
                <div className="admin-usage-funnel-row" key={row.label}>
                  <div>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="admin-usage-funnel-track" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }} />
                  </div>
                  <p>{row.detail}</p>
                </div>
              ))}
            </div>
          </article>
          <DashboardPanel
            title="风险摘要"
            rows={[
              { label: "处理失败", value: data.metrics.risk.failed_video_count },
              { label: "待发布索引", value: data.metrics.risk.index_required_video_count },
              { label: "空搜索", value: data.metrics.usage.search_empty_count },
              { label: "搜索失败", value: coreSearchFailureCount(data.metrics.usage) },
              { label: "剪切失败", value: data.metrics.usage.cut_failure_count }
            ]}
          />
          <DashboardPanel
            title="系统负荷"
            rows={[
              { label: "当前状态", value: statusToneText(runtimeLoad.overall_status) },
              { label: "处理建议", value: data.jobs.observability.load_advice },
              { label: "预计完成", value: compactDateTimeLabel(data.jobs.observability.estimated_all_done_at) },
              { label: "服务状态", value: data.jobs.supervisor.state_label }
            ]}
          />
        </section>
        <DiskUsage data={data} />
        <section className="admin-list-panel admin-recent-jobs-panel">
          <h2>最近任务</h2>
          {data.jobs.jobs.slice(0, 4).map((job) => (
            <StatusRow
              tone={adminStatusTone(job.status)}
              label={job.source_video_id}
              detail={recentJobDetail(job, queuedPositionByJobId.get(job.job_id) ?? 1, averageProcessMs, supervisorRunning)}
              value={
                job.status === "failed" && job.retryable
                  ? "失败可重试"
                  : job.status === "queued"
                    ? "等待处理"
                  : job.status === "running" && !supervisorRunning
                    ? "待恢复"
                  : `${job.progress}%`
              }
              key={job.job_id}
            />
          ))}
        </section>
        <section className="admin-list-panel admin-warning-panel" aria-label="最近预警">
          <h2>最近预警</h2>
          {warningRows.length ? warningRows.map((row) => (
            <StatusRow
              tone={row.tone === "blocked" ? "failed" : row.tone === "attention" ? "warning" : "ready"}
              label={row.label}
              detail={row.detail}
              value={row.tone === "blocked" ? "需处理" : row.tone === "attention" ? "观察" : "正常"}
              key={row.label}
            />
          )) : (
            <StatusRow tone="ready" label="暂无预警" detail="系统没有发现需要立即处理的风险。" value="正常" />
          )}
        </section>
      </div>
      <InspectorPanel title="公共库摘要">
        <div className="admin-dashboard-inspector-head">
          <span className={`admin-status-badge is-${data.doctor.summary.fail > 0 ? "failed" : data.doctor.summary.warn > 0 ? "warning" : "ready"}`}>
            {data.doctor.summary.fail > 0 ? "需处理" : data.doctor.summary.warn > 0 ? "可服务" : "可服务"}
          </span>
        </div>
        <dl className="admin-dashboard-kv">
          <div>
            <dt>根目录</dt>
            <dd>{data.status.root_path}</dd>
          </div>
          <div>
            <dt>已发布版本</dt>
            <dd>{data.indexes.current_version || "暂无索引"}</dd>
          </div>
          <div>
            <dt>最近扫描</dt>
            <dd>{data.status.updated_at}</dd>
          </div>
          <div>
            <dt>刷新方式</dt>
            <dd>卡片局部刷新</dd>
          </div>
        </dl>
        <div className="admin-dashboard-note">
          <strong>空状态</strong>
          <p>首次未初始化时只显示设置入口和素材库初始化说明。</p>
        </div>
        <div className="admin-dashboard-note is-danger">
          <strong>错误状态</strong>
          <p>服务不可连接时保留 shell，提供重试与系统检查入口。</p>
        </div>
      </InspectorPanel>
    </>
  );
}
