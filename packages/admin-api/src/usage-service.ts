import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  USAGE_SERVICE_MAX_BATCH_EVENTS,
  USAGE_SERVICE_STORE_SCHEMA_VERSION,
  UsageServiceError,
  UsageServiceStore,
  acquireUsageServiceOwner
} from "../../library-fs/src/usage-service-store.ts";

const CONTRACT_VERSION = "1.0.0";
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/;

export interface CreateUsageServiceInput {
  state_root: string;
  client_token: string;
  admin_token?: string;
  /** Retention/capacity overrides (defaults: 180 days / 500k events; 0 = unlimited). */
  retention_days?: number;
  max_events?: number;
  /** Test/maintenance override for the /v1/metrics 200k guard. */
  max_query_events?: number;
}

export interface UsageServiceHandle {
  server: Server;
  store_id: string;
  close(): Promise<void>;
}

export interface UsageServiceIdentity {
  store_id: string;
  schema_version: string;
  contract_version: string;
}

function tokenEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, status: number, code: string, message: string): void {
  sendJson(response, status, { error: { code, message } });
}

function bearerToken(request: IncomingMessage): string {
  const authorization = String(request.headers.authorization ?? "");
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? "";
}

function isLoopbackRequest(request: IncomingMessage): boolean {
  const remoteAddress = (request.socket.remoteAddress ?? "").trim().toLowerCase();
  const host = String(request.headers.host ?? "").trim().toLowerCase();

  return LOOPBACK_ADDRESSES.has(remoteAddress) &&
    LOOPBACK_HOST_PATTERN.test(host) &&
    !request.headers.origin;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new UsageServiceError("BATCH_TOO_LARGE", "统计请求体超过 1MiB", 413);
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    throw new UsageServiceError("VALIDATION_FAILED", "统计请求体不能为空");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new UsageServiceError("VALIDATION_FAILED", "统计请求体必须是 JSON");
  }
}

function ingestEnvelopes(body: unknown): unknown[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UsageServiceError("VALIDATION_FAILED", "统计请求体必须是对象");
  }

  const record = body as Record<string, unknown>;

  if (record.schema_version !== "1.0") {
    throw new UsageServiceError("VALIDATION_FAILED", "统计批次 schema_version 必须是 1.0");
  }

  if (!Array.isArray(record.events)) {
    throw new UsageServiceError("VALIDATION_FAILED", "统计批次 events 必须是数组");
  }

  if (record.events.length === 0 || record.events.length > USAGE_SERVICE_MAX_BATCH_EVENTS) {
    throw new UsageServiceError(
      "BATCH_TOO_LARGE",
      "统计批次事件数必须在 1 到 " + USAGE_SERVICE_MAX_BATCH_EVENTS + " 之间",
      413
    );
  }

  return record.events;
}

function metricsQuery(searchParams: URLSearchParams): {
  from?: string;
  to?: string;
  user_id?: string;
  last_days?: number;
} {
  const query: { from?: string; to?: string; user_id?: string; last_days?: number } = {};
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const userId = searchParams.get("user_id")?.trim();
  const rawLastDays = searchParams.get("last_days")?.trim();

  if (from) {
    query.from = from;
  }
  if (to) {
    query.to = to;
  }
  if (userId) {
    query.user_id = userId;
  }
  if (rawLastDays) {
    if (!/^\d+$/.test(rawLastDays)) {
      throw new UsageServiceError("VALIDATION_FAILED", "last_days 必须是 1-3650 的整数");
    }
    query.last_days = Number.parseInt(rawLastDays, 10);
  }

  return query;
}

interface MaintenanceBody {
  mode: "dry-run" | "apply";
  retention_days?: number;
  max_events?: number;
  compact?: boolean;
}

function maintenanceBody(body: unknown): MaintenanceBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UsageServiceError("VALIDATION_FAILED", "维护请求必须是对象");
  }

  const record = body as Record<string, unknown>;
  const mode = record.mode;

  if (mode !== "dry-run" && mode !== "apply") {
    throw new UsageServiceError("VALIDATION_FAILED", "维护模式必须是 dry-run 或 apply");
  }

  const input: MaintenanceBody = { mode };

  for (const key of ["retention_days", "max_events"] as const) {
    const value = record[key];
    if (value === undefined) {
      continue;
    }
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new UsageServiceError("VALIDATION_FAILED", key + " 必须是非负整数");
    }
    input[key] = value as number;
  }

  if (record.compact !== undefined) {
    if (typeof record.compact !== "boolean") {
      throw new UsageServiceError("VALIDATION_FAILED", "compact 必须是布尔值");
    }
    input.compact = record.compact;
  }

  return input;
}

