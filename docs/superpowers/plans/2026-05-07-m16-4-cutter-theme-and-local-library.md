# M16.4 Cutter Theme And Local Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement M16.4 by making dark mode the default cutter theme, replacing legacy appearance modes with `深色 / 浅色 / 系统`, adding the sidebar quick theme switch, and organizing local clips by current project versus all projects.

**Architecture:** Keep the change inside the existing cutter web app shell. Appearance mode state remains in `apps/cutter-web/src/state/appearance.ts`, app-level wiring stays in `CutterApp.tsx`, settings remains the full configuration surface, and `LocalLibraryPage.tsx` owns project-scoped local clip presentation.

**Tech Stack:** React, TypeScript, CSS custom properties, Node test runner with `tsx`, existing `@mixlab/ui-foundation` components.

---

### Task 1: Appearance Mode State

**Files:**
- Modify: `apps/cutter-web/src/state/appearance.ts`
- Test: `apps/cutter-web/src/cutter-state.test.ts`

- [ ] **Step 1: Write failing tests**

Add or update the existing appearance test so it asserts:

```ts
assert.equal(readCutterAppearanceMode(), "dark");
assert.equal(appearanceModeLabel("dark"), "深色");
assert.equal(appearanceModeLabel("light"), "浅色");
assert.equal(appearanceModeLabel("system"), "系统");

window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "default");
assert.equal(readCutterAppearanceMode(), "dark");

window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "comfort");
assert.equal(readCutterAppearanceMode(), "light");

window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "night");
assert.equal(readCutterAppearanceMode(), "dark");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --import tsx --test-name-pattern "appearance mode" apps/cutter-web/src/cutter-state.test.ts
```

Expected: FAIL because current default is `system`, current values include `default/night/comfort`, and labels still use `跟随系统/默认/深夜/护眼`.

- [ ] **Step 3: Implement appearance migration**

Change `CutterAppearanceMode` to:

```ts
export type CutterAppearanceMode = "dark" | "light" | "system";
```

Make `readCutterAppearanceMode()` return:

- `dark` for empty, unknown, `default`, or `night`
- `light` for `comfort`
- stored `dark`, `light`, or `system` as-is

Make labels:

```ts
dark -> "深色"
light -> "浅色"
system -> "系统"
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test --import tsx --test-name-pattern "appearance mode" apps/cutter-web/src/cutter-state.test.ts
```

Expected: PASS.

### Task 2: Settings And Sidebar Theme Switch

**Files:**
- Modify: `apps/cutter-web/src/features/settings/SettingsPage.tsx`
- Modify: `apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Write failing render tests**

Update settings test to assert the settings page contains `深色`, `浅色`, `系统`, and does not contain `默认`, `深夜`, or `护眼`.

Update sidebar footer test to render:

```tsx
<CutterSidebarFooter
  username="Allen"
  localCount={18}
  publicCount={41}
  activeTaskCount={0}
  concurrency={2}
  engineReady={true}
  appearanceMode="dark"
  onSetAppearanceMode={() => undefined}
/>
```

Assert rendered HTML contains `Allen`, `深色`, `浅色`, `系统`, and `aria-pressed="true"` on the selected mode, and still does not contain `打开用户数据面板`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test --import tsx --test-name-pattern "settings render|sidebar footer" apps/cutter-web/src/cutter-app.test.ts
```

Expected: FAIL because settings still renders legacy options and sidebar footer has no theme switch props or controls.

- [ ] **Step 3: Implement settings options**

Replace settings options with:

```tsx
<option value="dark">{appearanceModeLabel("dark")}</option>
<option value="light">{appearanceModeLabel("light")}</option>
<option value="system">{appearanceModeLabel("system")}</option>
```

- [ ] **Step 4: Implement sidebar quick switch**

Add `appearanceMode` and `onSetAppearanceMode` props to `CutterSidebarFooter`. Render static username plus a compact three-item control:

```tsx
<div className="cutter-sidebar-user-entry" aria-label="当前用户">
  <strong>{username}</strong>
  <div className="cutter-sidebar-theme-switch" role="group" aria-label="显示模式">
    {(["dark", "light", "system"] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        aria-pressed={appearanceMode === mode}
        onClick={() => onSetAppearanceMode(mode)}
      >
        {appearanceModeLabel(mode)}
      </button>
    ))}
  </div>
</div>
```

Pass `appearanceMode` and `handleSetAppearanceMode` from `CutterApp`.

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
node --test --import tsx --test-name-pattern "settings render|sidebar footer" apps/cutter-web/src/cutter-app.test.ts
```

Expected: PASS.

### Task 3: Theme CSS Token Cleanup

**Files:**
- Modify: `apps/cutter-web/src/styles.css`
- Test: `apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Write failing CSS tests**

