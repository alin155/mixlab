export type AdminCommandTransportAbort =
  | "allowed"
  | "forbidden"
  | "safe-checkpoint-command-only";

export type AdminCommandRouteNavigationBehavior =
  | "cancel-read-request"
  | "continue-command"
  | "local-only"
  | "explicit-command-only";

export type AdminCommandDuplicateSubmissionBehavior =
  | "replace-or-skip-by-loader"
  | "block-while-running";

export type AdminCommandClientScope =
  | "abortable-request-scope"
  | "stable-runtime-client"
  | "local-state-only";

export type AdminCommandBackendSafetyDependency =
  | "protection-gate"
  | "writer-lease"
  | "command-audit"
  | "command-snapshot-or-rollback-plan";

export interface AdminCommandActionCancellationPolicy {
  protected_command: {
    transport_abort: "forbidden";
    route_navigation: "continue-command";
    duplicate_submission: "block-while-running";
    client_scope: "stable-runtime-client";
    completion_refresh: "after-settle";
    backend_safety_dependencies: readonly AdminCommandBackendSafetyDependency[];
  };
  route_read_request: {
    transport_abort: "allowed";
    route_navigation: "cancel-read-request";
    duplicate_submission: "replace-or-skip-by-loader";
    client_scope: "abortable-request-scope";
  };
  local_ui_arming: {
    transport_abort: "forbidden";
    route_navigation: "local-only";
    duplicate_submission: "block-while-running";
    client_scope: "local-state-only";
  };
  safe_checkpoint_cancel: {
    transport_abort: "safe-checkpoint-command-only";
    route_navigation: "explicit-command-only";
    duplicate_submission: "block-while-running";
    client_scope: "stable-runtime-client";
  };
}

export interface AdminCommandActionStartDecision {
  allowed: boolean;
  message: string;
  active_label: string;
  next_label: string;
  duplicate_submission: AdminCommandDuplicateSubmissionBehavior;
}

export const ADMIN_COMMAND_ACTION_CANCELLATION_POLICY: AdminCommandActionCancellationPolicy = {
  protected_command: {
    transport_abort: "forbidden",
    route_navigation: "continue-command",
    duplicate_submission: "block-while-running",
    client_scope: "stable-runtime-client",
    completion_refresh: "after-settle",
    backend_safety_dependencies: [
      "protection-gate",
      "writer-lease",
      "command-audit",
      "command-snapshot-or-rollback-plan"
    ]
  },
  route_read_request: {
    transport_abort: "allowed",
    route_navigation: "cancel-read-request",
    duplicate_submission: "replace-or-skip-by-loader",
    client_scope: "abortable-request-scope"
  },
  local_ui_arming: {
    transport_abort: "forbidden",
    route_navigation: "local-only",
    duplicate_submission: "block-while-running",
    client_scope: "local-state-only"
  },
  safe_checkpoint_cancel: {
    transport_abort: "safe-checkpoint-command-only",
    route_navigation: "explicit-command-only",
    duplicate_submission: "block-while-running",
    client_scope: "stable-runtime-client"
  }
};

export function adminCommandActionBlockedMessage(activeLabel: string, nextLabel = ""): string {
  const active = activeLabel.trim() || "未知命令";
  const next = nextLabel.trim();

  if (next && next !== active) {
    return `已有管理端命令「${active}」执行中，请等待完成后再执行「${next}」。`;
  }

  return `已有管理端命令「${active}」执行中，请等待完成后再继续。`;
}

export function adminCommandActionStartDecision(
  activeLabel: string,
  nextLabel: string
): AdminCommandActionStartDecision {
  const active = activeLabel.trim();
  const next = nextLabel.trim();

  if (active) {
    return {
      allowed: false,
      message: adminCommandActionBlockedMessage(active, next),
      active_label: active,
      next_label: next,
      duplicate_submission: ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.protected_command.duplicate_submission
    };
  }

  return {
    allowed: true,
    message: "",
    active_label: "",
    next_label: next,
    duplicate_submission: ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.protected_command.duplicate_submission
  };
}

export function canStartAdminCommandAction(
  activeLabel: string,
  nextLabel: string
): AdminCommandActionStartDecision {
  return adminCommandActionStartDecision(activeLabel, nextLabel);
}
