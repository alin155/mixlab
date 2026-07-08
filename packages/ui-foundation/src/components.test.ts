import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as foundation from "./components.tsx";
import {
  AppShell,
  Badge,
  Button,
  Card,
  InspectorPanel,
  MIXLAB_UI_FOUNDATION_V1_COMPONENTS,
  SearchBox,
  Sidebar,
  Table
} from "./components.tsx";

test("defines the stable UI Foundation v1 component set", () => {
  assert.deepEqual(MIXLAB_UI_FOUNDATION_V1_COMPONENTS, [
    "tokens",
    "AppShell",
    "Sidebar",
    "Button",
    "SearchBox",
    "Card",
    "Table",
    "Badge",
    "InspectorPanel"
  ]);
});

test("does not export legacy experiment components", () => {
  for (const exportName of [
    "MacWindow",
    "UnifiedToolbar",
    "SegmentedControl",
    "GalleryGrid",
    "SourceTable",
    "GroupedForm",
    "StatusRow",
    "MediaPanel",
    "PageBoard"
  ]) {
    assert.equal(Object.hasOwn(foundation, exportName), false, `${exportName} must stay out of v1`);
  }
});

test("renders v1 shell without legacy window chrome", () => {
  const html = renderToStaticMarkup(
    h(AppShell, {
      activeKey: "home",
      brand: { title: "MixLab Cutter", subtitle: "Project material cutting" },
      items: [
        { key: "home", label: "Home", icon: "home", href: "#/project-home" },
        { key: "search", label: "Material Search", icon: "search", href: "#/material-locator" }
      ],
      sidebarFooter: h("div", null, "status"),
      children: h("div", null, "workspace")
    })
  );

  assert.match(html, /class="ml-app-shell"/);
  assert.match(html, /class="ml-workbench"/);
  assert.doesNotMatch(html, /ml-window-chrome/);
});

test("foundation owns AppShell viewport geometry", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-app-shell\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-app-shell\s*{[^}]*grid-template-columns:\s*var\(--ml-sidebar-width\) minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-app-shell\s*{[^}]*width:\s*100%/s);
  assert.match(css, /\.ml-app-shell\s*{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.ml-app-shell\s*{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-app-shell\s*{[^}]*background:\s*var\(--ml-color-canvas\)/s);
  assert.match(css, /\.ml-workbench\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-workbench\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-workbench\s*{[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-workbench\s*{[^}]*background:\s*var\(--ml-workbench-background,\s*var\(--ml-color-surface\)\)/s);
  assert.match(css, /\.ml-workbench-content\s*{[^}]*width:\s*100%[^}]*max-width:\s*100%/s);
  assert.match(css, /\.ml-workbench-content\s*{[^}]*min-width:\s*0[^}]*min-height:\s*0/s);
  assert.match(css, /\.ml-workbench-content\s*{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*padding:\s*0/s);
  assert.match(css, /\.ml-workbench-content\s*{[^}]*overflow:\s*auto[^}]*box-shadow:\s*none/s);
});

test("foundation owns auth and desktop entry surface primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-auth-gate\s*{[^}]*place-items:\s*center/s);
  assert.match(css, /\.ml-auth-panel\s*{[^}]*width:\s*min\(420px,\s*calc\(100vw - 48px\)\)/s);
  assert.match(css, /\.ml-entry-surface\s*{[^}]*min-height:\s*100vh[^}]*padding:\s*32px/s);
  assert.match(css, /\.ml-entry-shell\s*{[^}]*max-width:\s*1180px/s);
  assert.match(css, /\.ml-entry-header\s*{[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.ml-entry-step-grid\s*{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.ml-entry-step-card\s*{[^}]*padding:\s*var\(--ml-space-4\)/s);
  assert.match(css, /\.ml-check-row\s*{[^}]*grid-template-columns:\s*60px minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-diagnostics-panel\s*{[^}]*padding:\s*var\(--ml-space-4\)/s);
  assert.match(css, /\.ml-entry-actions\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width:\s*1180px\)[\s\S]*\.ml-entry-step-grid,[\s\S]*\.ml-entry-body\s*{[\s\S]*grid-template-columns:\s*1fr/s);
});

test("renders v1 controls and panels", () => {
  const html = renderToStaticMarkup(
    h(
      "div",
      null,
      h(Button, { variant: "primary" }, "Search"),
      h(SearchBox, { placeholder: "Search transcript", buttonLabel: "Search" }),
      h(Badge, { tone: "running", children: "Running" }),
      h(Card, { title: "Recent project", subtitle: "2 cuts", children: "content" }),
      h(InspectorPanel, { title: "Details", subtitle: "Selected item", children: "metadata" })
    )
  );

  assert.match(html, /ml-button--primary/);
  assert.match(html, /ml-search-box/);
  assert.match(html, /ml-badge is-info/);
  assert.match(html, /ml-card/);
  assert.match(html, /ml-inspector-subtitle/);
});

test("renders Card with foundation-owned flush body spacing", async () => {
  const html = renderToStaticMarkup(h(Card, { bodyFlush: true, children: "rows" }));
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(html, /class="ml-card-body is-flush"/);
  assert.match(css, /\.ml-card-body\.is-flush\s*{[^}]*padding:\s*0/s);
});

test("foundation owns quiet card table and inspector surfaces", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");
  const cardRule = css.match(/\.ml-card\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const tableRule = css.match(/\.ml-table-wrap\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const inspectorRule = css.match(/\.ml-inspector\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  for (const rule of [cardRule, tableRule, inspectorRule]) {
    assert.match(rule, /border:\s*1px solid color-mix\(in srgb, var\(--ml-color-border\) 58%, transparent\)/);
    assert.match(rule, /box-shadow:\s*none/);
  }
});

test("foundation owns workbench inspector surface variant", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");
  const workbenchRule =
    css.match(/\.ml-inspector\.ml-inspector--workbench\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchHeaderRule =
    css.match(/\.ml-inspector\.ml-inspector--workbench \.ml-inspector-header\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(workbenchRule, /border-color:\s*var\(--ml-border-subtle\)/);
  assert.match(workbenchRule, /background-color:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 72%,\s*transparent\)/);
  assert.match(workbenchRule, /box-shadow:\s*var\(--ml-shadow-panel\)/);
  assert.match(workbenchHeaderRule, /border-color:\s*var\(--ml-border-subtle\)/);
});

test("foundation owns shared data list and data row rhythm", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");
  const dataListRule = css.match(/\.ml-data-list\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const dataRowRule = css.match(/\.ml-data-row\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const dataRowLabelRule = css.match(/\.ml-data-row dt\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const dataRowValueRule = css.match(/\.ml-data-row dd\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(dataListRule, /margin:\s*0/);
  assert.match(css, /\.ml-data-list--grid\s*{[^}]*display:\s*grid[^}]*padding:\s*0/s);
  assert.match(css, /\.ml-data-list--stacked-detail dt\s*{[^}]*align-self:\s*center/s);
  assert.match(css, /\.ml-data-list--stacked-detail dd\s*{[^}]*display:\s*grid[^}]*gap:\s*3px/s);
  assert.match(dataRowRule, /display:\s*grid/);
  assert.match(dataRowRule, /border-bottom:\s*1px solid var\(--ml-border-subtle\)/);
  assert.match(dataRowLabelRule, /color:\s*var\(--ml-color-text-secondary\)/);
  assert.match(dataRowLabelRule, /font-size:\s*12px/);
  assert.match(dataRowValueRule, /color:\s*var\(--ml-color-text\)/);
  assert.match(dataRowValueRule, /line-height:\s*20px/);
  assert.match(css, /\.ml-data-list--detail\s*{[^}]*width:\s*var\(--ml-data-list-detail-width,\s*362px\)[^}]*height:\s*var\(--ml-data-list-detail-height,\s*168px\)[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-data-row--detail\s*{[^}]*min-height:\s*var\(--ml-data-row-detail-min-height,\s*41px\)[^}]*grid-template-columns:\s*var\(--ml-data-row-detail-label,\s*112px\) minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-data-row--check\s*{[^}]*grid-template-columns:\s*96px minmax\(0,\s*112px\) minmax\(0,\s*1fr\)[^}]*min-height:\s*68px/s);
  assert.match(css, /\.ml-data-row--compact-check\s*{[^}]*grid-template-columns:\s*minmax\(96px,\s*auto\) minmax\(0,\s*1fr\)[^}]*min-height:\s*38px/s);
  assert.match(css, /\.ml-data-row--wide-detail\s*{[^}]*grid-template-columns:\s*124px minmax\(0,\s*1fr\)[^}]*min-height:\s*58px/s);
  assert.match(css, /\.ml-info-groups\s*{[^}]*display:\s*grid[^}]*gap:\s*14px/s);
  assert.match(css, /\.ml-info-row\s*{[^}]*grid-template-columns:\s*132px minmax\(0,\s*1fr\)[^}]*min-height:\s*46px/s);
});

