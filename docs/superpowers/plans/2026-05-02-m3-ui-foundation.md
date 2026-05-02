# M3 UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This milestone is intentionally limited to shared UI foundation and fixture screens; it does not rebuild the formal cutter or admin products.

**Goal:** Establish a reusable Apple-HIG inspired UI foundation so the formal cutter and admin applications cannot drift into generic web-dashboard styling.

**Architecture:** `packages/ui-foundation` owns design tokens, layout primitives, React components, and design contract helpers. `apps/ui-fixtures` renders static cutter/admin reference boards using fake data and the shared primitives. A visual check script opens the fixture app in Chrome at 1536x1024, saves screenshots, and verifies the expected macOS window/sidebar/toolbar/gallery/table/inspector structures exist.

**Tech Stack:** TypeScript, React, Vite, CSS tokens, Node built-in test runner, Playwright with local Chrome channel for screenshot capture.

---

## Step Guard

Every task in this M starts with this declaration:

```text
This step: M3 Formal UI Foundation
Spec sources: 21_视觉与交互设计规范.md, docs/spec-traceability.md CUTTER-001/CUTTER-002/ADMIN-001
Hi-fi screen: /Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png and /Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png
Files to change: packages/ui-foundation, apps/ui-fixtures, scripts/visual, package.json, tsconfig.json, README.md, docs
Explicitly not doing: final cutter rebuild, final admin console, backend APIs, Tauri shell, Go service
Acceptance: npm run typecheck; npm test; npm run build:cutter-web; npm run build:ui-fixtures; npm run visual:ui-foundation
```

---

## File Structure

- Create `packages/ui-foundation/package.json`: workspace package metadata and React peer dependencies.
- Create `packages/ui-foundation/src/design-contract.ts`: spec IDs, hi-fi paths, required page names, forbidden patterns, and validation helpers.
- Create `packages/ui-foundation/src/design-contract.test.ts`: TDD coverage for required pages and forbidden UI pattern rejection.
- Create `packages/ui-foundation/src/tokens.css`: Apple-HIG inspired CSS variables for typography, surfaces, separators, accent colors, status colors, and density.
- Create `packages/ui-foundation/src/layout.css`: reusable macOS window, sidebar, toolbar, content, inspector, grid, table, queue, and form classes.
- Create `packages/ui-foundation/src/components.tsx`: React primitives for the formal apps and fixture boards.
- Create `packages/ui-foundation/src/index.ts`: package exports.
- Create `apps/ui-fixtures/package.json`: Vite app used only for visual acceptance.
- Create `apps/ui-fixtures/index.html`: static app shell.
- Create `apps/ui-fixtures/src/main.tsx`: route between cutter and admin fixtures.
- Create `apps/ui-fixtures/src/fixture-data.ts`: fake source videos, cut list rows, local clips, admin jobs, index versions, and doctor checks.
- Create `apps/ui-fixtures/src/CutterFixture.tsx`: six-panel cutter board matching the required page boundaries.
- Create `apps/ui-fixtures/src/AdminFixture.tsx`: six-panel admin board matching the required page boundaries.
- Create `apps/ui-fixtures/src/styles.css`: fixture-only page board sizing and composition.
- Create `scripts/visual/check-ui-foundation-screenshots.ts`: starts fixture dev server, captures screenshots, verifies structures, saves artifacts.
- Modify `package.json`: add React/Playwright dependencies and M3 scripts.
- Modify `tsconfig.json`: include `.tsx`, set `jsx` to `react-jsx`.
- Modify `README.md`: document M3 UI foundation and visual acceptance.
- Create `docs/acceptance/m3-ui-foundation.md`: acceptance record and screenshot paths.
- Modify `docs/spec-traceability.md`: mark UI foundation support as partial, not final product acceptance.

---

## Task 1: Workspace And Contract Tests

**Files:**

- Create: `packages/ui-foundation/package.json`
- Create: `packages/ui-foundation/src/design-contract.ts`
- Create: `packages/ui-foundation/src/design-contract.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Steps:**

- [x] Add workspace scripts and dependencies:

```json
{
  "scripts": {
    "build:ui-fixtures": "npm run build -w @mixlab/ui-fixtures",
    "visual:ui-foundation": "tsx scripts/visual/check-ui-foundation-screenshots.ts"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "playwright": "^1.56.0"
  }
}
```

- [x] Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": [
    "packages/**/*.ts",
    "packages/**/*.tsx",
    "apps/**/*.ts",
    "apps/**/*.tsx"
  ]
}
```

