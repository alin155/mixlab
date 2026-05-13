# M18.3 GitHub Actions Windows Package Acceptance

## Goal

Generate the MixLab Cutter Windows `.exe` installer without requiring the product owner to maintain a Windows packaging environment.

## User Operation

The user only needs to do these steps after the code is pushed to GitHub:

1. Open the GitHub repository.
2. Open `Actions`.
3. Choose `Cutter Desktop Windows Package`.
4. Click `Run workflow`.
5. Wait for the workflow to finish.
6. Download the `mixlab-cutter-windows-exe` artifact.

## Workflow Contract

The workflow must:

- run on GitHub's `windows-latest` runner;
- install Node dependencies with `npm ci`;
- install Rust stable;
- run `npm run typecheck`;
- run focused desktop packaging tests;
- run `npm run package:cutter-desktop:windows`;
- upload `apps/cutter-desktop/src-tauri/target/release/bundle/nsis/*.exe` as an artifact.

## Expected Artifact

Artifact name:

```text
mixlab-cutter-windows-exe
```

Expected content:

```text
*.exe
```

The first M18 desktop package is unsigned. Windows may show an unknown-publisher or SmartScreen warning until a code-signing certificate is added in a later release.

## Failure Handling

If the workflow fails:

- failure before `npm ci`: check GitHub runner or package registry/network availability;
- failure during `npm run package:cutter-desktop:windows`: inspect the step log for missing Tauri/Rust/build asset output;
- failure during artifact upload: check whether Tauri generated an `.exe` under `apps/cutter-desktop/src-tauri/target/release/bundle/nsis/`.
