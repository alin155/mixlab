import {
  Badge,
  Card,
  InspectorPanel,
  Table,
  type BadgeTone,
  type TableColumn
} from "@mixlab/ui-foundation";
import type {
  AdminGateStatus,
  AdminOperationsOverview,
  AdminReadModelReconcilerStatus,
  AdminReleaseGate
} from "./api.ts";
import {
  formatAdminFileSize
} from "../../app/view-model.ts";
import {
  AdminInfoGroups,
  AdminPageHeader,
  EmptyState,
  MetricBand
} from "../shared.tsx";

function gateStatusLabel(status: AdminGateStatus): string {
  const labels: Record<AdminGateStatus, string> = {
    pass: "通过",
    attention: "关注",
    blocked: "阻塞"
  };

  return labels[status];
}

function gateStatusTone(status: AdminGateStatus): BadgeTone {
  const tones: Record<AdminGateStatus, BadgeTone> = {
    pass: "success",
    attention: "warning",
    blocked: "danger"
  };

  return tones[status];
}

function gateLabel(code: string): string {
  const labels: Record<string, string> = {
    "runtime-path-profile": "路径环境",
    "build-version-health": "版本信息",
    "admin-worker-env-proof": "Worker 证明",
    "cutter-compatibility-proof": "Cutter 证明",
    "preprocess-disk": "磁盘空间",
    "processing-recovery": "任务恢复",
    "usage-events-tolerance": "使用事件",
    "current-index": "当前索引",
    "scan-protection": "扫描保护"
  };

  return labels[code] ?? code;
}

function usageRepairStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    clean: "无需修复",
    "dry-run-required": "需要 dry-run"
  };

  return labels[status] ?? status;
}

function usageRepairStatusTone(status: string): BadgeTone {
  return status === "clean" ? "success" : "danger";
}

function usageRepairScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    "usage-events-only": "仅使用事件"
  };

  return labels[scope] ?? scope;
}

function diskProtectionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    healthy: "安全",
    attention: "需关注",
    blocked: "已阻断"
  };

  return labels[status] ?? status;
}

function diskProtectionStatusTone(status: string): BadgeTone {
  if (status === "healthy") {
    return "success";
  }

  return status === "attention" ? "warning" : "danger";
}

function diskProtectionScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    "preprocess-and-docker-upload": "预处理与 Docker 上传"
  };

  return labels[scope] ?? scope;
}

function versionParityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: "元数据完整",
    incomplete: "需补齐"
  };

  return labels[status] ?? status;
}

function versionParityStatusTone(status: string): BadgeTone {
  return status === "ready" ? "success" : "warning";
}

function versionParityScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    "version-health-only": "仅版本健康"
  };

  return labels[scope] ?? scope;
}

function workerEnvProofStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    "external-proof-required": "需外部证明"
  };

  return labels[status] ?? status;
}

function workerEnvProofStatusTone(status: string): BadgeTone {
  return status === "external-proof-required" ? "warning" : "info";
}

function workerEnvProofScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    "admin-worker-env-only": "仅 worker 环境"
  };

  return labels[scope] ?? scope;
}

function cutterCompatibilityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    "external-proof-required": "需外部证明"
  };

  return labels[status] ?? status;
}

function cutterCompatibilityStatusTone(status: string): BadgeTone {
  return status === "external-proof-required" ? "warning" : "info";
}

function cutterCompatibilityScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    "cutter-compatibility-only": "仅 Cutter 兼容性"
  };

  return labels[scope] ?? scope;
}

function processingRecoveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    clear: "无需恢复",
    "preflight-required": "需要预检"
  };

  return labels[status] ?? status;
}

function processingRecoveryStatusTone(status: string): BadgeTone {
  return status === "clear" ? "success" : "danger";
}

function processingRecoveryScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    "processing-to-queued-only": "仅恢复到队列"
  };

  return labels[scope] ?? scope;
}

