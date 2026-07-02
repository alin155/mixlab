import {
  Badge,
  Card,
  InspectorPanel,
  Table,
  type BadgeTone,
  type TableColumn
} from "@mixlab/ui-foundation";
import type {
  AdminCommandActor,
  AdminCommandSnapshotRestoreResult,
  AdminCommandRestorePlan,
  AdminOperationLogEvent,
  AdminOperationLogResponse
} from "../../api.ts";
import {
  AdminControlButton,
  AdminInfoGroups,
  AdminPageHeader,
  EmptyState,
  MetricBand
} from "../shared.tsx";

interface CommandSnapshotSummary {
  snapshot_id: string;
  snapshot_kind: string;
  rollback_status: string;
  manifest_relative_path: string;
  captured_file_count: number;
  missing_file_count: number;
  skipped_file_count: number;
  failed_file_count: number;
}

export interface CommandSnapshotRestorePlanPreview {
  snapshotId: string;
  plan: AdminCommandRestorePlan | null;
  loading: boolean;
  error: string;
}

export interface CommandSnapshotRestoreExecutionState {
  snapshotId: string;
  armed: boolean;
  loading: boolean;
  error: string;
  result: AdminCommandSnapshotRestoreResult | null;
}

function areaLabel(area: AdminOperationLogEvent["area"]): string {
  const labels: Record<AdminOperationLogEvent["area"], string> = {
    "read-model": "读模型",
    protection: "保护",
    preprocess: "预处理",
    release: "发布",
    settings: "设置",
    users: "剪辑师",
    system: "系统"
  };

  return labels[area];
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "read-model-reconcile": "读模型对账",
    "read-model-invalidate": "读模型失效标记"
  };

  return labels[action] ?? commandLabel(action);
}

function eventTypeLabel(eventType: AdminOperationLogEvent["event_type"]): string {
  const labels: Record<AdminOperationLogEvent["event_type"], string> = {
    started: "开始",
    progress: "进行中",
    "cancel-requested": "请求取消",
    cancelled: "已取消",
    succeeded: "成功",
    skipped: "跳过",
    failed: "失败"
  };

  return labels[eventType];
}

function eventTypeTone(eventType: AdminOperationLogEvent["event_type"]): BadgeTone {
  const tones: Record<AdminOperationLogEvent["event_type"], BadgeTone> = {
    started: "info",
    progress: "running",
    "cancel-requested": "warning",
    cancelled: "cancelled",
    succeeded: "success",
    skipped: "neutral",
    failed: "danger"
  };

  return tones[eventType];
}

function eventMessageLabel(event: AdminOperationLogEvent): string {
  const command = detailValue(event.details.command);
  if (command && /^Admin command .+ (started|succeeded|failed)\.$/u.test(event.message)) {
    const suffix: Record<AdminOperationLogEvent["event_type"], string> = {
      started: "已开始",
      progress: "进行中",
      "cancel-requested": "请求取消",
      cancelled: "已取消",
      succeeded: "已成功",
      skipped: "已跳过",
      failed: "失败"
    };
    return `${commandLabel(command)}${suffix[event.event_type]}`;
  }

  return event.message;
}

function invalidationReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    "source-folder-scope-change": "素材来源范围变化",
    "library-scan-or-init": "素材库扫描或初始化",
    manual: "手动标记"
  };

  return labels[reason] ?? reason;
}

