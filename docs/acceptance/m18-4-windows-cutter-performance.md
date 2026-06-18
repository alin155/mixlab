# M18.4 Windows Cutter Performance Acceptance

## Goal

Verify that the Windows Cutter app no longer stalls on the core cutter workflow:

- app/runtime status;
- public material first page;
- keyword search;
- selected source detail and full transcript;
- cache observability;
- real cut job execution.

This acceptance focuses on the packaged Windows app and the real public material library. Shared-folder agent/watchdog is not part of the acceptance path.

## Environment

- Repository branch: `codex/windows-first-run-autostart-20260615104835`
- Verified app commit: `521e977`
- Installer: `/Users/huaqihang/Public/MixLabWindowsBuilds/MixLab Cutter_0.18.10_x64-setup-521e977.exe`
- Installer SHA-256: `0a5641251e526af16dfa064192e97bcd82ebf07a94c454029d76c74bd6bbf990`
- GitHub Actions run: `27731867633`
- Windows Test Runner main endpoint: `http://192.168.1.20:3799`
- Main Runner version: `0.1.10`
- Real cut smoke Runner version: `0.1.12` via temporary backup runner

## Fix Under Test

Commit `521e977` changes source-video cache behavior during cuts:

- opening source detail no longer starts a full source-video prefetch;
- cold cuts no longer start full source-video cache copying before or during FFmpeg;
- if a valid local source-video cache already exists, cutting still uses it;
- after a successful cold cut, source-video cache warmup starts in the background.

The target regression is the previous self-induced NAS I/O contention where FFmpeg and full-file cache copy could read the same NAS source at the same time.

## Windows Reports

| Report | Result | Path |
| --- | --- | --- |
| Install + smoke | Passed | `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/install_latest_and_smoke-20260618T022050Z-c27f0dee/report.json` |
| Non-destructive acceptance | Passed | `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/windows_acceptance-20260618T024258Z-e94142c0/report.json` |
| Real cut smoke, first post-fix run | Passed | `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/real_cut_smoke-20260618T023159Z-f15e410b/report.json` |
| Real cut smoke, repeat run | Passed | `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/real_cut_smoke-20260618T024837Z-3e57a5bd/report.json` |

## Performance Evidence

### Non-Destructive Acceptance

`windows_acceptance-20260618T024258Z-e94142c0`

| Check | Result |
| --- | --- |
| Auth mode | `local_trusted` |
| Available public videos | `7950` |
| Runtime status | `7ms` inside app runtime smoke |
| Public library first page | `20 / 7950`, `8ms` |
| Real data source library | `20 / 7950`, `4ms` |
| Search `第一场` | `10` groups, `14` hits, `12ms` |
| Selected detail | `V000868`, `8248` chars, `277` segments, `6ms` |
| Cut jobs list | `6` jobs, `2ms` |
| Observed cache buckets | `4` |
| Total observed cache | `28,670,929,262` bytes |
| Release cache | `1,109,861,341` bytes |
| Source-video cache | `27,559,860,594` bytes, `3` cached videos |
| Cut-temp cache | `0` bytes |

The outer probe in this run observed one cold `runtime_status` at `2372ms`, but immediate follow-up probe runs returned `84ms`, `9ms`, and `8ms`. The product API therefore remained responsive after the cold status fill.

### Real Cut Comparison

Same query and source: `第一场`, `V000868 / C0629`.

| Run | Search | Detail | Run-next | Resolve source | Preflight | Cut media |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before fix: `real_cut_smoke-20260618T013114Z-349782be` | `15ms` | `5ms` | `29945ms` | `1508ms` | `542ms` | `27718ms` |
| After fix: `real_cut_smoke-20260618T023159Z-f15e410b` | `12ms` | `5ms` | `1265ms` | `1ms` | `29ms` | `1069ms` |
| Repeat: `real_cut_smoke-20260618T024837Z-3e57a5bd` | `7ms` | `5ms` | `475ms` | `2ms` | `40ms` | `258ms` |

## Local Code Gates

Run on macOS repository machine:

```sh
npm run typecheck
node --test --import tsx packages/cutter-api/src/index.test.ts
npm run test:windows-test-runner
npm run build:cutter-web
```

Results:

- `npm run typecheck`: passed
- Cutter API focused tests: `52/52` passed
- Windows Test Runner tests: `21/21` passed
- Cutter Web build: passed

## Acceptance Conclusion

Passed for the current Windows packaged Cutter performance batch.

The original slowdown was not keyword search itself. Search and source detail stayed in the millisecond range. The slow path was first-cut media execution caused by source-video cache prefetch contention. The verified Windows package removes that contention and the repeated real-cut smoke remained below one second for `run-next` on the cached repeat path.

Remaining watch item: cold `runtime-status` can have an isolated multi-second outlier when cache/runtime status is being filled for the first time. Follow-up probes were below `100ms`, so this is not currently blocking the cutter workflow, but it should stay in future acceptance reports.
