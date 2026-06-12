# Local Web Real NAS Preflight Acceptance Record

Date: 2026-06-04

## Scope

This record captures the current phase agreed for MixLab V3: verify the local Web admin and local Web cutter against the real NAS-mounted public library before starting the later Windows cutter desktop and NAS Docker admin target gates.

This preflight is intentionally narrower than final target acceptance:

- It proves the local Web admin can read real NAS public-library status, preprocessing/index health, and usage metrics.
- It proves the local Web cutter can search the real NAS public source library, open full transcript context, locate keyword hits, select transcript text, cut a local clip, and see that clip in the local workspace library.
- It does not complete ACC-008 Windows target acceptance.
- It does not complete ACC-009 NAS Docker deployment acceptance.
- It must not run destructive NAS management actions such as batch retry, recovery, rebuild, or queue mutation without explicit operator approval.

## Runtime Under Test

- Admin Web: `http://127.0.0.1:5176/`
- Cutter Web: `http://127.0.0.1:5177/`
- Public library root: `/Volumes/MixLab/PublicLibrary`
- Searchd: `http://127.0.0.1:3799`
- Admin API: `http://127.0.0.1:3889`
- Cutter API: `http://127.0.0.1:3789`

## Automated Gate

Run with the local services already started:

```sh
MIXLAB_ADMIN_WEB_URL=http://127.0.0.1:5176/ \
MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:3889/ \
MIXLAB_CUTTER_WEB_URL=http://127.0.0.1:5177/ \
MIXLAB_CUTTER_API_BASE_URL=http://127.0.0.1:3789/ \
MIXLAB_SEARCHD_BASE_URL=http://127.0.0.1:3799/ \
MIXLAB_LOCAL_WEB_SANITY_REPORT=docs/acceptance/artifacts/local-web-sanity.json \
npm run audit:local-web-sanity
```

The Web URL aliases `MIXLAB_ADMIN_WEB_BASE_URL` and `MIXLAB_CUTTER_WEB_BASE_URL` are also accepted for local source-machine runs.

For a no-side-effect live check before manual testing or before rerunning the full cut-producing audit, run:

```sh
npm run status:local-real-nas
```

This read-only status check only sends HTTP GET requests to the running Web/API/searchd services. It reports whether the services are reachable, whether Cutter search still uses searchd for the audited query, and whether the live Admin/Searchd/Cutter index signals have drifted from the saved `local-web-sanity.json` and `real-nas-50-editor-report.json` snapshots. When `ready_for_manual_web_test = true`, local Web exploratory testing can proceed against the real NAS data. Warnings such as `admin current index ... differs from searchd ...` mean the real NAS index is still hot-refreshing; `ready_for_evidence_refresh = false` in that state only means wait for it to settle before refreshing evidence with the full audit below.

To let the check poll until the live Admin/Searchd/Cutter signals settle, set `MIXLAB_LOCAL_REAL_NAS_STATUS_WAIT_MS`:

```sh
MIXLAB_LOCAL_REAL_NAS_STATUS_WAIT_MS=60000 npm run status:local-real-nas
```

When the live signals are stable but the saved snapshots are old, the report keeps `ok = true`, `ready_for_manual_web_test = true`, and `ready_for_evidence_refresh = true`; that is the right time to rerun the full audit and 50-editor rehearsal.

Then validate the saved artifact:

```sh
npm run validate:local-web-sanity-report -- docs/acceptance/artifacts/local-web-sanity.json
```

When the real NAS index has advanced, sync the human acceptance record from the saved JSON before running the phase audit:

```sh
npm run sync:local-real-nas-record
```

The audit must verify:

- admin and cutter Web endpoints return HTTP 200;
- admin and cutter API endpoints return HTTP 200;
- admin dashboard shows core-path labels for keyword location, full transcript, selection cutting, 50-editor capacity, search p95, local search coverage, zero search failures, and material scale;
- Admin dashboard records disabled write actions for `智能扫描` while `真实 NAS 写入动作` is `未解锁`;
- structured admin metrics include `active_cutter_count`, `cutter_capacity >= 50`, `current_index_version`, `search_p95_ms <= 1000`, `local_search_coverage_percent >= 80`, and `search_failure_count = 0`;
- searchd health returns HTTP 200 and the structured `searchd_index.index_version` matches `admin_dashboard.current_index_version` after the searchd hot-refresh window;
- Admin real NAS matrix reads `admin_real_nas_matrix` from the real `/Volumes/MixLab/PublicLibrary` library, confirms source folder settings, ready source detail transcript counts, source video list pagination/filtering, preprocess jobs, index versions, cutter users, and read-only handling of mutating actions;
- Admin Web route matrix renders source videos, preprocessing, Doctor, cutter users, and settings pages with real NAS-backed labels;
- Source Videos route records disabled write actions for `重试此视频`, `保存封面`, and `保存公开说明` while `真实 NAS 写入动作` is `未解锁`;
- Cutter search matrix searches multiple keywords through `cutter_search_matrix`, requires every query to use local searchd, records hit source/segment evidence, and requires every query index version to match searchd health;
- layout evidence records `layout.admin_statusbar`, `layout.admin_statusbar_item_overflow_count`, `layout.cutter_workbench`, `layout.cutter_body`, `layout.admin_route_layouts`, and `layout.cutter_route_layouts` across desktop `1440x960` and compact `1024x768` viewports; all route body/page horizontal overflow checks must pass;
- Material Locator search status shows local searchd and the structured `material_locator.search_index_version` matches `searchd_index.index_version`;
- Material Locator default selection records `material_locator.default_selected_material_section` and must focus a public source result first so the transcript pane opens real NAS full-video context even when reusable local clips are listed before public results;
- Material Locator renders public NAS candidates, exposes the current hit segment id and current hit time, then proves manual full-transcript drag selection with `material_locator_closed_loop.selection_method = transcript-drag`, at least two selected transcript sentences, and `material_locator_closed_loop.selected_text_segment_count >= 2`;
- transcript header counters match structured values for global hit position, global hit count, current-video hit count, selected sentence count, and full transcript character count;
- current-video hit count does not exceed global hit count;
- selected transcript text includes the audited query;
- selected transcript text includes broader context than the audited query alone and is selected by dragging across the full transcript rather than relying only on the current-hit shortcut;
- selected transcript text is smaller than the full transcript character count;
- a cut action produces completion feedback and the selected text appears in the local library;
- the closed-loop report records `local_clip_id`, local media/manifest file paths, local media/manifest existence and byte sizes, `cut_job_id`, `cut_job_status`, `cut_job_export_clip_id`, `cut_job_output_file`, cut-tasks page visibility proof, `public_library_root`, `local_output_is_outside_public_library = true`, and `public_library_write_detected = false`;
- local reusable material appears before public source results after the cut;
- the report does not include secrets, signed URLs, bearer tokens, full private transcript text, or pasted search text.

## Latest Evidence

Artifact:

- `docs/acceptance/artifacts/local-web-sanity.json`

Latest verified values from the 2026-06-04 local Web sanity run:

