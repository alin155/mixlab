import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_REPORT_PATH = "docs/acceptance/artifacts/local-web-stability.json";
const DEFAULT_QUERY = "第一场";

interface ApiEnvelope<T> {
  data: T;
}

interface TimedResult<T> {
  value: T;
  ms: number;
}

interface RuntimeStatus {
  library_root_path?: string;
  available_video_count?: number;
  search_backend?: {
    mode?: string;
    index_version?: string;
    response_ms?: number;
  };
  release_cache?: {
    ready?: boolean;
    active_release_version?: string;
    ready_video_count?: number;
    cache_size_bytes?: number;
  };
  local_cache?: {
    thumbnail_cache_size_bytes?: number;
    thumbnail_cache_manifest_entry_count?: number;
    thumbnail_cache_checksum_entry_count?: number;
    cut_temp_cache?: {
      size_bytes?: number;
      file_count?: number;
      max_bytes?: number;
    };
  };
  source_video_preflight?: {
    status?: string;
    checked_count?: number;
    readable_count?: number;
    probe_count?: number;
    probe_readable_count?: number;
  };
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
  relative_path?: string;
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
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function envQueries(): string[] {
  const raw = process.env.MIXLAB_LOCAL_WEB_STABILITY_QUERIES?.trim();
  const queries = raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [DEFAULT_QUERY];
  return queries.length > 0 ? queries : [DEFAULT_QUERY];
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

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index]!;
}