function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    "settings-config": "保存设置",
    "source-folder-add": "新增素材来源",
    "source-folder-update": "更新素材来源",
    "source-folder-remove": "移除素材来源",
    "library-scan": "扫描素材库",
    "library-init": "初始化素材库",
    "admin-auth-register": "注册管理员",
    "admin-auth-login": "管理员登录",
    "admin-auth-logout": "管理员登出",
    "source-video-metadata": "保存素材信息",
    "source-video-cover": "保存封面",
    "cutter-user-approve": "通过剪辑师",
    "cutter-user-disable": "停用剪辑师",
    "cutter-user-password-reset": "重置剪辑师密码",
    "source-video-queue": "加入预处理",
    "source-video-retry": "重新处理",
    "source-video-recover-processing": "恢复到队列",
    "source-video-publish": "发布单条素材",
    "preprocess-queue-unprocessed": "加入预处理队列",
    "preprocess-retry-failed": "重试可继续处理的视频",
    "preprocess-recover-processing": "恢复卡住任务",
    "index-repair": "批量上线素材",
    "command-snapshot-restore": "命令快照恢复"
  };

  return labels[command] ?? command;
}

function detailValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function actorFromDetails(details: Record<string, unknown>): AdminCommandActor | null {
  const candidate = details.actor;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const actor = candidate as Partial<AdminCommandActor>;
  if (
    actor.kind !== "admin-user" &&
    actor.kind !== "system" &&
    actor.kind !== "unknown"
  ) {
    return null;
  }

  if (
    actor.source !== "admin-session" &&
    actor.source !== "auth-disabled" &&
    actor.source !== "system-task" &&
    actor.source !== "runtime-holder"
  ) {
    return null;
  }

  return actor as AdminCommandActor;
}

function actorLabel(details: Record<string, unknown>): string {
  const actor = actorFromDetails(details);
  if (!actor) {
    return "";
  }

  if (actor.kind === "admin-user") {
    return actor.display_name || actor.username || actor.admin_id || "管理员";
  }

  if (actor.kind === "system") {
    return actor.label || "系统任务";
  }

  return actor.label || "";
}

function eventDetailSummary(event: AdminOperationLogEvent): string {
  const details: string[] = [];
  const command = detailValue(event.details.command);
  const holder = detailValue(event.details.holder);
  const actor = actorLabel(event.details);
  const phase = detailValue(event.details.phase);
  const reason = detailValue(event.details.invalidation_reason);
  const staleMarkResult = detailValue(event.details.stale_mark_result);
  const scanned = detailValue(event.details.scanned_source_video_count);
  const total = detailValue(event.details.total_source_video_count);
  const snapshot = commandSnapshotSummary(event);

  if (command) {
    details.push(`命令 ${commandLabel(command)}`);
  }

  if (actor) {
    details.push(`操作者 ${actor}`);
  }

  if (holder) {
    details.push(actor ? `锁持有者 ${holder}` : `执行者 ${holder}`);
  }

  if (snapshot) {
    details.push(`快照 ${snapshot.snapshot_id}`);
  }

  if (phase) {
    details.push(`阶段 ${phase}`);
  }

  if (reason) {
    details.push(`原因 ${invalidationReasonLabel(reason)}`);
  }

  if (staleMarkResult) {
    details.push(`标记 ${staleMarkResult}`);
  }

  if (scanned || total) {
    details.push(`进度 ${scanned || 0}/${total || 0}`);
  }

  return details.join(" · ") || "无补充字段";
}

function commandSnapshotSummary(event: AdminOperationLogEvent): CommandSnapshotSummary | null {
  const candidate = event.details.command_snapshot;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const snapshot = candidate as Record<string, unknown>;
  if (snapshot.created !== true || typeof snapshot.snapshot_id !== "string") {
    return null;
  }

  return {
    snapshot_id: snapshot.snapshot_id,
    snapshot_kind: detailValue(snapshot.snapshot_kind),
    rollback_status: detailValue(snapshot.rollback_status),
    manifest_relative_path: detailValue(snapshot.manifest_relative_path),
    captured_file_count: typeof snapshot.captured_file_count === "number" ? snapshot.captured_file_count : 0,
    missing_file_count: typeof snapshot.missing_file_count === "number" ? snapshot.missing_file_count : 0,
    skipped_file_count: typeof snapshot.skipped_file_count === "number" ? snapshot.skipped_file_count : 0,
    failed_file_count: typeof snapshot.failed_file_count === "number" ? snapshot.failed_file_count : 0
  };
}

