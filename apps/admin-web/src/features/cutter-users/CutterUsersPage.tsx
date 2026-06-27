import { Badge, InspectorPanel, Table, type BadgeTone, type TableColumn } from "@mixlab/ui-foundation";
import { useState } from "react";
import type {
  AdminCutterUser,
  AdminCutterUsersResponse,
  UsageMetrics,
  UserUsageMetrics
} from "../../api.ts";
import { AdminControlButton, AdminInfoGroups, AdminPageHeader, EmptyState, MetricBand } from "../shared.tsx";

function userStatusLabel(status: AdminCutterUser["status"]): string {
  return {
    pending: "待审核",
    approved: "已通过",
    rejected: "已拒绝",
    disabled: "已停用"
  }[status];
}

function userMetricFor(userId: string, metrics: UsageMetrics): UserUsageMetrics | undefined {
  return metrics.users.find((user) => user.user_id === userId);
}

function userDisplayName(
  metric: UserUsageMetrics,
  usersById: Map<string, AdminCutterUser>
): string {
  return usersById.get(metric.user_id)?.display_name || `用户 ${metric.user_id}`;
}

function lastUsedLabel(value: string): string {
  return value || "暂无";
}

function statusCount(users: AdminCutterUser[], status: AdminCutterUser["status"]): number {
  return users.filter((user) => user.status === status).length;
}

function statusTone(status: AdminCutterUser["status"]): BadgeTone {
  return {
    pending: "warning",
    approved: "success",
    rejected: "neutral",
    disabled: "danger"
  }[status] as BadgeTone;
}

export function CutterUserDisableDialog({
  user,
  onCancel,
  onConfirm
}: {
  user: AdminCutterUser;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-label="停用剪辑师用户">
        <header>
          <p>停用剪辑师用户</p>
          <h2>{user.display_name}</h2>
        </header>
        <p>
          停用后该剪辑师现有登录凭证会失效，需要管理员重新处理后才能进入剪辑端。
        </p>
        <dl>
          <div>
            <dt>用户名</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>设备数</dt>
            <dd>{user.devices.length} 台</dd>
          </div>
        </dl>
        <footer>
          <button className="admin-secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="admin-danger-button" type="button" onClick={onConfirm}>
            确认停用
          </button>
        </footer>
      </section>
    </div>
  );
}

