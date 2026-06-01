# M18.1 Windows Cutter Desktop Design

## Status

Design approved in discussion on 2026-05-11.

## Scope

M18.1 delivers the first desktop build for the cutter side only. The first desktop target is Windows, not macOS.

The deliverable is a Windows `.exe` installer for a cutter desktop application. The installer must be usable on a fresh Windows 10/11 64-bit computer without Node.js, npm, Git, FFmpeg, or the source repository preinstalled.

## Core Principles

1. Web first: the existing web cutter app must continue to run independently.
2. Desktop as shell: Tauri is an additional runtime shell, not a rewrite of product logic.
3. Shared core: cutter search, playback, cut queue, local workspace, and material handling stay in the existing `apps/cutter-web`, `packages/cutter-api`, and shared packages.
4. Non-breaking rule: desktop work must not break `dev:cutter-web`, `server:cutter-api`, or `smoke:cutter-api-web`.
5. Fallback path: if the desktop build has a runtime issue, the web mode remains a usable fallback.
6. Cutter boundary: the cutter app reads source materials from the public library and writes cut outputs only to the local workspace. The only allowed public-library write from the cutter side is the lightweight cutter login/session record required for admin approval.

## Explicit Non-Goals

- macOS `.app` or `.dmg`.
- Windows `.msi`.
- Signing, notarization, or auto-update.
- Startup at login.
- Tray/background resident mode.
- Management desktop app.
- Cutter-side public-library initialization, repair, or source-material mutation.
- Rewriting `cutter-api` in Rust.
- Requiring users to run commands.

## Architecture

M18.1 uses Tauri with a Windows-first Node sidecar.

```text
MixLab Cutter Windows Desktop
  ├─ Tauri shell
  │   ├─ Windows application window
  │   ├─ native directory selection
  │   ├─ reveal/open folder commands
  │   ├─ sidecar process lifecycle
  │   └─ diagnostics and logs
  ├─ cutter-web
  │   └─ built React/Vite cutter workspace
  ├─ cutter-api sidecar
  │   └─ packaged Windows executable sidecar for existing Node/TypeScript API behavior
  └─ bundled runtime
      ├─ sidecar runtime files needed by cutter-api
      ├─ FFmpeg for Windows
      └─ FFprobe for Windows
```

The sidecar target is a Windows executable distributed inside the installer. The target Windows computer must not need Node.js or project source files.

## Runtime Modes

Web mode remains unchanged:

```text
npm run server:cutter-api
npm run dev:cutter-web
```

Desktop mode:

```text
Start MixLab Cutter from Windows
  → Tauri starts
  → Tauri launches cutter-api sidecar on 127.0.0.1:3789
  → health check runs
  → embedded cutter-web connects to the local API
```

## First-Run Flow

The desktop app must not enter the workbench without a valid public library path.

```text
Welcome
  → Choose public library path
  → Doctor checks public library
  → Confirm local workspace
  → Start local engine
  → Enter cutter workbench
```

Public library Doctor checks:

- `source-videos` exists and is readable.
- `.mixlab-library` exists and is readable.
- source transcript index `current.json` exists and is readable.
- at least one cutter-visible `ready` material exists.
- no public-library write is attempted.

If Doctor fails, the app blocks entry and shows:

- failed check item,
- selected path,
- reselect directory action,
- copy diagnostics action,
- exit action,
- instruction to contact the administrator.

## Local Workspace

Default Windows local workspace:

```text
%USERPROFILE%\Videos\MixLabLocal
```

Rules:

- It must be writable.
- It can be changed in settings.
- It must not be inside the public library.
- It stores projects, cut jobs, exported videos, and reusable local materials.

## Windows Path Requirements

M18.1 must support public libraries on:

```text
D:\MixLabPublicLibrary
E:\MixLabPublicLibrary
\\NAS\MixLab\PublicLibrary
```

Required path variants:

- Chinese paths, such as `D:\素材库\MixLab公共素材库`.
- Paths with spaces, such as `D:\MixLab Public Library`.
- Deep paths, such as `D:\Team\Project\MixLabPublicLibrary`.
- UNC paths, such as `\\NAS\MixLab\PublicLibrary`.

