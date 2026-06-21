import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const artifactDir = resolve(root, "docs/acceptance/artifacts/m4-cutter-workbench");
const port = 4294;
const baseUrl = `http://127.0.0.1:${port}`;

const routes = [
  ["project-home", "project-home.png"],
  ["material-locator", "material-locator.png"],
  ["cut-tasks", "cut-tasks.png"],
  ["local-library", "local-library.png"],
  ["public-library", "public-library.png"],
  ["source-detail", "source-detail.png"],
  ["cache-management", "cache-management.png"],
  ["settings", "settings.png"]
] as const;

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`Timed out waiting for cutter web at ${url}`);
}

function startCutterServer(): ChildProcessWithoutNullStreams {
  const child = spawn(
    resolve(root, "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: resolve(root, "apps/cutter-web"),
      env: {
        ...process.env,
        VITE_MIXLAB_USE_FIXTURE_DATA: "true"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return child;
}

async function requireCount(page: Page, selector: string, minCount: number): Promise<void> {
  const count = await page.locator(selector).count();

  if (count < minCount) {
    throw new Error(`Expected ${selector} count >= ${minCount}, got ${count}`);
  }
}

async function requireNoElements(page: Page, selector: string): Promise<void> {
  const count = await page.locator(selector).count();

  if (count > 0) {
    throw new Error(`Expected ${selector} to be absent, got ${count}`);
  }
}

async function requireAnyCount(
  page: Page,
  selectors: readonly string[],
  minCount: number
): Promise<void> {
  const counts = await Promise.all(selectors.map(async (selector) => page.locator(selector).count()));
  if (counts.some((count) => count >= minCount)) {
    return;
  }

  throw new Error(
    `Expected one of ${selectors.join(", ")} count >= ${minCount}, got ${counts.join(", ")}`
  );
}

async function requireText(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
}

async function requirePlaceholder(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(text, { exact: false }).first().waitFor();
}

async function assertPublicLibraryOnlyShowsReadyMaterial(page: Page): Promise<void> {
  const content = await page.locator("[data-page='public-library']").textContent();

  if (!content) {
    throw new Error("Public library page content not found");
  }

  for (const forbidden of ["processing", "failed", "处理中", "失败", "未处理"]) {
    if (content.includes(forbidden)) {
      throw new Error(`Public library leaked non-ready source material marker: ${forbidden}`);
    }
  }
}

async function assertNoSentenceWaterfall(page: Page): Promise<void> {
  const count = await page.locator(".sentence-waterfall").count();

  if (count > 0) {
    throw new Error("Search page rendered forbidden sentence-waterfall UI");
  }
}

function routeHash(route: (typeof routes)[number][0]): string {
  if (route === "material-locator") {
    return "#/material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81";
  }

  return `#/${route}`;
}

async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not launch local Chrome for cutter visual verification. ${message}`);
  }
}

async function captureRoute(
  browser: Browser,
  route: (typeof routes)[number][0],
  fileName: string
): Promise<void> {
  const page = await browser.newPage({
    viewport: {
      width: 1536,
      height: 1024
    },
    deviceScaleFactor: 1
  });

  page.setDefaultTimeout(12_000);
  await page.goto(`${baseUrl}/${routeHash(route)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-cutter-web-ready='true']").waitFor();
  await requireCount(page, ".ml-app-shell", 1);
  await requireCount(page, ".ml-sidebar", 1);
  await requireCount(page, ".ml-workbench", 1);
  await requireCount(page, ".cutter-workspace", 1);
  await requireNoElements(page, ".ml-window");
  await requireNoElements(page, ".ml-window-chrome");
  await requireCount(page, `[data-page='${route}']`, 1);

  if (route === "project-home") {
    await requireText(page, "开始搜索");
    await requirePlaceholder(page, "搜索文案关键词");
    await requireText(page, "最近项目");
    await requireText(page, "项目详情");
  }

  if (route === "material-locator") {
    await page.locator("[data-segment-id]").first().click();
    await requireText(page, "候选素材");
    await requireCount(page, ".cutter-locator-workbench", 1);
    await requireText(page, "视频文案");
    await requireText(page, "命中");
    await assertNoSentenceWaterfall(page);
  }

  if (route === "cut-tasks") {
    await requireText(page, "剪切任务");
    await requireText(page, "本机剪切流水线");
    await requireText(page, "失败");
  }

  if (route === "local-library") {
    await requireAnyCount(page, [".cutter-library-grid", ".cutter-library-empty-state"], 1);
    await requireText(page, "本地素材库");
    await requireText(page, "本地可复剪素材");
    await requireText(page, "素材详情");
  }

  if (route === "public-library") {
    await requireCount(page, ".cutter-library-grid", 1);
    await requireText(page, "可用原素材");
    await requireText(page, "浏览管理端已经发布到剪辑端的原视频");
    await assertPublicLibraryOnlyShowsReadyMaterial(page);
  }

  if (route === "source-detail") {
    await requireText(page, "原视频与完整文案");
    await requireText(page, "连续选择");
    await requireCount(page, "video", 1);
  }

  if (route === "cache-management") {
    await requireText(page, "缓存管理");
    await requireText(page, "测试结果");
    await requireText(page, "缓存明细");
    await requireText(page, "缓存位置");
  }

  if (route === "settings") {
    await requireText(page, "运行环境");
    await requireText(page, "设置");
    await requireText(page, "公共素材库");
    await requireText(page, "FFmpeg");
  }

  await page.screenshot({
    path: resolve(artifactDir, fileName),
    fullPage: false
  });
  await page.close();
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const server = startCutterServer();
  let browser: Browser | null = null;

  try {
    await waitForServer(baseUrl);
    browser = await launchChrome();

    for (const [route, fileName] of routes) {
      await captureRoute(browser, route, fileName);
    }
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }

  console.log(`Cutter web screenshots saved to ${artifactDir}`);
}

await main();
