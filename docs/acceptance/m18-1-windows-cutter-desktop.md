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

After the workflow finishes, download the `mixlab-cutter-windows-exe` artifact for the generated NSIS `.exe` installer and the `mixlab-target-evidence-kit` artifact for the standalone evidence collectors.

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

- installer file name, version, and SHA-256 digest;
- screenshot of first-run Doctor pass;
- screenshot of normal engine status;
- screenshot of material locator search result and playback;
- screenshot of completed cut job;
- screenshot of local library showing new local clip;
- copied diagnostics from one successful run;
- copied diagnostics from one induced failure.

## Evidence JSON Gate

After collecting the screenshots, diagnostics, path-matrix results, and failure-matrix results, encode them in one JSON evidence file and run:

```sh
npm run template:windows-evidence -- docs/acceptance/evidence/windows-acc-008.json
npm run validate:windows-evidence -- docs/acceptance/evidence/windows-acc-008.json
```

The template command creates an intentionally failing draft with the complete field, path, and failure-case matrix. Replace every empty string and `false` value with real target-machine evidence before running the validator. The Windows validator is an ACC-008 preflight; it also rejects screenshot references that use absolute paths, backslashes, `..` traversal, the wrong OS folder, or a filename stem that does not match its field. Final delivery still requires the combined target gate after the NAS evidence file is also present:

```sh
npm run validate:target-evidence -- docs/acceptance/evidence/windows-acc-008.json docs/acceptance/evidence/nas-acc-009.json
```

On each Windows target, the PowerShell collector can update the same evidence file with clean-machine checks, first-run switches, screenshot paths, diagnostics text, and explicitly passed path/failure cases:

Generate the standalone collector kit on the repository machine, then copy `dist/acceptance/mixlab-evidence-kit/windows/` to the target Windows machine:

```sh
npm run package:evidence-kit
```

Alternatively, download the `mixlab-target-evidence-kit` artifact from either the `Cutter Desktop Windows Package` workflow or the `Target Evidence Kit` workflow, then copy its `windows/` folder to the target machine.

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-acc-008-collector.ps1 `
  -EvidencePath .\windows-acc-008.json `
  -EvidenceDir .\captures `
  -RepositoryCommitSha "<40-char-commit-sha>" `
  -EvidenceKitWorkflowRunUrl "https://github.com/alin155/mixlab/actions/runs/RUN_ID" `
  -InstallerWorkflowRunUrl "https://github.com/alin155/mixlab/actions/runs/RUN_ID" `
  -InstallerFilePath ".\captures\MixLab Cutter_0.1.0_x64-setup.exe" `
  -InstallerVersion "0.1.0" `
  -InstalledFromExe `
  -LaunchedFromStartMenu `
  -NoCommandLineRequired `
  -DoctorPassed `
  -DefaultWorkspacePathOk `
  -EngineStatusNormal `
  -EnteredWorkbench `
  -RequireCurrentEnvironmentComplete `
  -AllPublicLibraryPathsPassed `
  -AllFailureCasesPassed
```

Before leaving each Windows target, run the read-only local self-check from the copied kit:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-evidence-self-check.ps1 -EvidencePath .\windows-acc-008.json
```

The self-check reports remaining draft placeholders and missing referenced screenshots while the machine is still available. It does not replace the repository validators.
It also reads the referenced screenshot files enough to reject fake images and screenshots smaller than `640x360` before the tester leaves the Windows target.

Run the collector once on Windows 10 and once on Windows 11, preserving the same JSON file so both environments remain in the final evidence package. When returning evidence to the repository, copy `windows-acc-008.json` and the generated `screenshots/` folder together under `docs/acceptance/evidence/`; the validator reads those relative screenshot paths and fails if only the JSON is copied back.
Set `-RepositoryCommitSha` to the 40-character commit that produced the Windows installer and `mixlab-target-evidence-kit` artifacts, and set both workflow run URLs to the official `https://github.com/alin155/mixlab` GitHub Actions runs that produced those artifacts. Pass `-InstallerFilePath` when the downloaded `.exe` is available on the target machine; the collector records `installer.file_sha256` with `Get-FileHash -Algorithm SHA256`. If the installer file is not present, pass `-InstallerFileSha256` from the workflow artifact instead. The installer file name must include the recorded `-InstallerVersion`. When the kit is downloaded from the `Cutter Desktop Windows Package` workflow, these provenance fields, installer file name, installer SHA-256, and installer version are already prefilled in `windows-acc-008.json`. The final combined gate rejects missing provenance, missing installer SHA-256, mismatched installer file name/version evidence, rejects workflow run URLs outside the MixLab delivery repository, and rejects paired Windows/NAS evidence that does not reference the same repository commit.
With `-EvidenceDir .\captures`, the collector auto-picks `doctor-pass`, `engine-status`, `material-locator`, `cut-job` or `completed-cut`, `local-library`, `success-diagnostics.txt`, and `failure-diagnostics.txt` from that folder. Individual screenshot and diagnostics parameters still override the captures folder when a target machine needs a different file name.
Use `-RequireCurrentEnvironmentComplete` on each Windows 10/11 target pass once the local captures and matrices are ready. It fails before writing the JSON if the current environment is missing clean-machine proof, first-run proof, screenshots, diagnostics, public-library path matrix rows, or failure-case rows. If the tester completed the entire path matrix and failure matrix on that machine, pass `-AllPublicLibraryPathsPassed` and `-AllFailureCasesPassed`; otherwise pass only the verified rows with `-PassedPublicLibraryPath` and `-PassedFailureCase` and leave `-RequireCurrentEnvironmentComplete` off until the remaining rows are done.
The collector rejects screenshot files whose `.png`, `.jpg`, `.jpeg`, or `.webp` extension does not match the file signature, then copies accepted screenshots into `screenshots/<os>/` beside `windows-acc-008.json` and writes forward-slash relative paths. Use real target screenshots at least 640x360; the Windows preflight and final combined gate reject missing, fake, undersized, or semantically swapped screenshot attachments, including screenshot filenames that do not match their fields (`doctor-pass`, `engine-status`, `material-locator`, `cut-job`, and `local-library`). Do not hand-edit screenshot paths to Windows absolute paths, `.\...` paths, or swapped semantic filenames before running validation.
Supplied diagnostics files must be non-empty, must include `stage`, `api`, `log`, `public`, `workspace`, `ffmpeg`, `ffprobe`, `doctor`, and `retry`, and must not include ASR keys, signed URLs, private transcript text, pasted search text, or non-redacted bearer tokens.
The collector is a standalone PowerShell script so the target machine still does not need Node.js, npm, Git, FFmpeg, or the MixLab source repository.

The validator requires:

- both `windows-10` and `windows-11` environments;
- the 40-character repository commit SHA, `mixlab-target-evidence-kit` artifact name, evidence-kit workflow run URL, `mixlab-cutter-windows-exe` installer artifact, installer workflow run URL, `.exe` file name, installer SHA-256, and installer version;
- clean target-machine proof that Node.js, npm, Git, FFmpeg/FFprobe, and the source repository were absent;
- every public-library path in the matrix to pass selection, Doctor, search, playback, one cut, output reveal, local-library refresh, and public-library non-write checks;
- every failure case to show diagnostics and block entry into a broken workbench;
- successful and failure diagnostics samples that include operational fields and exclude ASR keys, signed URLs, private transcript text, and pasted search text.
