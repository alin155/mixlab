# Admin CSS Governance Classification

Generated: 2026-06-27T08:24:09.566Z

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor CSS.

## Summary

- CSS files scanned: 2
- Duplicate selectors: 333
- Reference-layer overlaps: 201
- Same-file legacy duplicates: 131
- Reference-internal duplicates: 1
- Other duplicates: 0

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
classification-no-side-effects | pass | no | The classification reads CSS files and writes acceptance artifacts only.
reference-layer-not-deleted-first | pass | no | 201 reference-layer overlaps are classified as requiring browser/computed-style proof before deleting legacy rules.
same-file-legacy-duplicates-reviewed | blocked | yes | 131 same-file styles.css duplicate selector candidates need line-level ownership review.
css-cleanup-still-targeted | blocked | yes | This report classifies cleanup candidates but does not authorize broad CSS deletion.

## Classified Duplicates

| Selector | Kind | Count | Files | Cleanup Policy |
| --- | --- | --- | --- | --- |
.admin-reference-dashboard-row | reference-internal-duplicate | 2 | apps/admin-web/src/admin-reference.css | Review inside the reference layer before editing; this may be a responsive override rather than dead CSS.
.admin-app .ml-inspector | reference-layer-overlap | 19 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-shell | reference-layer-overlap | 17 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-content-split | reference-layer-overlap | 15 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-metric-tile | reference-layer-overlap | 15 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-sidebar | reference-layer-overlap | 14 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-source-table th | reference-layer-overlap | 13 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-smart-scan-card | reference-layer-overlap | 13 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
body | reference-layer-overlap | 13 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-sidebar-item | reference-layer-overlap | 12 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app | reference-layer-overlap | 11 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-console-statusbar | reference-layer-overlap | 11 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-list-panel | reference-layer-overlap | 11 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-workspace | reference-layer-overlap | 11 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-core-path-card | reference-layer-overlap | 10 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-kpi-grid | reference-layer-overlap | 10 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .admin-primary-button | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .admin-secondary-button | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-sidebar-footer | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-sidebar-item.is-active | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-list-panel h2 | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-metric-band | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-metric-tile strong | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-page-header | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-page-header p | reference-layer-overlap | 9 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-button | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .ml-source-table td | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-core-path-row | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-count-strip | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-current-job-card | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-dashboard-grid | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-dashboard-panel h2 | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-disk | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-empty-state | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-health-row | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-metric-tile span | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-ops-grid | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-status-badge | reference-layer-overlap | 8 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .admin-number-input | reference-layer-overlap | 7 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.
.admin-app .admin-select | reference-layer-overlap | 7 | apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css | Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-css-governance-classification-20260627T082409Z.json
- Markdown: docs/acceptance/artifacts/admin-css-governance-classification-20260627T082409Z.md