function compactIdList(ids: string[]): string {
  if (ids.length === 0) {
    return "无";
  }

  const visible = ids.slice(0, 3).join(", ");
  return ids.length > 3 ? `${visible}...` : visible;
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function readModelFreshnessLabel(freshness: string): string {
  const labels: Record<string, string> = {
    fresh: "新鲜",
    building: "生成中",
    stale: "过期",
    missing: "缺失",
    unreadable: "不可读"
  };

  return labels[freshness] ?? freshness;
}

function readModelTone(freshness: string): BadgeTone {
  if (freshness === "fresh") {
    return "success";
  }

  if (freshness === "building") {
    return "info";
  }

  return freshness === "missing" || freshness === "unreadable" ? "danger" : "warning";
}

function reconciliationActionLabel(action: string): string {
  const labels: Record<string, string> = {
    none: "无需对账",
    build: "后台构建",
    rebuild: "后台重建",
    "manual-review": "人工复核"
  };

  return labels[action] ?? action;
}

function reconciliationActionTone(action: string): BadgeTone {
  if (action === "none") {
    return "success";
  }

  return action === "manual-review" ? "danger" : "warning";
}

function reconciliationScanModeLabel(scanMode: string): string {
  const labels: Record<string, string> = {
    "no-scan": "不扫描",
    "full-reconcile": "后台全量对账"
  };

  return labels[scanMode] ?? scanMode;
}

function reconcileStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: "未运行",
    running: "运行中",
    succeeded: "已完成",
    skipped: "已跳过",
    cancelled: "已取消",
    failed: "失败"
  };

  return labels[status] ?? status;
}

function reconcileStatusTone(status: string): BadgeTone {
  if (status === "succeeded" || status === "skipped" || status === "idle") {
    return "success";
  }

  if (status === "running") {
    return "info";
  }

  return status === "failed" ? "danger" : "warning";
}

function reconcilePhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    idle: "空闲",
    starting: "启动中",
    scanning: "读取快照",
    writing: "写入 admin.sqlite",
    completed: "完成",
    cancelled: "取消",
    failed: "失败"
  };

  return labels[phase] ?? phase;
}

function reconcileStepLabel(step: string): string {
  const labels: Record<string, string> = {
    idle: "空闲",
    starting: "启动中",
    "library-manifest": "读取 library.json",
    "source-video-manifests": "读取 source-video manifest",
    "preprocess-job-snapshots": "读取 preprocess job 快照",
    writing: "写入 admin.sqlite",
    completed: "完成",
    cancelled: "取消",
    failed: "失败"
  };

  return labels[step] ?? step;
}

