import assert from "node:assert/strict";
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
