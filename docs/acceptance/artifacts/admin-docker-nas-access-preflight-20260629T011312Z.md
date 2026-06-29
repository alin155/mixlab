# Admin Docker NAS Access Preflight

Generated: 2026-06-29T01:13:12.670Z
Mode: admin-docker-nas-access-preflight
Result: ready-for-nas-collection
NAS collection directly available: yes
Push execution allowed: no
Docker deploy allowed: no

This preflight is read-only: TCP connect probes, HTTP HEAD probes, and bounded SMB directory metadata reads only.

## Target

- NAS host: 192.168.1.27
- SMB root: /Volumes/MixLab
- Handoff bundle: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest

## Handoff Bundle

- Present: yes
- Candidate SHA: 4cb5b18262e49894d4272b0fc940be6c1d2102b4
- Candidate ref: admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4
- Missing files: none

## NAS Handoff Archive

- Visible archives: none

## UGOS Browserless

- Present: yes
- Status: browserless-collection-ready
- Direct collection available: yes
- Blockers: none
- Source artifact: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T225530Z.json

## Ports

| Port | Status | Error |
| --- | --- | --- |
| 22 | closed | connect ECONNREFUSED 192.168.1.27:22 |
| 5000 | closed | connect ECONNREFUSED 192.168.1.27:5000 |
| 5001 | closed | connect ECONNREFUSED 192.168.1.27:5001 |
| 2375 | closed | connect ECONNREFUSED 192.168.1.27:2375 |
| 2376 | closed | connect ECONNREFUSED 192.168.1.27:2376 |
| 8080 | closed | connect ECONNREFUSED 192.168.1.27:8080 |
| 18080 | open | none |
| 9999 | open | none |

## HTTP

| URL | Status | HTTP | Content-Type | Error |
| --- | --- | --- | --- | --- |
| http://192.168.1.27:18080/ | ok | 200 | text/html | none |
| http://192.168.1.27:8080/ | error | n/a | n/a | fetch failed |
| http://192.168.1.27:9999/desktop/ | ok | 200 | text/html | none |

## SMB

- Mounted: no
- Top-level dirs: none
- Compose candidates: none
- Returned evidence candidates: none
- Scan limits: depth 5, entries 2000; pruned PublicLibrary, #recycle

## Gates

| Gate | Category | Status | Blocks NAS Collection | Blocks Staging Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| preflight-no-side-effects | safety | pass | no | no | Only TCP connect, HTTP HEAD, and bounded SMB directory metadata reads are used. | n/a |
| nas-desktop-or-legacy-admin-reachable | network | pass | no | yes | 9999=open, 18080=open | At least one NAS management or existing Admin endpoint should be reachable before staging review. |
| ssh-access-available | network | blocked | no | no | port 22 is closed | Open a temporary SSH path or use the NAS desktop/local shell to run the collector. |
| smb-root-mounted | smb | blocked | no | no | /Volumes/MixLab is not mounted | Mount the NAS share if using SMB to transfer handoff or returned evidence. |
| handoff-bundle-ready | handoff | pass | no | no | candidate=4cb5b18262e49894d4272b0fc940be6c1d2102b4, ref=admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4 | Regenerate prepare:admin-docker-nas-release-inputs-handoff and require README, operator checklist, MANIFEST, NAS runner, collector, installer, and local validator. |
| handoff-transfer-visible-on-smb | handoff | blocked | no | no | No admin-docker-nas-handoff-kit.tar.gz was found outside PublicLibrary/#recycle. | Run transfer:admin-docker-nas-handoff-kit to place the portable archive in the NAS handoff share. |
| compose-project-visible-on-smb | smb | blocked | no | no | No compose file found outside PublicLibrary/#recycle within bounded scan. | Mount or locate the NAS Compose project folder containing docker-compose.yml and .env. |
| returned-evidence-visible | returned-evidence | blocked | no | yes | No returned evidence files or admin-docker-release-inputs directory found outside PublicLibrary/#recycle. | Run the NAS collector and copy admin-docker-release-inputs/ back to the Mac repo. |
| ugos-browserless-collection-ready | ugos | pass | yes | no | status=browserless-collection-ready, direct_ugos_collection_available=true, blockers=none, path=docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T225530Z.json | Run preflight:admin-docker-nas-ugos-api with authenticated in-memory credentials or a temporary auth header until direct_ugos_collection_available=true. |
| staging-admin-port-reachable | staging-target | blocked | no | yes | port 8080 is closed | After staging, the configured Admin Web port must be reachable and expose current Admin API endpoints. |

## Summary

- NAS collection blockers: none
- Staging review blockers: returned-evidence-visible, staging-admin-port-reachable

## Next Actions

- Use collect:admin-docker-nas-ugos-returned-evidence to generate sanitized admin-docker-release-inputs/ directly from UGOS Docker read-only APIs.
- Copy or point to the generated admin-docker-release-inputs/ folder in the Mac repo.
- Run sh docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260629T011312Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260629T011312Z.md
