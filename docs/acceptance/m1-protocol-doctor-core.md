# M1 Protocol And Doctor Core Acceptance Record

Date: 2026-05-02
Updated: 2026-06-03

## Scope

This milestone implements the non-UI M1 contract layer.

Spec sources:

- `06_公共素材库协议.md`
- `07_数据模型与Manifest.md`
- `12_权限与路径解析规格.md`
- `19_增量预处理与可见性规则.md`
- `20_开发落地路线与技术护栏.md`
- `22_运行时依赖与ASR配置.md`

Hi-fi screen: none. M1 is infrastructure, not UI.

## Implemented

- Protocol validators for source video public metadata, local clip manifests, export clip manifests, and clip-list manifests.
- Source video manifest validation now rejects unsafe absolute/traversal artifact paths.
- Cutter source library now hides ready records if source media or required published artifacts are missing.
- `@mixlab/doctor-core` package with redacted JSON Doctor report.
- Doctor checks public root, `source-videos`, `.mixlab-library` writability, library counts, source manifests, current index, FFmpeg, FFprobe, ASR config, and local clip manifests.
- Local clip writer now validates manifests through the shared protocol validator before writing.

## Explicitly Not Implemented In M1

- Management UI.
- Cutter UI rebuild.
- Go admin service.
- Tauri desktop shell.
- SQLite/FTS production search.
- Formal Doctor export button in UI.

## Verification Commands

Targeted TDD commands:

```bash
node --test --import tsx packages/protocol/src/status.test.ts
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts
node --test --import tsx packages/doctor-core/src/index.test.ts
node --test --import tsx packages/library-fs/src/local-clips.test.ts
```

Milestone commands:

```bash
npm run typecheck
npm test
```

Result:

- `node --test --import tsx packages/protocol/src/*.test.ts`: passed, 32/32 tests.
- `npm run typecheck`: passed.
- `npm test`: passed, 598/598 tests.

## Acceptance Criteria

- Protocol validator tests pass.
- Incomplete `ready + visible_to_cutters=true` records are hidden from cutter list/detail/search.
- Doctor reports incomplete ready artifacts as failures.
- Doctor reports malformed local clip manifests as failures.
- Doctor reports DashScope key presence without exposing the key value.
- Full workspace typecheck and tests pass.

## Resolved After M1

- Shared `clip-list.json` validation was completed after M1 and is enforced by `@mixlab/cutter-local` write/read paths.

## Known Remaining Work

- Admin UI Doctor page and export action belong to M5.
- Tauri local file/folder actions belong to M8.