function percentLabel(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function countProgressLabel(completed: number, total: number): string {
  return total > 0
    ? `${completed.toLocaleString("zh-CN")} / ${total.toLocaleString("zh-CN")}`
    : "未开始";
}

function diskDetail(overview: AdminOperationsOverview): string {
  const disk = overview.release.safety.disk;
  return `${formatAdminFileSize(disk.available_bytes)} 可用 / 已使用 ${disk.usage_percent}%`;
}

const gateColumns: TableColumn<AdminReleaseGate>[] = [
  {
    id: "gate",
    header: "门禁",
    render: (gate) => gateLabel(gate.code),
    width: "9rem"
  },
  {
    id: "status",
    header: "状态",
    render: (gate) => <Badge tone={gateStatusTone(gate.status)}>{gateStatusLabel(gate.status)}</Badge>,
    width: "7rem"
  },
  {
    id: "message",
    header: "说明",
    render: (gate) => gate.message
  }
];

export function ProtectionCenterPage({
  overview,
  readModelReconcileStatus,
  readModelReconcileError,
  readModelReconcileCommandLoading = false,
  onStartReadModelReconcile,
  onCancelReadModelReconcile,
  loading,
  error
}: {
  overview: AdminOperationsOverview | null;
  readModelReconcileStatus: AdminReadModelReconcilerStatus | null;
  readModelReconcileError: string;
  readModelReconcileCommandLoading?: boolean;
  onStartReadModelReconcile?: () => void;
  onCancelReadModelReconcile?: () => void;
  loading: boolean;
  error: string;
}) {
  if (error) {
    return (
      <>
        <div className="admin-main-column">
          <EmptyState title="保护中心加载失败" detail={error} />
        </div>
        <InspectorPanel title="保护中心">
          <p>请稍后重新进入页面，或先确认管理端 API 是否可用。</p>
        </InspectorPanel>
      </>
    );
  }

  if (!overview) {
    return (
      <>
        <div className="admin-main-column">
          <EmptyState
            title={loading ? "正在读取保护中心" : "暂无保护中心数据"}
            detail={loading ? "正在读取发布门禁、读模型和运行保护状态。" : "请刷新管理端数据后重试。"}
          />
        </div>
        <InspectorPanel title="保护中心">
          <p>{loading ? "加载中" : "未读取到保护中心数据"}</p>
        </InspectorPanel>
      </>
    );
  }

  const readModel = overview.read_model.source_video_status;
  const readModelStore = overview.read_model.admin_read_model;
  const reconciliation = readModelStore.reconciliation;
  const reconcileProgress = readModelReconcileStatus?.progress ?? null;
  const reconcileRunning = readModelReconcileStatus?.status === "running";
  const reconcileCancelRequested = readModelReconcileStatus?.cancel_requested === true;
  const blockedGates = overview.release.gates.filter((gate) => gate.status === "blocked");
  const attentionGates = overview.release.gates.filter((gate) => gate.status === "attention");
  const usageEventStore = overview.release.usage_event_store;
  const usageEventsRepair = overview.release.usage_events_repair;
  const processingRecovery = overview.release.processing_recovery;
  const diskProtection = overview.release.disk_space_protection;
  const versionParity = overview.release.version_health_parity;
  const workerEnvProof = overview.release.admin_worker_env_proof;
  const cutterCompatibilityProof = overview.release.cutter_compatibility_proof;

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          eyebrow="运行保护"
          title="保护中心"
          description="集中查看发布门禁、预处理保护、读模型新鲜度和数据加载策略。"
        />
        <MetricBand
          items={[
            {
              label: "阻塞门禁",
              value: overview.summary.blocked_gate_count,
              caption: overview.summary.blocked_gate_count > 0 ? "发布前必须处理" : "当前无阻塞"
            },
            {
              label: "关注门禁",
              value: overview.summary.attention_gate_count,
              caption: "发布前需要确认"
            },
            {
              label: "处理中",
              value: overview.summary.processing_video_count,
              caption: "应为可恢复状态"
            },
            {
              label: "队列中",
              value: overview.summary.queued_video_count,
              caption: "等待预处理"
            }
          ]}
        />
        <Card
          title="发布门禁"
          subtitle="Docker 上传和继续预处理前必须通过的检查"
          className="admin-protection-card"
        >
          <Table
            columns={gateColumns}
            rows={overview.release.gates}
            getRowKey={(gate) => gate.code}
            density="compact"
            stickyHeader
          />
        </Card>
        <Card
          title="读模型和加载策略"
          subtitle="管理端页面是否还会触发隐藏全库扫描"
          className="admin-protection-card"
        >
          <dl className="admin-protection-grid">
            <div>
              <dt>读模型</dt>
              <dd>{readModel.name}</dd>
            </div>
            <div>
              <dt>新鲜度</dt>
              <dd><Badge tone={readModelTone(readModel.freshness)}>{readModelFreshnessLabel(readModel.freshness)}</Badge></dd>
            </div>
            <div>
              <dt>状态计数</dt>
              <dd>{readModel.current_video_count} 条</dd>
            </div>
            <div>
              <dt>查询库</dt>
              <dd>{readModelStore.storage === "sqlite" ? "admin.sqlite" : readModelStore.storage}</dd>
            </div>
            <div>
              <dt>查询库状态</dt>
              <dd><Badge tone={readModelTone(readModelStore.freshness)}>{readModelFreshnessLabel(readModelStore.freshness)}</Badge></dd>
            </div>
            <div>
              <dt>对账计划</dt>
              <dd><Badge tone={reconciliationActionTone(reconciliation.action)}>{reconciliationActionLabel(reconciliation.action)}</Badge></dd>
            </div>
            <div>
              <dt>扫描模式</dt>
              <dd>{reconciliationScanModeLabel(reconciliation.scan_mode)}</dd>
            </div>
            <div>
              <dt>隐藏全库扫描</dt>
              <dd>{overview.data_loading.hidden_full_scan_allowed ? "允许" : "禁止"}</dd>
            </div>
          </dl>
          <div className="admin-protection-reconcile">
            <div className="admin-section-subhead">
              <h3>后台对账</h3>
              {readModelReconcileStatus ? (
                <Badge tone={reconcileStatusTone(readModelReconcileStatus.status)}>
                  {reconcileStatusLabel(readModelReconcileStatus.status)}
                </Badge>
              ) : (
                <Badge tone={readModelReconcileError ? "warning" : "info"}>
                  {readModelReconcileError ? "状态不可用" : "未读取"}
                </Badge>
              )}
            </div>
            {readModelReconcileStatus && reconcileProgress ? (
              <dl className="admin-protection-grid admin-protection-grid-compact">
                <div>
                  <dt>阶段</dt>
                  <dd>{reconcilePhaseLabel(readModelReconcileStatus.phase)}</dd>
                </div>
                <div>
                  <dt>当前步骤</dt>
                  <dd>{reconcileStepLabel(reconcileProgress.current_step)}</dd>
                </div>
                <div>
                  <dt>总进度</dt>
                  <dd>{percentLabel(reconcileProgress.percent)}</dd>
                </div>
                <div>
                  <dt>步骤进度</dt>
                  <dd>{percentLabel(reconcileProgress.step_percent)}</dd>
                </div>
                <div>
                  <dt>preprocess job 快照</dt>
                  <dd>{countProgressLabel(
                    reconcileProgress.preprocess_job_snapshot_count,
                    reconcileProgress.total_preprocess_job_snapshot_count
                  )}</dd>
                </div>
                <div>
                  <dt>取消请求</dt>
                  <dd>{readModelReconcileStatus.cancel_requested ? "已请求" : "无"}</dd>
                </div>
              </dl>
            ) : (
              <p className="admin-muted">
                {readModelReconcileError || "尚未读取后台对账状态。"}
              </p>
            )}
            {readModelReconcileStatus?.message ? (
              <p className="admin-muted">{readModelReconcileStatus.message}</p>
            ) : null}
            <div className="admin-action-row" aria-label="读模型维护命令">
              <button
                className="admin-primary-button"
                type="button"
                onClick={onStartReadModelReconcile}
                disabled={!onStartReadModelReconcile || readModelReconcileCommandLoading || reconcileRunning}
              >
                启动后台对账
              </button>
              <button
                className="admin-secondary-button"
                type="button"
                onClick={onCancelReadModelReconcile}
                disabled={
                  !onCancelReadModelReconcile ||
                  readModelReconcileCommandLoading ||
                  !reconcileRunning ||
                  reconcileCancelRequested
                }
              >
                请求停止对账
              </button>
            </div>
            <p className="admin-muted">
              full-reconcile 是显式维护命令；取消只会在安全检查点停止后台对账。
            </p>
          </div>
        </Card>
      </div>
      <InspectorPanel
        title="运行结论"
        subtitle={overview.generated_at}
      >
        <div className="admin-protection-summary">
          <Badge tone={gateStatusTone(overview.summary.overall_status)}>
            {overview.summary.release_allowed ? "允许发布" : gateStatusLabel(overview.summary.overall_status)}
          </Badge>
          <p>
            {overview.summary.release_allowed
              ? "当前门禁允许进入 Docker 发布验收。"
              : "当前仍不适合上传 Docker 或启动新的预处理。"}
          </p>
        </div>
        <dl className="admin-dashboard-kv">
          <div>
            <dt>磁盘</dt>
            <dd>{diskDetail(overview)}</dd>
          </div>
          <div>
            <dt>当前索引</dt>
            <dd>{overview.summary.current_index_version || "待发布"}</dd>
          </div>
          <div>
            <dt>ready</dt>
            <dd>{overview.summary.ready_video_count}</dd>
          </div>
          <div>
            <dt>已处理待上线</dt>
            <dd>{overview.summary.index_required_video_count}</dd>
          </div>
        </dl>
        <AdminInfoGroups
          groups={[
            {
              title: "版本健康",
              rows: [
                { label: "状态", value: (
                  <Badge tone={versionParityStatusTone(versionParity.status)}>
                    {versionParityStatusLabel(versionParity.status)}
                  </Badge>
                ) },
                { label: "版本", value: versionParity.build_version || "未设置" },
                { label: "镜像", value: versionParity.image_tag || "未设置" },
                { label: "服务数", value: versionParity.expected_services.length },
                { label: "证明范围", value: versionParityScopeLabel(versionParity.safe_scope) },
                { label: "启动 worker", value: versionParity.starts_workers ? "会" : "不会" }
              ]
            },
            {
              title: "Worker 证明",
              rows: [
                { label: "状态", value: (
                  <Badge tone={workerEnvProofStatusTone(workerEnvProof.status)}>
                    {workerEnvProofStatusLabel(workerEnvProof.status)}
                  </Badge>
                ) },
                { label: "服务", value: workerEnvProof.expected_service },
                { label: "Flag", value: `mvp=${workerEnvProof.required_env_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE}, preprocess=${workerEnvProof.required_env_flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER}, publish=${workerEnvProof.required_env_flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER}` },
                { label: "根目录", value: workerEnvProof.required_library_roots.MIXLAB_ADMIN_LIBRARY_ROOT },
                { label: "证明范围", value: workerEnvProofScopeLabel(workerEnvProof.safe_scope) },
                { label: "启动 worker", value: workerEnvProof.starts_workers ? "会" : "不会" },
                { label: "记录密钥", value: workerEnvProof.records_secrets ? "会" : "不会" }
              ]
            },
            {
              title: "Cutter 证明",
              rows: [
                { label: "状态", value: (
                  <Badge tone={cutterCompatibilityStatusTone(cutterCompatibilityProof.status)}>
                    {cutterCompatibilityStatusLabel(cutterCompatibilityProof.status)}
                  </Badge>
                ) },
                { label: "认证模式", value: cutterCompatibilityProof.expected_auth_mode },
                { label: "ready 下限", value: cutterCompatibilityProof.expected_ready_count },
                { label: "证明范围", value: cutterCompatibilityScopeLabel(cutterCompatibilityProof.safe_scope) },
                { label: "需 staged candidate", value: cutterCompatibilityProof.requires_staged_candidate ? "需要" : "不需要" },
                { label: "联系 Windows Runner", value: cutterCompatibilityProof.contacts_windows_runner ? "会" : "不会" },
                { label: "改变 Cutter 协议", value: cutterCompatibilityProof.mutates_cutter_protocol ? "会" : "不会" }
              ]
            },
            {
              title: "磁盘保护",
              rows: [
                { label: "状态", value: (
                  <Badge tone={diskProtectionStatusTone(diskProtection.status)}>
                    {diskProtectionStatusLabel(diskProtection.status)}
                  </Badge>
                ) },
                { label: "已使用", value: `${diskProtection.usage_percent}%` },
                { label: "可用空间", value: formatAdminFileSize(diskProtection.available_bytes) },
                { label: "阻断阈值", value: `${diskProtection.block_usage_percent}%` },
                { label: "阻断范围", value: diskProtectionScopeLabel(diskProtection.write_block_scope) },
                { label: "启动 worker", value: diskProtection.starts_workers ? "会" : "不会" }
              ]
            },
            {
              title: "任务恢复",
              rows: [
                { label: "状态", value: (
                  <Badge tone={processingRecoveryStatusTone(processingRecovery.status)}>
                    {processingRecoveryStatusLabel(processingRecovery.status)}
                  </Badge>
                ) },
                { label: "处理中", value: processingRecovery.processing_count },
                { label: "样例 ID", value: compactIdList(processingRecovery.source_video_ids) },
                { label: "恢复范围", value: processingRecoveryScopeLabel(processingRecovery.safe_scope) },
                { label: "服务状态", value: processingRecovery.supervisor_must_be_idle ? "需空闲" : "未限制" }
              ]
            },
            {
              title: "使用事件",
              rows: [
                { label: "总行数", value: usageEventStore.line_count },
                { label: "有效行", value: usageEventStore.valid_line_count },
                { label: "坏行", value: usageEventStore.malformed_line_count },
                {
                  label: "修复状态",
                  value: (
                    <Badge tone={usageRepairStatusTone(usageEventsRepair.status)}>
                      {usageRepairStatusLabel(usageEventsRepair.status)}
                    </Badge>
                  )
                },
                { label: "修复范围", value: usageRepairScopeLabel(usageEventsRepair.safe_scope) },
                { label: "投影", value: basename(usageEventsRepair.projection_path) }
              ]
            },
            {
              title: "页面契约",
              rows: [
                { label: "主工作区", value: "发布门禁" },
                { label: "辅助区", value: "读模型状态" },
                { label: "数据来源", value: "data-loading-contract / read-model-reconcile" },
                { label: "扫描模式", value: "不扫描；全量对账只作为显式维护命令" },
                { label: "加载边界", value: "路由加载，不阻塞 Admin Shell" },
                { label: "命令边界", value: "后台对账需显式启动或停止" },
                { label: "错误边界", value: "本页面局部处理" }
              ]
            }
          ]}
        />
        <div className="admin-protection-actions">
          <strong>下一步</strong>
          {overview.next_actions.length > 0 ? (
            <ul>
              {overview.next_actions.slice(0, 4).map((action) => (
                <li key={action.key}>
                  <span>{action.label}</span>
                  <small>{action.detail}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>没有必须立即处理的保护项。</p>
          )}
        </div>
        {blockedGates.length > 0 || attentionGates.length > 0 ? (
          <div className="admin-protection-actions">
            <strong>门禁分布</strong>
            <p>{blockedGates.length} 个阻塞，{attentionGates.length} 个关注。</p>
          </div>
        ) : null}
      </InspectorPanel>
    </>
  );
}
