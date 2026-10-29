import assert from "node:assert/strict";
import test from "node:test";
import { CutterApiError } from "../api.ts";
import {
  MATERIAL_SEARCH_TIMEOUT_NOTICE,
  shouldClearCutterSessionForApiError,
  userFacingErrorMessage
} from "./notice.ts";

test("userFacingErrorMessage keeps the action context and the technical detail", () => {
  assert.equal(
    userFacingErrorMessage(new Error("boom"), "打开文件目录失败"),
    "打开文件目录失败：boom"
  );
  assert.equal(userFacingErrorMessage(new Error("   "), "打开文件目录失败"), "打开文件目录失败");
  assert.equal(userFacingErrorMessage("plain string", "删除本地素材失败"), "删除本地素材失败");
  assert.equal(userFacingErrorMessage(undefined, "删除本地素材失败"), "删除本地素材失败");
  assert.equal(
    userFacingErrorMessage(new Error("打开文件目录失败"), "打开文件目录失败"),
    "打开文件目录失败"
  );
  assert.equal(
    userFacingErrorMessage(new Error("打开文件目录失败：权限不足"), "打开文件目录失败"),
    "打开文件目录失败：权限不足"
  );
});

test("userFacingErrorMessage maps expired sessions to an actionable login message", () => {
  const expired = new CutterApiError({
    status: 401,
    code: "login_required",
    message: "session expired"
  });
  assert.equal(userFacingErrorMessage(expired, "重试剪切任务失败"), "登录已失效，请重新登录后再试。");

  const serverError = new CutterApiError({
    status: 500,
    code: "api_error",
    message: "internal error"
  });
  assert.equal(
    userFacingErrorMessage(serverError, "重试剪切任务失败"),
    "重试剪切任务失败：internal error"
  );
});

test("material search timeout notice is user-facing Chinese", () => {
  assert.match(MATERIAL_SEARCH_TIMEOUT_NOTICE, /搜索响应较慢/);
  assert.match(MATERIAL_SEARCH_TIMEOUT_NOTICE, /重试/);
});

test("expired-session errors are detected so the app can clear the session", () => {
  assert.equal(
    shouldClearCutterSessionForApiError(
      new CutterApiError({ status: 401, code: "api_error", message: "unauthorized" })
    ),
    true
  );
  assert.equal(
    shouldClearCutterSessionForApiError(
      new CutterApiError({ status: 400, code: "login_required", message: "login required" })
    ),
    true
  );
  assert.equal(
    shouldClearCutterSessionForApiError(
      new CutterApiError({ status: 401, code: "AUTH_REQUIRED", message: "session expired" })
    ),
    true
  );
  assert.equal(
    shouldClearCutterSessionForApiError(
      new CutterApiError({ status: 500, code: "api_error", message: "boom" })
    ),
    false
  );
  assert.equal(shouldClearCutterSessionForApiError(new Error("network")), false);
  assert.equal(shouldClearCutterSessionForApiError(null), false);
});
