# Admin Docker NAS Access Preflight

Generated: 2026-06-28T21:17:11.243Z
Mode: admin-docker-nas-access-preflight
Result: blocked
NAS collection directly available: no
Push execution allowed: no
Docker deploy allowed: no

This preflight is read-only: TCP connect probes, HTTP HEAD probes, and bounded SMB directory metadata reads only.

## Target

- NAS host: 192.168.1.27
- SMB root: /Volumes/MixLab
- Handoff bundle: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest

## Handoff Bundle

- Present: yes
- Candidate SHA: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Candidate ref: admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863
- Missing files: none

## NAS Handoff Archive

- Visible archives: /Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz

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

- Mounted: yes
- Top-level dirs: #recycle, PublicLibrary, 安装包
- Compose candidates: none
- Returned evidence candidates: none
- Scan limits: depth 5, entries 2000; pruned PublicLibrary, #recycle

## Gates

| Gate | Category | Status | Blocks NAS Collection | Blocks Staging Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| preflight-no-side-effects | safety | pass | no | no | Only TCP connect, HTTP HEAD, and bounded SMB directory metadata reads are used. | n/a |
| nas-desktop-or-legacy-admin-reachable | network | pass | no | yes | 9999=open, 18080=open | At least one NAS management or existing Admin endpoint should be reachable before staging review. |
| ssh-access-available | network | blocked | yes | no | port 22 is closed | Open a temporary SSH path or use the NAS desktop/local shell to run the collector. |
| smb-root-mounted | smb | pass | no | no | /Volumes/MixLab mounted with top-level dirs: #recycle, PublicLibrary, 安装包 | Mount the NAS share if using SMB to transfer handoff or returned evidence. |
| handoff-bundle-ready | handoff | pass | no | no | candidate=25fe2264de7b391a56e770a8acb6bf40ebec3863, ref=admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863 | Regenerate prepare:admin-docker-nas-release-inputs-handoff and require README, operator checklist, MANIFEST, NAS runner, collector, installer, and local validator. |
| handoff-transfer-visible-on-smb | handoff | pass | no | no | /Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz | Run transfer:admin-docker-nas-handoff-kit to place the portable archive in the NAS handoff share. |
| compose-project-visible-on-smb | smb | blocked | yes | no | No compose file found outside PublicLibrary/#recycle within bounded scan. | Mount or locate the NAS Compose project folder containing docker-compose.yml and .env. |
| returned-evidence-visible | returned-evidence | blocked | yes | yes | No returned evidence files or admin-docker-release-inputs directory found outside PublicLibrary/#recycle. | Run the NAS collector and copy admin-docker-release-inputs/ back to the Mac repo. |
| staging-admin-port-reachable | staging-target | blocked | no | yes | port 8080 is closed | After staging, the configured Admin Web port must be reachable and expose current Admin API endpoints. |

## Summary

- NAS collection blockers: ssh-access-available, compose-project-visible-on-smb, returned-evidence-visible
- Staging review blockers: returned-evidence-visible, staging-admin-port-reachable

## Next Actions

- Keep push_images=false; do not edit NAS .env, restart containers, or enable workers.
- Use the NAS desktop or physical NAS shell to locate the Compose project folder that contains docker-compose.yml and .env.
- Copy docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/nas/ into that Compose project folder.
- On the NAS host, run sh ./nas/RUN_ON_NAS.sh and copy the generated admin-docker-release-inputs/ folder back to this Mac.
- Run preflight:admin-docker-nas-ugos-api to evaluate whether an authenticated UGOS API session can replace browser/SSH evidence collection.
- Alternatively enable a temporary SSH or mounted Compose-project read-only workflow, then rerun this preflight.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T211711Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T211711Z.md
