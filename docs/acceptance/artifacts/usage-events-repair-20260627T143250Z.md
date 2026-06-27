# Usage Events Repair dry-run

- Status: pass
- Library root: `/Volumes/MixLab/PublicLibrary`
- Events file: `/Volumes/MixLab/PublicLibrary/.mixlab-library/usage-events/events.ndjson`
- Existing file: yes
- Lines: 10155
- Valid lines: 10155
- Malformed lines: 0
- Malformed line numbers: none
- Changed active file: no
- Rewrite strategy: none
- Backup: n/a
- Quarantine: n/a

## Notes

- Dry-run mode never rewrites NAS data.
- Apply mode copies the original file before rewriting and stores bad lines in quarantine.
- This repair only affects usage analytics history; source-video manifests and ready artifacts are untouched.