export function CutterUserPasswordResetDialog({
  user,
  onCancel,
  onConfirm
}: {
  user: AdminCutterUser;
  onCancel: () => void;
  onConfirm: (newPassword: string) => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const nextPassword = password.trim();
    if (!nextPassword) {
      setError("请输入新密码。");
      return;
    }
    if (nextPassword !== confirmPassword.trim()) {
      setError("两次输入的新密码不一致。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onConfirm(nextPassword);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "重置密码失败。");
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-label="重置剪辑师密码">
        <header>
          <p>重置剪辑师密码</p>
          <h2>{user.display_name}</h2>
        </header>
        <p>
          重置后该剪辑师当前所有登录会话会失效，需要使用新密码重新登录。
        </p>
        <div className="admin-reset-password-form">
          <label>
            <span>新密码</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="至少 8 位，包含字母和数字"
            />
          </label>
          <label>
            <span>确认新密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              placeholder="再次输入新密码"
            />
          </label>
          {error ? <p className="admin-dialog-error">{error}</p> : null}
        </div>
        <footer>
          <button className="admin-secondary-button" type="button" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button className="admin-danger-button" type="button" onClick={handleSubmit} disabled={submitting}>
            确认重置
          </button>
        </footer>
      </section>
    </div>
  );
}

export function CutterUsersPage({
  users,
  metrics,
  onApprove,
  onDisable,
  onResetPassword
}: {
  users: AdminCutterUsersResponse;
  metrics: UsageMetrics;
  onApprove?: (userId: string) => void;
  onDisable?: (userId: string) => void;
  onResetPassword?: (userId: string, input: { new_password: string }) => Promise<void> | void;
}) {
  const usersById = new Map(users.users.map((user) => [user.user_id, user]));
  const [disableTargetUserId, setDisableTargetUserId] = useState("");
  const [passwordResetTargetUserId, setPasswordResetTargetUserId] = useState("");
  const disableTargetUser = users.users.find((user) => user.user_id === disableTargetUserId);
  const passwordResetTargetUser = users.users.find((user) => user.user_id === passwordResetTargetUserId);
  const pendingUserCount = statusCount(users.users, "pending");
  const approvedUserCount = statusCount(users.users, "approved");
  const rejectedUserCount = statusCount(users.users, "rejected");
  const disabledUserCount = statusCount(users.users, "disabled");
  const columns: Array<TableColumn<AdminCutterUser>> = [
    { id: "user", header: "用户", accessor: "display_name" },
    {
      id: "status",
      header: "状态",
      render: (user) => <Badge tone={statusTone(user.status)}>{userStatusLabel(user.status)}</Badge>
    },
    { id: "devices", header: "设备", render: (user) => `${user.devices.length} 台` },
    {
      id: "searches",
      header: "搜索次数",
      render: (user) => userMetricFor(user.user_id, metrics)?.search_request_count ?? 0,
      align: "right"
    },
    {
      id: "searchFailures",
      header: "搜索失败",
      render: (user) => userMetricFor(user.user_id, metrics)?.search_failure_count ?? 0,
      align: "right"
    },
    {
      id: "cutSuccess",
      header: "剪切成功",
      render: (user) => userMetricFor(user.user_id, metrics)?.cut_success_count ?? 0,
      align: "right"
    },
    {
      id: "lastUsed",
      header: "最近使用",
      render: (user) => lastUsedLabel(user.last_used_at || userMetricFor(user.user_id, metrics)?.last_used_at || "")
    },
    {
      id: "actions",
      header: "操作",
      render: (user) => (
        <div className="admin-user-actions">
          {user.status === "pending" ? (
            <AdminControlButton
              label="通过申请"
              state="m9b-api"
              reason="允许该用户名和设备进入剪辑师工作台。"
              variant="primary"
              onClick={onApprove ? () => onApprove(user.user_id) : undefined}
            />
          ) : null}
          {onResetPassword ? (
            <AdminControlButton
              label="重置密码"
              state="m9b-api"
              reason="为该剪辑师设置新密码，并清除旧登录会话。"
              onClick={() => setPasswordResetTargetUserId(user.user_id)}
            />
          ) : null}
          {user.status === "approved" ? (
            <AdminControlButton
              label="停用用户"
              state="m9b-api"
              reason="停用后该剪辑师现有登录凭证会失效。"
              onClick={onDisable ? () => setDisableTargetUserId(user.user_id) : undefined}
            />
          ) : null}
          {user.status !== "pending" && user.status !== "approved" && !onResetPassword ? "无需操作" : null}
        </div>
      )
    }
  ];

  const confirmDisableUser = () => {
    if (!disableTargetUser) {
      return;
    }

    onDisable?.(disableTargetUser.user_id);
    setDisableTargetUserId("");
  };

  const confirmPasswordReset = async (newPassword: string) => {
    if (!passwordResetTargetUser) {
      return;
    }

    await onResetPassword?.(passwordResetTargetUser.user_id, { new_password: newPassword });
    setPasswordResetTargetUserId("");
  };

  return (
    <>
      <div className="admin-main-column admin-cutter-users-console">
        <AdminPageHeader
          title="剪辑师"
          eyebrow="登录申请与使用统计"
          description="用户审核按路由加载，账号写操作只通过命令接口执行。"
        />
        <MetricBand
          items={[
            { label: "活跃剪辑师", value: metrics.active_user_count, caption: "有使用记录" },
            { label: "搜索次数", value: metrics.search_request_count, caption: "全部剪辑端请求" },
            { label: "搜索失败", value: metrics.search_failure_count, caption: "需排查错误" },
            { label: "选段次数", value: metrics.transcript_selection_count, caption: "加入待剪前的文案选择" },
            { label: "剪切成功", value: metrics.cut_success_count, caption: "已生成本地素材" }
          ]}
        />
        <MetricBand
          items={[
            { label: "待审核", value: pendingUserCount, caption: "等待管理员通过" },
            { label: "已通过", value: approvedUserCount, caption: "可以进入剪辑端" },
            { label: "已拒绝", value: rejectedUserCount, caption: "申请未开放" },
            { label: "已停用", value: disabledUserCount, caption: "登录凭证失效" }
          ]}
        />
        <section className="admin-cutter-users-route-contract" aria-label="剪辑师数据来源">
          <div>
            <span>用户表格</span>
            <strong>用户仓库</strong>
            <p>路由加载 · 不扫描</p>
          </div>
          <div>
            <span>使用概览</span>
            <strong>使用指标</strong>
            <p>只读统计 · 不阻塞审核</p>
          </div>
          <div>
            <span>账号操作</span>
            <strong>命令操作</strong>
            <p>通过 / 停用 / 重置密码</p>
          </div>
        </section>
        {users.users.length === 0 ? (
          <EmptyState title="暂无剪辑师申请" detail="剪辑端提交用户名后会出现在这里等待审核。" />
        ) : (
          <section className="admin-list-section admin-cutter-user-table-surface" aria-label="用户表格">
            <header className="admin-section-header">
              <div>
                <h2>用户表格</h2>
                <p>展示剪辑师准入状态和最近使用指标；审批写操作保留在当前行的命令按钮中。</p>
              </div>
              <Badge tone={pendingUserCount > 0 ? "warning" : "success"}>
                待审核 {pendingUserCount} 人
              </Badge>
            </header>
            <Table
              columns={columns}
              rows={users.users}
              getRowKey={(user) => user.user_id}
              stickyHeader
            />
          </section>
        )}
      </div>
      <InspectorPanel title="用户概览" subtitle="剪辑师准入">
        <div className="admin-user-inspector">
          <AdminInfoGroups
            groups={[
              {
                title: "审批状态",
                rows: [
                  { label: "待审核", value: `${pendingUserCount} 人` },
                  { label: "已通过", value: `${approvedUserCount} 人` },
                  { label: "已拒绝", value: `${rejectedUserCount} 人` },
                  { label: "已停用", value: `${disabledUserCount} 人` }
                ]
              },
              {
                title: "页面契约",
                rows: [
                  { label: "主工作区", value: "用户表格" },
                  { label: "辅助区", value: "使用概览" },
                  { label: "用户来源", value: "用户仓库" },
                  { label: "操作边界", value: "命令操作" },
                  { label: "扫描模式", value: "不扫描" },
                  { label: "错误边界", value: "本页面局部处理" }
                ]
              }
            ]}
          />
          <section>
            <h2>最近使用</h2>
            {metrics.users.length === 0 ? (
              <p className="admin-note">暂无剪辑端使用记录。</p>
            ) : metrics.users.map((metric) => (
              <p className="admin-note" key={metric.user_id}>
                {userDisplayName(metric, usersById)}：搜索 {metric.search_request_count} 次，
                剪切成功 {metric.cut_success_count} 次，
                最近使用 {lastUsedLabel(metric.last_used_at)}
              </p>
            ))}
          </section>
        </div>
      </InspectorPanel>
      {disableTargetUser ? (
        <CutterUserDisableDialog
          user={disableTargetUser}
          onCancel={() => setDisableTargetUserId("")}
          onConfirm={confirmDisableUser}
        />
      ) : null}
      {passwordResetTargetUser ? (
        <CutterUserPasswordResetDialog
          user={passwordResetTargetUser}
          onCancel={() => setPasswordResetTargetUserId("")}
          onConfirm={confirmPasswordReset}
        />
      ) : null}
    </>
  );
}
