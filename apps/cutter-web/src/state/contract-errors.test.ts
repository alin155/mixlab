import assert from "node:assert/strict";
import test from "node:test";
import { CutterApiError } from "../api.ts";
import {
  contractCodePresentation,
  contractErrorPresentation,
  isAuthRequiredError,
  normalizeContractErrorCode,
  retryabilityLabel
} from "./contract-errors.ts";

test("known contract codes render shared message + remediation + retryability", () => {
  const auth = contractErrorPresentation(
    new CutterApiError({ status: 401, code: "AUTH_REQUIRED", message: "session expired" }),
    "打开项目目录失败"
  );
  assert.equal(auth.known, true);
  assert.equal(auth.code, "AUTH_REQUIRED");
  assert.equal(auth.message, "登录已过期，请重新登录");
  assert.equal(auth.remediation, "重新登录后重试");
  assert.equal(auth.retryability, "after-fix");
  assert.match(auth.technical, /HTTP 401/);
  assert.equal(auth.expandable, true);

  const lib = contractErrorPresentation(
    new CutterApiError({ status: 503, code: "LIBRARY_UNAVAILABLE", message: "nas offline" }),
    "打开失败"
  );
  assert.equal(lib.retryability, "retryable");
  assert.equal(lib.message, "素材库暂时不可用");

  const lease = contractErrorPresentation(
    new CutterApiError({ status: 409, code: "WORKSPACE_LEASE_UNAVAILABLE", message: "busy" }),
    "打开失败"
  );
  assert.equal(lease.code, "WORKSPACE_LEASE_UNAVAILABLE");
  assert.equal(lease.retryability, "retryable");

  const cut = contractErrorPresentation(
    new CutterApiError({ status: 500, code: "CUT_OUTPUT_MISMATCH", message: "short output" }),
    "剪切失败"
  );
  assert.equal(cut.message, "输出未通过完整性校验");
  assert.equal(cut.remediation, "复剪或查看诊断信息");
});

test("legacy backend codes and ambiguous HTTP status map onto stable codes", () => {
  const legacy = contractErrorPresentation(
    new CutterApiError({ status: 401, code: "login_required", message: "请登录" }),
    "打开失败"
  );
  assert.equal(legacy.code, "AUTH_REQUIRED");
  assert.equal(legacy.known, true);

  assert.equal(normalizeContractErrorCode({ code: "api_error", status: 500 }), "INTERNAL_ERROR");
  assert.equal(normalizeContractErrorCode({ status: 403 }), "AUTH_FORBIDDEN");
  assert.equal(normalizeContractErrorCode({ code: "NOT_A_CODE", status: 418 }), undefined);
});

test("server-provided remediation/retryable override the registry defaults", () => {
  const presentation = contractErrorPresentation(
    new CutterApiError({
      status: 500,
      code: "CUT_TIMEOUT",
      message: "timeout",
      remediation: "降低片段长度后重试",
      retryable: "never"
    }),
    "剪切失败"
  );
  assert.equal(presentation.message, "剪辑执行超时");
  assert.equal(presentation.remediation, "降低片段长度后重试");
  assert.equal(presentation.retryability, "never");
});

test("unknown codes keep the existing message and expose expandable details", () => {
  const unknown = contractErrorPresentation(
    new CutterApiError({ status: 502, code: "SOMETHING_NEW", message: "bad gateway" }),
    "打开失败"
  );
  assert.equal(unknown.known, false);
  assert.equal(unknown.message, "打开失败：bad gateway");
  assert.equal(unknown.remediation, "");
  assert.equal(unknown.retryability, "unknown");
  assert.equal(unknown.expandable, true);

  const plain = contractErrorPresentation(new Error("boom"), "打开失败");
  assert.equal(plain.known, false);
  assert.equal(plain.message, "打开失败：boom");
  assert.equal(plain.expandable, true);
});

test("auth-required detection and retryability labels", () => {
  assert.equal(isAuthRequiredError(new CutterApiError({ status: 401, code: "x", message: "x" })), true);
  assert.equal(isAuthRequiredError(new CutterApiError({ status: 200, code: "AUTH_REQUIRED", message: "x" })), true);
  assert.equal(isAuthRequiredError(new CutterApiError({ status: 500, code: "INTERNAL_ERROR", message: "x" })), false);
  assert.equal(isAuthRequiredError(new Error("x")), false);
  assert.equal(retryabilityLabel("retryable"), "可重试");
  assert.equal(retryabilityLabel("after-fix"), "处理后重试");
  assert.equal(retryabilityLabel("never"), "不可重试");
  assert.equal(retryabilityLabel("unknown"), "重试策略未知");

  const codePresentation = contractCodePresentation("CONTRACT_TOO_OLD");
  assert.equal(codePresentation?.code, "CONTRACT_TOO_OLD");
  assert.equal(codePresentation?.message, "客户端版本过低，请升级");
  assert.equal(contractCodePresentation("NOT_A_CODE"), null);
});