function snapshotKindLabel(value: string): string {
  const labels: Record<string, string> = {
    "file-capture": "文件快照",
    "metadata-only": "元数据锚点"
  };

  return labels[value] ?? (value || "未知");
}

function restoreBlockerLabel(value: string): string {
  const labels: Record<string, string> = {
    snapshot_manifest_outside_command_snapshot_root: "快照清单不在命令快照目录内",
    snapshot_manifest_missing: "快照清单不存在",
    snapshot_manifest_not_file: "快照清单不是文件",
    snapshot_manifest_invalid_json: "快照清单不是有效 JSON",
    snapshot_manifest_invalid_schema: "快照清单结构不符合恢复要求",
    snapshot_is_not_file_capture: "该快照没有捕获文件内容",
    snapshot_file_not_captured: "快照文件未成功捕获",
    snapshot_file_path_missing: "快照文件路径缺失",
    snapshot_file_path_unsafe: "快照文件路径不安全",
    snapshot_file_missing: "快照文件不存在",
    snapshot_file_not_file: "快照路径不是文件",
    snapshot_file_size_mismatch: "快照文件大小不一致",
    source_path_missing: "目标文件路径缺失",
    source_path_unsafe: "目标文件路径不安全",
    target_is_not_file: "目标路径不是文件",
    restore_plan_blocked: "恢复计划被阻断",
    restore_plan_empty: "恢复计划没有可恢复文件",
    restore_file_missing_paths: "恢复文件路径缺失",
    restore_file_path_unsafe: "恢复文件路径不安全"
  };

  return labels[value] ?? value;
}

function targetStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    exists: "目标存在",
    missing: "目标缺失",
    "not-file": "目标不是文件",
    unsafe: "目标路径不安全"
  };

  return labels[value] ?? value;
}

function snapshotStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    exists: "快照存在",
    missing: "快照缺失",
    "not-file": "快照不是文件",
    "size-mismatch": "大小不一致",
    unsafe: "快照路径不安全",
    "not-captured": "未捕获"
  };

  return labels[value] ?? value;
}

function restoreExecutionStatusLabel(status: AdminCommandSnapshotRestoreResult["status"]): string {
  return status === "restored" ? "恢复已执行" : "恢复被阻断";
}

function formatEventTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function operationLogColumns(input: {
  onPreviewCommandSnapshotRestore?: (snapshotId: string) => void;
}): TableColumn<AdminOperationLogEvent>[] {
  return [
    {
      id: "time",
      header: "时间",
      render: (event) => <span title={event.occurred_at}>{formatEventTime(event.occurred_at)}</span>,
      width: "9rem"
    },
    {
      id: "area",
      header: "区域",
      render: (event) => areaLabel(event.area),
      width: "7rem"
    },
    {
      id: "action",
      header: "动作",
      render: (event) => actionLabel(event.action),
      width: "10rem"
    },
    {
      id: "type",
      header: "结果",
      render: (event) => (
        <Badge tone={eventTypeTone(event.event_type)}>
          {eventTypeLabel(event.event_type)}
        </Badge>
      ),
      width: "7rem"
    },
    {
      id: "message",
      header: "记录",
      render: (event) => {
        const snapshot = commandSnapshotSummary(event);
        return (
          <div className="admin-operation-log-record">
            <strong>{eventMessageLabel(event)}</strong>
            <p>{eventDetailSummary(event)}</p>
            {snapshot ? (
              <div className="admin-operation-log-snapshot">
                <span>{snapshotKindLabel(snapshot.snapshot_kind)}</span>
                <span>已捕获 {snapshot.captured_file_count} 个文件</span>
                <AdminControlButton
                  label="查看恢复预检"
                  state={input.onPreviewCommandSnapshotRestore ? "m9b-api" : "read-only"}
                  reason="只读取命令快照恢复计划，不执行恢复"
                  onClick={
                    input.onPreviewCommandSnapshotRestore
                      ? () => input.onPreviewCommandSnapshotRestore?.(snapshot.snapshot_id)
                      : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        );
      }
    }
  ];
}

function RestoreExecutionPanel({
  preview,
  execution,
  onArmRestore,
  onCancelRestore,
  onExecuteRestore
}: {
  preview: CommandSnapshotRestorePlanPreview;
  execution: CommandSnapshotRestoreExecutionState | null;
  onArmRestore?: (snapshotId: string) => void;
  onCancelRestore?: (snapshotId: string) => void;
  onExecuteRestore?: (snapshotId: string) => void;
}) {
  const plan = preview.plan;
  if (!plan?.can_restore) {
    return null;
  }

  const restoreState = execution?.snapshotId === preview.snapshotId ? execution : null;
  const result = restoreState?.result ?? null;

  if (result) {
    return (
      <section className={`admin-restore-execution is-${result.status}`}>
        <strong>{restoreExecutionStatusLabel(result.status)}</strong>
        <p>恢复 {result.restored_file_count} 个文件，阻断 {result.blocked_file_count} 个文件。</p>
        {result.blockers.length > 0 ? (
          <ul className="admin-restore-blockers">
            {result.blockers.map((blocker) => (
              <li key={blocker}>{restoreBlockerLabel(blocker)}</li>
            ))}
          </ul>
        ) : null}
        <div className="admin-restore-file-list">
          {result.files.map((file) => (
            <article key={`${file.label}-${file.source_relative_path || ""}`}>
              <strong>{file.label}</strong>
              <span>{file.restored ? "已恢复" : "未恢复"}</span>
              <small>{file.source_relative_path || "未记录目标路径"}</small>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (restoreState?.loading) {
    return (
      <section className="admin-restore-execution">
        <strong>正在执行恢复</strong>
        <p>后端正在重新预检、获取写入锁并记录审计。</p>
        <AdminControlButton
          label="正在执行恢复"
          state="read-only"
          reason="恢复执行中，等待后端返回结果。"
        />
      </section>
    );
  }

  if (restoreState?.armed) {
    return (
      <section className="admin-restore-execution is-armed">
        <strong>确认执行恢复</strong>
        <p>将用该命令快照覆盖对应文件；后端仍会重新预检并阻断不安全恢复。</p>
        {restoreState.error ? <p className="admin-restore-execution-error">{restoreState.error}</p> : null}
        <div className="admin-restore-actions">
          <AdminControlButton
            label="确认执行恢复"
            state="m9b-api"
            reason="执行命令快照恢复。后端会重新检查恢复计划、写入锁和安全阻断。"
            variant="primary"
            onClick={onExecuteRestore ? () => onExecuteRestore(preview.snapshotId) : undefined}
          />
          <AdminControlButton
            label="取消"
            state="local"
            reason="取消本次恢复确认，不写入任何文件。"
            onClick={onCancelRestore ? () => onCancelRestore(preview.snapshotId) : undefined}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="admin-restore-execution">
      <strong>恢复执行</strong>
      <p>预检已通过；执行前需要先准备恢复，再二次确认。</p>
      {restoreState?.error ? <p className="admin-restore-execution-error">{restoreState.error}</p> : null}
      <AdminControlButton
        label="准备恢复"
        state="local"
        reason="准备命令快照恢复，下一步仍需确认。"
        onClick={onArmRestore ? () => onArmRestore(preview.snapshotId) : undefined}
      />
    </section>
  );
}

function RestorePlanPreviewPanel({
  preview,
  execution,
  onArmRestore,
  onCancelRestore,
  onExecuteRestore
}: {
  preview: CommandSnapshotRestorePlanPreview | null;
  execution: CommandSnapshotRestoreExecutionState | null;
  onArmRestore?: (snapshotId: string) => void;
  onCancelRestore?: (snapshotId: string) => void;
  onExecuteRestore?: (snapshotId: string) => void;
}) {
  if (!preview) {
    return (
      <section className="admin-restore-plan-panel">
        <strong>恢复预检</strong>
        <p>选择带文件快照的操作记录后，可查看恢复计划；恢复执行必须先通过预检和二次确认。</p>
      </section>
    );
  }

  if (preview.loading) {
    return (
      <section className="admin-restore-plan-panel">
        <strong>恢复预检</strong>
        <p>正在读取 {preview.snapshotId} 的恢复计划。</p>
      </section>
    );
  }

  if (preview.error) {
    return (
      <section className="admin-restore-plan-panel is-blocked">
        <strong>恢复预检失败</strong>
        <p>{preview.error}</p>
      </section>
    );
  }

  const plan = preview.plan;
  if (!plan) {
    return (
      <section className="admin-restore-plan-panel">
        <strong>恢复预检</strong>
        <p>尚未读取到恢复计划。</p>
      </section>
    );
  }

  return (
    <section className={`admin-restore-plan-panel${plan.can_restore ? " is-restorable" : " is-blocked"}`}>
      <strong>{plan.can_restore ? "恢复预检通过" : "恢复预检被阻断"}</strong>
      <p>{plan.can_restore ? "该快照具备恢复条件；执行恢复仍需准备并确认。" : "当前快照不能恢复，请先处理阻断原因。"}</p>
      <dl className="admin-dashboard-kv">
        <div>
          <dt>快照</dt>
          <dd>{plan.snapshot_id || preview.snapshotId}</dd>
        </div>
        <div>
          <dt>命令</dt>
          <dd>{plan.command ? commandLabel(plan.command) : "未知"}</dd>
        </div>
        <div>
          <dt>文件</dt>
          <dd>{plan.restorable_file_count} 可恢复 / {plan.blocked_file_count} 阻断 / {plan.file_count} 总数</dd>
        </div>
        <div>
          <dt>扫描模式</dt>
          <dd>不扫描</dd>
        </div>
      </dl>
      {plan.blockers.length > 0 ? (
        <ul className="admin-restore-blockers">
          {plan.blockers.map((blocker) => (
            <li key={blocker}>{restoreBlockerLabel(blocker)}</li>
          ))}
        </ul>
      ) : null}
      <div className="admin-restore-file-list">
        {plan.files.map((file) => (
          <article key={`${file.label}-${file.source_relative_path || ""}`}>
            <strong>{file.label}</strong>
            <span>{targetStatusLabel(file.target_status)} · {snapshotStatusLabel(file.snapshot_status)}</span>
            <small>{file.source_relative_path || "未记录目标路径"}</small>
          </article>
        ))}
      </div>
      <RestoreExecutionPanel
        preview={preview}
        execution={execution}
        onArmRestore={onArmRestore}
        onCancelRestore={onCancelRestore}
        onExecuteRestore={onExecuteRestore}
      />
    </section>
  );
}

export function OperationLogPage({
  operationLog,
  loading,
  error,
  restorePlanPreview = null,
  restoreExecution = null,
  onPreviewCommandSnapshotRestore,
  onArmCommandSnapshotRestore,
  onCancelCommandSnapshotRestore,
  onExecuteCommandSnapshotRestore
}: {
  operationLog: AdminOperationLogResponse | null;
  loading: boolean;
  error: string;
  restorePlanPreview?: CommandSnapshotRestorePlanPreview | null;
  restoreExecution?: CommandSnapshotRestoreExecutionState | null;
  onPreviewCommandSnapshotRestore?: (snapshotId: string) => void;
  onArmCommandSnapshotRestore?: (snapshotId: string) => void;
  onCancelCommandSnapshotRestore?: (snapshotId: string) => void;
  onExecuteCommandSnapshotRestore?: (snapshotId: string) => void;
}) {
  if (error) {
    return (
      <>
        <div className="admin-main-column">
          <EmptyState title="操作记录加载失败" detail={error} />
        </div>
        <InspectorPanel title="操作记录">
          <p>请确认管理端 API 是否可用。</p>
        </InspectorPanel>
      </>
    );
  }

  if (!operationLog) {
    return (
      <>
        <div className="admin-main-column">
          <EmptyState
            title={loading ? "正在读取操作记录" : "暂无操作记录"}
            detail={loading ? "正在读取最近的管理端维护事件。" : "当前没有可显示的审计事件。"}
          />
        </div>
        <InspectorPanel title="操作记录">
          <p>{loading ? "加载中" : "未读取到操作记录"}</p>
        </InspectorPanel>
      </>
    );
  }

  const latestEvent = operationLog.events[0] ?? null;

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          eyebrow="审计记录"
          title="操作记录"
          description="查看读模型对账、失效标记和后续管理端命令审计。"
        />
        <MetricBand
          items={[
            {
              label: "本页事件",
              value: operationLog.events.length,
              caption: operationLog.truncated ? "已截断显示" : "当前返回数量"
            },
            {
              label: "日志行数",
              value: operationLog.total_line_count,
              caption: "已读取的事件行"
            },
            {
              label: "异常行",
              value: operationLog.malformed_line_count,
              caption: operationLog.malformed_line_count > 0 ? "需要检查日志文件" : "未发现格式异常"
            },
            {
              label: "读取上限",
              value: operationLog.limit,
              caption: "最近记录窗口"
            }
          ]}
        />
        <Card
          title="最近事件"
          subtitle="数据同步和失效标记的审计轨迹"
          className="admin-operation-log-card"
        >
          <Table
            columns={operationLogColumns({ onPreviewCommandSnapshotRestore })}
            rows={operationLog.events}
            getRowKey={(event) => event.event_id}
            empty={<EmptyState title="暂无事件" detail="当前操作记录文件没有可显示的事件。" />}
            density="compact"
            stickyHeader
          />
        </Card>
      </div>
      <InspectorPanel
        title="审计状态"
        subtitle={operationLog.generated_at}
      >
        <dl className="admin-dashboard-kv">
          <div>
            <dt>记录文件</dt>
            <dd>{operationLog.path}</dd>
          </div>
          <div>
            <dt>截断</dt>
            <dd>{operationLog.truncated ? "是" : "否"}</dd>
          </div>
          <div>
            <dt>坏行</dt>
            <dd>{operationLog.malformed_line_count}</dd>
          </div>
          <div>
            <dt>最近动作</dt>
            <dd>{latestEvent ? actionLabel(latestEvent.action) : "暂无"}</dd>
          </div>
          <div>
            <dt>最近结果</dt>
            <dd>
              {latestEvent ? (
                <Badge tone={eventTypeTone(latestEvent.event_type)}>
                  {eventTypeLabel(latestEvent.event_type)}
                </Badge>
              ) : "暂无"}
            </dd>
          </div>
        </dl>
        <AdminInfoGroups
          groups={[
            {
              title: "页面契约",
              rows: [
                { label: "主工作区", value: "审计时间线" },
                { label: "辅助区", value: "恢复预检" },
                { label: "数据来源", value: "operation-log / command-snapshot" },
                { label: "扫描模式", value: "不扫描" },
                { label: "加载边界", value: "路由加载，只读取最近事件窗口" },
                { label: "命令边界", value: "确认执行恢复前重新预检" },
                { label: "错误边界", value: "本页面局部处理" }
              ]
            }
          ]}
        />
        <RestorePlanPreviewPanel
          preview={restorePlanPreview}
          execution={restoreExecution}
          onArmRestore={onArmCommandSnapshotRestore}
          onCancelRestore={onCancelCommandSnapshotRestore}
          onExecuteRestore={onExecuteCommandSnapshotRestore}
        />
      </InspectorPanel>
    </>
  );
}
