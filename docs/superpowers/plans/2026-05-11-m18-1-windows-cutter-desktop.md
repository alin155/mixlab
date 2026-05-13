# M18.1 Windows Cutter Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. This implementation is cross-cutting; keep edits small and verify web mode after every major slice.

**Goal:** Deliver the first Windows-only cutter desktop path as a Tauri shell with a packaged cutter-api sidecar, while preserving the current web cutter workflow.

**Architecture:** Keep product logic in `apps/cutter-web`, `packages/cutter-api`, and shared packages. Add desktop-only runtime code around them: configuration persistence, Windows path validation, native directory selection, sidecar lifecycle, diagnostics, and packaging scripts.

**Tech Stack:** Tauri v2, React/Vite cutter web assets, TypeScript runtime packages, Node-based cutter-api sidecar packaged as a Windows executable, bundled FFmpeg/FFprobe for Windows.

---

## Hard Constraints

- Web first: `npm run dev:cutter-web`, `npm run server:cutter-api`, and `npm run smoke:cutter-api-web` must remain valid.
- Desktop must be additive. No desktop-specific behavior may be required by browser mode.
- First target is Windows `.exe` only. Do not add macOS `.app`, `.dmg`, Windows `.msi`, signing, auto-update, tray, or login-start work.
- Target Windows computer is fresh: no Node.js, npm, Git, FFmpeg, source repo, or command-line operation required.
- Desktop reads the public library and writes only to the local workspace.
- Public library paths must support drive paths, spaces, Chinese characters, deep paths, and UNC paths without mapping UNC to drive letters.
- If desktop runtime fails, web mode remains a usable fallback.

## Phase 0 - Baseline And Branch Hygiene

Status on 2026-05-11 in `.worktrees/m18-windows-cutter-desktop`:

- branch/worktree check passed;
- `npm install` failed because `ffmpeg-static` download timed out after 30s;
- `npm install --ignore-scripts` succeeded for TypeScript/Vite/test dependencies;
- `npm run typecheck` passed;
- `npm run build:cutter-web` passed;
- `npm test` baseline has 444 passing and 2 failing tests caused by missing bundled FFmpeg files after `--ignore-scripts`:
  - `packages/doctor-core/src/index.test.ts` reports FFmpeg health as `fail`;
  - `packages/ffmpeg-core/src/cut-plan.test.ts` cannot resolve bundled `ffmpeg`/`ffprobe`.

- [x] Verify branch and worktree.
  - Expected branch: `codex/m18-windows-cutter-desktop`.
  - Expected worktree: `.worktrees/m18-windows-cutter-desktop`.
  - Command:
    ```sh
    git branch --show-current
    git status --short
    ```
- [x] Install workspace dependencies in the worktree if `node_modules` is absent.
  - Command:
    ```sh
    npm install
    ```
- [x] Run baseline checks before edits.
  - Commands:
    ```sh
    npm run typecheck
    npm test
    npm run build:cutter-web
    ```
  - If these fail before M18 changes, record the baseline failure and do not hide it inside desktop work.

## Phase 1 - Desktop Runtime Core

Create a small shared package for desktop-only path, config, and diagnostics logic. This keeps Tauri commands thin and makes Windows edge cases testable without launching a desktop app.

- [x] Add `packages/desktop-runtime/package.json`.
  - Package name: `@mixlab/desktop-runtime`.
  - Exports: `./src/index.ts`.
  - Dependencies: only existing workspace packages unless a new dependency is justified.
- [x] Add `packages/desktop-runtime/src/index.ts`.
  - Export typed config:
    ```ts
    export interface CutterDesktopConfig {
      api_host: "127.0.0.1";
      api_port: 3789;
      public_library_root: string;
      local_workspace_root: string;
      ffmpeg_path?: string;
      ffprobe_path?: string;
    }
    ```
  - Export helpers:
    - `defaultWindowsWorkspaceRoot(env)`
    - `normalizeDesktopPathForStorage(path)`
    - `isWindowsUncPath(path)`
    - `isSubPath(candidate, parent)`
    - `validatePublicLibraryCandidate(path, fsLike)`
    - `validateLocalWorkspaceCandidate(path, fsLike)`
    - `redactDesktopDiagnostics(input)`
    - `buildCutterApiEnv(config)`