test("foundation owns action stack and sticky action surface rhythm", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");
  const actionStackRule = css.match(/\.ml-action-stack\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const actionStackButtonRule =
    css.match(/\.ml-action-stack > \.ml-button\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const stickyActionStackRule =
    css.match(/\.ml-sticky-action-stack\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const floatingActionBarRule =
    css.match(/\.ml-floating-action-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const floatingActionLabelRule =
    css.match(/\.ml-floating-action-label\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(actionStackRule, /display:\s*grid/);
  assert.match(actionStackRule, /gap:\s*8px/);
  assert.match(actionStackButtonRule, /width:\s*100%/);
  assert.match(actionStackButtonRule, /min-height:\s*36px/);
  assert.match(stickyActionStackRule, /position:\s*sticky/);
  assert.match(stickyActionStackRule, /background:\s*var\(--ml-color-sticky-surface-fade\),\s*var\(--ml-color-sticky-surface\)/);
  assert.match(stickyActionStackRule, /backdrop-filter:\s*blur\(8px\)/);
  assert.match(css, /\.ml-action-stack--detail\s*{[^}]*width:\s*var\(--ml-action-stack-detail-width,\s*362px\)[^}]*margin-top:\s*var\(--ml-action-stack-detail-margin-top,\s*12px\)/s);
  assert.match(floatingActionBarRule, /display:\s*inline-flex/);
  assert.match(floatingActionBarRule, /max-width:\s*min\(360px,\s*calc\(100vw - 32px\)\)/);
  assert.match(floatingActionBarRule, /min-height:\s*34px/);
  assert.match(floatingActionBarRule, /border-radius:\s*999px/);
  assert.match(floatingActionBarRule, /padding:\s*4px 5px 4px 10px/);
  assert.match(floatingActionBarRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 94%,\s*#000000\)/);
  assert.match(floatingActionBarRule, /box-shadow:\s*0 14px 34px rgba\(0,\s*0,\s*0,\s*0\.28\)/);
  assert.match(floatingActionLabelRule, /font-size:\s*12px/);
  assert.match(floatingActionLabelRule, /line-height:\s*16px/);
  assert.match(floatingActionLabelRule, /text-overflow:\s*ellipsis/);
});

test("foundation owns split workbench page composition primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-split-workbench-page\s*{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-split-workbench\s*{[^}]*grid-template-columns:\s*var\(--ml-split-workbench-left,\s*256px\)/s);
  assert.match(css, /\.ml-split-workbench\s*{[^}]*minmax\(var\(--ml-split-workbench-center-min,\s*480px\),\s*1fr\)/s);
  assert.match(css, /\.ml-split-workbench\s*{[^}]*var\(--ml-split-workbench-right,\s*360px\)/s);
  assert.match(css, /\.ml-split-workbench-command\s*{[^}]*grid-column:\s*1 \/ 3/s);
  assert.match(css, /\.ml-split-workbench-flow\s*{[^}]*display:\s*contents/s);
  assert.match(css, /\.ml-split-workbench-side\s*{[^}]*grid-row:\s*1 \/ span 2/s);
  assert.match(css, /\.ml-queue-panel-stack\s*{[^}]*grid-template-rows:\s*auto auto auto/s);
  assert.match(css, /\.ml-queue-table-fit\s*{[^}]*width:\s*100%/s);
  assert.match(css, /\.ml-floating-selection-anchor\s*{[^}]*position:\s*fixed/s);
});

test("foundation owns standard workbench page composition primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-workbench-page\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*var\(--ml-workbench-page-main,\s*900px\)\)[^}]*var\(--ml-workbench-page-side,\s*330px\)/s);
  assert.match(css, /\.ml-workbench-page\s*{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-workbench-page--library\s*{[^}]*--ml-workbench-page-side:\s*350px/s);
  assert.match(css, /\.ml-workbench-page--fluid\s*{[^}]*--ml-workbench-page-width:\s*100%/s);
  assert.match(css, /\.ml-workbench-page--project-home\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*width:\s*100%/s);
  assert.match(css, /\.ml-workbench-main\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-workbench-main--rows-list\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-workbench-main--rows-list-footer\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s);
  assert.match(css, /\.ml-workbench-main--rows-dashboard\s*{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-workbench-main--stack\s*{[^}]*grid-auto-rows:\s*max-content[^}]*align-content:\s*start/s);
  assert.match(css, /\.ml-workbench-main--project-home\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*gap:\s*42px/s);
  assert.match(css, /\.ml-workbench-header\s*{[^}]*display:\s*flex[^}]*align-items:\s*flex-start[^}]*justify-content:\s*space-between[^}]*gap:\s*20px[^}]*min-height:\s*76px[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-workbench-header > div:first-child\s*{[^}]*display:\s*grid[^}]*gap:\s*4px[^}]*min-width:\s*0/s);
  assert.match(css, /\.ml-workbench-hero\s*{[^}]*grid-template-columns:[^}]*var\(--ml-workbench-hero-copy,\s*0\.9fr\)[^}]*var\(--ml-workbench-hero-action-min,\s*360px\)[^}]*min-height:\s*var\(--ml-workbench-hero-min-height,\s*124px\)/s);
  assert.match(css, /\.ml-workbench-hero-copy\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.ml-workbench-hero-actions\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto[^}]*margin-top:\s*var\(--ml-workbench-hero-actions-offset,\s*53px\)/s);
  assert.match(css, /\.ml-workbench-board\s*{[^}]*grid-template-columns:[^}]*var\(--ml-workbench-board-side-min,\s*300px\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-workbench-panel\s*{[^}]*height:\s*100%[^}]*border:\s*0[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-workbench-panel--list\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*padding:\s*var\(--ml-workbench-panel-list-padding,\s*28px 17px 30px\)/s);
  assert.match(css, /\.ml-fixed-media-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*var\(--ml-fixed-media-grid-item,\s*262px\)\)[^}]*justify-content:\s*start/s);
  assert.match(css, /@media \(max-width:\s*1180px\)[\s\S]*\.ml-workbench-hero\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*\.ml-workbench-board\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*}/);
  assert.match(css, /@media \(min-width:\s*1181px\) and \(max-width:\s*1320px\)[\s\S]*\.ml-workbench-board\s*{[\s\S]*--ml-workbench-board-side-min:\s*280px[\s\S]*--ml-workbench-board-side:\s*330px[\s\S]*}/);
  assert.match(css, /@media \(max-width:\s*1180px\)[\s\S]*\.ml-workbench-header\s*{[\s\S]*flex-direction:\s*column[\s\S]*}/);
  assert.match(css, /\.ml-workbench-inspector\s*{[^}]*width:\s*100%/s);
  assert.match(css, /\.ml-workbench-inspector--offset-header\s*{[^}]*margin-top:\s*122px/s);
  assert.match(css, /\.ml-scroll-region\s*{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*stable/s);
});

