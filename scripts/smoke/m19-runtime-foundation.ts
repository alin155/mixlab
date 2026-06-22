import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

const DEFAULT_QUERY = "第一场";
const DEFAULT_REPORT_PATH = "docs/acceptance/artifacts/m19-runtime-foundation-local-web.json";
const CUTTER_AUTH_STORAGE_KEY = "mixlab:cutter:auth_session";
const CUTTER_DEVICE_STORAGE_KEY = "mixlab:cutter:device_id";

interface ApiEnvelope<T> {
  data: T;
}

interface TimedResult<T> {
  value: T;
  ms: number;
}

interface CutterSession {
  user_id: string;
  device_id: string;
  session_token: string;
  username?: string;
}

interface RuntimeStatus {
  library_id?: string;
  available_video_count?: number;
  search_backend?: {
    mode?: string;
    source_video_count?: number;
    response_ms?: number;
  };
  release_cache?: {
    ready?: boolean;
    ready_video_count?: number;
  };
}

interface SourceVideoCard {
  source_video_id: string;
  title: string;
  relative_path?: string;
}

interface SourceLibraryResponse {
  library_id?: string;
  available_video_count: number;
  videos: SourceVideoCard[];
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
  relative_path?: string;
  hit_segments: SearchHitSegment[];
}

interface SearchResponse {
  query: string;
  search_mode?: string;
  next_cursor?: string;
  has_more?: boolean;
  returned_count?: number;
  limit?: number;
  search_ms?: number;
  groups: SearchGroup[];
}

interface SourceVideoDetail {
  source_video_id: string;
  title: string;
  relative_path?: string;
  transcript: {
    segments: SearchHitSegment[];
  };
}

interface CutJob {
  cut_job_id: string;
  source_video_id: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  error_message?: string;
}

