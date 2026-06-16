import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readRunReport } from "./report.ts";
import { RunStore } from "./run-store.ts";
import type { RunnerConfig, RunRequest } from "./types.ts";

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function isRunRequest(value: unknown): value is RunRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.suite === "probe_api";
}

export function createWindowsTestRunnerServer(config: RunnerConfig): {
  server: Server;
  store: RunStore;
} {
  const store = new RunStore(config);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, {
          ok: true,
          runner: "mixlab-windows-test-runner",
          runner_version: config.runner_version
        });
        return;
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
        const body = await readJsonBody(request);
        if (!isRunRequest(body)) {
          writeJson(response, 400, {
            ok: false,
            error: "Unsupported or invalid run request. Phase 1 supports suite=probe_api."
          });
          return;
        }
        const record = store.createRun(body);
        writeJson(response, 202, {
          ok: true,
          run: store.toSummary(record)
        });
        return;
      }

      const runMatch = /^\/runs\/([^/]+)(?:\/(report))?$/.exec(url.pathname);
      if (method === "GET" && runMatch) {
        const run = store.getRun(decodeURIComponent(runMatch[1]));
        if (!run) {
          writeJson(response, 404, { ok: false, error: "Run not found." });
          return;
        }
        if (runMatch[2] === "report") {
          const report = await readRunReport(run.report_dir);
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
        error: "Not found."
      });
    } catch (error) {
      writeJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  return { server, store };
}
