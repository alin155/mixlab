import type { ApiProbeResult, FailureCategory, ProbeApiReport } from "../types.ts";

const PROBES: Array<{ id: string; path: string }> = [
  { id: "health", path: "/health" },
  { id: "auth_mode", path: "/cutter/auth/mode" },
  { id: "runtime_status", path: "/cutter/runtime-status" },
  { id: "source_library_first_page", path: "/cutter/source-library?limit=20" }
];

function buildUrl(baseUrl: string, pathName: string): string {
  return new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 1000);
  }
}

function hasNonEmptySourceLibrary(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const root = body as Record<string, unknown>;
  const value = root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : root;
  const items = value.items ?? value.videos ?? value.source_videos;
  if (Array.isArray(items)) {
    return items.length > 0;
  }
  const total = value.total ?? value.total_count ?? value.count ?? value.available_video_count;
  return typeof total === "number" && total > 0;
}

async function probeEndpoint(input: {
  id: string;
  path: string;
  baseUrl: string;
  timeoutMs: number;
}): Promise<ApiProbeResult> {
  const url = buildUrl(input.baseUrl, input.path);
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await readResponseBody(response);
    return {
      id: input.id,
      path: input.path,
      url,
      ok: response.ok,
      status_code: response.status,
      elapsed_ms: Date.now() - started,
      body
    };
  } catch (error) {
    return {
      id: input.id,
      path: input.path,
      url,
      ok: false,
      status_code: null,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runProbeApi(input: {
  apiBaseUrl: string;
  timeoutMs?: number;
}): Promise<{
  report: ProbeApiReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const timeoutMs = input.timeoutMs ?? 5000;
  const probes: ApiProbeResult[] = [];
  for (const probe of PROBES) {
    probes.push(await probeEndpoint({
      id: probe.id,
      path: probe.path,
      baseUrl: input.apiBaseUrl,
      timeoutMs
    }));
  }

  const health = probes.find((probe) => probe.id === "health");
  const auth = probes.find((probe) => probe.id === "auth_mode");
  const sourceLibrary = probes.find((probe) => probe.id === "source_library_first_page");
  let failureCategory: FailureCategory | undefined;
  let failureMessage: string | undefined;

  if (!health?.ok) {
    failureCategory = "api_health_timeout";
    failureMessage = health?.error ?? `Health probe failed with status ${health?.status_code ?? "n/a"}`;
  } else if (auth?.status_code === 401 || auth?.status_code === 403) {
    failureCategory = "api_auth_failure";
    failureMessage = `Auth probe failed with status ${auth.status_code}`;
  } else if (!sourceLibrary?.ok) {
    failureCategory = "real_data_unavailable";
    failureMessage = sourceLibrary?.error ?? `Source library probe failed with status ${sourceLibrary?.status_code ?? "n/a"}`;
  } else if (!hasNonEmptySourceLibrary(sourceLibrary.body)) {
    failureCategory = "real_data_unavailable";
    failureMessage = "Source library returned no visible items or total count.";
  }

  return {
    report: {
      api_base_url: input.apiBaseUrl,
      probes
    },
    passed: !failureCategory,
    failure_category: failureCategory,
    failure_message: failureMessage
  };
}