UNC rules:

- `\\server\share\path` is valid.
- UNC paths must not be converted to mapped drive letters.
- Doctor must distinguish missing paths from unreadable paths.
- Search, video playback, cover loading, subtitle loading, and SQLite index reads must work from UNC paths.

## Engine Lifecycle

M18.1 does not run at startup and does not stay resident in the tray.

```text
Open app
  → start cutter-api sidecar
  → run health check
  → enter workbench

Close app
  → stop cutter-api sidecar
  → release port and process
```

The app uses fixed local API address:

```text
http://127.0.0.1:3789
```

If the port is occupied:

- check whether it is a previous owned process;
- if it is not owned by the current app, show diagnostics;
- do not silently switch to a random port in M18.1.

## Runtime Dependency Rules

The Windows `.exe` installer must include:

- the Tauri app;
- built cutter-web assets;
- cutter-api sidecar executable;
- FFmpeg Windows binary;
- FFprobe Windows binary;
- default configuration template.

The user must not install FFmpeg manually. Settings and Doctor may display the runtime source and status.

## Diagnostics

If the local engine fails to start, show a diagnostic page.

Minimum page content:

- stage: sidecar startup, port check, public library check, local workspace check, or FFmpeg check;
- error summary;
- API address;
- log path;
- retry action;
- reselect public library action;
- reselect local workspace action;
- open log directory action;
- copy diagnostics action;
- exit action.

Log directory:

```text
%APPDATA%\MixLab Cutter\logs\
```

Log files:

- `app.log`
- `cutter-api.log`
- `doctor.log`

Copied diagnostics include:

- app version;
- Windows version;
- API address;
- public library path;
- local workspace path;
- FFmpeg status;
- Doctor check result;
- latest error summary.

Copied diagnostics must not include:

- ASR keys;
- signed URLs;
- full private transcript or user text content.

## User-Facing Engine Status

The existing sidebar engine card remains the default user-facing runtime status.

Visible fields:

- local engine: starting, normal, or abnormal;
- concurrency;
- CPU usage if available, otherwise `--`;
- disk I/O if available, otherwise `--`;
- local and public material counts.

Ports, process ids, and raw logs stay in diagnostics or advanced information.

## Acceptance Matrix

Windows environment:

- Windows 10 64-bit real machine.
- Windows 11 64-bit real machine.
- No Node.js required.
- No npm required.
- No Git required.
- No FFmpeg required.
- No command-line operation required.

Public library paths:

```text
D:\MixLabPublicLibrary
D:\MixLab Public Library
D:\素材库\MixLab公共素材库
E:\MixLabPublicLibrary
\\NAS\MixLab\PublicLibrary
\\NAS\MixLab Public Library
\\NAS\素材库\MixLab公共素材库
```

Each path verifies:

- first-run wizard can select the directory;
- Doctor reports accurate pass/fail results;
- source materials and ready artifacts are not mutated by the cutter app; cutter login/session records may be written for admin approval;
- ready materials appear;
- search works;
- video playback works;
- a cut job completes;
- project output folder opens;
- local library refreshes with the new clip.

Failure scenarios:

- public library does not exist;
- `current.json` is missing;
- no `ready` materials exist;
- local workspace is not writable;
- port `3789` is occupied by another process;
- FFmpeg or FFprobe is missing or not executable;
- NAS path is offline;
- NAS path exists but is unreadable.

## Verification

Non-desktop regression checks:

```text
npm run typecheck
npm test
npm run build:cutter-web
npm run smoke:cutter-api-web
```

Desktop checks:

- Tauri window starts.
- cutter-api sidecar starts.
- health check succeeds.
- closing the app stops the sidecar.
- port conflict opens diagnostics.
- packaged installer works on a fresh Windows machine.

## Spec Sources

- `docs/spec-traceability.md`
- `README.md`
- `docs/superpowers/plans/2026-05-02-mixlab-v3-spec-driven-delivery.md`
- Current M17 code baseline at commit `31a48f0`