- Searchd health: `index_version = v003022`, `source_video_count = 3022`, `segment_count = 403605`.
- Searchd/admin index parity: `searchd_index.index_version = v003022`, `admin_dashboard.current_index_version = v003022`, `admin_real_nas_matrix.current_index_version = v003022`, `admin_real_nas_matrix.index_current_version = v003022`, `matched_admin_current_index = true`.
- Admin real NAS matrix: `video_count = 11394`, `ready_video_count = 3022`, `queued_video_count = 8109`, `processing_video_count = 2`, `failed_video_count = 259`, `index_required_video_count = 2`, `source_ready_detail_id = V000001`, `source_ready_detail_ms = 90`, `source_ready_detail_transcript_segment_count = 78`, `source_ready_detail_transcript_char_count = 2481`, `runtime_settings_ms = 32`.
- Admin source video list: server pagination returned `50` first-page rows and `50` second-page rows at page size `50`; first ids `V000001` and `V000051` proved distinct pages, ready filter returned `50` all-ready rows in `31ms`, and query `房产` returned `3` metadata matches with first id `V000001` in `48ms`.
- Admin source videos Web UI: route `http://127.0.0.1:5176/#/source-videos` displayed the real source path (`source_path_visible = true`) and first server id `V000001`; load-more changed loaded count `100 -> 200`; query `房产` observed a source-videos API response (`true`) and rendered `V000001`; ready filter selected `ready`, observed a source-videos API response (`true`), and rendered `100` ready status badges only.
- Admin preprocess Web UI: route `http://127.0.0.1:5176/#/preprocess-jobs` displayed current index `v003022`, source count `11394`, queued count `8109`, failed count `259`, production status `2 个处理中任务需要恢复`, public-library root visibility `true`, real queue job `J001440`, opened log job `J001440`, log record source `preprocess-job`, and rendered `606` log characters.
- Admin cutter users Web UI: route `http://127.0.0.1:5176/#/cutter-users` rendered `19` cutter users, `18` approved users, `1` pending users, first API user `CU000001` / `Allen`, first device `Windows 剪辑端 · Edge`, identity note visibility `true`, device detail visibility `true`, approve action visibility `true`, and disable action visibility `true`.
- Admin source videos write lock: source-videos route recorded `disabled_write_action_labels` for `重试此视频`, `保存封面`, `保存公开说明`, proving single-video retry plus cover and public metadata save actions are disabled by default until explicitly unlocked.
- Admin Web route matrix: source videos, preprocessing, Doctor, cutter users, and settings routes all rendered with required labels; preprocessing additionally verified visible real NAS safety labels `真实 NAS 安全边界`, `真实 NAS 写入动作`, `未解锁`, `只读观察`, `人工确认`, and `本机工作区`.
- Admin write lock: the preprocessing route recorded `disabled_write_action_labels` for `重试失败`, `发布待索引视频`, `校验索引`, `恢复处理中任务`, `启动预处理流水线`, and `暂停预处理流水线` in both `admin_real_nas_matrix.web_routes` and `layout.admin_route_layouts`, proving real NAS write actions are disabled by default until explicitly unlocked.
- Cutter Web route layout matrix: Material Locator, cut tasks, local library, public library, and settings routes all rendered with required labels.
- Cutter search matrix: `现金流`, `利润`, `客户`, `增长`, `AI`, and `品牌` all used `searchd` on `v003022`; max query latency was `44ms`.
- Cutter public library Web UI: route `http://127.0.0.1:5177/#public-library` observed the `source-library` API response (`true`), displayed `3022` public source videos, rendered `100` initial cards, and matched first API source `V000001` / `1.房产置换与资产优化` in the page and inspector.
- Cutter search status: `material_locator.search_index_version = v003022`, `search_status_text = 本地 searchd v003022 继续加载中 搜索服务 565ms NAS 只读`.
- Admin dashboard: `17/50` active editors, `search_p95_ms = 121`, `local_search_coverage_percent = 100`, `search_failure_count = 0`.
- Admin dashboard write lock: dashboard recorded `disabled_write_action_labels` for `智能扫描`, `重试失败视频`, proving smart-scan shortcut actions are disabled by default until explicitly unlocked.
- Admin dashboard funnel guard: historical inconsistent conversion samples are capped at `100%`; the saved dashboard body shows `加入待剪率 100% 92 次选区进入待剪清单 · 选区样本 1 次 · 样本缺口 91`, with no four-digit conversion percentages.
- Material Locator query: `现金流`.
- Candidate count: `96`.
- Default selected material section: `⌄ 公共原素材（10）`; this keeps the full transcript pane on public NAS source context even though local reusable materials remain listed first.
- Current hit: `V000303-S000071` at `418803ms`, displayed as `06:58`.
- Full transcript context: `2513` characters, global hit `111 / 201`, current video hit count `3`, selected sentence count `2`.
- Closed loop: the Material Locator used `transcript-drag` to drag-select transcript context from the full transcript. The selection proof strip recorded `selection_proof_text = 来源 公共原素材 时间段 06:58 - 07:06 字数 47 字 命中 111/201`. Selected text `当然第二个就强制储蓄，第三个是潜在的养老金准备，第四个是现金流的转换。 保险可以转换现金流吗？`, `selected_text_char_count = 47`, `selected_sentence_count = 2`, `selected_text_segment_count = 2`, `selected_text_is_broader_than_query = true`, cut notice `剪切完成 · 本地素材已更新 1`, local library contains the selection, and result ordering remains local material before public source material (`⌄ 本地素材（86）` before `⌄ 公共原素材（94）`).
- Local library page proof: route `http://127.0.0.1:5177/#local-library` used view `all`, displayed `90` current-view clips via `90 条当前视图素材`, and showed generated clip title `1-6月4日-ljf20241111_7994`, source `ljf20241111_7994`, and selected text visibility `true`.
- Output file proof: generated local clip `E000091` wrote media `/Users/huaqihang/Movies/MixLabLocal/export-clips/E000091/001-6月4日-ljf20241111_7994.mp4` with `local_clip_media_file_exists = true` and `local_clip_media_file_size_bytes = 50876992`; manifest `/Users/huaqihang/Movies/MixLabLocal/export-clips/E000091/export-clip.json` has `local_clip_manifest_file_exists = true` and `local_clip_manifest_file_size_bytes = 2189`.
- Cut task tracking: generated local clip `E000091` maps to completed cut job `CJ20260604-0051`, `cut_job_status = done`, `cut_job_export_clip_id = E000091`, and `cut_job_output_file = export-clips/E000091/001-6月4日-ljf20241111_7994.mp4`; route `http://127.0.0.1:5177/#cut-tasks` showed selected text, source `ljf20241111_7994`, time range `06:58 - 07:06`, output `export-clips/E000091/001-6月4日-ljf20241111_7994.mp4`, and status `已完成`.
- Write protection: generated local clip `E000091` with media path under `/Users/huaqihang/Movies/MixLabLocal/export-clips/E000091/`; `public_library_root = /Volumes/MixLab/PublicLibrary`, `local_output_is_outside_public_library = true`, and `public_library_write_detected = false`.
- Layout: admin source videos status bar had no horizontal overflow (`client_width = 920`, `scroll_width = 920`) and `admin_statusbar_item_overflow_count = 0`; cutter Material Locator workbench (`1260 / 1260`) and body (`1440 / 1440`) had no horizontal overflow. `layout.admin_route_layouts` recorded 10 admin route/viewport checks: 5/5 desktop route pages at `922 / 922` and 5/5 compact route pages at `958 / 958`; `layout.cutter_route_layouts` recorded 10 cutter route/viewport checks: desktop Material Locator `1260 / 1260`, desktop standard pages `1164 / 1164`, compact Material Locator `998 / 998`, and compact standard pages `958 / 958`.
- Admin API performance fix verified during this run: `/api/admin/settings/runtime` returned in `32ms`, `/api/admin/source-videos/V000001` detail returned in `90ms`, and large-library Doctor report stayed bounded with the online summary path.
- Search/detail performance fix verified after this run: `mixlab-searchd` now builds source-video detail from the indexed video span map instead of filtering the whole segment table, and Cutter API searchd-backed detail uses the indexed source relative path directly instead of cold-reading each NAS `source-video.json` manifest before a local cut.
- Browser evidence screenshots are saved under `docs/acceptance/artifacts/local-web-real-nas/`: `admin-dashboard-real-library.png`, `admin-source-videos-real-library.png`, `cutter-material-locator-cut-complete.png`, `cutter-material-locator-real-library-layout.png`, plus live-reference screenshots `admin-dashboard-live-real-library.png` and `cutter-material-locator-live-real-library.png`. Live-reference screenshots may show a newer hot-refreshed index than the structured JSON report if searchd continues indexing during manual viewing.

