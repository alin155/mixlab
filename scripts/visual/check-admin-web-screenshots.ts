import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const artifactDir = resolve(root, "docs/acceptance/artifacts/m5-admin-console");
const port = 4295;
const baseUrl = `http://127.0.0.1:${port}`;

const routes = [
  ["dashboard", "dashboard.png"],
  ["library-settings", "library-settings.png"],
  ["source-videos", "source-videos.png"],
  ["preprocess-jobs", "preprocess-jobs.png"],
  ["index-publish", "index-publish.png"],
  ["doctor", "doctor.png"],
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

  throw new Error(`Timed out waiting for admin web at ${url}`);
}

function startAdminServer(): ChildProcessWithoutNullStreams {
  const child = spawn(
    resolve(root, "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: resolve(root, "apps/admin-web"),
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

async function assertNoSecret(page: Page): Promise<void> {
  const content = await page.content();

  if (content.includes("sk-")) {
    throw new Error("Admin web leaked a secret-looking API key");
  }
}

async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not launch local Chrome for admin visual verification. ${message}`);
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

  await page.goto(`${baseUrl}/#/${route}`, { waitUntil: "networkidle" });
  await page.locator("[data-admin-web-ready='true']").waitFor();
  await requireCount(page, ".ml-window", 1);
  await requireCount(page, ".ml-sidebar", 1);
  await requireCount(page, ".ml-toolbar", 1);
  await assertNoSecret(page);

  if (route === "dashboard") {
    await requireText(page, "Ready");
    await requireText(page, "Failed");
    await requireText(page, "Index Required");
  }

  if (route === "source-videos") {
    await requireText(page, "公共元数据");
    await requireText(page, "对剪辑师可见");
    await requireText(page, "讲师");
  }

  if (route === "preprocess-jobs") {
    await requireText(page, "失败可重试");
    await requireText(page, "DashScope ASR 网络超时");
    await requireText(page, "J000041");
  }

  if (route === "index-publish") {
    await requireText(page, "current.json");
    await requireText(page, "原子切换 current");
  }

  if (route === "doctor") {
    await requireText(page, "导出诊断 JSON");
  }

  if (route === "settings") {
    await requireText(page, "已配置，已隐藏");
    await requireText(page, "DashScope 临时上传");
  }

  await page.screenshot({
    path: resolve(artifactDir, fileName),
    fullPage: false
  });
  await page.close();
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const server = startAdminServer();
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

  console.log(`Admin web screenshots saved to ${artifactDir}`);
}

await main();
