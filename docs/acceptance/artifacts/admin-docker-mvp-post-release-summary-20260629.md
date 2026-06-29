# Admin Docker MVP Post-Release Summary

Generated: 2026-06-29T16:05:00Z

## Result

Admin Docker MVP is live on the NAS runtime at `http://192.168.1.27:18080`.

The deployed image tag is `5a50922bc82f1b6728f247ed33e5885ab8cf6bef` for both the admin runtime path and admin web path.

## Passed Evidence

- GitHub image push succeeded: `docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T111722Z.json`
- NAS post-release smoke passed: `docs/acceptance/artifacts/admin-docker-post-release-smoke-20260629T155533Z.json`
- NAS Docker live-readonly probe observed the new API/image tag: `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T155219Z.json`
- NAS UGOS returned evidence was collected: `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260629T155229Z.json`
- Worker flags proof passed: `docs/acceptance/artifacts/admin-worker-env-proof-20260629T155243Z.json`
- NAS disk proof passed: `docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T155243Z.json`
- MVP readonly API proof passed: `docs/acceptance/artifacts/admin-docker-mvp-readonly-api-proof-20260629T155625Z.json`
- MVP browser QA passed: `docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/report.json`
- Post-release Windows Cutter acceptance passed: `docs/acceptance/artifacts/windows_acceptance-20260629T155927Z-d3649fad/report.json`

## Observed Runtime Baseline

- Admin URL: `http://192.168.1.27:18080`
- Public library root: `/data/PublicLibrary`
- Total source videos: `11394`
- Ready videos preserved: `10471`
- Current Cutter index preserved: `v010471`
- Processing count: `0`
- Queued count observed by admin UI/API: `904`
- Index-required count observed by admin UI/API: `19`
- Preprocess supervisor state: `idle`
- Worker production flags: disabled for library preprocess and ready publish workers
- NAS disk usage: healthy, about `68%`

## Browser QA

The Docker admin web login and MVP routes were checked with Playwright after deployment:

- `#/dashboard`: rendered real library baseline, `10471` ready, `v010471`, preprocess idle
- `#/cutter-users`: rendered cutter user table, `16` users, `15` approved, `1` disabled
- `#/preprocess-jobs`: rendered queue and index status, `904` queued, `0` processing, `0` failed
- `#/source-videos`: rendered paginated read-model list, `11394` total, `10471` searchable, first `20` loaded

Screenshots are archived under `docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/`.

## Safety Boundary

This release did not start production preprocessing.

It did not enable `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER` or `MIXLAB_ENABLE_READY_PUBLISH_WORKER` in the NAS worker.

It did not intentionally mutate ready preprocess artifacts, publish a new Cutter index, or rerun the `10471` ready videos.

The protected admin API/browser checks were GET/read-only except normal login/session creation and the Windows Cutter acceptance flow.

## Known Non-Blocking Follow-Up

A post-release `real_cut_smoke` run was attempted and failed as a Runner/test-harness issue:

- Failed report: `docs/acceptance/artifacts/real_cut_smoke-20260629T160001Z-10690865/report.json`
- Failure category: `cut_failure`
- Failure message: `Real cut smoke finished with status unknown.`
- Observed cause: the Windows desktop Cutter API has `auto_run_cut_queue` enabled. The smoke submitted `CJ20260629-0002`, then manual `/cutter/cut-jobs/run-next` returned HTTP 200 with `data:null`, which is consistent with the automatic drain path racing the manual run-next assertion.

The post-release `windows_acceptance` evidence still passed after the Docker deploy and proves reviewed auth, public library visibility, transcript detail, cache/runtime visibility, and cut-jobs list health from the Windows Cutter side.

## Conclusion

The NAS Docker Admin MVP is usable for the agreed core surfaces: admin login, cutter user management, source video management, and preprocess management visibility.

The data safety baseline is preserved: `10471` ready videos and Cutter index `v010471` remain intact, and the NAS preprocess worker remains disabled until a separate controlled production preprocess run is intentionally started.