- [x] Create `design-contract.test.ts` first. Tests must prove:
  - cutter pages include `公共原素材库`, `搜索与文案`, `待剪清单`, `本地素材库`, `剪切队列`, `设置`.
  - admin pages include `仪表盘`, `公共素材库设置`, `原视频管理`, `预处理任务`, `索引发布`, `健康诊断`, `设置`.
  - forbidden phrases/classes such as `hero`, `marketing`, `sentence-waterfall`, `heavy-dashboard-card`, and `public-source-table-only` are rejected.
  - hi-fi reference paths end with the two expected PNG files.
- [x] Run:

```bash
node --test --import tsx packages/ui-foundation/src/design-contract.test.ts
```

Expected: fail until `design-contract.ts` exists.

- [x] Implement `design-contract.ts` with:
  - `MIXLAB_HIFI_REFERENCES`.
  - `CUTTER_REQUIRED_PAGES`.
  - `ADMIN_REQUIRED_PAGES`.
  - `FORBIDDEN_UI_PATTERNS`.
  - `validateRequiredPages(kind, pages)`.
  - `validateNoForbiddenUiPatterns(content)`.
- [x] Re-run the contract test.

Expected: pass.

---

## Task 2: UI Foundation Tokens, Layout, And Components

**Files:**

- Create: `packages/ui-foundation/src/tokens.css`
- Create: `packages/ui-foundation/src/layout.css`
- Create: `packages/ui-foundation/src/components.tsx`
- Create: `packages/ui-foundation/src/index.ts`
- Create: `packages/ui-foundation/src/components.test.ts`

**Steps:**

- [x] Write `components.test.ts` first. It must use `react-dom/server` and prove:
  - `MacWindow` renders a `.ml-window` with traffic lights and title.
  - `Sidebar` renders page labels and an active item.
  - `UnifiedToolbar` renders a library selector, toolbar actions, and health state.
  - `GalleryGrid` renders `.ml-gallery-grid` cards rather than a source table.
  - `SourceTable` exists for admin management views.
  - `InspectorPanel`, `GroupedForm`, `StatusRow`, and `MediaPanel` render their expected class names.
  - Rendered fixture markup passes `validateNoForbiddenUiPatterns`.
- [x] Run:

```bash
node --test --import tsx packages/ui-foundation/src/components.test.ts
```

Expected: fail until components exist.

- [x] Implement `tokens.css` with:
  - SF Pro system font stack.
  - neutral macOS surfaces, not a one-hue palette.
  - status colors for ready, processing, queued, failed, warning.
  - 8px or smaller component radii where the design allows cards.
  - no decorative gradients or orbs.
- [x] Implement `layout.css` with:
  - `.ml-window`, `.ml-window-chrome`, `.ml-traffic-lights`.
  - `.ml-shell`, `.ml-sidebar`, `.ml-toolbar`, `.ml-content`, `.ml-inspector`.
  - `.ml-gallery-grid`, `.ml-source-table`, `.ml-status-row`, `.ml-media-panel`, `.ml-grouped-form`.
  - responsive constraints for 1536x1024 and mobile widths.
- [x] Implement `components.tsx` primitives:
  - `MacWindow`.
  - `Sidebar`.
  - `UnifiedToolbar`.
  - `SegmentedControl`.
  - `GalleryGrid`.
  - `SourceTable`.
  - `InspectorPanel`.
  - `GroupedForm`.
  - `StatusRow`.
  - `MediaPanel`.
  - `PageBoard`.
- [x] Export all primitives and contract helpers from `index.ts`.
- [x] Re-run component tests.

Expected: pass.

---

## Task 3: Visual Fixture App

**Files:**

- Create: `apps/ui-fixtures/package.json`
- Create: `apps/ui-fixtures/index.html`
- Create: `apps/ui-fixtures/src/main.tsx`
- Create: `apps/ui-fixtures/src/fixture-data.ts`
- Create: `apps/ui-fixtures/src/CutterFixture.tsx`
- Create: `apps/ui-fixtures/src/AdminFixture.tsx`
- Create: `apps/ui-fixtures/src/styles.css`

