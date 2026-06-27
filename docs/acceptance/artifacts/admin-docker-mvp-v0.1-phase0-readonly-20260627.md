# Admin Docker MVP v0.1 Phase 0 Readonly Baseline

Date: 2026-06-27
Scope: GET-only / read-only baseline for `Admin Docker MVP v0.1`.

## Purpose

Record the current NAS-facing Admin state before any MVP v0.1 implementation work.

This artifact proves the starting point for the new plan:

- current NAS `18080` endpoint is reachable but still serves the old Admin API shape;
- compose default `8080` is not reachable from Mac;
- the production public-library counts are known before MVP changes;
- no NAS write, Docker upload, worker start, release/index mutation, or Cutter protocol change was performed.

## Environment

| Item | Observation |
| --- | --- |
| Mac local Admin Web | `http://127.0.0.1:5176` |
| Mac local Admin API | `http://127.0.0.1:3889` |
| NAS observed Admin endpoint | `http://192.168.1.27:18080` |
| NAS compose default endpoint | `http://192.168.1.27:8080` |
| Docker library root | `/data/PublicLibrary` |
| Current plan | `docs/architecture/admin-docker-mvp-v0.1-plan.md` |

## NAS Library Status

GET-only command:

```bash
curl --noproxy '*' -sS -m 5 \
  http://192.168.1.27:18080/api/admin/library/status
```

Observed response summary:

| Field | Value |
| --- | --- |
| `ok` | `true` |
| `root_path` | `/data/PublicLibrary` |
| `source_videos_path` | `/data/PublicLibrary/source-videos` |
| `mixlab_library_path` | `/data/PublicLibrary/.mixlab-library` |
| `video_count` | `11394` |
| `ready_video_count` | `10471` |
| `queued_video_count` | `904` |
| `processing_video_count` | `0` |
| `failed_video_count` | `0` |
| `index_required_video_count` | `19` |
| `current_index_version` | `v010471` |
| `index_status` | `needs-publish` |
| `disk_total_bytes` | `31840459087872` |
| `disk_available_bytes` | `681451835392` |
| Approx disk used | `97.86%` |

## API Contract Probe

GET-only commands:

```bash
for endpoint in \
  /api/admin/auth/status \
  /api/admin/data-loading/plan \
  /api/admin/release-gates \
  /health
do
  curl --noproxy '*' -sS -m 5 -o /tmp/mixlab-nas-probe.out \
    -w "%{http_code}\n" "http://192.168.1.27:18080$endpoint"
done
```

Observed status codes:

| Endpoint | HTTP |
| --- | --- |
| `/api/admin/auth/status` | `404` |
| `/api/admin/data-loading/plan` | `404` |
| `/api/admin/release-gates` | `404` |
| `/health` | `200` |

Interpretation:

- NAS `18080` is live enough to respond to legacy health/library status.
- It is not serving the current Admin Architecture / MVP API contract.
- The new Docker MVP cannot be declared live until these endpoints exist on the staged candidate.

## Port 8080 Probe

GET-only command:

```bash
curl --noproxy '*' -sS -m 5 -o /tmp/mixlab-nas-8080.out \
  -w "%{http_code}\n" http://192.168.1.27:8080/
```

Observed result:

```text
curl: (7) Failed to connect to 192.168.1.27 port 8080 after 79 ms: Couldn't connect to server
000
```

Interpretation:

- The compose default `8080` endpoint is not currently reachable from Mac.
- MVP staging must choose and document an explicit NAS port before release validation.

## Phase 0 Result

Status: pass for planning, blocked for Docker promotion.

Confirmed:

- Current ready baseline is `10471`.
- Current index baseline is `v010471`.
- Current total video count is `11394`.
- Current disk pressure is high, about `97.86%` used by observed total/available bytes.
- NAS `18080` still lacks MVP-required API endpoints.
- NAS `8080` is not reachable from Mac.

No write actions performed:

- no Docker upload;
- no compose restart;
- no NAS file writes;
- no worker start;
- no preprocess command;
- no scan apply;
- no release/index mutation;
- no Cutter protocol change.

Next implementation step:

- Begin Phase 1 from `docs/architecture/admin-docker-mvp-v0.1-plan.md`: MVP surface contraction and backend safety gate, using local tests only before any Docker staging.
