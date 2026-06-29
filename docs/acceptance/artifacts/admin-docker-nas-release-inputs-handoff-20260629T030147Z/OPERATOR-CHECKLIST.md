# Admin Docker NAS Operator Checklist

Generated: 2026-06-29T03:01:47.771Z
Candidate SHA: 4cb5b18262e49894d4272b0fc940be6c1d2102b4
Candidate ref: admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4
Push execution allowed: no
Docker deploy allowed: no

## Before You Start

- Confirm you are on the NAS host or NAS desktop shell.
- Locate the Admin Docker Compose project folder containing `docker-compose.yml` and `.env`.
- Do not edit `.env`, restart containers, enable workers, run preprocessing, run scan apply, or run `push_images=true`.

## Collect On NAS

1. Copy the `nas/` folder from this bundle into the Compose project folder.
2. From the Compose project folder, run:

```sh
sh ./nas/RUN_ON_NAS.sh
```

3. Confirm the command created `admin-docker-release-inputs/` with exactly these files:

- `admin-docker-current.env`
- `admin-docker-current.inspect.json`
- `admin-worker.env`
- `admin-worker.inspect.json`
- `admin-docker-disk-proof.json`
- `MANIFEST.txt`
- `README.md`

## Bring Back To Mac

1. Copy only the generated `admin-docker-release-inputs/` folder back to the Mac repo or another local path.
2. Do not add full `.env`, full `docker inspect`, passwords, tokens, API keys, ASR credentials, private NAS account data, or private transcript text.
3. Run the local validator. It will run returned-evidence precheck, local intake, and release readiness summary refresh:

```sh
sh docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>
```

## Stop Conditions

- Stop if the returned evidence validator reports a missing, unexpected, or sensitive file.
- Stop if release inputs remain blocked after intake.
- Stop if disk proof remains blocked or the staging runbook carries `nas-disk-risk-carried-forward`.
- Stop if any proof attempts to set `push_execution_allowed=true` or `docker_deploy_allowed=true` before the separate release decision.