**Steps:**

- [x] Create `apps/ui-fixtures` as a private Vite React app.
- [x] Build fake cutter data:
  - 120 available ready source videos.
  - public source library gallery cards with cover, tags, lecturer, course, duration, description.
  - source detail with video/document/inspector.
  - grouped search results.
  - cut list rows.
  - local library reusable clips.
  - cut queue/settings rows.
- [x] Build fake admin data:
  - library counts.
  - path validation rows.
  - source video table rows and metadata inspector.
  - preprocessing jobs.
  - index versions and current pointer.
  - Doctor checks and export panel.
- [x] Implement `CutterFixture.tsx` as a six-window board with page titles matching the spec.
- [x] Implement `AdminFixture.tsx` as a six-window board with page titles matching the spec.
- [x] Implement `main.tsx` with hash routes:

```text
/#/cutter
/#/admin
```

- [x] Run:

```bash
npm run build:ui-fixtures
```

Expected: pass and generate `apps/ui-fixtures/dist`.

---

## Task 4: Screenshot Verification Script

**Files:**

- Create: `scripts/visual/check-ui-foundation-screenshots.ts`
- Create directory on run: `docs/acceptance/artifacts/m3-ui-foundation`
- Modify: `package.json`

**Steps:**

- [x] Implement `check-ui-foundation-screenshots.ts` to:
  - start `npm run dev -w @mixlab/ui-fixtures -- --host 127.0.0.1 --port 4193`.
  - open local Chrome through Playwright with `channel: "chrome"`.
  - capture `/#/cutter` at `1536x1024` to `docs/acceptance/artifacts/m3-ui-foundation/cutter-fixture.png`.
  - capture `/#/admin` at `1536x1024` to `docs/acceptance/artifacts/m3-ui-foundation/admin-fixture.png`.
  - assert each page has at least six `.ml-window` elements.
  - assert cutter has `.ml-gallery-grid`, `.ml-media-panel`, `.ml-inspector`, and no `sentence-waterfall`.
  - assert admin has `.ml-source-table`, `.ml-status-row`, `.ml-grouped-form`, and Doctor/export text.
  - always shut down the Vite child process.
- [x] Run:

```bash
npm run visual:ui-foundation
```

Expected: screenshots are created and checks pass.

---

## Task 5: Docs, Final Verification, And Commit

**Files:**

- Modify: `README.md`
- Modify: `docs/spec-traceability.md`
- Create: `docs/acceptance/m3-ui-foundation.md`
- Modify: `docs/superpowers/plans/2026-05-02-m3-ui-foundation.md`

**Steps:**

- [x] Update README current implementation status with:
  - `packages/ui-foundation`.
  - `apps/ui-fixtures`.
  - screenshot verification command.
- [x] Update traceability:
  - `CUTTER-001` remains `preview-ui` or `partial`, because formal app rebuild is M4.
  - `CUTTER-002` becomes `partial`, because gallery-first foundation exists but final cutter UI is M4.
  - `ADMIN-001` becomes `partial`, because admin foundation exists but final console is M5.
- [x] Create `m3-ui-foundation.md` acceptance record with:
  - scope.
  - explicit not implemented list.
  - screenshot artifact paths.
  - verification commands.
  - known remaining work.
- [x] Run:

```bash
npm run typecheck
npm test
npm run build:cutter-web
npm run build:ui-fixtures
npm run visual:ui-foundation
```

Expected: all pass.

- [x] Mark all M3 plan checkboxes complete.
- [x] Commit:

```bash
git add .
git commit -m "feat: add M3 UI foundation"
```

Expected: commit succeeds on `codex/m3-ui-foundation`.

---

## Stop Conditions

Stop and report only if:

- Chrome channel cannot be launched for screenshot verification after a fallback check confirms no usable local browser.
- React/Vite dependency installation fails.
- A fixture page cannot map to the required hi-fi reference image.
- The fixture uses forbidden UI patterns from `21_视觉与交互设计规范.md`.
- Full verification fails after implementation and the failure cannot be localized.