/**
 * Isolated usage service v1: loopback-only HTTP, bearer auth, private SQLite state.
 * This process is intentionally separate from admin-api (see scripts/servers/usage-service.ts).
 */
export async function createUsageService(input: CreateUsageServiceInput): Promise<UsageServiceHandle> {
  const clientToken = input.client_token.trim();
  const adminToken = (input.admin_token ?? "").trim() || clientToken;

  if (!clientToken) {
    throw new Error("统计服务需要非空客户端 token");
  }

  const unlock = await acquireUsageServiceOwner(input.state_root);
  let store: UsageServiceStore;

  try {
    store = new UsageServiceStore(input.state_root, {
      ...(input.retention_days !== undefined ? { retention_days: input.retention_days } : {}),
      ...(input.max_events !== undefined ? { max_events: input.max_events } : {}),
      ...(input.max_query_events !== undefined
        ? { max_query_events: input.max_query_events }
        : {})
    });
  } catch (error) {
    unlock();
    throw error;
  }

  const identity: UsageServiceIdentity = {
    store_id: store.id,
    schema_version: USAGE_SERVICE_STORE_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION
  };

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      if (error instanceof UsageServiceError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      sendError(response, 500, "INTERNAL_ERROR", "统计服务内部错误");
    });
  });

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isLoopbackRequest(request)) {
      sendError(response, 403, "local_only", "统计服务仅允许本机回环访问");
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const token = bearerToken(request);

    // Canonical service-local paths are /v1/*; keep `/usage/v1/*` as a compatibility alias so
    // clients ported from the isolation candidate (and future gateways) can use either prefix.
    const pathname = url.pathname.startsWith("/usage/v1/")
      ? url.pathname.slice("/usage".length)
      : url.pathname;

    if (request.method === "GET" && pathname === "/v1/identity") {
      if (!tokenEquals(token, clientToken)) {
        sendError(response, 401, "AUTH_REQUIRED", "统计服务令牌无效");
        return;
      }
      sendJson(response, 200, {
        store_id: store.id,
        schema_version: "1.0",
        contract_version: "1.0"
      });
      return;
    }

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/usage/health")) {
      sendJson(response, 200, {
        status: "ok",
        service: "mixlab-usage-service",
        ...identity
      });
      return;
    }

    if (request.method === "POST" && pathname === "/v1/events") {
      if (!tokenEquals(token, clientToken)) {
        sendError(response, 401, "AUTH_REQUIRED", "统计服务令牌无效");
        return;
      }

      const expectedStoreId = String(request.headers["x-mixlab-usage-store"] ?? "").trim();

      if (expectedStoreId && expectedStoreId !== store.id) {
        sendError(response, 409, "usage_destination_changed", "统计服务身份已变化");
        return;
      }

      const events = ingestEnvelopes(await readJsonBody(request));
      sendJson(response, 200, store.ingest(events));
      return;
    }

    if (request.method === "GET" && pathname === "/v1/metrics") {
      if (!tokenEquals(token, adminToken)) {
        sendError(response, 403, "admin_required", "统计指标需要管理令牌");
        return;
      }

      sendJson(response, 200, store.metrics(metricsQuery(url.searchParams)));
      return;
    }

    if (request.method === "POST" && pathname === "/v1/maintenance") {
      if (!tokenEquals(token, adminToken)) {
        sendError(response, 403, "admin_required", "统计维护需要管理令牌");
        return;
      }

      const body = maintenanceBody(await readJsonBody(request));
      const maintenance = store.prune({
        mode: body.mode,
        ...(body.retention_days !== undefined ? { retention_days: body.retention_days } : {}),
        ...(body.max_events !== undefined ? { max_events: body.max_events } : {}),
        ...(body.compact ? { compact: true } : {})
      });
      sendJson(response, 200, {
        store_id: store.id,
        maintenance
      });
      return;
    }

    sendError(response, 404, "route_missing", "统计服务路由不存在");
  }

  let closed = false;

  return {
    server,
    store_id: store.id,
    async close() {
      if (closed) {
        return;
      }
      closed = true;

      try {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        }
      } finally {
        store.close();
        unlock();
      }
    }
  };
}