- [x] Add `packages/desktop-runtime/src/index.test.ts`.
  - Tests must cover:
    - `D:\MixLabPublicLibrary`
    - `D:\MixLab Public Library`
    - `D:\素材库\MixLab公共素材库`
    - `E:\MixLabPublicLibrary`
    - `\\NAS\MixLab\PublicLibrary`
    - `\\NAS\MixLab Public Library`
    - `\\NAS\素材库\MixLab公共素材库`
    - local workspace defaults to `%USERPROFILE%\Videos\MixLabLocal`
    - local workspace cannot be inside public library
    - diagnostics redacts secrets and transcript-like text
- [x] Wire package into root workspaces through normal npm workspace discovery.
  - No custom resolver hacks.

## Phase 2 - Cutter API Sidecar Entry

The current `scripts/servers/cutter-api-server.ts` is a development entry. Add a desktop sidecar entry that can be packaged and can emit machine-readable lifecycle events.

- [x] Add `packages/cutter-api/src/desktop-sidecar.ts`.
  - Export `startCutterApiSidecar(input)`.
  - Responsibilities:
    - read desktop config JSON path from `--config <path>` or `MIXLAB_DESKTOP_CONFIG_PATH`;
    - map config to existing `createCutterApiServer`;
    - force API address `127.0.0.1:3789`;
    - use bundled FFmpeg/FFprobe paths when provided;
    - emit JSON line events to stdout:
      - `starting`
      - `ready`
      - `failed`
      - `stopping`
    - write operational logs to the configured log directory;
    - stop cleanly on `SIGINT` and `SIGTERM`.
- [x] Add `packages/cutter-api/src/desktop-sidecar.test.ts`.
  - Test config parsing.
  - Test env generation.
  - Test missing config fails with a diagnostic-safe error.
  - Test sidecar emits `ready` after the API listens.
- [x] Keep `scripts/servers/cutter-api-server.ts` unchanged except for possible shared helper extraction.
  - `npm run server:cutter-api` must still work exactly as before.

## Phase 3 - Desktop Shell App

Add a Windows-only Tauri app that embeds the built cutter web app. The shell owns native capabilities; cutter web remains the product UI.

- [x] Add `apps/cutter-desktop/package.json`.
  - Scripts:
    - `dev`
    - `build:web`
    - `build:sidecar`
    - `tauri:dev`
    - `tauri:build`
  - Dependencies should be desktop-specific and must not be required by `apps/cutter-web`.
- [x] Add Tauri scaffold under `apps/cutter-desktop/src-tauri/`.
  - Required files:
    - `Cargo.toml`
    - `tauri.conf.json`
    - `src/main.rs`
    - capabilities config
  - Tauri window loads built cutter web assets.
  - Tauri allowlist/capabilities are minimal:
    - choose directory;
    - open/reveal folder;
    - spawn/stop sidecar;
    - read/write desktop config;
    - copy diagnostics;
    - open log directory.
- [x] Add desktop bootstrap bridge.
  - `apps/cutter-web` may dynamically detect desktop runtime, but browser mode must not import or require Tauri at startup.
  - Browser mode fallback returns:
    ```ts
    { mode: "web", desktop_available: false }
    ```
  - Desktop mode returns:
    ```ts
    { mode: "desktop", desktop_available: true, api_base_url: "http://127.0.0.1:3789" }
    ```
- [x] Add tests for desktop bridge fallback.
  - Browser mode tests must pass without Tauri globals.

## Phase 4 - First-Run Wizard And Diagnostics

Implement the first-run gate in desktop mode only.

