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
  ["source-videos", "source-videos.png"],
  ["preprocess-jobs", "preprocess-jobs.png"],
  ["index-publish", "index-publish.png"],
  ["doctor", "doctor.png"],
  ["cutter-users", "cutter-users.png"],
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
  const matches = page.getByText(text, { exact: false });
  const count = await matches.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = matches.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return;
    }
  }

  await matches.first().waitFor({ state: "visible" });
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
    await requireText(page, "全局风险和产能");
    await requireText(page, "素材规模");
    await requireText(page, "风险摘要");
    await requireText(page, "处理未处理");
  }

  if (route === "source-videos") {
    await requireText(page, "公共元数据");
    await requireText(page, "保存公开说明");
  }

  if (route === "preprocess-jobs") {
    await requireText(page, "预处理队列");
    await requireText(page, "未处理原视频");
    await requireText(page, "启动预处理服务");
  }

  if (route === "index-publish") {
    await requireText(page, "索引与发布");
    await requireText(page, "发布待索引视频");
  }

  if (route === "doctor") {
    await requireText(page, "诊断系统问题");
    await requireText(page, "检查目的");
    await requireText(page, "导出诊断报告");
  }

  if (route === "cutter-users") {
    await requireText(page, "剪辑师用户");
    await requireText(page, "通过申请");
  }

  if (route === "settings") {
    await requireText(page, "运行策略");
    await requireText(page, "新增素材来源");
    await requireText(page, "启用素材来源");
    await requireText(page, "保存设置");
    await requireText(page, "阿里云百炼");
    await requireText(page, "无损单声道");
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