interface CutJobCatalog {
  job_count: number;
  jobs: CutJob[];
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
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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

function authHeaders(session: CutterSession): HeadersInit {
  return {
    "X-MixLab-Device-Id": session.device_id,
    "X-MixLab-Session-Token": session.session_token
  };
}

async function loginCutter(apiBaseUrl: string): Promise<CutterSession> {
  const deviceId = process.env.MIXLAB_CUTTER_TEST_DEVICE_ID?.trim() || "m19-runtime-foundation";
  const username = process.env.MIXLAB_CUTTER_TEST_USERNAME?.trim();
  const password = process.env.MIXLAB_CUTTER_TEST_PASSWORD?.trim();
  const mode = await fetchJson<ApiEnvelope<{ auth_mode?: string; mode?: string }>>(`${apiBaseUrl}/cutter/auth/mode`);
  const authMode = mode.data.auth_mode ?? mode.data.mode;

  if (authMode !== "local_trusted" && (!username || !password)) {
    throw new Error("MIXLAB_CUTTER_TEST_USERNAME and MIXLAB_CUTTER_TEST_PASSWORD are required for reviewed auth");
  }

  const login = await fetchJson<ApiEnvelope<{
    session: CutterSession;
  }>>(`${apiBaseUrl}/cutter/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      username: username || "local",
      password: password || "local",
      device_id: deviceId,
      device_name: "M19 Runtime Foundation"
    })
  });

  return {
    ...login.data.session,
    ...(username ? { username } : {})
  };
}

async function apiGet<T>(apiBaseUrl: string, session: CutterSession, pathAndQuery: string): Promise<TimedResult<T>> {
  return timed(async () =>
    apiData<T>(await fetchJson<ApiEnvelope<T>>(`${apiBaseUrl}${pathAndQuery}`, {
      headers: authHeaders(session)
    }))
  );
}

async function apiPost<T>(
  apiBaseUrl: string,
  session: CutterSession,
  pathAndQuery: string,
  body: unknown
): Promise<TimedResult<T>> {
  return timed(async () =>
    apiData<T>(await fetchJson<ApiEnvelope<T>>(`${apiBaseUrl}${pathAndQuery}`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify(body)
    }))
  );
}

function selectedSegment(detail: SourceVideoDetail, group: SearchGroup): SearchHitSegment {
  const hit = group.hit_segments[0];
  return detail.transcript.segments.find((segment) => segment.segment_id === hit?.segment_id)
    ?? detail.transcript.segments[0]!;
}

async function waitForPageReady(page: Page, dataPage: string, timeoutMs: number): Promise<number> {
  const started = performance.now();
  await page.waitForSelector(`[data-page="${dataPage}"]`, { timeout: timeoutMs });
  await page.waitForFunction(() => !document.body.innerText.includes("加载失败"), undefined, { timeout: timeoutMs });
  return Math.round(performance.now() - started);
}

async function gotoCutterRoute(input: {
  page: Page;
  hash: string;
  dataPage: string;
  timeoutMs: number;
}): Promise<number> {
  const started = performance.now();
  await input.page.evaluate((hash) => {
    window.location.hash = hash;
  }, input.hash);
  await waitForPageReady(input.page, input.dataPage, input.timeoutMs);
  return Math.round(performance.now() - started);
}

async function assertNoGlobalFailure(page: Page): Promise<void> {
  const text = await page.locator("body").innerText({ timeout: 1000 });
  assert.equal(text.includes("加载失败"), false, "workbench must not show global loading failure");
  assert.equal(text.includes("Internal server error"), false, "workbench must not show Internal server error");
}

async function countCards(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count();
}

async function runBrowserAcceptance(input: {
  cutterWebBaseUrl: string;
  session: CutterSession;
  query: string;
  tabSwitchIterations: number;
}): Promise<{
  cached_revisit: Record<string, { visible_ms: number; refresh_ms: number; card_count: number }>;
  tab_switch: { iterations: number; max_ms: number; p95_ms: number; source_library_request_limits: number[] };
  candidate_switch: { clicked_count: number; transcript_ready: boolean };
}> {
  const sourceLibraryRequestLimits: number[] = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(
    ({ session, authStorageKey, deviceStorageKey }) => {
      localStorage.setItem(authStorageKey, JSON.stringify(session));
      localStorage.setItem(deviceStorageKey, session.device_id);
    },
    {
      session: input.session,
      authStorageKey: CUTTER_AUTH_STORAGE_KEY,
      deviceStorageKey: CUTTER_DEVICE_STORAGE_KEY
    }
  );
  const page = await context.newPage();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/cutter/source-library") {
      sourceLibraryRequestLimits.push(Number(url.searchParams.get("limit") ?? 0));
    }
  });

  await page.goto(`${input.cutterWebBaseUrl}/#/project-home`, { waitUntil: "domcontentloaded" });
  await waitForPageReady(page, "project-home", 15_000);

  const cacheTargets = [
    {
      key: "project_home",
      hash: "#/project-home",
      dataPage: "project-home",
      selector: '[data-page="project-home"] .cutter-project-card-main, [data-page="project-home"] .cutter-project-empty-state'
    },
    {
      key: "local_library",
      hash: "#/local-library",
      dataPage: "local-library",
      selector: '[data-page="local-library"] .cutter-library-card, [data-page="local-library"] .cutter-library-empty-state'
    },
    {
      key: "public_library",
      hash: "#/public-library",
      dataPage: "public-library",
      selector: '[data-page="public-library"] .cutter-library-card, [data-page="public-library"] .cutter-library-empty-state'
    }
  ];
  const cachedRevisit: Record<string, { visible_ms: number; refresh_ms: number; card_count: number }> = {};

  for (const target of cacheTargets) {
    await gotoCutterRoute({
      page,
      hash: target.hash,
      dataPage: target.dataPage,
      timeoutMs: 10_000
    });
    await page.waitForSelector(target.selector, { timeout: 10_000 });
  }

  for (const target of cacheTargets) {
    await gotoCutterRoute({
      page,
      hash: "#/settings",
      dataPage: "settings",
      timeoutMs: 10_000
    });
    const visibleMs = await gotoCutterRoute({
      page,
      hash: target.hash,
      dataPage: target.dataPage,
      timeoutMs: 200
    });
    const refreshMs = await waitForPageReady(page, target.dataPage, 1_000);
    const cardCount = await countCards(page, target.selector);
    cachedRevisit[target.key] = {
      visible_ms: visibleMs,
      refresh_ms: refreshMs,
      card_count: cardCount
    };
  }

  const switchTargets = [
    ["#/project-home", "project-home"],
    ["#/public-library", "public-library"],
    ["#/local-library", "local-library"],
    [`#/material-locator?query=${encodeURIComponent(input.query)}`, "material-locator"],
    ["#/cut-tasks", "cut-tasks"],
    ["#/cache-management", "cache-management"],
    ["#/settings", "settings"]
  ] as const;
  const switchTimes: number[] = [];

  for (let index = 0; index < input.tabSwitchIterations; index += 1) {
    const [hash, dataPage] = switchTargets[index % switchTargets.length]!;
    const routeMs = await gotoCutterRoute({
      page,
      hash,
      dataPage,
      timeoutMs: 1_000
    });
    switchTimes.push(routeMs);
    await assertNoGlobalFailure(page);
  }

  await gotoCutterRoute({
    page,
    hash: `#/material-locator?query=${encodeURIComponent(input.query)}`,
    dataPage: "material-locator",
    timeoutMs: 10_000
  });
  const candidates = page.locator(".cutter-locator-result");
  await candidates.first().waitFor({ timeout: 10_000 });
  const candidateCount = Math.min(5, await candidates.count());
  for (let index = 0; index < candidateCount; index += 1) {
    await candidates.nth(index).click({ timeout: 1_000 });
  }
  await page.waitForTimeout(300);
  await assertNoGlobalFailure(page);
  const transcriptReady = await page.locator(".cutter-transcript-body, .cutter-transcript-empty").first().isVisible();
  await browser.close();

  const sortedSwitchTimes = [...switchTimes].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sortedSwitchTimes.length * 0.95) - 1);
  return {
    cached_revisit: cachedRevisit,
    tab_switch: {
      iterations: switchTimes.length,
      max_ms: Math.max(...switchTimes),
      p95_ms: sortedSwitchTimes[p95Index] ?? 0,
      source_library_request_limits: sourceLibraryRequestLimits
    },
    candidate_switch: {
      clicked_count: candidateCount,
      transcript_ready: transcriptReady
    }
  };
}