- [x] Add desktop first-run state to cutter web without changing web mode routing.
  - Desktop first-run sequence:
    1. welcome;
    2. choose public library path;
    3. Doctor checks;
    4. confirm local workspace;
    5. start local engine;
    6. enter workbench.
- [x] Add public-library Doctor checks.
  - Must verify:
    - `source-videos` readable;
    - `.mixlab-library` readable;
    - `current.json` readable;
    - at least one cutter-visible `ready` material;
    - no public-library write attempt.
- [x] Add local-workspace Doctor checks.
  - Must verify:
    - directory exists or can be created;
    - writable;
    - not inside public library.
- [x] Add diagnostics screen.
  - Minimum fields:
    - stage;
    - error summary;
    - API address;
    - log path;
    - public library path;
    - local workspace path;
    - FFmpeg status;
    - Doctor result.
  - Actions:
    - retry;
    - reselect public library;
    - reselect workspace;
    - open log directory;
    - copy diagnostics;
    - exit.
- [x] Keep existing sidebar engine card as the normal user-facing runtime status.
  - Do not expose raw ports, process ids, or logs outside diagnostics/advanced information.

## Phase 5 - Sidecar Packaging And Windows Runtime Assets

Implement build scripts so Windows packaging can produce the required runtime layout. Mac can generate source/build artifacts, but the final `.exe` must be validated on Windows.

- [x] Add `scripts/desktop/build-cutter-sidecar.ts`.
  - Build `packages/cutter-api/src/desktop-sidecar.ts` into a distributable sidecar artifact.
  - Windows target output name: `cutter-api-sidecar-x86_64-pc-windows-msvc.exe`.
  - The target Windows machine must not need Node installed.
  - If the selected executable bundling tool has Windows-only steps, the script must fail clearly on macOS with instructions instead of producing a misleading artifact.
- [x] Add `scripts/desktop/verify-windows-runtime-assets.ts`.
  - Validate required runtime files:
    - sidecar executable;
    - `ffmpeg.exe`;
    - `ffprobe.exe`;
    - built cutter web assets;
    - default config template.
- [x] Add Windows runtime asset directory convention.
  - Suggested path:
    ```text
    apps/cutter-desktop/src-tauri/binaries/
    ```
  - Do not commit large third-party binaries unless explicitly approved.
  - If binaries are not committed, document exactly where to place them for packaging.
- [x] Add root package scripts:
  - `dev:cutter-desktop`
  - `build:cutter-desktop`
  - `package:cutter-desktop:windows`
  - `verify:cutter-desktop:windows-assets`

## Phase 5.5 - Windows Packaging Orchestrator

After confirming the first desktop foundation, add a single packaging command that a Windows build machine can execute without remembering the individual build steps. This keeps the development Mac path honest: it can run tests and web builds, but it must not pretend to produce the final Windows installer.

- [x] Add `scripts/desktop/package-windows-desktop.ts`.
  - It fails early on non-Windows hosts with an explicit Windows build-machine message.
  - It runs the required Windows packaging steps in order:
    1. `npm run build:cutter-web`
    2. `npm run build:sidecar -w @mixlab/cutter-desktop`
    3. `npm run prepare:cutter-desktop:windows-assets`
    4. `npm run verify:cutter-desktop:windows-assets`
    5. `npm run tauri:build -w @mixlab/cutter-desktop`
- [x] Add `scripts/desktop/prepare-windows-runtime-assets.ts`.
  - It copies Windows `ffmpeg.exe` and `ffprobe.exe` from the installed static runtime packages into Tauri resources.
  - It fails early on non-Windows hosts to avoid copying macOS binaries into Windows-named files.
- [x] Make `npm run package:cutter-desktop:windows` call the orchestrator directly.
- [x] Make `npm run build:cutter-desktop` an alias for `npm run package:cutter-desktop:windows`.
- [x] Cover the orchestrator with focused tests for command order, Windows `npm.cmd`, and non-Windows early failure.

## Phase 5.6 - GitHub Actions Windows Build Machine

Provide a managed Windows build machine so non-technical users do not need to install Node, Rust, Tauri, or FFmpeg tooling locally.