## 50-Editor Real NAS Source-Machine Rehearsal

Artifact:

- `docs/acceptance/artifacts/real-nas-50-editor-report.json`

Run with the real NAS mount and local searchd already online:

```sh
MIXLAB_REAL_NAS_LIBRARY_ROOT=/Volumes/MixLab/PublicLibrary \
MIXLAB_REAL_NAS_SEARCHD_BASE_URL=http://127.0.0.1:3799 \
MIXLAB_REAL_NAS_50_REPORT_PATH=docs/acceptance/artifacts/real-nas-50-editor-report.json \
npm run smoke:real-nas-50-editor
```

Latest verified values from the 2026-06-04 50-editor source-machine run:

- Status: `passed`.
- Search index: `v003022`.
- Indexed real NAS scale: `3022` source videos and `403605` transcript segments.
- Active editors: `50`.
- Distinct source videos covered by the 50 editors: `50`.
- Search backend: every editor used `searchd` across `5` distinct queries (`现金流`, `利润`, `客户`, `增长`, `品牌`); `search_failure_count = 0`.
- Search latency: p95 `609.1ms`, max `651.8ms`, SLA `1000ms`.
- Full transcript detail latency: p95 `478.7ms`, max `484.6ms`, SLA `1000ms`.
- Local cut submission latency: p95 `160.7ms`, max `178ms`, SLA `1000ms`.
- Usage loop counts: `50` searches, `50` source detail views, `50` transcript selections, `50` cut submissions, `50` successful cuts, and `50` local clips.
- Per-editor proof includes search hit source/segment/rank, global transcript character positions, selected transcript character positions, selected text hash, local clip id/path/size/hash, `location_verified = true`, `completed_closed_loop = true`, `workspace_output_written = true`, and `public_library_written = false`.
- The rehearsal asserts local workspace isolation with `no_cross_workspace_outputs = true` and public-library write protection with `public_library_not_written_by_cutters = true`.

