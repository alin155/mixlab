import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerNasUgosApiPreflightReport,
  toMarkdown
} from "./admin-docker-nas-ugos-api-preflight.ts";

function probe(input: {
  name: string;
  path?: string;
  expectedJson?: boolean;
  http?: number | null;
  code?: string;
  message?: string;
  shape?: string;
  error?: string;
}) {
  return {
    name: input.name,
    path: input.path ?? `/ugreen/${input.name}`,
    expected_json: input.expectedJson ?? true,
    notes: "test probe",
    url: `http://192.168.1.27:9999${input.path ?? `/ugreen/${input.name}`}`,
    status: input.error ? "error" as const : "ok" as const,
    duration_ms: 1,
    http_status: input.http ?? 200,
    content_type: input.expectedJson === false ? "text/html" : "application/json",
    response_bytes: input.expectedJson === false ? 3000 : 100,
    api_code: input.code ?? "",
    api_message: input.message ?? "",
    data_shape: input.shape ?? "object(no-keys)",
    error: input.error ?? ""
  };
}

function report(input: {
  loginCode?: string;
  loginMessage?: string;
  dockerUidCode?: string;
  dockerUidMessage?: string;
  containerListCode?: string;
  containerListMessage?: string;
  containerListV2Code?: string;
  containerListV2Message?: string;
  overviewCode?: string;
  overviewMessage?: string;
  cookiePresent?: boolean;
  queryTokenPresent?: boolean;
} = {}) {
  return buildAdminDockerNasUgosApiPreflightReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    base_url: "http://192.168.1.27:9999",
    normalized_base_url: "http://192.168.1.27:9999",
    auth_header_inputs: {
      cookie_present: input.cookiePresent ?? false,
      query_token_present: input.queryTokenPresent ?? false,
      x_ugreen_auth_present: false,
      authorization_present: false
    },
    probes: [
      probe({ name: "desktop_html", path: "/desktop/", expectedJson: false, http: 200, shape: "html" }),
      probe({
        name: "verify_is_login",
        code: input.loginCode ?? "1024",
        message: input.loginMessage ?? "Login has expired, please login again!"
      }),
      probe({ name: "current_user", code: input.loginCode ?? "1024", message: input.loginMessage ?? "Login has expired, please login again!" }),
      probe({
        name: "docker_app_uid",
        code: input.dockerUidCode ?? "1024",
        message: input.dockerUidMessage ?? "Login has expired, please login again!"
      }),
      probe({
        name: "docker_container_list",
        code: input.containerListCode ?? "9405",
        message: input.containerListMessage ?? "",
        shape: "object(app_id)"
      }),
      probe({
        name: "docker_container_list_v2",
        path: "/ugreen/v1/docker/container/ContainerListV2",
        code: input.containerListV2Code ?? input.loginCode ?? "1024",
        message: input.containerListV2Message ?? input.loginMessage ?? "Login has expired, please login again!",
        shape: "object(originalTotal,result,total)"
      }),
      probe({
        name: "docker_overview",
        path: "/ugreen/v1/docker/view/ObtainOverviewInfo",
        code: input.overviewCode ?? input.loginCode ?? "1024",
        message: input.overviewMessage ?? input.loginMessage ?? "Login has expired, please login again!",
        shape: "object(containerCount,runContainerCount,status)"
      }),
      probe({ name: "filemgr_share_list", code: input.loginCode ?? "1024", message: input.loginMessage ?? "Login has expired, please login again!" }),
      probe({ name: "machine_common", code: input.loginCode ?? "1024", message: input.loginMessage ?? "Login has expired, please login again!" })
    ]
  });
}

test("UGOS API preflight stays blocked when session is expired", () => {
  const built = report();

  assert.equal(built.result.status, "blocked");
  assert.equal(built.direct_ugos_collection_available, false);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.docker_runtime_touched, false);
  assert.ok(built.summary.browserless_collection_blockers.includes("ugos-session-authenticated"));
  assert.ok(built.summary.browserless_collection_blockers.includes("docker-app-context-ready"));
  assert.ok(built.summary.browserless_collection_blockers.includes("docker-container-list-readable"));
});

test("UGOS API preflight does not treat Docker app context error as collection ready", () => {
  const built = report({
    loginCode: "200",
    loginMessage: "ok",
    dockerUidCode: "9405",
    dockerUidMessage: "",
    containerListCode: "9405",
    containerListMessage: "",
    containerListV2Code: "1024",
    containerListV2Message: "Login has expired, please login again!",
    overviewCode: "1024",
    overviewMessage: "Login has expired, please login again!"
  });

  assert.equal(built.direct_ugos_collection_available, false);
  assert.ok(!built.summary.browserless_collection_blockers.includes("ugos-session-authenticated"));
  assert.ok(built.summary.browserless_collection_blockers.includes("docker-app-context-ready"));
  assert.ok(built.summary.browserless_collection_blockers.includes("docker-container-list-readable"));
});

test("UGOS API preflight can become browserless-collection-ready with authenticated Docker reads", () => {
  const built = report({
    loginCode: "200",
    loginMessage: "ok",
    dockerUidCode: "200",
    dockerUidMessage: "ok",
    containerListCode: "9405",
    containerListMessage: "",
    containerListV2Code: "200",
    containerListV2Message: "ok",
    overviewCode: "200",
    overviewMessage: "ok",
    queryTokenPresent: true
  });

  assert.equal(built.result.status, "browserless-collection-ready");
  assert.equal(built.direct_ugos_collection_available, true);
  assert.equal(built.summary.browserless_collection_blockers.length, 0);
  assert.equal(built.docker_deploy_allowed, false);
});

test("UGOS API preflight ignores legacy ContainerList when Docker app V2 list is readable", () => {
  const built = report({
    loginCode: "200",
    loginMessage: "ok",
    dockerUidCode: "200",
    dockerUidMessage: "ok",
    containerListCode: "9405",
    containerListMessage: "",
    containerListV2Code: "200",
    containerListV2Message: "ok",
    overviewCode: "200",
    overviewMessage: "ok",
    queryTokenPresent: true
  });

  assert.equal(built.direct_ugos_collection_available, true);
  assert.ok(!built.summary.browserless_collection_blockers.includes("docker-container-list-readable"));
});

test("UGOS API preflight markdown records safety boundary without auth values", () => {
  const markdown = toMarkdown(report({ cookiePresent: true, queryTokenPresent: true }));

  assert.match(markdown, /read-only/i);
  assert.match(markdown, /does not log in/i);
  assert.match(markdown, /Cookie present: yes/);
  assert.match(markdown, /Query token present: yes/);
  assert.match(markdown, /Push execution allowed: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.equal(markdown.includes(["Cookie", ":"].join("")), false);
  assert.doesNotMatch(markdown, /token=secret-token/);
  assert.doesNotMatch(markdown, /super-secret-password/);
});