test("foundation owns metric card, meter, and detail section primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-metric-card-body\s*{[^}]*min-height:\s*128px/s);
  assert.match(css, /\.ml-metric-summary\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-metric-value\s*{[^}]*font-size:\s*22px/s);
  assert.match(css, /\.ml-metric-description\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(css, /\.ml-metric-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)[^}]*gap:\s*12px/s);
  assert.match(css, /\.ml-meter\s*{[^}]*height:\s*6px/s);
  assert.match(css, /\.ml-meter-fill\s*{[^}]*background:\s*var\(--ml-color-accent\)/s);
  assert.match(css, /\.ml-meter-fill\.is-ready\s*{[^}]*background:\s*var\(--ml-color-ready\)/s);
  assert.match(css, /\.ml-meter-fill\.is-warning\s*{[^}]*background:\s*var\(--ml-color-warning\)/s);
  assert.match(css, /\.ml-meter-fill\.is-failed\s*{[^}]*background:\s*var\(--ml-color-failed\)/s);
  assert.match(css, /\.ml-detail-section\s*{[^}]*border-bottom:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(css, /\.ml-detail-section-title\s*{[^}]*font-weight:\s*720/s);
  assert.match(css, /\.ml-detail-section-copy\s*{[^}]*overflow-wrap:\s*anywhere/s);
});

test("foundation owns hero control row density", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-control-row--hero \.ml-search-box-input,\s*\.ml-control-row--hero \.ml-search-box \.ml-button,\s*\.ml-control-row--hero > \.ml-button\s*{[^}]*min-height:\s*45px/s);
});

test("foundation owns shared page typography hierarchy", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-page-kicker\.ml-page-kicker\s*{[^}]*color:\s*var\(--ml-color-text-tertiary\)[^}]*font-size:\s*12px/s);
  assert.match(css, /\.ml-page-kicker\.ml-page-kicker--hero\s*{[^}]*margin-bottom:\s*18px[^}]*font-size:\s*14px/s);
  assert.match(css, /\.ml-page-title\.ml-page-title\s*{[^}]*font-family:\s*var\(--ml-font-display\)[^}]*font-size:\s*30px/s);
  assert.match(css, /\.ml-page-title\.ml-page-title--hero\s*{[^}]*font-size:\s*34px[^}]*line-height:\s*44px/s);
  assert.match(css, /\.ml-page-description\.ml-page-description\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)[^}]*font-size:\s*15px/s);
  assert.match(css, /\.ml-page-description\.ml-page-description--hero\s*{[^}]*margin-top:\s*12px[^}]*line-height:\s*24px/s);
  assert.match(css, /\.ml-section-heading\s*{[^}]*display:\s*flex[^}]*min-height:\s*28px/s);
  assert.match(css, /\.ml-section-title\s*{[^}]*font-family:\s*var\(--ml-font-display\)[^}]*font-size:\s*20px[^}]*line-height:\s*28px/s);
  assert.match(css, /\.ml-section-title\.ml-section-title--dense\s*{[^}]*font-size:\s*15px[^}]*line-height:\s*22px/s);
  assert.match(css, /\.ml-section-meta\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.ml-section-group\s*{[^}]*align-content:\s*start/s);
  assert.match(css, /\.ml-section-group > header\s*{[^}]*min-height:\s*28px[^}]*padding:\s*0 20px/s);
  assert.match(css, /\.ml-section-group-title\s*{[^}]*color:\s*var\(--ml-color-accent\)[^}]*font-size:\s*12px[^}]*line-height:\s*20px/s);
});

test("foundation owns overlay action row button density", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-overlay-action-row > \.ml-button\s*{[^}]*min-height:\s*42px/s);
});

test("foundation owns inset focus rings for clipped interactive surfaces", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.ml-focus-inset\.ml-focus-inset:focus-visible\s*{[^}]*outline:\s*2px solid color-mix\(in srgb, var\(--ml-color-accent\) 42%, transparent\)[^}]*outline-offset:\s*-3px/s
  );
});

test("foundation owns button count and status icon primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-button-label:has\(\.ml-button-count\)\s*{[^}]*display:\s*inline-flex/s);
  assert.match(css, /\.ml-button-count\s*{[^}]*min-width:\s*24px[^}]*background:\s*var\(--ml-color-control\)/s);
  assert.match(css, /\.ml-button\.is-active \.ml-button-count,\s*\.ml-button\[aria-pressed="true"\] \.ml-button-count\s*{[^}]*color:\s*var\(--ml-color-accent\)/s);
  assert.match(css, /\.ml-button-icon svg\s*{[^}]*width:\s*18px[^}]*height:\s*18px/s);
  assert.match(css, /\.ml-status-icon\s*{[^}]*width:\s*26px[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.ml-status-icon--ready\s*{[^}]*color:\s*var\(--ml-color-ready\)[^}]*background:\s*var\(--ml-color-ready-soft\)/s);
  assert.match(css, /\.ml-status-icon svg\s*{[^}]*width:\s*15px/s);
});