This is a local source-machine real NAS rehearsal for the current Web phase. It supports the ACC-009 evidence shape, but it does not complete ACC-009 because the final gate still requires a real NAS/SMB Docker admin target and target-machine provenance.

## Verification Commands

```sh
node --test --import tsx packages/cutter-api/src/index.test.ts
node --test --import tsx packages/library-fs/src/preprocess-lifecycle.test.ts
node --test --import tsx packages/admin-api/src/index.test.ts
npm run test:searchd
node --test --import tsx packages/doctor-core/src/index.test.ts packages/admin-api/src/index.test.ts scripts/acceptance/local-web-sanity.test.ts
node --test --import tsx scripts/acceptance/local-web-sanity.test.ts
npm run typecheck
MIXLAB_ADMIN_WEB_BASE_URL=http://127.0.0.1:5176/ MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:3889/ MIXLAB_CUTTER_WEB_BASE_URL=http://127.0.0.1:5177/ MIXLAB_CUTTER_API_BASE_URL=http://127.0.0.1:3789/ MIXLAB_SEARCHD_BASE_URL=http://127.0.0.1:3799/ MIXLAB_LOCAL_WEB_SANITY_REPORT=docs/acceptance/artifacts/local-web-sanity.json npm run audit:local-web-sanity
npm run validate:local-web-sanity-report -- docs/acceptance/artifacts/local-web-sanity.json
npm run sync:local-real-nas-record
MIXLAB_REAL_NAS_LIBRARY_ROOT=/Volumes/MixLab/PublicLibrary MIXLAB_REAL_NAS_SEARCHD_BASE_URL=http://127.0.0.1:3799 MIXLAB_REAL_NAS_50_REPORT_PATH=docs/acceptance/artifacts/real-nas-50-editor-report.json npm run smoke:real-nas-50-editor
sh scripts/acceptance/nas-50-editor-report-self-check.sh docs/acceptance/artifacts/real-nas-50-editor-report.json
npm run audit:local-real-nas-phase
npm run package:evidence-kit
npm run validate:evidence-kit-manifest
npm run test:acceptance-evidence
npm run audit:delivery-readiness
```

