import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_COMMAND_ACTION_CANCELLATION_POLICY,
  adminCommandActionBlockedMessage,
  adminCommandActionStartDecision,
  canStartAdminCommandAction
} from "./command-cancellation-policy.ts";

test("protected Admin commands continue across route navigation without transport abort", () => {
  const policy = ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.protected_command;

  assert.equal(policy.transport_abort, "forbidden");
  assert.equal(policy.route_navigation, "continue-command");
  assert.equal(policy.duplicate_submission, "block-while-running");
  assert.equal(policy.client_scope, "stable-runtime-client");
  assert.equal(policy.completion_refresh, "after-settle");
  assert.deepEqual(policy.backend_safety_dependencies, [
    "protection-gate",
    "writer-lease",
    "command-audit",
    "command-snapshot-or-rollback-plan"
  ]);
});

test("route reads and local restore arming stay separate from protected command semantics", () => {
  assert.equal(ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.route_read_request.transport_abort, "allowed");
  assert.equal(ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.route_read_request.route_navigation, "cancel-read-request");
  assert.equal(ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.route_read_request.client_scope, "abortable-request-scope");

  assert.equal(ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.local_ui_arming.transport_abort, "forbidden");
  assert.equal(ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.local_ui_arming.route_navigation, "local-only");
  assert.equal(ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.local_ui_arming.client_scope, "local-state-only");
});

test("safe-checkpoint cancellation is reserved for explicit maintenance cancel commands", () => {
  const policy = ADMIN_COMMAND_ACTION_CANCELLATION_POLICY.safe_checkpoint_cancel;

  assert.equal(policy.transport_abort, "safe-checkpoint-command-only");
  assert.equal(policy.route_navigation, "explicit-command-only");
  assert.equal(policy.duplicate_submission, "block-while-running");
  assert.equal(policy.client_scope, "stable-runtime-client");
});

test("command start decisions block duplicate frontend command submissions", () => {
  assert.deepEqual(adminCommandActionStartDecision("", "扫描源视频"), {
    allowed: true,
    message: "",
    active_label: "",
    next_label: "扫描源视频",
    duplicate_submission: "block-while-running"
  });

  assert.deepEqual(canStartAdminCommandAction("扫描源视频", "上线到剪辑端"), {
    allowed: false,
    message: "已有管理端命令「扫描源视频」执行中，请等待完成后再执行「上线到剪辑端」。",
    active_label: "扫描源视频",
    next_label: "上线到剪辑端",
    duplicate_submission: "block-while-running"
  });

  assert.equal(
    adminCommandActionBlockedMessage("扫描源视频", "扫描源视频"),
    "已有管理端命令「扫描源视频」执行中，请等待完成后再继续。"
  );
});
