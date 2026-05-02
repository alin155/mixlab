import assert from "node:assert/strict";
import test from "node:test";
import { Fragment, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GalleryGrid,
  GroupedForm,
  InspectorPanel,
  MacWindow,
  MediaPanel,
  Sidebar,
  SourceTable,
  StatusRow,
  UnifiedToolbar
} from "./components.tsx";
import { validateNoForbiddenUiPatterns } from "./design-contract.ts";

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
      ]
    })
  );

  assert.match(html, /ml-sidebar/);
  assert.match(html, /公共原素材库/);
  assert.match(html, /is-active/);
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