- [x] Add `.github/workflows/cutter-desktop-windows.yml`.
  - Manual trigger through `workflow_dispatch`.
  - Runs on `windows-latest`.
  - Installs Node dependencies with `npm ci`.
  - Installs Rust stable.
  - Runs typecheck and focused desktop packaging tests.
  - Runs `npm run package:cutter-desktop:windows`.
  - Uploads the generated NSIS `.exe` from `apps/cutter-desktop/src-tauri/target/release/bundle/nsis/*.exe` as `mixlab-cutter-windows-exe`.
- [x] Document the user workflow: GitHub Actions page -> run workflow -> download artifact.

## Phase 6 - Web Regression Protection

Desktop work must prove it did not damage browser mode.

- [x] Run non-desktop regression checks:
  ```sh
  npm run typecheck
  npm test
  npm run build:cutter-web
  npm run smoke:cutter-api-web
  ```
  - `npm run typecheck` passed.
  - `npm run build:cutter-web` passed.
  - Targeted browser/desktop regression tests passed.
  - `npm test` still has the recorded baseline FFmpeg/FFprobe failures caused by missing bundled FFmpeg files after `npm install --ignore-scripts`.
  - `npm run smoke:cutter-api-web` still fails for the same missing FFmpeg runtime.
- [x] Verify browser mode still reads API base URL from `VITE_MIXLAB_CUTTER_API_BASE_URL`.
- [x] Verify fixture fallback still works when no API base URL is provided.
- [x] Verify settings page still supports web-mode cutter runtime display.
- [x] Verify material locator, local library, public library, and cut tasks still load in web mode.

## Phase 7 - Windows Acceptance Documentation

Because final Windows `.exe` validation runs on a separate Windows computer, create an acceptance guide that is executable by a human tester.

- [x] Add `docs/acceptance/m18-1-windows-cutter-desktop.md`.
  - Include:
    - build machine assumptions;
    - target fresh Windows 10/11 assumptions;
    - installer installation steps;
    - first-run path selection;
    - public library path matrix;
    - failure matrix;
    - expected log locations;
    - what screenshots/logs to collect when failing.
- [x] Include explicit acceptance cases:
  - Windows 10 64-bit fresh machine;
  - Windows 11 64-bit fresh machine;
  - no Node/npm/Git/FFmpeg installed;
  - drive path public library;
  - Chinese path public library;
  - path with spaces;
  - UNC public library;
  - NAS offline;
  - unreadable NAS;
  - port `3789` occupied by unrelated process;
  - missing `current.json`;
  - no ready materials;
  - successful search/play/cut/local-library-refresh/open-output-folder.

## Phase 8 - Final Review And Commit

- [ ] Review changed files and confirm no unrelated local context files are staged.
  ```sh
  git status --short
  git diff --stat
  ```
- [ ] Run final verification.
  ```sh
  npm run typecheck
  npm test
  npm run build:cutter-web
  npm run smoke:cutter-api-web
  ```
- [ ] If desktop build cannot be fully verified on macOS, state that clearly and point to the Windows acceptance guide.
- [ ] Commit with a focused message after verification.
  - Suggested message:
    ```text
    feat: add windows cutter desktop foundation
    ```

## Self-Review Against Approved Spec

- Windows-only `.exe`: planned, with macOS `.app`/`.dmg` explicitly excluded.
- Fresh Windows machine: planned through sidecar executable and bundled FFmpeg/FFprobe validation.
- Web first: protected by hard constraints and regression phase.
- Tauri shell, not rewrite: planned with product logic remaining in existing web/API packages.
- Public library read-only: planned through Doctor checks and workspace/public-library separation.
- UNC support: planned through desktop-runtime tests and acceptance matrix.
- First-run gate: planned before entering workbench.
- Diagnostics: planned with redaction and required actions.
- Existing runtime status: retained as default user-facing status.
- Windows machine validation: documented as required because final `.exe` cannot be proven on this Mac alone.
