# M18.1 Windows Cutter Desktop Acceptance

## Goal

Verify the Windows-only MixLab Cutter desktop installer on a fresh Windows computer. The desktop build must not require Node.js, npm, Git, FFmpeg, or command-line operation on the target machine.

## Build Machine Assumptions

- Build target: Windows 10/11 64-bit.
- Package target: NSIS `.exe` installer.
- Final installer packaging is performed on a Windows build machine, not on the development Mac.
- Build machine prerequisites:
  - Node.js and npm;
  - Rust toolchain and Tauri build prerequisites;
  - Windows runtime assets listed below.
- Required runtime assets are present before packaging:
  - `apps/cutter-desktop/src-tauri/binaries/cutter-api-sidecar-x86_64-pc-windows-msvc.exe`
  - `apps/cutter-desktop/src-tauri/binaries/ffmpeg.exe`
  - `apps/cutter-desktop/src-tauri/binaries/ffprobe.exe`
  - `apps/cutter-desktop/src-tauri/resources/default-desktop-config.json`
  - `apps/cutter-web/dist/index.html`

Run before packaging:

```sh
npm run package:cutter-desktop:windows
```

This command runs the web build, sidecar build, Windows FFmpeg asset preparation, runtime asset verification, and Tauri NSIS packaging in order. On non-Windows hosts it must fail early with a clear Windows build-machine message instead of producing a misleading artifact.

If a human does not want to maintain a Windows build machine, use the GitHub Actions workflow:

```text
Actions -> Cutter Desktop Windows Package -> Run workflow
```

After the workflow finishes, download the `mixlab-cutter-windows-exe` artifact. It contains the generated NSIS `.exe` installer.

## Target Machine Assumptions

Validate on both:

- Windows 10 64-bit fresh machine.
- Windows 11 64-bit fresh machine.

The machine must not have these preinstalled:

- Node.js;
- npm;
- Git;
- FFmpeg or FFprobe;
- MixLab source repository.

## First-Run Flow

1. Install the generated `.exe` installer.
2. Launch MixLab Cutter from the Start menu.
3. Confirm the app does not require a command line.
4. Select public library path.
5. Confirm Doctor checks run before entering the workbench.
6. Confirm local workspace defaults to:

```text
%USERPROFILE%\Videos\MixLabLocal
```

7. Start local engine.
8. Confirm sidebar engine status reaches normal.
9. Enter cutter workbench.

## Public Library Path Matrix

Each path must verify search, playback, cut, local library refresh, and output folder reveal.

```text
D:\MixLabPublicLibrary
D:\MixLab Public Library
D:\素材库\MixLab公共素材库
E:\MixLabPublicLibrary
\\NAS\MixLab\PublicLibrary
\\NAS\MixLab Public Library
\\NAS\素材库\MixLab公共素材库
```

For every path:

- first-run wizard can select it;
- Doctor reports accurate pass/fail details;
- public library is not written by the cutter app;
- ready materials appear in public library;
- material locator search works;
- selected result loads video preview;
- video playback works;
- one cut job completes;
- project output folder opens;
- local library refreshes with the new local clip.

## Failure Matrix

Verify that each failure opens diagnostics and does not silently enter a broken workbench:

- public library path does not exist;
- `source-videos` missing;
- `.mixlab-library` missing;
- `.mixlab-library/indexes/source-transcript-index/current.json` missing;
- no cutter-visible ready materials;
- local workspace not writable;
- local workspace selected inside public library;
- port `3789` occupied by an unrelated process;
- FFmpeg missing or not executable;
- FFprobe missing or not executable;
- NAS path offline;
- NAS path exists but is unreadable.

## Diagnostics Expectations

Diagnostics must include:

- stage;
- error summary;
- API address;
- log path;
- public library path;
- local workspace path;
- FFmpeg/FFprobe status;
- Doctor check result;
- retry action;
- reselect public library action;
- reselect local workspace action;
- open log directory action;
- copy diagnostics action;
- exit action.

Diagnostics must not include:

- ASR keys;
- signed URL query strings;
- full private transcript text;
- pasted user search text.

Expected log directory:

```text
%APPDATA%\MixLab Cutter\logs\
```

Expected runtime log file:

- `cutter-api-sidecar.ndjson`.

Doctor details are also included in copied diagnostics from the first-run screen.

## Regression Checks

Before accepting desktop work, rerun web mode:

```sh
npm run typecheck
npm test
npm run build:cutter-web
npm run smoke:cutter-api-web
```

If the desktop app fails, the web fallback must still work:

```sh
npm run server:cutter-api
npm run dev:cutter-web
```

## Evidence To Collect

For each Windows environment:

- installer file name and version;
- screenshot of first-run Doctor pass;
- screenshot of normal engine status;
- screenshot of material locator search result and playback;
- screenshot of completed cut job;
- screenshot of local library showing new local clip;
- copied diagnostics from one successful run;
- copied diagnostics from one induced failure.
