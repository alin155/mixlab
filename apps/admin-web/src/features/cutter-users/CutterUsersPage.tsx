import { InspectorPanel, SourceTable } from "@mixlab/ui-foundation";
import { useState } from "react";
import type {
  AdminCutterUser,
  AdminCutterUsersResponse,
  UsageMetrics,
  UserUsageMetrics
} from "../../api.ts";
import { AdminControlButton, AdminPageHeader, EmptyState, MetricBand } from "../shared.tsx";

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

export function CutterUsersPage({
  users,
  metrics,
  onApprove,
  onDisable
}: {
  users: AdminCutterUsersResponse;
  metrics: UsageMetrics;
  onApprove?: (userId: string) => void;
  onDisable?: (userId: string) => void;
}) {
  const usersById = new Map(users.users.map((user) => [user.user_id, user]));
  const [disableTargetUserId, setDisableTargetUserId] = useState("");
  const disableTargetUser = users.users.find((user) => user.user_id === disableTargetUserId);

  const confirmDisableUser = () => {
    if (!disableTargetUser) {
      return;
    }

    onDisable?.(disableTargetUser.user_id);
    setDisableTargetUserId("");
  };

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="剪辑师用户" eyebrow="登录申请与使用统计" />
        <MetricBand
          items={[
            { label: "活跃剪辑师", value: metrics.active_user_count, caption: "有使用记录" },
            { label: "搜索次数", value: metrics.search_request_count, caption: "全部剪辑端请求" },
            { label: "搜索失败", value: metrics.search_failure_count, caption: "需要排查的搜索链路错误" },
            { label: "选段次数", value: metrics.transcript_selection_count, caption: "加入待剪前的文案选择" },
            { label: "剪切成功", value: metrics.cut_success_count, caption: "已生成本地素材" }
          ]}
        />
        <MetricBand
          items={[
            { label: "待审核", value: statusCount(users.users, "pending"), caption: "等待管理员通过" },
            { label: "已通过", value: statusCount(users.users, "approved"), caption: "可以进入剪辑端" },
            { label: "已拒绝", value: statusCount(users.users, "rejected"), caption: "申请未开放" },
            { label: "已停用", value: statusCount(users.users, "disabled"), caption: "登录凭证失效" }
          ]}
        />
        {users.users.length === 0 ? (
          <EmptyState title="暂无剪辑师申请" detail="剪辑端提交用户名后会出现在这里等待审核。" />
        ) : (
          <section className="admin-list-panel">
            <SourceTable
              columns={["用户", "状态", "设备", "搜索次数", "搜索失败", "剪切成功", "最近使用", "操作"]}
              rows={users.users.map((user) => {
                const metric = userMetricFor(user.user_id, metrics);
                return [
                  user.display_name,
                  userStatusLabel(user.status),
                  `${user.devices.length} 台`,
                  metric?.search_request_count ?? 0,
                  metric?.search_failure_count ?? 0,
                  metric?.cut_success_count ?? 0,
                  lastUsedLabel(user.last_used_at || metric?.last_used_at || ""),
                  user.status === "pending" ? (
                    <AdminControlButton
                      label="通过申请"
                      state="m9b-api"
                      reason="允许该用户名和设备进入剪辑师工作台。"
                      variant="primary"
                      onClick={onApprove ? () => onApprove(user.user_id) : undefined}
                    />
                  ) : user.status === "approved" ? (
                    <AdminControlButton
                      label="停用用户"
                      state="m9b-api"
                      reason="停用后该剪辑师现有登录凭证会失效。"
                      onClick={onDisable ? () => setDisableTargetUserId(user.user_id) : undefined}
                    />
                  ) : (
                    "无需操作"
                  )
                ];
              })}
            />
          </section>
        )}
      </div>
      <InspectorPanel title="用户概览">
        <div className="admin-user-inspector">
          <section>
            <h2>审批状态</h2>
            <p className="admin-note">
              待审核 {statusCount(users.users, "pending")} 人，已通过 {statusCount(users.users, "approved")} 人，
              已停用 {statusCount(users.users, "disabled")} 人。
            </p>
          </section>
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
    </>
  );
}
