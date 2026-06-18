import assert from "node:assert/strict";
import test from "node:test";
import { Fragment, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppShell,
  Badge,
  Button,
  Card,
  GalleryGrid,
  GroupedForm,
  InspectorPanel,
  MIXLAB_UI_FOUNDATION_V1_COMPONENTS,
  MacWindow,
  MediaPanel,
  SearchBox,
  Sidebar,
  SourceTable,
  StatusRow,
  Table,
  UnifiedToolbar
} from "./components.tsx";
import { validateNoForbiddenUiPatterns } from "./design-contract.ts";

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

test("renders macOS window chrome with title and traffic lights", () => {
  const html = renderToStaticMarkup(
    h(MacWindow, { title: "MixLab V3", children: h("p", null, "content") })
  );

  assert.match(html, /class="ml-window/);
  assert.match(html, /class="ml-traffic-lights"/);
  assert.match(html, /MixLab V3/);
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

test("renders unified toolbar with library selector, actions, and health", () => {
  const html = renderToStaticMarkup(
    h(UnifiedToolbar, {
      title: "MixLab V3 - 剪辑师工作台",
      libraryLabel: "默认公共库",
      availableCountLabel: "可用原素材 120个",
      healthLabel: "健康",
      actions: ["扫描", "处理", "Doctor"]
    })
  );

  assert.match(html, /ml-toolbar/);
  assert.match(html, /默认公共库/);
  assert.match(html, /Doctor/);
  assert.match(html, /健康/);
});

test("renders gallery grid for cutter public source browsing", () => {
  const html = renderToStaticMarkup(
    h(GalleryGrid, {
      items: [
        {
          id: "V000001",
          title: "现金流管理与风险控制",
          image: "/cover.jpg",
          meta: "56:14",
          tags: ["财务", "风险"],
          description: "企业现金流管理课程片段"
        }
      ]
    })
  );

  assert.match(html, /ml-gallery-grid/);
  assert.doesNotMatch(html, /ml-source-table/);
});

test("renders admin source table and supporting primitives", () => {
  const html = renderToStaticMarkup(
    h(
      Fragment,
      null,
      h(SourceTable, {
        columns: ["ID", "封面", "状态"],
        rows: [["P000001", "现金流.mp4", "Ready"]]
      }),
      h(InspectorPanel, { title: "片段信息", children: "详情" }),
      h(GroupedForm, {
        groups: [
          {
            title: "路径与配置",
            rows: [
              { label: "公共素材库", value: "/Volumes/PublicLibrary" },
              { label: "FFmpeg", value: "就绪" }
            ]
          }
        ]
      }),
      h(StatusRow, { tone: "ready", label: "Manifest", detail: "通过", value: "ready" }),
      h(MediaPanel, { title: "视频预览", image: "/cover.jpg" })
    )
  );

  assert.match(html, /ml-source-table/);
  assert.match(html, /ml-inspector/);
  assert.match(html, /ml-grouped-form/);
  assert.match(html, /ml-status-row/);
  assert.match(html, /ml-media-panel/);
  assert.equal(validateNoForbiddenUiPatterns(html).ok, true);
});
