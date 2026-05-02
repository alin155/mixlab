# MixLab V3 Spec Traceability

This file is the delivery baseline. Implementation work must reference these IDs before changing code.

Source specification directory:

```text
/Users/allen/Desktop/MixLab_V3_开发交付规格书
```

Hi-fi references:

```text
/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png
/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png
```

## Status Legend

| Status | Meaning |
|---|---|
| validated-core | Core behavior exists and has automated tests. |
| preview-ui | A development preview exists but is not final product UI. |
| partial | Some supporting behavior exists, but the requirement is not accepted. |
| not-started | No formal product implementation exists yet. |
| accepted | Implemented and accepted against the spec. |

## Product And Scope

| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| PROD-001 | `00_交付总说明.md` | Follow the delivery spec as binding scope; changes require written confirmation. | partial | Every milestone references this traceability file. |
| PROD-002 | `01_产品定位与边界.md` | First version supports search, full transcript reading, continuous selection, local cutting, and reusable exports. | partial | Stage 1 acceptance report passes sections 5-7 of `14_验收标准与测试剧本.md`. |
| PROD-003 | `02_角色与双端关系.md` | Admin writes/governs public library; cutter reads public library and writes local workspace only. | partial | Doctor and tests prove cutter writes no public-library files. |
| PROD-004 | `15_不做清单.md` | Do not add out-of-scope AI recommendations, collaboration, complex permissions, or cloud material management in version one. | partial | Any new feature not mapped to this file is rejected or documented as a change request. |

## Architecture And Runtime

| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| ARCH-001 | `03_硬件与部署环境.md` | Develop first on one Mac plus mobile disk; Mac mini and NAS are later stages. | partial | Stage reports are created in order: single Mac, Mac mini, team trial, Windows, NAS. |
| ARCH-002 | `04_技术架构方案.md` | Keep API boundary between UI and backend/index implementation. | validated-core | Cutter UI accesses public data through `packages/cutter-api`, not direct DB tables. |
| ARCH-003 | `05_技术栈选型.md` | Formal admin backend is Go; formal cutter desktop is Tauri + React + TypeScript. | not-started | Go/Tauri parity exists or a written change request is accepted. |
| ARCH-004 | `12_权限与路径解析规格.md` | Portable manifests must use library id, source video id, and relative paths rather than public-library absolute paths. | validated-core | Tests cover macOS, Windows drive, UNC, traversal rejection, and Chinese/space paths. |
| ARCH-005 | `22_运行时依赖与ASR配置.md` | FFmpeg/FFprobe are bundled or configurable; users are not asked to manually install FFmpeg for first version. | validated-core | Settings and Doctor show FFmpeg source/status without manual install. |
| ARCH-006 | `22_运行时依赖与ASR配置.md` | DashScope API key and ASR logs are redacted. | validated-core | Tests prove request/log redaction and no key appears in diagnostics. |

## Public Library And Preprocessing

| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| LIB-001 | `06_公共素材库协议.md` | Public library directory structure is fixed and NAS-compatible. | validated-core | Scanner creates `source-videos` and `.mixlab-library` compatible structures. |
| LIB-002 | `06_公共素材库协议.md` | Each source video has stable `source_video_id`. | validated-core | Rescan tests preserve existing ids and add new ids deterministically. |
| LIB-003 | `06_公共素材库协议.md`, `19_增量预处理与可见性规则.md` | Only `ready` videos are cutter visible/searchable. | validated-core | Tests prove unprocessed, processing, failed, and index-required videos are hidden. |
| LIB-004 | `19_增量预处理与可见性规则.md` | Partially preprocessed library is usable; ready videos appear while later videos continue processing. | partial | 10-video incremental visibility acceptance test passes. |
| LIB-005 | `07_数据模型与Manifest.md` | `library.json`, `source-video.json`, `transcript.json`, `keyframes.json`, `clip-list.json`, and `export-clip.json` match the schema. | partial | Manifest validators and fixture tests exist for every schema. |
| LIB-006 | `20_开发落地路线与技术护栏.md` | Ready publication is atomic and follows transcript/SRT/keyframes/cover/index validation before visibility. | validated-core | Ready publisher tests cover complete and incomplete artifacts. |
| LIB-007 | `20_开发落地路线与技术护栏.md` | Versioned read-only index packages and `current.json` are used. | validated-core | Index tests prove immutable package publication and current pointer validation. |
| LIB-008 | `22_运行时依赖与ASR配置.md` | ASR uses DashScope temporary upload storage rather than local file paths. | validated-core | Tests and live spike use temporary upload and `oss://` submission. |

## Management End

| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| ADMIN-001 | `08_素材库管理端规格.md`, `21_视觉与交互设计规范.md` | Admin dashboard shows restrained public-library governance status. | partial | M5 admin web MVP dashboard exists; real backend status binding remains later. |
| ADMIN-002 | `08`, `21` | Public library settings initialize and validate root, `source-videos`, `.mixlab-library`, id, protocol, permissions. | partial | M5 settings UI/path checks exist; real init/write action remains backend work. |
| ADMIN-003 | `08`, `21` | Source video management edits public metadata: cover, tags, description, lecturer, course, category. | partial | M5 metadata UI exists; persistence to public library remains backend work. |
| ADMIN-004 | `08`, `19`, `21` | Preprocessing task page shows active, queued, completed, failed/retry, stage, logs, error reason. | partial | M5 jobs UI proves failed video does not block later success; real task control remains backend work. |
| ADMIN-005 | `08`, `20`, `21` | Index publication page shows current pointer, historical versions, validation, and atomic switch. | partial | M5 index page exists; real index rebuild/current switch remains backend work. |
| ADMIN-006 | `08`, `21`, `22` | Doctor checks public paths, manifests, artifacts, index, FFmpeg, ASR, permissions, counts, logs and exports JSON. | partial | Doctor core and M5 Doctor UI/export entry exist; real export file action remains backend/Tauri work. |
| ADMIN-007 | `22` | Admin ASR settings manage provider, model, audio mode, key configured status, and last failure reason. | partial | M5 settings UI redacts key state; secure persistence/test submit remains later runtime work. |

## Cutter End

| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| CUTTER-001 | `09`, `21` | Cutter has independent pages: public source library, search/document, cut list, local library, cut queue, settings. | accepted | M4 cutter web app renders all cutter pages with screenshot acceptance. Tauri shell remains a later packaging step. |
| CUTTER-002 | `21` | Public source library is gallery-first like Apple TV/Photos/Finder Gallery, not a table or backend dashboard. | accepted | M4 public library page is gallery-first, ready-only, and shows admin-configured cover/tags/description. |
| CUTTER-003 | `09`, `10`, `21` | Source detail shows video, complete transcript, timestamps, highlights, continuous selection, right inspector. | partial | M4 UI and state tests prove continuous selection becomes one cut-list span; richer player interactions remain later polish. |
| CUTTER-004 | `10`, `21` | Search results are grouped by source video and open full transcript context; no sentence waterfall. | accepted | M4 search tests and visual checks assert grouped source-video layout and forbid sentence-waterfall UI. |
| CUTTER-005 | `09`, `11`, `21` | Cut list persists segment spans, ordering, cut mode, clear/delete, and submit. | partial | M4 local state and UI cover span/order/delete/clear/submit; production queue persistence belongs to M7. |
| CUTTER-006 | `09`, `11`, `21` | Cut queue shows pending/running/done/failed/retry and does not block search. | partial | M4 queue page shows all states and non-blocking navigation; real FFmpeg execution belongs to M7. |
| CUTTER-007 | `09`, `11`, `21` | Local library is independent, searchable, reusable, and shows source traceability. | partial | M4 local-library UI is independent and traceable; native open/reveal/reuse execution belongs to Tauri/M7. |
| CUTTER-008 | `11`, `07` | Every export writes `export-clip.json`. | not-started | Export fixture contains video and manifest with source traceability. |
| CUTTER-009 | `22`, `21` | Settings show public mount path, local workspace, FFmpeg status, default cut mode, concurrency, Doctor entry. | partial | M4 settings UI shows all required fields and Doctor status; real connection/native path tests remain later. |

## Acceptance And Delivery

| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| ACC-001 | `14_验收标准与测试剧本.md` | Management initialization test. | not-started | Acceptance report includes pass/fail evidence. |
| ACC-002 | `14` | Preprocessing test with at least three videos. | partial | UI shows current file/stage and outputs transcript, SRT, keyframes, cover, manifest. |
| ACC-003 | `14` | Cutter connection test. | not-started | library/transcript/source readable, local workspace writable, public library not written. |
| ACC-004 | `14` | Incremental preprocessing visibility test with 10 videos. | partial | Ready-only visibility holds while worker continues. |
| ACC-005 | `14` | Search and document test. | partial | Grouped results, highlight, full transcript context. |
| ACC-006 | `14` | Selection and cutting test. | partial | Multi-sentence span exports as one local clip with manifest. |
| ACC-007 | `14` | Export reuse test. | partial | Local clip can be found, opened, traced to source, and opened in folder. |
| ACC-008 | `14` | Windows test. | not-started | Drive letter, UNC, Chinese path, FFmpeg, export parity pass. |
| ACC-009 | `14` | NAS final test. | not-started | SMB read-only public library and multi-user search/cut pass. |
| DELIV-001 | `16_交付物清单.md` | Deliver admin app, cutter app, public library protocol, docs, tests, acceptance reports. | partial | `docs/acceptance/*` and packaged apps exist. |