test("foundation owns semantic status text colors", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-status-text\s*{[^}]*font-weight:\s*680/s);
  assert.match(css, /\.ml-status-text--pending\s*{[^}]*color:\s*var\(--ml-color-warning\)/s);
  assert.match(css, /\.ml-status-text--running\s*{[^}]*color:\s*var\(--ml-color-processing\)/s);
  assert.match(css, /\.ml-status-text--done\s*{[^}]*color:\s*var\(--ml-color-ready\)/s);
  assert.match(css, /\.ml-status-text--failed\s*{[^}]*color:\s*var\(--ml-color-failed\)/s);
  assert.match(css, /\.ml-status-text--cancelled\s*{[^}]*color:\s*var\(--ml-color-queued\)/s);
});

test("foundation owns task flow card and detail composition primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-workbench-main--task-flow\s*{[^}]*grid-template-rows:\s*auto auto auto minmax\(0,\s*1fr\)[^}]*gap:\s*16px/s);
  assert.match(css, /\.ml-toolbar-card-body\s*{[^}]*display:\s*flex[^}]*justify-content:\s*space-between[^}]*padding:\s*12px 14px/s);
  assert.match(css, /\.ml-toolbar-list\s*{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*gap:\s*6px/s);
  assert.match(css, /\.ml-summary-card-body\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto[^}]*min-height:\s*58px/s);
  assert.match(css, /\.ml-truncate-line\s*{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.ml-table-action-cell\s*{[^}]*display:\s*inline-flex[^}]*min-width:\s*64px/s);
  assert.match(css, /\.ml-table-primary-text\s*{[^}]*color:\s*var\(--ml-color-text\)[^}]*text-align:\s*left/s);
  assert.match(css, /\.ml-table-muted-text\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(css, /\.ml-empty-inline\s*{[^}]*color:\s*var\(--ml-color-text-tertiary\)/s);
  assert.match(css, /\.ml-data-list--grid\s*{[^}]*display:\s*grid[^}]*padding:\s*0/s);
  assert.match(css, /\.ml-data-row--detail-pair\s*{[^}]*grid-template-columns:\s*82px minmax\(0,\s*1fr\)[^}]*min-height:\s*58px/s);
  assert.match(css, /\.ml-detail-panel-stack\s*{[^}]*display:\s*grid[^}]*gap:\s*16px/s);
  assert.match(css, /\.ml-detail-status\s*{[^}]*width:\s*100%[^}]*min-height:\s*34px/s);
});

test("foundation owns shared control cluster alignment", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-control-cluster\s*{[^}]*display:\s*flex/s);
  assert.match(css, /\.ml-control-cluster\s*{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.ml-control-cluster\s*{[^}]*gap:\s*8px/s);
  assert.match(css, /\.ml-control-cluster\s*{[^}]*justify-content:\s*flex-end/s);
  assert.match(css, /\.ml-control-cluster\s*{[^}]*align-self:\s*start/s);
});

test("foundation owns table text buttons and inline summaries", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-table-text-button\s*{[^}]*max-width:\s*100%[^}]*font-weight:\s*720/s);
  assert.match(css, /\.ml-table-text-button\s*{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.ml-table-text-button:hover\s*{[^}]*color:\s*var\(--ml-color-accent\)/s);
  assert.match(css, /\.ml-table-text-button:focus-visible\s*{[^}]*outline:\s*2px solid color-mix/s);
  assert.match(css, /\.ml-inline-summary\s*{[^}]*display:\s*flex[^}]*align-items:\s*baseline/s);
  assert.match(css, /\.ml-inline-summary > span\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)[^}]*font-size:\s*13px/s);
  assert.match(css, /\.ml-inline-summary > strong\s*{[^}]*color:\s*var\(--ml-color-text\)[^}]*font-size:\s*15px/s);
  assert.match(css, /\.ml-supporting-text\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)[^}]*line-height:\s*20px/s);
});

test("foundation owns workbench table scroll and fitted density", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-card\.is-workbench\s*{[^}]*border-color:\s*var\(--ml-border-subtle\)[^}]*box-shadow:\s*var\(--ml-shadow-panel\)/s);
  assert.match(css, /\.ml-table-wrap\.is-workbench\s*{[^}]*border-color:\s*var\(--ml-border-subtle\)[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*stable/s);
  assert.match(css, /\.ml-table-wrap\.is-workbench\s*{[^}]*background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 86%,\s*transparent\)[^}]*box-shadow:\s*var\(--ml-shadow-panel\)/s);
  assert.match(css, /\.ml-table-wrap\.is-workbench \.ml-table\s*{[^}]*table-layout:\s*fixed/s);
  assert.match(css, /\.ml-table-wrap\.is-workbench \.ml-table th,\s*\.ml-table-wrap\.is-workbench \.ml-table td\s*{[^}]*min-width:\s*0[^}]*padding-right:\s*clamp\(7px,\s*0\.85vw,\s*13px\)/s);
  assert.match(css, /\.ml-table-wrap\.is-workbench \.ml-table th\s*{[^}]*z-index:\s*5[^}]*text-align:\s*center/s);
});

test("InspectorPanel owns scroll containment", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-inspector\s*{[^}]*max-height:\s*100%/s);
  assert.match(css, /\.ml-inspector\s*{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-inspector-body\s*{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.ml-inspector-body\s*{[^}]*overscroll-behavior:\s*contain/s);
});

test("InspectorPanel owns compact and operational density variants", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-inspector\.ml-inspector--compact \.ml-inspector-header\s*{[^}]*min-height:\s*52px/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--compact \.ml-inspector-header\s*{[^}]*padding:\s*0 18px/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--compact \.ml-inspector-body\s*{[^}]*padding:\s*18px 18px 20px/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--operational\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--operational\s*{[^}]*grid-template-rows:\s*66px minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--operational \.ml-inspector-header\s*{[^}]*border-bottom:\s*0/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--operational \.ml-inspector-body\s*{[^}]*padding:\s*0 24px 24px/s);
  assert.match(css, /\.ml-inspector\.ml-inspector--stacked-body \.ml-inspector-body\s*{[^}]*display:\s*grid[^}]*gap:\s*14px/s);
});

