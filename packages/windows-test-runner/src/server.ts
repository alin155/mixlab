import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { DEFAULT_MAX_BODY_BYTES } from "./config.ts";
import { readRunReport, serializeRunReport } from "./report.ts";
import { RunStore } from "./run-store.ts";
import type { RunnerConfig, RunRequest } from "./types.ts";

const SUPPORTED_SUITES = [
  "probe_api",
  "launch_app_probe",
  "launch_runner",
  "app_runtime_smoke",
  "real_data_smoke",
  "cache_smoke",
  "real_cut_smoke",
  "m19_runtime_foundation",
  "windows_acceptance",
  "desktop_ui_screenshot_smoke",
  "desktop_incident_diagnostics",
  "install_latest_and_smoke"
] as const;

/** Suites that kill processes, install software or touch a real workspace/library. */
export const DESTRUCTIVE_SUITES: ReadonlySet<string> = new Set([
  "real_cut_smoke",
  "windows_acceptance",
  "desktop_ui_screenshot_smoke",
  "desktop_incident_diagnostics",
  "install_latest_and_smoke"
]);

export class RunnerHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "RunnerHttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function headerValue(request: IncomingMessage, name: string): string {
  const raw = request.headers[name];
  if (Array.isArray(raw)) {
    return raw[0]?.trim() ?? "";
  }
  return typeof raw === "string" ? raw.trim() : "";
}

function requestAuthToken(request: IncomingMessage): string {
  const direct = headerValue(request, "x-mixlab-runner-token");
  if (direct) {
    return direct;
  }
  const authorization = headerValue(request, "authorization");
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? "";
}

function tokensEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function remoteAddressIsLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

export function isAuthorizedRunnerRequest(request: IncomingMessage, config: RunnerConfig): boolean {
  if (config.auth_token) {
    const token = requestAuthToken(request);
    return token.length > 0 && tokensEqual(token, config.auth_token);
  }
  return remoteAddressIsLoopback(request);
}

export function isAllowedRunnerOrigin(request: IncomingMessage, config: RunnerConfig): boolean {
  const origin = headerValue(request, "origin");
  if (!origin) {
    return true;
  }
  if ((config.allowed_origins ?? []).includes(origin)) {
    return true;
  }
  return isLoopbackOrigin(origin);
}

export function evaluateRunRequestSecurity(
  body: unknown,
  config: RunnerConfig
):
  | { ok: true; request: RunRequest }
  | { ok: false; statusCode: number; code: string; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, statusCode: 400, code: "invalid_request", message: "Request body must be a JSON object." };
  }
  const candidate = body as Record<string, unknown>;
  const suite = candidate.suite;
  if (typeof suite !== "string" || !SUPPORTED_SUITES.some((supported) => supported === suite)) {
    return {
      ok: false,
      statusCode: 400,
      code: "unsupported_suite",
      message: `Unsupported or invalid run request. Supported suites: ${SUPPORTED_SUITES.join(", ")}.`
    };
  }
  if (candidate.options !== undefined && (typeof candidate.options !== "object" || candidate.options === null || Array.isArray(candidate.options))) {
    return { ok: false, statusCode: 400, code: "invalid_options", message: "options must be a JSON object." };
  }
  if (candidate.confirm !== undefined && typeof candidate.confirm !== "boolean") {
    return { ok: false, statusCode: 400, code: "invalid_confirm", message: "confirm must be a boolean." };
  }
  const requireConfirm = config.require_destructive_confirm ?? false;
  if (requireConfirm && DESTRUCTIVE_SUITES.has(suite) && candidate.confirm !== true) {
    return {
      ok: false,
      statusCode: 400,
      code: "confirm_required",
      message: `Suite ${suite} can stop processes, install software or touch a real workspace. Resubmit with "confirm": true.`
    };
  }
  const request: RunRequest = {
    suite: suite as RunRequest["suite"],
    ...(candidate.options === undefined ? {} : { options: candidate.options as Record<string, unknown> }),
    ...(candidate.confirm === undefined ? {} : { confirm: candidate.confirm as boolean })
  };
  return { ok: true, request };
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(headerValue(request, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RunnerHttpError(413, "request_body_too_large", `Request body exceeds ${maxBytes} bytes.`);
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBytes) {
      throw new RunnerHttpError(413, "request_body_too_large", `Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RunnerHttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

export function createWindowsTestRunnerServer(config: RunnerConfig): {
  server: Server;
  store: RunStore;
} {
  const store = new RunStore(config);
  const maxBodyBytes = config.max_body_bytes ?? DEFAULT_MAX_BODY_BYTES;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const method = request.method ?? "GET";

      // Health is the only unauthenticated endpoint and exposes no sensitive data.
      if (method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, {
          ok: true,
          runner: "mixlab-windows-test-runner",
          runner_version: config.runner_version
        });
        return;
      }

      if (!isAuthorizedRunnerRequest(request, config)) {
        throw new RunnerHttpError(
          401,
          "unauthorized",
          "Runner requires authentication. Set Authorization: Bearer <MIXLAB_WINDOWS_TEST_RUNNER_TOKEN>."
        );
      }
      if (!isAllowedRunnerOrigin(request, config)) {
        throw new RunnerHttpError(403, "origin_not_allowed", "Request origin is not allowed.");
      }

      if (method === "GET" && url.pathname === "/version") {
        writeJson(response, 200, {
          runner_version: config.runner_version
        });
        return;
      }

      if (method === "GET" && url.pathname === "/status") {
        writeJson(response, 200, store.getStatus());
        return;
      }

      if (method === "POST" && url.pathname === "/runs") {
        const body = await readJsonBody(request, maxBodyBytes);
        const evaluation = evaluateRunRequestSecurity(body, config);
        if (!evaluation.ok) {
          writeJson(response, evaluation.statusCode, {
            ok: false,
            code: evaluation.code,
            error: evaluation.message
          });
          return;
        }
        const record = store.createRun(evaluation.request);
        writeJson(response, 202, {
          ok: true,
          run: store.toSummary(record)
        });
        return;
      }

      const runMatch = /^\/runs\/([^/]+)(?:\/(report))?$/.exec(url.pathname);
      if (method === "GET" && runMatch) {
        const run = store.getRun(decodeURIComponent(runMatch[1] ?? ""));
        if (!run) {
          writeJson(response, 404, { ok: false, code: "run_not_found", error: "Run not found." });
          return;
        }
        if (runMatch[2] === "report") {
          const report = await readRunReport(run.report_dir);
          if (!report && (run.status === "passed" || run.status === "failed" || run.status === "cancelled")) {
            writeJson(response, 200, serializeRunReport(run));
            return;
          }
          writeJson(response, report ? 200 : 202, report ?? {
            ok: false,
            status: run.status,
            message: "Report is not ready yet."
          });
          return;
        }
        writeJson(response, 200, {
          ok: true,
          run
        });
        return;
      }

      writeJson(response, 404, {
        ok: false,
        code: "not_found",
        error: "Not found."
      });
    } catch (error) {
      if (error instanceof RunnerHttpError) {
        writeJson(response, error.statusCode, {
          ok: false,
          code: error.code,
          error: error.message
        });
        return;
      }
      console.error("MixLab Windows Test Runner request failed.");
      console.error(error);
      writeJson(response, 500, {
        ok: false,
        code: "internal_error",
        error: "Runner internal error."
      });
    }
  });
  return { server, store };
}
