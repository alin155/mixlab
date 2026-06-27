# Usage Events Repair apply

- Status: pass
- Library root: `/Volumes/MixLab/PublicLibrary`
- Events file: `/Volumes/MixLab/PublicLibrary/.mixlab-library/usage-events/events.ndjson`
- Existing file: yes
- Lines: 9086
- Valid lines: 9084
- Malformed lines: 2
- Malformed line numbers: 9084, 9086
- Changed active file: yes
- Rewrite strategy: rename
- Backup: `/Volumes/MixLab/PublicLibrary/.mixlab-library/usage-events/backups/events.ndjson.backup-20260625T185622Z`
- Quarantine: `/Volumes/MixLab/PublicLibrary/.mixlab-library/usage-events/quarantine/events.malformed-20260625T185622Z.ndjson`

## Notes

- Dry-run mode never rewrites NAS data.
- Apply mode copies the original file before rewriting and stores bad lines in quarantine.
- This repair only affects usage analytics history; source-video manifests and ready artifacts are untouched.