test("foundation owns shared media frame and detail stack primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-media-frame\s*{[^}]*border-radius:\s*var\(--ml-radius-media\)/s);
  assert.match(css, /\.ml-media-frame--16x9\s*{[^}]*aspect-ratio:\s*16 \/ 9/s);
  assert.match(css, /\.ml-media-frame--fill\s*{[^}]*height:\s*100%[^}]*aspect-ratio:\s*auto/s);
  assert.match(css, /\.ml-media-frame-inner\s*{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*padding:\s*0/s);
  assert.match(css, /\.ml-media-fill,\s*\.ml-media-frame > img,\s*\.ml-media-frame > video\s*{[^}]*object-fit:\s*cover/s);
  assert.match(css, /\.ml-document-media-panel\s*{[^}]*border:\s*1px solid var\(--ml-color-border\)[^}]*background:\s*#0e1218/s);
  assert.match(css, /\.ml-document-media-video\s*{[^}]*aspect-ratio:\s*16 \/ 9[^}]*background:\s*#111318/s);
  assert.match(css, /\.ml-document-media-meta\s*{[^}]*justify-content:\s*space-between[^}]*color:\s*var\(--ml-color-on-media-secondary\)/s);
  assert.match(css, /\.ml-document-panel\s*{[^}]*border:\s*1px solid var\(--ml-color-border\)[^}]*background:\s*var\(--ml-color-surface\)/s);
  assert.match(css, /\.ml-document-panel-header\s*{[^}]*justify-content:\s*space-between[^}]*border-bottom:\s*1px solid var\(--ml-color-separator\)/s);
  assert.match(css, /\.ml-document-full-text\s*{[^}]*border-bottom:\s*1px solid var\(--ml-color-separator\)[^}]*font-size:\s*14px/s);
  assert.match(css, /\.ml-segment-list\s*{[^}]*display:\s*grid[^}]*padding:\s*12px/s);
  assert.match(css, /\.ml-segment-row\s*{[^}]*grid-template-columns:\s*64px minmax\(0,\s*1fr\) auto[^}]*border:\s*1px solid transparent/s);
  assert.match(css, /\.ml-segment-time\s*{[^}]*color:\s*var\(--ml-color-text-tertiary\)[^}]*font-size:\s*11px/s);
  assert.match(css, /\.ml-segment-text\s*{[^}]*font-size:\s*12px[^}]*line-height:\s*1\.45/s);
  assert.match(css, /\.ml-segment-action\s*{[^}]*justify-self:\s*end[^}]*font-weight:\s*650/s);
  assert.match(css, /\.ml-segment-row:hover,\s*\.ml-segment-row\.is-highlighted,\s*\.ml-segment-row\.is-selected\s*{[^}]*background:\s*var\(--ml-color-selected\)/s);
  assert.match(css, /\.ml-video-poster\s*{[^}]*position:\s*relative[^}]*background-image:\s*var\(--ml-video-poster\)[^}]*background-size:\s*cover/s);
  assert.match(css, /\.ml-video-poster--reference\s*{[^}]*background-size:\s*100% 100%/s);
  assert.match(css, /\.ml-video-poster::after\s*{[^}]*height:\s*78px[^}]*linear-gradient/s);
  assert.match(css, /\.ml-video-poster-controls\s*{[^}]*grid-template-columns:\s*16px minmax\(0,\s*1fr\) 18px 18px 14px/s);
  assert.match(css, /\.ml-video-poster-progress-track\s*{[^}]*height:\s*4px[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.ml-pane-shell\s*{[^}]*border:\s*0[^}]*background:\s*transparent[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-pane-section\s*{[^}]*display:\s*grid[^}]*min-height:\s*0/s);
  assert.match(css, /\.ml-pane-section--media\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)[^}]*padding:\s*10px 12px 8px/s);
  assert.match(css, /\.ml-pane-section--detail\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-pane-header\s*{[^}]*min-height:\s*42px[^}]*padding:\s*0 12px/s);
  assert.match(css, /\.ml-pane-header--compact\s*{[^}]*min-height:\s*38px/s);
  assert.match(css, /\.ml-pane-header--split\s*{[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.ml-pane-body\s*{[^}]*min-height:\s*0[^}]*padding:\s*0 12px 12px/s);
  assert.match(css, /\.ml-selected-copy\s*{[^}]*font-size:\s*12px[^}]*line-height:\s*18px/s);
  assert.match(css, /\.ml-selected-copy > p\s*{[^}]*min-height:\s*164px[^}]*overflow:\s*auto[^}]*white-space:\s*pre-wrap/s);
  assert.match(css, /\.ml-pane-scroll\s*{[^}]*min-height:\s*0[^}]*overflow:\s*auto[^}]*overscroll-behavior:\s*contain/s);
  assert.match(css, /\.ml-list-body--compact-inset\s*{[^}]*padding:\s*0 4px 10px 14px/s);
  assert.match(css, /\.ml-list-footer-note\s*{[^}]*display:\s*block[^}]*color:\s*var\(--ml-color-text-tertiary\)/s);
  assert.match(css, /\.ml-list-footer-action\.ml-button\s*{[^}]*width:\s*calc\(100% - 40px\)[^}]*justify-content:\s*flex-start/s);
  assert.match(css, /\.ml-list-panel\s*{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-list-panel-header\s*{[^}]*min-height:\s*44px[^}]*padding:\s*0 10px 0 20px/s);
  assert.match(css, /\.ml-list-panel-heading\s*{[^}]*align-items:\s*baseline[^}]*gap:\s*6px/s);
  assert.match(css, /\.ml-command-row\s*{[^}]*min-height:\s*36px[^}]*padding:\s*0 20px[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-command-row-header\s*{[^}]*display:\s*grid[^}]*gap:\s*0[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-command-row-form\s*{[^}]*width:\s*100%/s);
  assert.match(css, /\.ml-pane-notice\s*{[^}]*margin:\s*0 12px 6px[^}]*font-size:\s*12px[^}]*line-height:\s*18px/s);
  assert.match(css, /\.ml-pane-notice--success\s*{[^}]*color:\s*var\(--ml-color-ready\)[^}]*background:\s*var\(--ml-color-ready-soft\)/s);
  assert.match(css, /\.ml-media-row-list\s*{[^}]*align-content:\s*start/s);
  assert.match(css, /\.ml-media-row\s*{[^}]*grid-template-columns:\s*64px minmax\(0,\s*1fr\)[^}]*min-height:\s*58px/s);
  assert.match(css, /\.ml-media-row:hover\s*{[^}]*background:\s*color-mix\(in srgb,\s*var\(--ml-color-selected\) 46%,\s*transparent\)/s);
  assert.match(css, /\.ml-media-row\.is-selected\s*{[^}]*background:\s*var\(--ml-color-selected\)[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.ml-media-row-thumb\s*{[^}]*width:\s*64px[^}]*height:\s*38px[^}]*object-fit:\s*cover/s);
  assert.match(css, /\.ml-media-row-thumb\.is-placeholder\s*{[^}]*background:[^}]*var\(--ml-color-media-placeholder\)/s);
  assert.match(css, /\.ml-media-row-title\s*{[^}]*font-size:\s*13px[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.ml-media-row-meta\s*{[^}]*justify-content:\s*flex-start[^}]*gap:\s*4px/s);
  assert.match(css, /\.ml-media-row-subtle\s*{[^}]*font-size:\s*12px[^}]*line-height:\s*17px/s);
  assert.match(css, /\.ml-library-group-list\s*{[^}]*display:\s*grid[^}]*gap:\s*18px/s);
  assert.match(css, /\.ml-library-group\s*{[^}]*display:\s*grid[^}]*gap:\s*10px/s);
  assert.match(css, /\.ml-library-group-header\s*{[^}]*justify-content:\s*space-between[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.match(css, /\.ml-library-group-header > span\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)[^}]*font-size:\s*12px/s);
  assert.match(css, /\.ml-library-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(216px,\s*1fr\)\)[^}]*gap:\s*14px/s);
  assert.match(css, /\.ml-library-grid--three\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.ml-media-tile-card\s*{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-media-tile-body,\s*\.ml-media-tile-action\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-media-tile-action\s*{[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-media-tile-action:focus-visible\s*{[^}]*outline:\s*2px solid var\(--ml-color-accent\)/s);
  assert.match(css, /\.ml-media-tile-copy\s*{[^}]*gap:\s*7px/s);
  assert.match(css, /\.ml-media-tile-title\s*{[^}]*font-size:\s*14px/s);
  assert.match(css, /\.ml-media-tile-meta\s*{[^}]*font-size:\s*12px/s);
  assert.match(css, /\.ml-media-tile-description\s*{[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(css, /\.ml-media-tile-link\s*{[^}]*color:\s*var\(--ml-color-accent\)/s);
  assert.match(css, /\.ml-media-tile-tags\s*{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.ml-media-card\s*{[^}]*border-radius:\s*var\(--ml-radius-media\)[^}]*box-shadow:\s*var\(--ml-shadow-media\)/s);
  assert.match(css, /\.ml-media-card--fixed\s*{[^}]*width:\s*var\(--ml-media-card-fixed-width,\s*262px\)[^}]*aspect-ratio:\s*var\(--ml-media-card-fixed-ratio,\s*262\s*\/\s*220\)/s);
  assert.match(css, /\.ml-media-card-fill-action\s*{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-media-card-cover-fill\s*{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.ml-media-card:hover,\s*\.ml-media-card\.is-selected\s*{[^}]*box-shadow:\s*var\(--ml-shadow-media-strong\)/s);
  assert.match(css, /\.ml-media-card::after\s*{[^}]*background:\s*var\(--ml-color-media-overlay\)/s);
  assert.match(css, /\.ml-media-card-caption\s*{[^}]*color:\s*var\(--ml-color-on-media\)/s);
  assert.match(css, /\.ml-media-card-caption--top\s*{[^}]*top:\s*24px[^}]*left:\s*22px[^}]*right:\s*22px/s);
  assert.match(css, /\.ml-media-card-title\s*{[^}]*font-size:\s*20px[^}]*line-height:\s*27px/s);
  assert.match(css, /\.ml-media-card-meta\s*{[^}]*color:\s*var\(--ml-color-on-media-secondary\)[^}]*font-size:\s*14px/s);
  assert.match(css, /\.ml-media-card-meta-stack\s*{[^}]*display:\s*grid[^}]*margin-top:\s*8px/s);
  assert.match(css, /\.ml-media-card-action-row\s*{[^}]*bottom:\s*var\(--ml-media-card-action-row-bottom,\s*20px\)[^}]*left:\s*var\(--ml-media-card-action-row-left,\s*22px\)/s);
  assert.match(css, /\.ml-detail-stack\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(css, /\.ml-detail-stack > strong\s*{[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.match(css, /\.ml-detail-stack > span,\s*\.ml-detail-stack > p\s*{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.ml-detail-panel\s*{[^}]*grid-template-rows:\s*var\(--ml-detail-panel-rows,\s*auto minmax\(132px,\s*auto\) minmax\(0,\s*auto\) auto\)[^}]*padding:\s*var\(--ml-detail-panel-padding,\s*28px 35px 30px 24px\)/s);
  assert.match(css, /\.ml-detail-cover\s*{[^}]*width:\s*var\(--ml-detail-cover-width,\s*360px\)[^}]*max-height:\s*var\(--ml-detail-cover-max-height,\s*clamp\(132px,\s*21vh,\s*220px\)\)/s);
});

test("renders Button as a link when href is provided", () => {
  const html = renderToStaticMarkup(
    h(Button, { href: "#/cut-tasks", size: "sm", variant: "secondary" }, "Open queue")
  );

  assert.match(html, /<a /);
  assert.match(html, /href="#\/cut-tasks"/);
  assert.match(html, /ml-button--secondary/);
  assert.match(html, /ml-button--sm/);
  assert.match(html, /<span class="ml-button-label">Open queue<\/span>/);
});

test("renders v1 table with sticky header and semantic rows", () => {
  type Row = { id: string; status: string; source: string };
  const RowTable = Table<Row>;

  const html = renderToStaticMarkup(
    h(RowTable, {
      columns: [
        { id: "status", header: "Status", accessor: "status" },
        { id: "source", header: "Source", accessor: "source" }
      ],
      rows: [{ id: "1", status: "Done", source: "C0510" }],
      getRowKey: (row: { id: string }) => row.id,
      selectedRowKey: "1",
      stickyHeader: true
    })
  );

  assert.match(html, /ml-table-wrap has-sticky-header/);
  assert.match(html, /class="is-selected"/);
  assert.match(html, /C0510/);
});

test("renders sidebar with page labels and active item", () => {
  const html = renderToStaticMarkup(
    h(Sidebar, {
      active: "公共原素材库",
      items: [
        { label: "公共原素材库", icon: "archive" },
        { label: "搜索与文案", icon: "search" }
      ],
      footer: h("div", { className: "cutter-sidebar-footer" }, "剪辑师 Allen")
    })
  );

  assert.match(html, /ml-sidebar/);
  assert.match(html, /公共原素材库/);
  assert.match(html, /is-active/);
  assert.match(html, /ml-sidebar-footer/);
  assert.match(html, /剪辑师 Allen/);
});

test("foundation owns sidebar brand and navigation visual primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-sidebar-brand\s*{[^}]*margin:\s*var\(--ml-sidebar-brand-margin,\s*0\)/s);
  assert.match(
    css,
    /\.ml-sidebar-brand-mark\s*{[^}]*background:\s*var\(--ml-sidebar-brand-mark-background,\s*var\(--ml-color-text\)\)/s
  );
  assert.match(css, /\.ml-sidebar-nav\s*{[^}]*margin-top:\s*var\(--ml-sidebar-nav-margin-top,\s*16px\)/s);
  assert.match(css, /\.ml-sidebar-item\s*{[^}]*min-height:\s*40px[^}]*font-size:\s*13px[^}]*font-weight:\s*650/s);
  assert.match(css, /\.ml-sidebar-item\.is-active\s*{[^}]*background:\s*var\(--ml-color-control-active\)/s);
  assert.match(css, /\.ml-sidebar-icon\s*{[^}]*flex:\s*0 0 20px[^}]*width:\s*20px/s);
  assert.match(css, /\.ml-sidebar-icon svg\s*{[^}]*width:\s*18px[^}]*height:\s*18px/s);
});

