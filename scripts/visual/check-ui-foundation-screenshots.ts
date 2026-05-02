import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const artifactDir = resolve(root, "docs/acceptance/artifacts/m3-ui-foundation");
const port = 4193;
const baseUrl = `http://127.0.0.1:${port}`;

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

  throw new Error(`Timed out waiting for fixture server at ${url}`);
}

function startFixtureServer(): ChildProcessWithoutNullStreams {
  const child = spawn(
    resolve(root, "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: resolve(root, "apps/ui-fixtures"),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  return child;
}

async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not launch local Chrome for visual verification. ${message}`
    );
  }
}

async function requireCount(page: Page, selector: string, minCount: number): Promise<void> {
  const count = await page.locator(selector).count();

  if (count < minCount) {
    throw new Error(`Expected ${selector} count >= ${minCount}, got ${count}`);
  }
}

async function requireAbsent(page: Page, text: string): Promise<void> {
  const content = await page.content();

  if (content.includes(text)) {
    throw new Error(`Forbidden fixture content found: ${text}`);
  }
}

async function captureFixture(
  browser: Browser,
  route: "cutter" | "admin",
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
  await page.locator("[data-ml-fixture-ready='true']").waitFor();
  await requireCount(page, ".ml-window", 6);
  await requireCount(page, ".ml-sidebar", 6);
  await requireCount(page, ".ml-toolbar", 6);

  if (route === "cutter") {
    await requireCount(page, ".ml-gallery-grid", 2);
    await requireCount(page, ".ml-media-panel", 2);
    await requireCount(page, ".ml-inspector", 4);
    await requireAbsent(page, "sentence-waterfall");
  } else {
    await requireCount(page, ".ml-source-table", 2);
    await requireCount(page, ".ml-status-row", 8);
    await requireCount(page, ".ml-grouped-form", 4);
    await page.getByText("导出诊断 JSON").waitFor();
  }

  await page.screenshot({
    path: resolve(artifactDir, fileName),
    fullPage: false
  });

  await page.close();
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const server = startFixtureServer();
  let browser: Browser | null = null;

  try {
    await waitForServer(baseUrl);
    browser = await launchChrome();
    await captureFixture(browser, "cutter", "cutter-fixture.png");
    await captureFixture(browser, "admin", "admin-fixture.png");
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }

  console.log(`UI foundation screenshots saved to ${artifactDir}`);
}

await main();
