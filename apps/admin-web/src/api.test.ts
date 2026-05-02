import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  unwrapAdminResponse,
  type AdminApiEnvelope
} from "./api.ts";

test("unwraps successful admin API envelopes", () => {
  assert.deepEqual(unwrapAdminResponse({ ok: true, data: { ready: 120 } }), {
    ready: 120
  });
});

test("throws readable admin API errors", () => {
  const envelope: AdminApiEnvelope<unknown> = {
    ok: false,
    error_code: "LIBRARY_NOT_FOUND",
    message: "无法访问公共素材库，请检查路径是否正确。",
    details: { path: "/Volumes/MixLab" }
  };

  assert.throws(() => unwrapAdminResponse(envelope), /LIBRARY_NOT_FOUND.*无法访问公共素材库/);
});

test("calls admin API endpoints through the typed client", async () => {
  const requested: string[] = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.getLibraryStatus();
  await client.listSourceVideos();
  await client.listPreprocessJobs();
  await client.listIndexVersions();
  await client.getDoctorReport();
  await client.getRuntimeSettings();

  assert.deepEqual(
    requested.map((url) => new URL(url).pathname),
    [
      "/api/admin/library/status",
      "/api/admin/source-videos",
      "/api/admin/preprocess/jobs",
      "/api/admin/index/versions",
      "/api/admin/doctor/report",
      "/api/admin/settings/runtime"
    ]
  );
});

test("fixture client separates ready, failed, and index-required counts", async () => {
  const data = await loadAdminDashboardData(createFixtureAdminApiClient());

  assert.equal(data.status.ready_video_count, 120);
  assert.equal(data.status.failed_video_count, 2);
  assert.equal(data.status.index_required_video_count, 5);
});

test("fixture jobs show failed retry without blocking later success", async () => {
  const jobs = await createFixtureAdminApiClient().listPreprocessJobs();
  const failed = jobs.jobs.find((job) => job.status === "failed");
  const laterDone = jobs.jobs.find(
    (job) => job.status === "done" && (job.completed_at ?? "") > (failed?.failed_at ?? "")
  );

  assert.equal(failed?.retryable, true);
  assert.ok(laterDone, "expected a later successful job after the failed job");
});

test("fixture runtime settings redact DashScope key values", async () => {
  const settings = await createFixtureAdminApiClient().getRuntimeSettings();
  const asJson = JSON.stringify(settings);

  assert.equal(settings.asr.dashscope_api_key_configured, true);
  assert.equal(asJson.includes("sk-"), false);
});