test("foundation owns sidebar footer status and user cache primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-sidebar-footer\s*{[^}]*margin-top:\s*auto[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-sidebar-status\s*{[^}]*display:\s*grid[^}]*gap:\s*8px/s);
  assert.match(css, /\.ml-sidebar-status-card,\s*\.ml-sidebar-user-entry\s*{[^}]*border:\s*0[^}]*border-radius:\s*8px/s);
  assert.match(css, /\.ml-sidebar-status-card\s*{[^}]*padding:\s*12px 18px/s);
  assert.match(css, /\.ml-sidebar-status-row\s*{[^}]*min-height:\s*34px[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.ml-sidebar-status-label\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(css, /\.ml-sidebar-status-value\s*{[^}]*color:\s*var\(--ml-color-text\)[^}]*font-weight:\s*750/s);
  assert.match(css, /\.ml-sidebar-status-health::before\s*{[^}]*background:\s*var\(--ml-color-ready\)/s);
  assert.match(css, /\.ml-sidebar-status-health\.is-failed::before\s*{[^}]*background:\s*var\(--ml-color-failed\)/s);
  assert.match(css, /\.ml-sidebar-user-entry\s*{[^}]*grid-template-columns:\s*34px minmax\(0,\s*1fr\) auto/s);
  assert.match(css, /\.ml-sidebar-user-icon\s*{[^}]*width:\s*34px[^}]*background:\s*var\(--ml-color-control-active\)/s);
  assert.match(css, /\.ml-sidebar-user-name\s*{[^}]*font-size:\s*13px[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.ml-sidebar-cache-button\s*{[^}]*min-height:\s*30px[^}]*padding:\s*0 10px/s);
  assert.match(css, /\.ml-sidebar-menu\s*{[^}]*min-width:\s*156px[^}]*box-shadow:\s*var\(--ml-shadow-panel\)/s);
  assert.match(css, /\.ml-sidebar-menu-action\s*{[^}]*width:\s*100%[^}]*justify-content:\s*flex-start/s);
});