async function submitSequentialCutBatch(input: {
  apiBaseUrl: string;
  session: CutterSession;
  libraryId: string;
  search: SearchResponse;
  query: string;
  cutCount: number;
}): Promise<{
  clip_list_id: string;
  submitted_job_ids: string[];
  submit_ms: number;
  during_cut_responsiveness: {
    source_library_ms: number;
    search_ms: number;
    cut_jobs_ms: number;
    source_library_count: number;
    search_group_count: number;
    cut_job_count: number;
  };
  final_statuses: Record<string, string>;
  poll_ms: number;
}> {
  const groups = input.search.groups.filter((group) => group.hit_segments.length > 0).slice(0, input.cutCount);
  assert.ok(groups.length >= Math.min(2, input.cutCount), "search must return enough groups for queued cut validation");

  const details = [];
  for (const group of groups) {
    const detail = await apiGet<SourceVideoDetail>(
      input.apiBaseUrl,
      input.session,
      `/cutter/source-videos/${encodeURIComponent(group.source_video_id)}`
    );
    details.push({ group, detail: detail.value });
  }

  const items = details.map(({ group, detail }, index) => {
    const segment = selectedSegment(detail, group);
    const relativePath = detail.relative_path || group.relative_path || `${detail.source_video_id}.mp4`;
    return {
      source_video_id: detail.source_video_id,
      source_title: detail.title,
      source_relative_path: relativePath.replace(/\\/g, "/"),
      start_segment_id: segment.segment_id,
      end_segment_id: segment.segment_id,
      begin_ms: segment.begin_ms,
      end_ms: segment.end_ms,
      selected_text: segment.text,
      cut_mode: "copy",
      pre_roll_ms: 0,
      post_roll_ms: 0,
      order: index + 1
    };
  });
  const clipList = await apiPost<{ clip_list_id: string }>(input.apiBaseUrl, input.session, "/cutter/clip-lists", {
    library_id: input.libraryId,
    title: `M19 runtime queue ${nowIso()}`,
    items
  });
  const submission = await apiPost<{ submitted_count: number; jobs: CutJob[] }>(
    input.apiBaseUrl,
    input.session,
    "/cutter/cut-jobs",
    {
      clip_list_id: clipList.value.clip_list_id
    }
  );
  const submittedJobIds = submission.value.jobs.map((job) => job.cut_job_id);
  assert.equal(submittedJobIds.length, items.length, "every cut-list item must become one cut job");

  const duringCutStarted = await Promise.all([
    apiGet<SourceLibraryResponse>(input.apiBaseUrl, input.session, "/cutter/source-library?limit=20"),
    apiGet<SearchResponse>(
      input.apiBaseUrl,
      input.session,
      `/cutter/source-search?query=${encodeURIComponent(input.query)}&limit=10`
    ),
    apiGet<CutJobCatalog>(input.apiBaseUrl, input.session, "/cutter/cut-jobs?limit=50")
  ]);
  const [duringCutLibrary, duringCutSearch, duringCutJobs] = duringCutStarted;
  assert.ok(
    duringCutLibrary.ms <= 1_000,
    `source-library while cuts run took ${duringCutLibrary.ms}ms and must stay within 1s`
  );
  assert.ok(
    duringCutSearch.ms <= 1_000,
    `search while cuts run took ${duringCutSearch.ms}ms and must stay within 1s`
  );
  assert.ok(
    duringCutJobs.ms <= 1_000,
    `cut-jobs while cuts run took ${duringCutJobs.ms}ms and must stay within 1s`
  );
  assert.ok(duringCutLibrary.value.videos.length <= 20, "source-library while cuts run must stay paged");
  assert.ok(duringCutSearch.value.groups.length <= 10, "search while cuts run must stay paged");
  const duringCutResponsiveness = {
    source_library_ms: duringCutLibrary.ms,
    search_ms: duringCutSearch.ms,
    cut_jobs_ms: duringCutJobs.ms,
    source_library_count: duringCutLibrary.value.videos.length,
    search_group_count: duringCutSearch.value.groups.length,
    cut_job_count: duringCutJobs.value.jobs.length
  };

  const pollStarted = performance.now();
  const deadline = Date.now() + envNumber("MIXLAB_M19_CUT_QUEUE_TIMEOUT_MS", 300_000);
  let finalStatuses: Record<string, string> = {};
  while (Date.now() < deadline) {
    const catalog = await apiGet<CutJobCatalog>(input.apiBaseUrl, input.session, "/cutter/cut-jobs?limit=200");
    finalStatuses = Object.fromEntries(
      catalog.value.jobs
        .filter((job) => submittedJobIds.includes(job.cut_job_id))
        .map((job) => [job.cut_job_id, job.status])
    );
    const statuses = submittedJobIds.map((jobId) => finalStatuses[jobId]);
    assert.equal(statuses.includes("failed"), false, "queued cuts must not fail");
    assert.equal(statuses.includes("cancelled"), false, "queued cuts must not be cancelled");
    if (statuses.every((status) => status === "done")) {
      return {
        clip_list_id: clipList.value.clip_list_id,
        submitted_job_ids: submittedJobIds,
        submit_ms: clipList.ms + submission.ms,
        during_cut_responsiveness: duringCutResponsiveness,
        final_statuses: finalStatuses,
        poll_ms: Math.round(performance.now() - pollStarted)
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const finalCatalog = await apiGet<CutJobCatalog>(input.apiBaseUrl, input.session, "/cutter/cut-jobs?limit=200");
  finalStatuses = Object.fromEntries(
    finalCatalog.value.jobs
      .filter((job) => submittedJobIds.includes(job.cut_job_id))
      .map((job) => [job.cut_job_id, job.status])
  );
  if (submittedJobIds.every((jobId) => finalStatuses[jobId] === "done")) {
    return {
      clip_list_id: clipList.value.clip_list_id,
      submitted_job_ids: submittedJobIds,
      submit_ms: clipList.ms + submission.ms,
      during_cut_responsiveness: duringCutResponsiveness,
      final_statuses: finalStatuses,
      poll_ms: Math.round(performance.now() - pollStarted)
    };
  }

  throw new Error(`queued cuts did not finish before timeout: ${JSON.stringify(finalStatuses)}`);
}

async function run(): Promise<void> {
  const cutterApiBaseUrl = envUrl("MIXLAB_CUTTER_API_URL", envUrl("MIXLAB_CUTTER_API_BASE_URL", "http://127.0.0.1:3789"));
  const cutterWebBaseUrl = envUrl("MIXLAB_CUTTER_WEB_BASE_URL", envUrl("MIXLAB_CUTTER_WEB_URL", "http://127.0.0.1:5177"));
  const reportPath = process.env.MIXLAB_M19_RUNTIME_REPORT?.trim() || DEFAULT_REPORT_PATH;
  const query = process.env.MIXLAB_M19_QUERY?.trim() || DEFAULT_QUERY;
  const tabSwitchIterations = Math.max(30, Math.trunc(envNumber("MIXLAB_M19_TAB_SWITCH_ITERATIONS", 30)));
  const cutCount = Math.min(10, Math.max(5, Math.trunc(envNumber("MIXLAB_M19_CUT_COUNT", 5))));

  const session = await loginCutter(cutterApiBaseUrl);
  const runtime = await apiGet<RuntimeStatus>(cutterApiBaseUrl, session, "/cutter/runtime-status");
  assert.equal(runtime.value.release_cache?.ready, true, "release cache must be ready");
  assert.ok(Number(runtime.value.available_video_count ?? 0) >= 10_000, "public library must expose 10k-level data");

  const library = await apiGet<SourceLibraryResponse>(cutterApiBaseUrl, session, "/cutter/source-library?limit=20");
  assert.ok(library.ms <= 1_000, `public library first page ${library.ms}ms must be visible within 1s`);
  assert.ok(library.value.videos.length <= 20, "public library first screen must only load one small page");
  assert.ok(library.value.available_video_count >= library.value.videos.length, "public library total must be available");

  const search = await apiGet<SearchResponse>(
    cutterApiBaseUrl,
    session,
    `/cutter/source-search?query=${encodeURIComponent(query)}&limit=10`
  );
  assert.ok(search.ms <= 1_000, `search first page ${search.ms}ms must be actionable within 1s`);
  assert.ok(search.value.groups.length > 0, "search first page must return candidate groups");
  assert.ok(search.value.groups.length <= 10, "search first page must respect the requested limit");

  const browser = await runBrowserAcceptance({
    cutterWebBaseUrl,
    session,
    query,
    tabSwitchIterations
  });
  for (const [key, value] of Object.entries(browser.cached_revisit)) {
    assert.ok(value.visible_ms <= 200, `${key} cached revisit visible in ${value.visible_ms}ms exceeds 200ms`);
    assert.ok(value.refresh_ms <= 1_000, `${key} visible refresh ${value.refresh_ms}ms exceeds 1s`);
  }
  assert.equal(browser.tab_switch.iterations, tabSwitchIterations);
  assert.ok(browser.tab_switch.max_ms <= 1_000, `tab switch max ${browser.tab_switch.max_ms}ms exceeds 1s`);
  assert.equal(browser.candidate_switch.transcript_ready, true, "rapid candidate clicks must leave transcript area ready");
  assert.ok(
    browser.tab_switch.source_library_request_limits.every((limit) => limit > 0 && limit <= 20),
    `source-library browser requests must stay paged: ${browser.tab_switch.source_library_request_limits.join(", ")}`
  );

  const queue = await submitSequentialCutBatch({
    apiBaseUrl: cutterApiBaseUrl,
    session,
    libraryId: library.value.library_id || runtime.value.library_id || "public-library",
    search: search.value,
    query,
    cutCount
  });

  const report = {
    status: "passed",
    generated_at: nowIso(),
    target: "M19 Runtime Foundation v1",
    config: {
      cutter_api_base_url: cutterApiBaseUrl,
      cutter_web_base_url: cutterWebBaseUrl,
      query,
      tab_switch_iterations: tabSwitchIterations,
      cut_count: cutCount
    },
    api: {
      runtime_ms: runtime.ms,
      available_video_count: runtime.value.available_video_count,
      search_backend: runtime.value.search_backend,
      source_library_first_page_ms: library.ms,
      source_library_first_page_count: library.value.videos.length,
      source_library_total_count: library.value.available_video_count,
      search_first_page_ms: search.ms,
      search_group_count: search.value.groups.length,
      search_next_cursor: search.value.next_cursor
    },
    browser,
    cut_queue: queue
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
