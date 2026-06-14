import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_QUERY = "现金流";
const DEFAULT_REPORT_PATH = "docs/acceptance/artifacts/local-web-fast-path.json";

interface TimedResult<T> {
  value: T;
  ms: number;
}

interface ApiEnvelope<T> {
  data: T;
}

interface SearchHitSegment {
  segment_id: string;
  begin_ms: number;
  end_ms: number;
  text: string;
}

interface SearchGroup {
  source_video_id: string;
  title: string;
  hit_count: number;
  hit_segments: SearchHitSegment[];
}

interface SourceVideoDetail {
  source_video_id: string;
  title: string;
  source_video_file_path?: string;
  transcript: {
    full_text?: string;
    segments: SearchHitSegment[];
  };
}

function envUrl(name: string, fallback: string): string {
  return (process.env[name]?.trim() || fallback).replace(/\/+$/, "");
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const started = performance.now();
  const value = await fn();
  return {
    value,
    ms: Math.round(performance.now() - started)
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url} returned non-JSON: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  return parsed as T;
}

function apiData<T>(body: ApiEnvelope<T>): T {
  assert.ok(body && typeof body === "object" && "data" in body, "API response must contain data");
  return body.data;
}

async function fileProof(filePath: string): Promise<{ exists: boolean; size_bytes: number }> {
  try {
    const info = await stat(filePath);
    return {
      exists: true,
      size_bytes: info.size
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        exists: false,
        size_bytes: 0
      };
    }
    throw error;
  }
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function checkRoute(input: {
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;
  url: string;
  selector: string;
  slaMs: number;
}): Promise<{ url: string; load_ms: number; horizontal_overflow_px: number }> {
  const load = await timed(async () => {
    await input.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: input.slaMs + 10_000 });
    await input.page.waitForSelector(input.selector, { timeout: input.slaMs + 10_000 });
  });
  const horizontalOverflow = await input.page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );

  return {
    url: input.url,
    load_ms: load.ms,
    horizontal_overflow_px: horizontalOverflow
  };
}

