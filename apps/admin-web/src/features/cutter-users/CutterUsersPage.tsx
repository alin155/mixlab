import { InspectorPanel, SourceTable } from "@mixlab/ui-foundation";
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

function deviceStatusLabel(status: AdminCutterUser["devices"][number]["status"]): string {
  return {
    active: "启用",
    disabled: "停用"
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

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="剪辑师用户" eyebrow="登录申请与使用统计" />
        <MetricBand
          items={[
            { label: "活跃剪辑师", value: metrics.active_user_count, caption: "有使用记录" },
            { label: "搜索次数", value: metrics.search_request_count, caption: "全部剪辑端请求" },
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
              columns={["用户", "状态", "设备", "搜索次数", "剪切成功", "最近使用", "操作"]}
              rows={users.users.map((user) => {
                const metric = userMetricFor(user.user_id, metrics);
                return [
                  user.display_name,
                  userStatusLabel(user.status),
                  `${user.devices.length} 台`,
                  metric?.search_request_count ?? 0,
                  metric?.cut_success_count ?? 0,
                  lastUsedLabel(user.last_used_at || metric?.last_used_at || ""),
                  user.status === "pending" ? (
                    <AdminControlButton
                      label="通过申请"
                      state="m9b-api"
                      reason="允许该用户名和设备进入剪辑师工作台。"
                      variant="primary"
                      onClick={() => onApprove?.(user.user_id)}
                    />
                  ) : user.status === "approved" ? (
                    <AdminControlButton
                      label="停用用户"
                      state="m9b-api"
                      reason="停用后该剪辑师现有登录凭证会失效。"
                      onClick={() => onDisable?.(user.user_id)}
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
      <InspectorPanel title="用户统计">
        <div className="admin-user-inspector">
          <section>
            <h2>设备明细</h2>
            {users.users.map((user) => (
              <p className="admin-note" key={user.user_id}>
                {user.display_name}：{user.devices.length} 台设备，
                {user.devices.map((device) => `${device.device_name}（${deviceStatusLabel(device.status)}）`).join("、")}
              </p>
            ))}
          </section>
          <section>
            <h2>使用统计</h2>
            {metrics.users.length === 0 ? (
              <p className="admin-note">暂无剪辑端使用记录。</p>
            ) : metrics.users.map((metric) => (
              <p className="admin-note" key={metric.user_id}>
                {userDisplayName(metric, usersById)}：搜索次数 {metric.search_request_count}，
                选段次数 {metric.transcript_selection_count}，
                加入待剪 {metric.add_to_cut_list_count}，
                剪切成功 {metric.cut_success_count}，
                复用本地素材 {metric.reuse_local_clip_count}，
                最近使用 {lastUsedLabel(metric.last_used_at)}
              </p>
            ))}
          </section>
        </div>
      </InspectorPanel>
    </>
  );
}
