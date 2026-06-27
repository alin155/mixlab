import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

type BrowserViewportName = "desktop" | "mobile";

interface ViewportResult {
  name: BrowserViewportName;
  width: number;
  height: number;
  url: string;
  load_ms: number;
  screenshot_path: string;
  body_horizontal_overflow_px: number;
  visible_checks: Record<string, boolean>;
  user_table_text: string;
  inspector_text: string;
  console_errors: string[];
  failed_api_requests: string[];
}

export interface BrowserQaGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AdminCutterUsersBrowserQaReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  web_url: string;
  output_dir: string;
  viewports: ViewportResult[];
  gates: BrowserQaGate[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_WEB_URL = "http://127.0.0.1:5188/#/cutter-users";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const REQUIRED_TEXT = [
  "剪辑师",
  "用户表格",
  "用户概览",
  "用户仓库",
  "使用指标",
  "命令操作",
  "不扫描",
  "本页面局部处理",
  "重置密码"
] as const;

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function gate(name: string, passed: boolean, detail: string): BrowserQaGate {
  return { name, passed, detail };
}

function textHasAll(text: string, required: readonly string[]): boolean {
  return required.every((item) => text.includes(item));
}

export function buildGateChecks(report: Omit<AdminCutterUsersBrowserQaReport, "gates" | "result">): BrowserQaGate[] {
  return [
    gate(
      "browser-renders-required-content",
      report.viewports.every((viewport) => Object.values(viewport.visible_checks).every(Boolean)),
      report.viewports.map((viewport) => `${viewport.name}:${Object.entries(viewport.visible_checks).filter(([, ok]) => !ok).map(([key]) => key).join(",") || "ok"}`).join("; ")
    ),
    gate(
      "user-table-visible",
      report.viewports.every((viewport) => textHasAll(viewport.user_table_text, ["用户表格", "状态", "搜索次数"])),
      report.viewports.map((viewport) => `${viewport.name}:${viewport.user_table_text.length}`).join("; ")
    ),
    gate(
      "inspector-contract-visible",
      report.viewports.every((viewport) => textHasAll(viewport.inspector_text, ["用户概览", "页面契约", "用户仓库", "命令操作", "本页面局部处理"])),
      report.viewports.map((viewport) => `${viewport.name}:${viewport.inspector_text.length}`).join("; ")
    ),
    gate(
      "no-console-errors",
      report.viewports.every((viewport) => viewport.console_errors.length === 0),
      report.viewports.map((viewport) => `${viewport.name}:${viewport.console_errors.length}`).join("; ")
    ),
    gate(
      "no-failed-admin-api-requests",
      report.viewports.every((viewport) => viewport.failed_api_requests.length === 0),
      report.viewports.map((viewport) => `${viewport.name}:${viewport.failed_api_requests.length}`).join("; ")
    ),
    gate(
      "no-horizontal-overflow",
      report.viewports.every((viewport) => viewport.body_horizontal_overflow_px === 0),
      report.viewports.map((viewport) => `${viewport.name}:${viewport.body_horizontal_overflow_px}px`).join("; ")
    )
  ];
}

export function renderMarkdown(report: AdminCutterUsersBrowserQaReport): string {
  const lines = [
    "# Admin Cutter Users Browser QA",
    "",
    `Generated: ${report.generated_at}`,
    `Result: ${report.result.status}`,
    `Summary: ${report.result.summary}`,
    "",
    "## Gates",
    "",
    "| Gate | Passed | Detail |",
    "| --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.name} | ${item.passed ? "yes" : "no"} | ${item.detail.replaceAll("|", "\\|")} |`),
    "",
    "## Viewports",
    "",
    "| Viewport | Size | Load ms | Overflow | Screenshot |",
    "| --- | ---: | ---: | ---: | --- |",
    ...report.viewports.map((viewport) =>
      `| ${viewport.name} | ${viewport.width}x${viewport.height} | ${viewport.load_ms} | ${viewport.body_horizontal_overflow_px}px | ${viewport.screenshot_path} |`
    ),
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function collectViewport(input: {
  browser: Browser;
  name: BrowserViewportName;
  width: number;
  height: number;
  webUrl: string;
  outputDir: string;
  artifactPrefix: string;
}): Promise<ViewportResult> {
  const context = await input.browser.newContext({
    viewport: { width: input.width, height: input.height }
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const failedApiRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/admin")) {
      failedApiRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/admin") && response.status() >= 400) {
      failedApiRequests.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });

  const startedAt = performance.now();
  await page.goto(input.webUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("用户表格") && document.body.innerText.includes("用户概览"),
    null,
    { timeout: 15_000 }
  );
  const loadMs = roundMs(performance.now() - startedAt);
  const screenshotPath = path.join(input.outputDir, `${input.artifactPrefix}-${input.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const details = await evaluatePage(page);
  await context.close();

  return {
    name: input.name,
    width: input.width,
    height: input.height,
    url: input.webUrl,
    load_ms: loadMs,
    screenshot_path: screenshotPath,
    body_horizontal_overflow_px: details.body_horizontal_overflow_px,
    visible_checks: Object.fromEntries(REQUIRED_TEXT.map((item) => [item, details.body_text.includes(item)])),
    user_table_text: details.user_table_text,
    inspector_text: details.inspector_text,
    console_errors: consoleErrors,
    failed_api_requests: failedApiRequests
  };
}

async function evaluatePage(page: Page): Promise<{
  body_text: string;
  user_table_text: string;
  inspector_text: string;
  body_horizontal_overflow_px: number;
}> {
  const [
    bodyText,
    userTableTexts,
    inspectorTexts,
    bodyHorizontalOverflowPx
  ] = await Promise.all([
    page.locator("body").innerText(),
    page.locator("[aria-label='用户表格']").allInnerTexts(),
    page.locator(".ml-inspector").allInnerTexts(),
    page.evaluate("Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth)")
  ]);

  return {
    body_text: bodyText,
    user_table_text: userTableTexts.join("\n"),
    inspector_text: inspectorTexts.join("\n"),
    body_horizontal_overflow_px: typeof bodyHorizontalOverflowPx === "number" ? bodyHorizontalOverflowPx : 0
  };
}

export async function runAdminCutterUsersBrowserQa(input: {
  webUrl?: string;
  outputDir?: string;
  generatedAt?: Date;
} = {}): Promise<AdminCutterUsersBrowserQaReport> {
  const generatedAt = input.generatedAt ?? new Date();
  const timestamp = timestampForFile(generatedAt);
  const webUrl = input.webUrl ?? process.env.MIXLAB_ADMIN_WEB_URL ?? DEFAULT_WEB_URL;
  const outputDir = input.outputDir ?? process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const artifactPrefix = `admin-cutter-users-browser-qa-${timestamp}`;

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const viewports = [
      await collectViewport({
        browser,
        name: "desktop",
        width: 1440,
        height: 960,
        webUrl,
        outputDir,
        artifactPrefix
      }),
      await collectViewport({
        browser,
        name: "mobile",
        width: 390,
        height: 844,
        webUrl,
        outputDir,
        artifactPrefix
      })
    ];

    const reportBase = {
      schema_version: "1.0" as const,
      generated_at: generatedAt.toISOString(),
      command: "tsx scripts/acceptance/admin-cutter-users-browser-qa.ts",
      web_url: webUrl,
      output_dir: outputDir,
      viewports
    };
    const gates = buildGateChecks(reportBase);
    const passed = gates.every((item) => item.passed);
    const report: AdminCutterUsersBrowserQaReport = {
      ...reportBase,
      gates,
      result: {
        passed,
        status: passed ? "passed" : "failed",
        summary: passed
          ? "cutter-users browser QA passed for desktop and mobile fixture routes"
          : "cutter-users browser QA failed one or more gates"
      }
    };
    const jsonPath = path.join(outputDir, `${artifactPrefix}.json`);
    const markdownPath = path.join(outputDir, `${artifactPrefix}.md`);
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, renderMarkdown(report), "utf8");

    if (!passed) {
      process.exitCode = 1;
    }

    return report;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAdminCutterUsersBrowserQa()
    .then((report) => {
      console.log(report.result.summary);
      for (const viewport of report.viewports) {
        console.log(`${viewport.name}: ${viewport.screenshot_path}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