async function run(): Promise<void> {
  const adminApiBaseUrl = envUrl("MIXLAB_ADMIN_API_URL", envUrl("MIXLAB_ADMIN_API_BASE_URL", "http://127.0.0.1:3889"));
  const cutterApiBaseUrl = envUrl("MIXLAB_CUTTER_API_URL", envUrl("MIXLAB_CUTTER_API_BASE_URL", "http://127.0.0.1:3789"));
  const searchdBaseUrl = envUrl("MIXLAB_SEARCHD_URL", envUrl("MIXLAB_SEARCHD_BASE_URL", "http://127.0.0.1:3799"));
  const adminWebBaseUrl = envUrl("MIXLAB_ADMIN_WEB_BASE_URL", envUrl("MIXLAB_ADMIN_WEB_URL", "http://127.0.0.1:5176"));
  const cutterWebBaseUrl = envUrl("MIXLAB_CUTTER_WEB_BASE_URL", envUrl("MIXLAB_CUTTER_WEB_URL", "http://127.0.0.1:5177"));
  const query = process.env.MIXLAB_LOCAL_WEB_FAST_PATH_QUERY?.trim() || DEFAULT_QUERY;
  const reportPath = process.env.MIXLAB_LOCAL_WEB_FAST_PATH_REPORT?.trim() || DEFAULT_REPORT_PATH;
  const apiSlaMs = envNumber("MIXLAB_LOCAL_WEB_API_SLA_MS", 1_000);
  const cutSlaMs = envNumber("MIXLAB_LOCAL_WEB_CUT_SLA_MS", 10_000);
  const routeSlaMs = envNumber("MIXLAB_LOCAL_WEB_ROUTE_SLA_MS", 1_000);

  const adminStatus = await timed(async () =>
    apiData<Record<string, unknown>>(await fetchJson(`${adminApiBaseUrl}/api/admin/library/status`))
  );
  const endpoints = await Promise.all([
    Promise.resolve({ value: adminStatus.value, ms: adminStatus.ms }),
    timed(() => fetchJson(`${cutterApiBaseUrl}/health`)),
    timed(() => fetchJson(`${searchdBaseUrl}/health`))
  ]);
  const adminFirstPage = await timed(async () =>
    apiData<Record<string, unknown>>(await fetchJson(`${adminApiBaseUrl}/api/admin/source-videos?limit=20`))
  );
  const runtime = await timed(async () =>
    apiData<Record<string, unknown>>(await fetchJson(`${cutterApiBaseUrl}/cutter/runtime-status`))
  );
  const library = await timed(async () =>
    apiData<Record<string, unknown>>(await fetchJson(`${cutterApiBaseUrl}/cutter/source-library?limit=20`))
  );
  const search = await timed(async () =>
    apiData<Record<string, unknown>>(
      await fetchJson(`${cutterApiBaseUrl}/cutter/source-search?query=${encodeURIComponent(query)}&limit=10`)
    )
  );

  const groups = Array.isArray(search.value.groups) ? search.value.groups as SearchGroup[] : [];
  assert.ok(groups.length > 0, "source search must return at least one public source group");
  const group = groups.find((item) => item.hit_segments?.length > 0) ?? groups[0]!;
  const segment = group.hit_segments[0]!;

  const detail = await timed(async () =>
    apiData<SourceVideoDetail>(await fetchJson(`${cutterApiBaseUrl}/cutter/source-videos/${group.source_video_id}`))
  );
  assert.equal(detail.value.source_video_id, group.source_video_id);
  assert.ok(detail.value.transcript.segments.length > 0, "selected source must return transcript segments");
  assert.ok(
    detail.value.transcript.segments.length >= group.hit_segments.length,
    "selected source detail should include the complete transcript, not only search hits"
  );

  const detailSegment = detail.value.transcript.segments.find((item) => item.segment_id === segment.segment_id)
    ?? detail.value.transcript.segments[0]!;
  const selectedText = detailSegment.text.trim();
  assert.ok(selectedText.length > 0, "selected transcript text must be non-empty");

  const cut = await timed(async () =>
    apiData<Record<string, unknown>>(
      await fetchJson(`${cutterApiBaseUrl}/cutter/local-clips`, {
        method: "POST",
        body: JSON.stringify({
          source_video_id: detail.value.source_video_id,
          start_segment_id: detailSegment.segment_id,
          end_segment_id: detailSegment.segment_id,
          begin_ms: detailSegment.begin_ms,
          end_ms: detailSegment.end_ms,
          selected_text: selectedText,
          cut_mode: "copy",
          title: `auto-smoke-${nowIso()}`
        })
      })
    )
  );

  const mediaFilePath = String(cut.value.media_file_path ?? cut.value.file_path ?? "");
  const mediaProof = mediaFilePath ? await fileProof(mediaFilePath) : { exists: false, size_bytes: 0 };
  const runtimeLibraryRoot = String(runtime.value.library_root_path ?? "");
  assert.ok(mediaProof.exists && mediaProof.size_bytes > 0, "local cut output file must exist and be non-empty");
  assert.ok(
    !runtimeLibraryRoot || !isInsidePath(runtimeLibraryRoot, mediaFilePath),
    "local cut output must not be written into the public library"
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const adminDashboardRoute = await checkRoute({
    page,
    url: `${adminWebBaseUrl}/#/dashboard`,
    selector: ".admin-shell, .ml-shell, main",
    slaMs: routeSlaMs
  });
  const cutterHomeRoute = await checkRoute({
    page,
    url: `${cutterWebBaseUrl}/#/project-home`,
    selector: ".cutter-shell, .cutter-page, main",
    slaMs: routeSlaMs
  });
  const cutterSearchRoute = await checkRoute({
    page,
    url: `${cutterWebBaseUrl}/#/material-locator?query=${encodeURIComponent(query)}`,
    selector: ".cutter-material-locator, .cutter-page, main",
    slaMs: routeSlaMs
  });
  await browser.close();

  const report = {
    status: "passed",
    generated_at: nowIso(),
    endpoints: {
      admin_api_health_ms: endpoints[0]!.ms,
      cutter_api_health_ms: endpoints[1]!.ms,
      searchd_health_ms: endpoints[2]!.ms
    },
    admin: {
      status_ms: adminStatus.ms,
      source_videos_first_page_ms: adminFirstPage.ms,
      current_index_version: String(adminStatus.value.current_index_version ?? ""),
      ready_video_count: Number(adminStatus.value.ready_video_count ?? 0),
      source_videos_first_page_count: Array.isArray(adminFirstPage.value)
        ? adminFirstPage.value.length
        : Array.isArray(adminFirstPage.value.items)
        ? adminFirstPage.value.items.length
        : Array.isArray(adminFirstPage.value.source_videos)
          ? adminFirstPage.value.source_videos.length
          : 0
    },
    cutter: {
      runtime_ms: runtime.ms,
      library_first_page_ms: library.ms,
      search_ms: search.ms,
      detail_ms: detail.ms,
      cut_ms: cut.ms,
      query,
      release_cache: runtime.value.release_cache,
      search_backend: runtime.value.search_backend,
      available_video_count: Number(runtime.value.available_video_count ?? 0),
      library_first_page_count: Array.isArray(library.value.videos) ? library.value.videos.length : 0,
      search_mode: String(search.value.search_mode ?? ""),
      search_index_version: String(search.value.index_version ?? ""),
      search_group_count: groups.length,
      selected_source_video_id: detail.value.source_video_id,
      selected_source_title: detail.value.title,
      full_transcript_segment_count: detail.value.transcript.segments.length,
      selected_segment_id: detailSegment.segment_id,
      selected_text_char_count: selectedText.length,
      local_clip_id: String(cut.value.local_clip_id ?? ""),
      local_clip_media_file_path: mediaFilePath,
      local_clip_media_file_size_bytes: mediaProof.size_bytes,
      local_output_is_outside_public_library: !runtimeLibraryRoot || !isInsidePath(runtimeLibraryRoot, mediaFilePath)
    },
    web_routes: {
      admin_dashboard: adminDashboardRoute,
      cutter_project_home: cutterHomeRoute,
      cutter_material_locator: cutterSearchRoute
    },
    sla: {
      api_sla_ms: apiSlaMs,
      cut_sla_ms: cutSlaMs,
      route_sla_ms: routeSlaMs
    }
  };

  const failures = [
    ["admin status", adminStatus.ms, apiSlaMs],
    ["admin source videos first page", adminFirstPage.ms, apiSlaMs],
    ["cutter runtime", runtime.ms, apiSlaMs],
    ["cutter source library first page", library.ms, apiSlaMs],
    ["cutter source search", search.ms, apiSlaMs],
    ["cutter source detail", detail.ms, apiSlaMs],
    ["cutter local cut", cut.ms, cutSlaMs],
    ["admin dashboard route", adminDashboardRoute.load_ms, routeSlaMs],
    ["cutter home route", cutterHomeRoute.load_ms, routeSlaMs],
    ["cutter material locator route", cutterSearchRoute.load_ms, routeSlaMs]
  ].filter(([, value, limit]) => Number(value) > Number(limit));

  assert.equal(String((runtime.value.search_backend as Record<string, unknown> | undefined)?.mode ?? ""), "searchd");
  assert.equal(String(search.value.search_mode ?? ""), "searchd");
  assert.ok(Number(runtime.value.available_video_count ?? 0) > 0, "cutter runtime must expose available public videos");
  assert.ok(failures.length === 0, `SLA exceeded: ${failures.map(([label, value, limit]) => `${label} ${value}ms>${limit}ms`).join("; ")}`);

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