Update the CSS appearance test so it asserts:

```ts
assert.match(css, /\.cutter-app\[data-appearance-mode="dark"\]\s*{/);
assert.match(css, /\.cutter-app\[data-appearance-mode="light"\]\s*{/);
assert.match(css, /@media \(prefers-color-scheme: dark\)\s*{\s*\.cutter-app\[data-appearance-mode="system"\]/);
assert.equal(css.includes('data-appearance-mode="night"'), false);
assert.equal(css.includes('data-appearance-mode="comfort"'), false);
```

Keep the media protection assertion: there must be no theme-scoped `video` or `img` rules applying `filter`.

- [ ] **Step 2: Run CSS test to verify failure**

Run:

```bash
node --test --import tsx --test-name-pattern "appearance CSS" apps/cutter-web/src/cutter-app.test.ts
```

Expected: FAIL because CSS still uses `night` and `comfort`.

- [ ] **Step 3: Implement theme selectors**

Replace theme selectors:

- `.cutter-app[data-appearance-mode="night"]` -> `.cutter-app[data-appearance-mode="dark"]`
- `.cutter-app[data-appearance-mode="comfort"]` -> `.cutter-app[data-appearance-mode="light"]`

Set base `.cutter-app` variables to dark defaults so initial render is dark. Add a complete light token block under `[data-appearance-mode="light"]`. Keep `system` under media queries by mapping it to dark or light tokens.

- [ ] **Step 4: Convert sidebar user and theme switch styles**

Add styles for `.cutter-sidebar-theme-switch` and selected buttons using variables only. Remove hard-coded white backgrounds in the sidebar footer so dark mode is readable.

- [ ] **Step 5: Run CSS test to verify pass**

Run:

```bash
node --test --import tsx --test-name-pattern "appearance CSS" apps/cutter-web/src/cutter-app.test.ts
```

Expected: PASS.

### Task 4: Local Library Project Views

**Files:**
- Modify: `apps/cutter-web/src/features/local-library/LocalLibraryPage.tsx`
- Modify: `apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Write failing local library tests**

Update or add a render test that passes:

- two projects
- current project id
- local clips with `project_id` across both projects
- one local clip with no `project_id`

Assert default render contains `当前项目`, `全部素材`, the current project clip, and does not show other project clips in the grid. Assert the all-materials render contains project group headings and `未归属素材`.

- [ ] **Step 2: Run local library test to verify failure**

Run:

```bash
node --test --import tsx --test-name-pattern "local library" apps/cutter-web/src/cutter-app.test.ts
```

Expected: FAIL because current local library is a flat gallery.

- [ ] **Step 3: Implement props and grouping**

Extend `LocalLibraryPage` props:

```ts
projects?: CutterProject[];
currentProjectId?: string;
viewMode?: "current-project" | "all";
onSetViewMode?: (mode: "current-project" | "all") => void;
```

Inside the component:

- default `viewMode` to `current-project`
- filter current-project view by `clip.project_id === currentProjectId`
- group all view by `project_id`
- use `未归属素材` for missing project ids
- sort clips by numeric prefix in title, then title

- [ ] **Step 4: Wire from CutterApp**

Pass `projects`, `currentProjectId`, local library view state, and setter into `LocalLibraryPage`. Reset selected local clip when changing view only if the selected clip is no longer visible.

- [ ] **Step 5: Run local library test to verify pass**

Run:

```bash
node --test --import tsx --test-name-pattern "local library" apps/cutter-web/src/cutter-app.test.ts
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- No additional file edits unless verification reveals a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test --import tsx --test-name-pattern "appearance mode|settings render|sidebar footer|appearance CSS|local library" apps/cutter-web/src/cutter-state.test.ts apps/cutter-web/src/cutter-app.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full cutter tests**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts apps/cutter-web/src/cutter-app.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build:cutter-web
```

Expected: both PASS.

- [ ] **Step 4: Browser smoke check**

Open the cutter app in the browser and verify:

- settings page only shows `深色 / 浅色 / 系统`
- sidebar shows `Allen  深色 | 浅色 | 系统`
- switching sidebar theme changes app appearance
- local library defaults to current project materials
- local library can switch to all materials and shows project grouping

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add apps/cutter-web/src/state/appearance.ts apps/cutter-web/src/features/settings/SettingsPage.tsx apps/cutter-web/src/app/CutterApp.tsx apps/cutter-web/src/features/local-library/LocalLibraryPage.tsx apps/cutter-web/src/cutter-state.test.ts apps/cutter-web/src/cutter-app.test.ts apps/cutter-web/src/styles.css docs/superpowers/plans/2026-05-07-m16-4-cutter-theme-and-local-library.md
git commit -m "feat: implement M16.4 cutter theme system"
```