test("foundation owns shared segmented, empty, and pagination visual primitives", async () => {
  const css = await readFile(new URL("./layout.css", import.meta.url), "utf8");

  assert.match(css, /\.ml-segmented-control\s*{[^}]*display:\s*inline-flex/s);
  assert.match(css, /\.ml-segmented-control\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(css, /\.ml-segmented-control\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(
    css,
    /\.ml-segmented-control\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-surface\) 70%, transparent\)/s
  );
  assert.match(css, /\.ml-segmented-control--equal\s*{[^}]*display:\s*grid/s);
  assert.match(
    css,
    /\.ml-segmented-control--equal\s*{[^}]*grid-template-columns:\s*repeat\(var\(--ml-segmented-control-count,\s*2\),\s*minmax\(0,\s*1fr\)\)/s
  );
  assert.match(css, /\.ml-segmented-control > \.ml-button\s*{[^}]*justify-content:\s*center/s);
  assert.match(
    css,
    /\.ml-segmented-control > \.ml-button\.is-active,\s*\.ml-segmented-control > \.ml-button\[aria-pressed="true"\]\s*{[^}]*background:\s*var\(--ml-color-accent\)/s
  );
  assert.match(css, /\.ml-empty-panel\s*{[^}]*min-height:\s*180px/s);
  assert.match(css, /\.ml-empty-panel\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-empty-panel\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(css, /\.ml-empty-panel\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(css, /\.ml-empty-panel > strong\s*{[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.match(css, /\.ml-empty-panel > span\s*{[^}]*font-size:\s*12px/s);
  assert.match(css, /\.ml-empty-panel--plain\s*{[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.ml-empty-panel--plain > strong\s*{[^}]*font-size:\s*14px[^}]*line-height:\s*20px/s);
  assert.match(
    css,
    /\.ml-empty-panel--subtle\s*{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 28%,\s*transparent\)[^}]*box-shadow:\s*none/s
  );
  assert.match(css, /\.ml-empty-panel--fill\s*{[^}]*min-height:\s*100%/s);
  assert.match(css, /\.ml-transcript-row\s*{[^}]*grid-template-columns:\s*58px minmax\(0,\s*1fr\)[^}]*padding:\s*3px 8px/s);
  assert.match(css, /\.ml-transcript-index\s*{[^}]*display:\s*none/s);
  assert.match(css, /\.ml-transcript-time\s*{[^}]*appearance:\s*none[^}]*font-family:\s*var\(--ml-font-mono\)[^}]*cursor:\s*pointer/s);
  assert.match(css, /\.ml-transcript-text\s*{[^}]*font-size:\s*13px[^}]*line-height:\s*22px/s);
  assert.match(css, /\.ml-transcript-text mark\s*{[^}]*background:\s*color-mix\(in srgb, #facc15 42%, transparent\)/s);
  assert.match(css, /\.ml-transcript-row:hover\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-surface-subtle\) 48%, transparent\)/s);
  assert.match(css, /\.ml-transcript-row\.is-current-hit\s*{[^}]*background:\s*transparent/s);
  assert.match(css, /\.ml-transcript-row\.is-selected,\s*\.ml-transcript-row\.is-drag-preview\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-accent\) 10%, transparent\)/s);
  assert.match(css, /\.ml-transcript-row\.is-time-selection-start\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-accent\) 8%, transparent\)/s);
  assert.match(css, /\.ml-transcript-row\.is-time-selection-start \.ml-transcript-time\s*{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--ml-color-accent\) 34%, transparent\)[^}]*color:\s*var\(--ml-color-accent\)/s);
  assert.match(css, /\.ml-compact-table\s*{[^}]*align-content:\s*start[^}]*overflow:\s*visible/s);
  assert.match(css, /\.ml-compact-table-head,\s*\.ml-compact-table-row\s*{[^}]*grid-template-columns:\s*58px minmax\(0,\s*1fr\) 46px/s);
  assert.match(css, /\.ml-compact-table-head,\s*\.ml-compact-table-row\s*{[^}]*border-bottom:\s*1px solid color-mix\(in srgb,\s*var\(--ml-color-border\) 28%,\s*transparent\)/s);
  assert.match(css, /\.ml-compact-table-row > strong,\s*\.ml-compact-table-row > small\s*{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.ml-transcript-panel\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.ml-transcript-panel-header\s*{[^}]*min-height:\s*44px[^}]*padding:\s*0 16px/s);
  assert.match(css, /\.ml-transcript-heading\s*{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto[^}]*min-height:\s*44px/s);
  assert.match(css, /\.ml-transcript-actions\s*{[^}]*display:\s*flex[^}]*justify-self:\s*end[^}]*gap:\s*12px/s);
  assert.match(css, /\.ml-transcript-body\s*{[^}]*contain:\s*content[^}]*overflow:\s*auto[^}]*padding:\s*0 18px 24px/s);
  assert.match(css, /\.ml-transcript-spacer\s*{[^}]*display:\s*block[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.ml-pagination-bar\s*{[^}]*min-height:\s*56px/s);
  assert.match(css, /\.ml-pagination-bar\s*{[^}]*display:\s*flex/s);
  assert.match(css, /\.ml-pagination-bar\s*{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.ml-pagination-bar > span\s*{[^}]*line-height:\s*18px/s);
  assert.match(css, /\.ml-panel-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*320px\),\s*1fr\)\)[^}]*gap:\s*18px/s);
  assert.match(css, /\.ml-panel-card\s*{[^}]*align-self:\s*start/s);
  assert.match(css, /\.ml-card-section-offset\s*{[^}]*margin-top:\s*14px/s);
  assert.match(css, /\.ml-field-select\s*{[^}]*min-height:\s*34px/s);
  assert.match(css, /\.ml-field-select\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(css, /\.ml-field-select\s*{[^}]*border-radius:\s*var\(--ml-radius-field\)/s);
  assert.match(css, /\.ml-field-select\s*{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.ml-data-surface\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-data-surface\s*{[^}]*gap:\s*8px/s);
  assert.match(css, /\.ml-data-surface\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(css, /\.ml-data-surface\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(css, /\.ml-form-stack\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-form-stack\s*{[^}]*gap:\s*12px/s);
  assert.match(css, /\.ml-form-summary-row\s*{[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.ml-form-field\s*{[^}]*font-size:\s*12px/s);
  assert.match(css, /\.ml-field-input\s*{[^}]*height:\s*38px/s);
  assert.match(css, /\.ml-field-input\s*{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--ml-color-border\) 62%, transparent\)/s);
  assert.match(css, /\.ml-field-input:focus\s*{[^}]*border-color:\s*var\(--ml-color-primary\)/s);
  assert.match(css, /\.ml-form-message\s*{[^}]*line-height:\s*1\.5/s);
  assert.match(css, /\.ml-form-message--danger\s*{[^}]*color:\s*var\(--ml-color-danger\)/s);
  assert.match(css, /\.ml-form-message--success\s*{[^}]*color:\s*var\(--ml-color-success\)/s);
  assert.match(css, /\.ml-menu-popover\s*{[^}]*position:\s*relative/s);
  assert.match(css, /\.ml-menu-popover-trigger\s*{[^}]*max-width:\s*280px/s);
  assert.match(css, /\.ml-menu-popover-trigger::after\s*{[^}]*content:\s*"⌄"/s);
  assert.match(css, /\.ml-menu-popover-content\s*{[^}]*position:\s*absolute[^}]*width:\s*190px/s);
  assert.match(css, /\.ml-menu-popover-action\s*{[^}]*justify-content:\s*flex-start/s);
  assert.match(css, /\.ml-modal-backdrop\s*{[^}]*position:\s*fixed[^}]*z-index:\s*200/s);
  assert.match(css, /\.ml-dialog\s*{[^}]*width:\s*min\(520px,\s*100%\)[^}]*background:\s*var\(--ml-color-surface\)/s);
  assert.match(css, /\.ml-dialog-header\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-dialog-title\s*{[^}]*font-size:\s*17px/s);
  assert.match(css, /\.ml-dialog-description\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(css, /\.ml-dialog-footer\s*{[^}]*justify-content:\s*flex-end/s);
  assert.match(css, /\.ml-dialog-footer > \.ml-button\s*{[^}]*min-width:\s*76px/s);
  assert.match(css, /\.ml-choice-list\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.ml-choice-option\s*{[^}]*grid-template-columns:\s*18px minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.ml-choice-option--danger\s*{[^}]*var\(--ml-color-failed\) 30%/s);
  assert.match(css, /\.ml-choice-option-body\s*{[^}]*display:\s*grid/s);
});

test("keeps foundation tokens as one stable source", async () => {
  const tokens = await readFile(new URL("./tokens.css", import.meta.url), "utf8");

  assert.equal(tokens.match(/^:root\s*{/gm)?.length, 1);
  assert.equal(tokens.includes("Google Sans"), false);
  assert.match(tokens, /--ml-sidebar-width:\s*248px;/);
  assert.match(tokens, /--ml-border-subtle:/);
  assert.match(tokens, /\*,\s*\*::before,\s*\*::after\s*{[^}]*box-sizing:\s*border-box/s);
  assert.match(tokens, /\[data-appearance-mode="dark"\],\s*\[data-appearance-mode="system"\]\s*{[^}]*--ml-color-canvas:\s*#101318/s);
  assert.match(tokens, /\[data-appearance-mode="light"\]\s*{[^}]*--ml-color-canvas:\s*#f7f8fa/s);
  assert.match(tokens, /\[data-appearance-mode\]\s*{[^}]*background:\s*var\(--ml-color-canvas\)/s);
  assert.match(tokens, /\.ml-theme-cutter\s*{[^}]*--ml-sidebar-width:\s*292px/s);
  assert.match(tokens, /\.ml-theme-cutter\s*{[^}]*--cutter-page-inset-block-start:\s*17px/s);
  assert.match(tokens, /\.ml-theme-cutter\s*{[^}]*--ml-workbench-background:\s*var\(--ml-color-window\)/s);
  assert.match(
    tokens,
    /\[data-appearance-mode\] input:not\(\.ml-field-input\):not\(\.ml-search-box-input\),\s*\[data-appearance-mode\] select:not\(\.ml-field-input\):not\(\.ml-field-select\),\s*\[data-appearance-mode\] textarea:not\(\.ml-field-input\)\s*{[^}]*border:\s*1px solid var\(--ml-color-border-strong\)[^}]*background:\s*var\(--ml-color-control\)/s
  );
  assert.match(
    tokens,
    /\[data-appearance-mode\] :where\(button,\s*a,\s*input,\s*select,\s*textarea\):focus-visible\s*{[^}]*outline:\s*2px solid color-mix\(in srgb, var\(--ml-color-accent\) 48%, transparent\)[^}]*outline-offset:\s*2px/s
  );
});
