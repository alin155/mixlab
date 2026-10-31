import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsUpdatePanel } from "./SettingsUpdatePanel.tsx";

test("settings update panel exposes current version and check action", () => {
  const html = renderToStaticMarkup(h(SettingsUpdatePanel, { appVersion: "0.18.27" }));
  assert.match(html, /软件更新/);
  assert.match(html, /当前版本 v0\.18\.27/);
  assert.match(html, /检查更新/);
});