Result:

- `node --test --import tsx packages/cutter-api/src/index.test.ts`: passed, 38/38 tests.
- `node --test --import tsx packages/library-fs/src/preprocess-lifecycle.test.ts`: passed, 10/10 tests.
- `node --test --import tsx packages/admin-api/src/index.test.ts`: passed, 40/40 tests.
- `npm run test:searchd`: passed, 18/18 Rust tests.
- `npm run typecheck`: passed.
- `npm run audit:local-web-sanity`: passed with `ok: true`.
- `npm run validate:local-web-sanity-report -- docs/acceptance/artifacts/local-web-sanity.json`: passed with `ok: true`.
- `npm run sync:local-real-nas-record`: passed with `ok: true`.
- `npm run smoke:real-nas-50-editor`: passed with `50` active editors, `50` distinct source videos, `3022` indexed videos, `403605` indexed transcript segments, search p95 `609.1ms`, detail p95 `478.7ms`, cut p95 `160.7ms`, and `search_failure_count = 0`.
- `sh scripts/acceptance/nas-50-editor-report-self-check.sh docs/acceptance/artifacts/real-nas-50-editor-report.json`: passed.
- `npm run audit:local-real-nas-phase`: passed with `ok: true`, local Web snapshot `v003022`, and 50-editor snapshot `v003022`.
- `npm run package:evidence-kit`: passed.
- `npm run validate:evidence-kit-manifest`: passed with `ok: true` and `file_count = 19`.
- `npm run test:acceptance-evidence`: passed, 125/125 tests.
- `npm run audit:delivery-readiness`: passed with `ok: true`, remaining target gates `ACC-008` and `ACC-009`.

## Manual Test Focus

When the Cutter API is started with `MIXLAB_CUTTER_AUTH_MODE=local_trusted`, a fresh local browser can automatically enter the cutter workbench as the trusted local cutter after reading `/cutter/auth/mode`. Reviewed team/NAS deployments still require the normal cutter-user approval flow.

Recommended tester entry points:

- Admin Web: `http://127.0.0.1:5176/`
- Cutter Web: `http://127.0.0.1:5177/`
- Material Locator with a known real-NAS query: `http://127.0.0.1:5177/#material-locator?query=现金流`

Current local test card:

- Expected index signal: Admin dashboard, searchd health, Cutter Material Locator, and the saved report should agree on `v003022` during this recorded run.
- Expected library scale: Admin dashboard should show about `3022` searchable videos and `403605` transcript segments, with `17/50` active cutter capacity and `search_p95_ms = 121`.
- Suggested cutter query: `现金流`.
- Expected dashboard write lock: Dashboard should show `真实 NAS 写入动作` as `未解锁`; `智能扫描`, `重试失败视频` should be disabled until the operator explicitly unlocks writes.
- Expected admin write lock: preprocessing should show `真实 NAS 写入动作` as `未解锁`; `重试失败`, `发布待索引视频`, `校验索引`, `恢复处理中任务`, `启动预处理流水线`, and `暂停预处理流水线` should be disabled until the operator explicitly unlocks writes.
- Expected source videos write lock: Source Videos should show `真实 NAS 写入动作` as `未解锁`; `重试此视频`, `保存封面`, `保存公开说明` should be disabled until the operator explicitly unlocks writes.
- Expected search result shape: Material Locator should show local searchd, NAS read-only status, `96` candidates, `201` total hits, and public NAS source results under `⌄ 公共原素材（10）`.
- Expected transcript locator shape: the transcript header should expose a current hit counter like `111 / 201`, current video hit count `3`, selected sentence count `2`, and full transcript length `2513` characters.
- Expected selection proof: after dragging across at least two full-transcript rows with `selection_method = transcript-drag`, the right-side selection proof strip should show source `公共原素材`, time range `06:58 - 07:06`, `47 字`, `selected_sentence_count = 2`, `selected_text_segment_count = 2`, and a global hit counter like `111/201`.
- Expected cut feedback: after dragging full-transcript context around the keyword and cutting, the UI should show `剪切完成 · 本地素材已更新 1`; the local library should contain the selected text, Cut Tasks should show the completed job/output, and local reusable materials should appear before public materials on the next search (`⌄ 本地素材（86）` before `⌄ 公共原素材（94）`).
- Write boundary: cutter-side testing should create files under the local cutter workspace only, not under `/Volumes/MixLab/PublicLibrary`; the saved report should keep `public_library_write_detected = false`.