function max(values: number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
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

function cutTempSnapshot(runtime: RuntimeStatus): { size_bytes: number; file_count: number; max_bytes: number } {
  return {
    size_bytes: Number(runtime.local_cache?.cut_temp_cache?.size_bytes ?? 0),
    file_count: Number(runtime.local_cache?.cut_temp_cache?.file_count ?? 0),
    max_bytes: Number(runtime.local_cache?.cut_temp_cache?.max_bytes ?? 0)
  };
}

function thumbnailSnapshot(runtime: RuntimeStatus): {
  size_bytes: number;
  manifest_entries: number;
  checksum_entries: number;
} {
  return {
    size_bytes: Number(runtime.local_cache?.thumbnail_cache_size_bytes ?? 0),
    manifest_entries: Number(runtime.local_cache?.thumbnail_cache_manifest_entry_count ?? 0),
    checksum_entries: Number(runtime.local_cache?.thumbnail_cache_checksum_entry_count ?? 0)
  };
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
  const searchdBaseUrl = envUrl("MIXLAB_SEARCHD_URL", envUrl("MIXLAB_SEARCHD_BASE_URL", "http://127.0.0.1:3790"));
  const adminWebBaseUrl = envUrl("MIXLAB_ADMIN_WEB_BASE_URL", envUrl("MIXLAB_ADMIN_WEB_URL", "http://127.0.0.1:5176"));
  const cutterWebBaseUrl = envUrl("MIXLAB_CUTTER_WEB_BASE_URL", envUrl("MIXLAB_CUTTER_WEB_URL", "http://127.0.0.1:5177"));
  const reportPath = process.env.MIXLAB_LOCAL_WEB_STABILITY_REPORT?.trim() || DEFAULT_REPORT_PATH;
  const queries = envQueries();
  const iterations = Math.max(1, Math.trunc(envNumber("MIXLAB_LOCAL_WEB_STABILITY_ITERATIONS", 6)));
  const cutEvery = Math.trunc(envNumber("MIXLAB_LOCAL_WEB_STABILITY_CUT_EVERY", 3));
  const apiSlaMs = envNumber("MIXLAB_LOCAL_WEB_STABILITY_API_SLA_MS", 1_000);
  const searchP95SlaMs = envNumber("MIXLAB_LOCAL_WEB_STABILITY_SEARCH_P95_SLA_MS", 500);
  const detailP95SlaMs = envNumber("MIXLAB_LOCAL_WEB_STABILITY_DETAIL_P95_SLA_MS", 1_000);
  const cutSlaMs = envNumber("MIXLAB_LOCAL_WEB_STABILITY_CUT_SLA_MS", 10_000);
  const routeSlaMs = envNumber("MIXLAB_LOCAL_WEB_STABILITY_ROUTE_SLA_MS", 1_000);

  const endpoints = await Promise.all([
    timed(() => fetchJson(`${adminApiBaseUrl}/api/admin/library/status`)),
    timed(() => fetchJson(`${cutterApiBaseUrl}/health`)),
    timed(() => fetchJson(`${searchdBaseUrl}/health`))
  ]);
  const initialRuntime = await timed(async () =>
    apiData<RuntimeStatus>(await fetchJson(`${cutterApiBaseUrl}/cutter/runtime-status`))
  );
  const initialCutTemp = cutTempSnapshot(initialRuntime.value);
  const initialThumbnails = thumbnailSnapshot(initialRuntime.value);

  assert.equal(initialRuntime.value.search_backend?.mode, "searchd", "runtime must use searchd");
  assert.equal(initialRuntime.value.release_cache?.ready, true, "release cache must be ready");
  assert.equal(initialRuntime.value.source_video_preflight?.status, "ready", "source video preflight must be ready");
  assert.equal(
    initialRuntime.value.source_video_preflight?.probe_readable_count,
    initialRuntime.value.source_video_preflight?.probe_count,
    "source video ffprobe preflight must pass every checked sample"
  );

  const runs = [];

  for (let index = 0; index < iterations; index += 1) {
    const query = queries[index % queries.length]!;
    const runtime = await timed(async () =>
      apiData<RuntimeStatus>(await fetchJson(`${cutterApiBaseUrl}/cutter/runtime-status`))
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
    assert.ok(groups.length > 0, `source search must return at least one group for "${query}"`);
    const group = groups.find((item) => item.hit_segments?.length > 0) ?? groups[0]!;
    const firstHit = group.hit_segments[0];
    assert.ok(firstHit, `source search group must include hit segments for "${query}"`);

    const detail = await timed(async () =>
      apiData<SourceVideoDetail>(await fetchJson(`${cutterApiBaseUrl}/cutter/source-videos/${group.source_video_id}`))
    );
    assert.equal(detail.value.source_video_id, group.source_video_id);
    assert.ok(detail.value.transcript.segments.length > 0, "source detail must include transcript segments");
    assert.ok(
      detail.value.transcript.segments.length >= group.hit_segments.length,
      "source detail must load complete transcript context"
    );

    const cover = await timed(async () => {
      const response = await fetch(`${cutterApiBaseUrl}/cutter/source-videos/${group.source_video_id}/cover`);
      assert.equal(response.ok, true, `cover request failed with ${response.status}`);
      await response.arrayBuffer();
      return response.headers.get("content-type") ?? "";
    });

    let cut: {
      ms: number;
      local_clip_id: string;
      file_path: string;
      output_exists: boolean;
      output_size_bytes: number;
      output_outside_public_library: boolean;
    } | undefined;
    if (cutEvery > 0 && (index + 1) % cutEvery === 0) {
      const detailSegment = detail.value.transcript.segments.find((item) => item.segment_id === firstHit.segment_id)
        ?? detail.value.transcript.segments[0]!;
      const selectedText = detailSegment.text.trim();
      assert.ok(selectedText.length > 0, "selected transcript text must be non-empty");
      const cutResult = await timed(async () =>
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
              title: `stability-${index + 1}-${nowIso()}`
            })
          })
        )
      );
      const mediaFilePath = String(cutResult.value.media_file_path ?? cutResult.value.file_path ?? "");
      const proof = mediaFilePath ? await fileProof(mediaFilePath) : { exists: false, size_bytes: 0 };
      const outputOutsidePublicLibrary = !runtime.value.library_root_path
        || !isInsidePath(runtime.value.library_root_path, mediaFilePath);
      assert.ok(proof.exists && proof.size_bytes > 0, "local cut output file must exist and be non-empty");
      assert.ok(outputOutsidePublicLibrary, "local cut output must not be written into public library");
      cut = {
        ms: cutResult.ms,
        local_clip_id: String(cutResult.value.local_clip_id ?? ""),
        file_path: mediaFilePath,
        output_exists: proof.exists,
        output_size_bytes: proof.size_bytes,
        output_outside_public_library: outputOutsidePublicLibrary
      };
    }

    runs.push({
      iteration: index + 1,
      query,
      runtime_ms: runtime.ms,
      library_ms: library.ms,
      search_ms: search.ms,
      detail_ms: detail.ms,
      cover_ms: cover.ms,
      cover_content_type: cover.value,
      search_group_count: groups.length,
      source_video_id: group.source_video_id,
      source_title: group.title,
      transcript_segment_count: detail.value.transcript.segments.length,
      ...(cut ? { cut } : {})
    });
  }

  const finalRuntime = await timed(async () =>
    apiData<RuntimeStatus>(await fetchJson(`${cutterApiBaseUrl}/cutter/runtime-status`))
  );
  const finalCutTemp = cutTempSnapshot(finalRuntime.value);
  const finalThumbnails = thumbnailSnapshot(finalRuntime.value);
  assert.equal(finalRuntime.value.search_backend?.mode, "searchd", "runtime must still use searchd after stability run");
  assert.equal(finalRuntime.value.source_video_preflight?.status, "ready", "source video preflight must remain ready");
  assert.equal(finalThumbnails.manifest_entries, finalThumbnails.checksum_entries, "thumbnail manifest entries must all have checksums");
  assert.ok(finalCutTemp.size_bytes <= finalCutTemp.max_bytes || finalCutTemp.max_bytes === 0, "cut temp cache must stay under max bytes");
  assert.ok(finalCutTemp.file_count <= initialCutTemp.file_count, "cut temp files must not grow after completed cuts");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const routes = {
    admin_dashboard: await checkRoute({
      page,
      url: `${adminWebBaseUrl}/#/dashboard`,
      selector: ".admin-shell, .ml-shell, main",
      slaMs: routeSlaMs
    }),
    cutter_project_home: await checkRoute({
      page,
      url: `${cutterWebBaseUrl}/#/project-home`,
      selector: ".cutter-shell, .cutter-page, main",
      slaMs: routeSlaMs
    }),
    cutter_material_locator: await checkRoute({
      page,
      url: `${cutterWebBaseUrl}/#/material-locator?query=${encodeURIComponent(queries[0]!)}`,
      selector: ".cutter-material-locator, .cutter-page, main",
      slaMs: routeSlaMs
    })
  };
  await browser.close();

  const runtimeTimes = runs.map((item) => item.runtime_ms);
  const libraryTimes = runs.map((item) => item.library_ms);
  const searchTimes = runs.map((item) => item.search_ms);
  const detailTimes = runs.map((item) => item.detail_ms);
  const coverTimes = runs.map((item) => item.cover_ms);
  const cutTimes = runs.flatMap((item) => item.cut ? [item.cut.ms] : []);

  const summary = {
    runtime_p95_ms: percentile(runtimeTimes, 0.95),
    runtime_max_ms: max(runtimeTimes),
    library_p95_ms: percentile(libraryTimes, 0.95),
    search_p95_ms: percentile(searchTimes, 0.95),
    search_max_ms: max(searchTimes),
    detail_p95_ms: percentile(detailTimes, 0.95),
    detail_max_ms: max(detailTimes),
    cover_p95_ms: percentile(coverTimes, 0.95),
    cut_p95_ms: percentile(cutTimes, 0.95),
    cut_max_ms: max(cutTimes),
    cut_count: cutTimes.length
  };

  assert.ok(summary.runtime_p95_ms <= apiSlaMs, `runtime p95 ${summary.runtime_p95_ms}ms exceeds ${apiSlaMs}ms`);
  assert.ok(summary.library_p95_ms <= apiSlaMs, `library p95 ${summary.library_p95_ms}ms exceeds ${apiSlaMs}ms`);
  assert.ok(summary.search_p95_ms <= searchP95SlaMs, `search p95 ${summary.search_p95_ms}ms exceeds ${searchP95SlaMs}ms`);
  assert.ok(summary.detail_p95_ms <= detailP95SlaMs, `detail p95 ${summary.detail_p95_ms}ms exceeds ${detailP95SlaMs}ms`);
  assert.ok(summary.cut_count === 0 || summary.cut_p95_ms <= cutSlaMs, `cut p95 ${summary.cut_p95_ms}ms exceeds ${cutSlaMs}ms`);

  for (const route of Object.values(routes)) {
    assert.ok(route.load_ms <= routeSlaMs, `${route.url} load ${route.load_ms}ms exceeds ${routeSlaMs}ms`);
    assert.equal(route.horizontal_overflow_px, 0, `${route.url} must not have horizontal overflow`);
  }

  const report = {
    status: "passed",
    generated_at: nowIso(),
    config: {
      iterations,
      cut_every: cutEvery,
      queries,
      api_sla_ms: apiSlaMs,
      search_p95_sla_ms: searchP95SlaMs,
      detail_p95_sla_ms: detailP95SlaMs,
      cut_sla_ms: cutSlaMs,
      route_sla_ms: routeSlaMs
    },
    endpoints: {
      admin_status_ms: endpoints[0]!.ms,
      cutter_health_ms: endpoints[1]!.ms,
      searchd_health_ms: endpoints[2]!.ms
    },
    initial_runtime: initialRuntime.value,
    final_runtime: finalRuntime.value,
    cache_delta: {
      cut_temp_initial: initialCutTemp,
      cut_temp_final: finalCutTemp,
      thumbnails_initial: initialThumbnails,
      thumbnails_final: finalThumbnails
    },
    summary,
    runs,
    routes
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
