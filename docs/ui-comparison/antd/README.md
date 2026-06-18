# MixLab Ant Design UI Lab 归档

> 状态：已归档。Ant Design 作为三端 UI 接管方案已被否定，隔离实验应用 `apps/antd-ui-lab` 已删除。

This is an isolated UI comparison lab for evaluating Ant Design across MixLab's three UI surfaces.

## Historical Boundary

- App package: `@mixlab/antd-ui-lab` (deleted)
- App path: `apps/antd-ui-lab` (deleted)
- Dev URL: `http://127.0.0.1:5188/`
- Preview URL: `http://127.0.0.1:5189/`
- App title: `MixLab AntD UI Lab`
- Data source: local read-only fixtures only

This lab must not import production UI components or mutate NAS data, projects, cache, auth, or cut jobs.

## Architecture Boundary

The lab was organized as an independent Ant Design application rather than a visual patch over the existing MixLab UI.

- App kernel: `apps/antd-ui-lab/src/app/`
  - `AntdLabRoot.tsx`: AntD `ConfigProvider` and route surface selection.
  - `routing.ts`: hash-route parsing and navigation.
  - `theme.ts`: AntD theme tokens and component tokens.
- Domain fixtures: `apps/antd-ui-lab/src/domain/fixtures.ts`
- Surface prototypes: `apps/antd-ui-lab/src/surfaces/ZeroSurfaces.tsx`
- Lab-only CSS: `apps/antd-ui-lab/src/styles.css`

The production apps remain outside this architecture. Do not import from `apps/admin-web`, `apps/cutter-web`, `apps/cutter-desktop`, or `packages/ui-foundation`.

## UI Copy Rule

The prototype UI should not contain design-explanation copy. The interface should show task labels, data, state, actions, and short empty/error feedback only.

Design rationale belongs in this README, screenshots, or later evaluation notes, not inside the rendered product pages.

## Routes

### Comparison

- `#/comparison`

### Admin Web

- `#/admin/dashboard`
- `#/admin/source-videos`
- `#/admin/source-detail`
- `#/admin/preprocess-jobs`
- `#/admin/index-publish`
- `#/admin/doctor`
- `#/admin/cutter-users`
- `#/admin/settings`

### Cutter Web

- `#/cutter-web/project-home`
- `#/cutter-web/material-locator`
- `#/cutter-web/cut-tasks`
- `#/cutter-web/local-library`
- `#/cutter-web/public-library`
- `#/cutter-web/source-detail`
- `#/cutter-web/cache-management`
- `#/cutter-web/settings`

### Cutter Desktop Preview

- `#/cutter-desktop/first-run`
- `#/cutter-desktop/project-home`
- `#/cutter-desktop/material-locator`
- `#/cutter-desktop/cut-tasks`

## Verification

Historical commands that were run before archival:

```sh
npm install -w @mixlab/antd-ui-lab
npm run build -w @mixlab/antd-ui-lab
npm run dev -w @mixlab/antd-ui-lab
```

Do not run these commands in the current workspace. The app package has been deleted.

Browser checks were run with Playwright against `http://127.0.0.1:5188/`.

Captured screenshots:

- `docs/ui-comparison/antd/screenshots/zero-comparison.png`
- `docs/ui-comparison/antd/screenshots/zero-admin-dashboard.png`
- `docs/ui-comparison/antd/screenshots/zero-admin-source-videos.png`
- `docs/ui-comparison/antd/screenshots/zero-admin-doctor.png`
- `docs/ui-comparison/antd/screenshots/zero-cutter-project-home.png`
- `docs/ui-comparison/antd/screenshots/zero-cutter-material-locator.png`
- `docs/ui-comparison/antd/screenshots/zero-cutter-public-library.png`
- `docs/ui-comparison/antd/screenshots/zero-cutter-cache-management.png`
- `docs/ui-comparison/antd/screenshots/zero-desktop-first-run.png`
- `docs/ui-comparison/antd/screenshots/zero-desktop-material-locator.png`

Additional automated browser checks:

- All 21 routes loaded successfully.
- The visible UI was checked to avoid design-explanation phrases such as `不是旧页面`, `从零设计`, `建议补充`, and `零基准 AntD 方案`.

Known build notes:

- Vite reports Ant Design package-level `"use client"` directives as ignored. The build still succeeds.
- The current prototype imports AntD from the package root, so production bundle size is large. That is acceptable for the first comparison lab, but a later polish pass can add route splitting and manual chunks.

## Initial Fit Notes

- Admin web is the best fit for AntD: tables, forms, metrics, settings, user states, and diagnostic panels map cleanly.
- Cutter web is mixed: project home, task tables, library grids, cache management, and settings benefit from AntD consistency; material search and transcript selection still need MixLab-specific custom interaction.
- Cutter desktop preview exposes the main risk: AntD controls can feel browser-like if window geometry, internal scroll regions, and text density are not carefully constrained.

## Next Evaluation Pass

- Review screenshots side-by-side with current MixLab UI.
- Score each page by visual quality, workflow fit, information density, desktop-app feel, implementation speed, custom CSS burden, and migration risk.
- Decide whether Admin should move closer to AntD while Cutter keeps a smaller AntD subset plus custom transcript/video workflows.