Use this checklist for manual local Web testing:

- Admin dashboard: confirm the page shows the current index version, 50-editor capacity, search p95, local search coverage, zero search failures, source-video scale, and real NAS preprocessing status; keep the dashboard write lock off and confirm `智能扫描` remains disabled until explicitly approved.
- Admin source videos: open the source-video list, confirm real NAS rows load, status/filter/pagination controls remain usable, ready rows are marked searchable/visible without horizontal overflow, and failed-row retry plus cover/public metadata save buttons remain disabled while `真实 NAS 写入动作` is `未解锁`.
- Admin preprocessing: inspect queue, processing, failed, and current index state. Keep the real NAS write lock off for read-only testing; do not unlock or trigger recovery, retry, rebuild, queue mutation, Doctor, publish, or supervisor state changes unless explicitly approved for the test session.
- Admin Doctor and settings: confirm FFmpeg/FFprobe, ASR configured state, source folder, runtime policy, and public-library path are visible without exposing API keys or bearer tokens.
- Cutter entry: in a fresh local browser context, confirm the cutter workbench opens automatically as `本机剪辑师` only for this local trusted run.
- Cutter keyword search: search at least three different keywords, including `现金流`; each search should show `本地 searchd`, public NAS source candidates, result counts, and a responsive route state.
- Public source focus: after search results load, the transcript pane should default to a `公共原素材` result so the full-video transcript is shown even if local reusable clips appear first in the result list.
- Keyword location: verify the current hit time, segment id, global hit counter, current-video hit counter, and highlighted text agree visually with the full transcript context.
- Transcript selection: drag-select continuous sentence context around the keyword in the full transcript, broader than the keyword alone and at least two transcript sentences, then run a precise cut or quick cut. The completion notice should say the local material library was updated.
- Local library: open the local library and confirm the new clip is listed with traceability back to the public source video and selected text.
- Cut tasks: open the cut tasks page and confirm the completed job shows the selected text, output path, and `已完成` status.
- Public NAS protection: verify cutter-side cutting creates only local workspace outputs; it must not create cutter local-clip/export/project files inside the public NAS library.
- Layout pass: quickly check Material Locator, cut tasks, local library, public library, and settings at desktop and compact widths; no toolbar, status row, transcript panel, or result card should require horizontal scrolling for normal operation.

Useful manual notes to capture:

- searched keywords and whether all used local searchd;
- any query that felt slow or returned confusing grouping;
- source video id, segment id, and timestamp for one successful keyword location;
- selected transcript text, cut mode, completion notice, and local clip id;
- any admin route that looked stale, overflowed, exposed secrets, or invited an unsafe action too easily.

## Remaining Target Gates

This preflight supports the full product goal but does not close the full delivery:

- ACC-008 remains open until a fresh Windows 10/11 target verifies the packaged cutter desktop app, bundled runtime, paths, diagnostics, screenshots, and artifact provenance.
- ACC-009 remains open until a real NAS/SMB Docker admin target verifies deployment, read-only public library access, worker configuration, evidence attachments, and the final 50+ editor multi-user search-to-cut report.
