import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const artifactDir = resolve(root, "docs/acceptance/artifacts/m4-cutter-workbench");
const port = 4294;
const baseUrl = `http://127.0.0.1:${port}`;

const routes = [
  ["public-library", "public-library.png"],
  ["source-detail", "source-detail.png"],
  ["search", "search.png"],
  ["cut-list", "cut-list.png"],
  ["local-library", "local-library.png"],
  ["cut-queue", "cut-queue.png"],
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

async function requireText(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
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

  await page.goto(`${baseUrl}/#${route}`, { waitUntil: "networkidle" });
  await page.locator("[data-cutter-web-ready='true']").waitFor();
  await requireCount(page, ".ml-window", 1);
  await requireCount(page, ".ml-sidebar", 1);
  await requireCount(page, ".ml-toolbar", 1);
  await requireCount(page, `[data-page='${route}']`, 1);

  if (route === "public-library") {
    await requireCount(page, ".ml-gallery-grid", 1);
    await requireText(page, "可用原素材");
    await requireText(page, "由管理端配置");
    await assertPublicLibraryOnlyShowsReadyMaterial(page);
  }

  if (route === "source-detail") {
    await requireText(page, "原视频与完整文案");
    await requireText(page, "连续选择");
    await requireCount(page, "video", 1);
  }

  if (route === "search") {
    await requireText(page, "按原素材分组");
    await requireText(page, "上下文文案");
    await assertNoSentenceWaterfall(page);
  }

  if (route === "cut-list") {
    await requireText(page, "提交剪切队列");
    await requireText(page, "选中文案");
  }

  if (route === "local-library") {
    await requireText(page, "本地素材库");
    await requireText(page, "可复用片段");
    await requireText(page, "来源追踪");
  }

  if (route === "cut-queue") {
    await requireText(page, "不阻塞搜索");
    await requireText(page, "failed");
    await requireText(page, "重试");
  }

  if (route === "settings") {
    await requireText(page, "公共素材库挂载");
    await requireText(page, "FFmpeg");
    await requireText(page, "Doctor");
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
