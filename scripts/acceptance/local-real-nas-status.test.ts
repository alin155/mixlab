import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLocalRealNasStatus } from "./local-real-nas-status.ts";

const endpoint = (label: string) => ({
  label,
  url: `http://127.0.0.1/${label}`,
  ok: true,
  status: 200
});

const completeLiveStatus = () => ({
  admin_index_version: "v003004",
  admin_ready_video_count: 3004,
  admin_total_video_count: 11394,
  admin_queued_count: 8127,
  admin_processing_count: 1,
  admin_failed_count: 259,
  admin_index_required_count: 3,
  public_library_root: "/Volumes/MixLab/PublicLibrary",
  searchd_index_version: "v003004",
  searchd_source_video_count: 3004,
  searchd_transcript_segment_count: 401272,
  cutter_public_available_video_count: 3004,
  cutter_search_query: "现金流",
  cutter_search_index_version: "v003004",
  cutter_search_mode: "searchd",
  cutter_search_ms: 12,
  cutter_search_returned_count: 1,
  cutter_search_first_source_video_id: "V000733",
  cutter_search_first_segment_id: "V000733-S000044",
  cutter_search_first_segment_contains_query: true
});

const completeSavedStatus = () => ({
  local_web_report_path: "docs/acceptance/artifacts/local-web-sanity.json",
  local_web_index_version: "v003004",
  local_web_source_video_count: 3004,
  local_web_transcript_segment_count: 401272,
  local_web_local_clip_id: "E000086",
  real_nas_50_report_path: "docs/acceptance/artifacts/real-nas-50-editor-report.json",
  real_nas_50_index_version: "v003004",
  real_nas_50_source_video_count: 3004,
  real_nas_50_transcript_segment_count: 401272,
  real_nas_50_editor_count: 50,
  real_nas_50_search_query_count: 5
});

test("local real NAS status accepts aligned read-only live state", () => {
  const result = evaluateLocalRealNasStatus({
    endpoints: [
      endpoint("admin web"),
      endpoint("cutter web"),
      endpoint("admin api"),
      endpoint("cutter api"),
      endpoint("searchd")
    ],
    live: completeLiveStatus(),
    saved: completeSavedStatus()
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.ready_for_manual_web_test, true);
  assert.equal(result.ready_for_evidence_refresh, true);
});

test("local real NAS status warns when live indexes are hot-refreshing", () => {
  const result = evaluateLocalRealNasStatus({
    endpoints: [
      endpoint("admin web"),
      endpoint("cutter web"),
      endpoint("admin api"),
      endpoint("cutter api"),
      endpoint("searchd")
    ],
    live: {
      ...completeLiveStatus(),
      admin_index_version: "v003006",
      admin_ready_video_count: 3006,
      cutter_public_available_video_count: 3006
    },
    saved: completeSavedStatus()
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.some((warning) => warning.includes("admin current index v003006")), true);
  assert.equal(result.warnings.some((warning) => warning.includes("cutter public library count 3006")), true);
  assert.equal(result.ready_for_manual_web_test, true);
  assert.equal(result.ready_for_evidence_refresh, false);
});

test("local real NAS status allows evidence refresh when only saved snapshots are stale", () => {
  const result = evaluateLocalRealNasStatus({
    endpoints: [
      endpoint("admin web"),
      endpoint("cutter web"),
      endpoint("admin api"),
      endpoint("cutter api"),
      endpoint("searchd")
    ],
    live: completeLiveStatus(),
    saved: {
      ...completeSavedStatus(),
      local_web_index_version: "v003001",
      real_nas_50_index_version: "v003001"
    }
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.some((warning) => warning.includes("saved local Web report v003001")), true);
  assert.equal(result.warnings.some((warning) => warning.includes("saved 50-editor report v003001")), true);
  assert.equal(result.ready_for_manual_web_test, true);
  assert.equal(result.ready_for_evidence_refresh, true);
});

test("local real NAS status rejects non-searchd or empty cutter search", () => {
  const result = evaluateLocalRealNasStatus({
    endpoints: [
      endpoint("admin web"),
      endpoint("cutter web"),
      endpoint("admin api"),
      endpoint("cutter api"),
      endpoint("searchd")
    ],
    live: {
      ...completeLiveStatus(),
      cutter_search_mode: "sqlite-index",
      cutter_search_returned_count: 0,
      cutter_search_first_segment_contains_query: false
    },
    saved: completeSavedStatus()
  });

  assert.match(result.errors.join("\n"), /cutter search must use searchd/);
  assert.match(result.errors.join("\n"), /cutter search must return at least one result/);
  assert.match(result.errors.join("\n"), /cutter first search hit must contain the audited query/);
  assert.equal(result.ready_for_manual_web_test, false);
  assert.equal(result.ready_for_evidence_refresh, false);
});
