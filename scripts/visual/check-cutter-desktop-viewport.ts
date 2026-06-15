import { chromium } from "playwright";

const baseUrl = process.env.MIXLAB_CUTTER_WEB_URL ?? "http://127.0.0.1:5187";

const routes = [
  "project-home",
  "material-locator",
  "cut-tasks",
  "local-library",
  "public-library",
  "cache-management",
  "settings"
];

const viewports = [
  { width: 1180, height: 720 },
  { width: 1240, height: 800 },
  { width: 1440, height: 900 },
  { width: 1680, height: 1050 }
];

type OverflowOffender = {
  tag: string;
  cls: string;
  id: string;
  dx: number;
  ox: string;
  oy: string;
};

type ViewportFailure = {
  viewport: (typeof viewports)[number];
  route: string;
  htmlDx: number;
  bodyDx: number;
  htmlDy: number;
  bodyDy: number;
  offenders: OverflowOffender[];
};

const browser = await chromium.launch({ headless: true });
const failures: ViewportFailure[] = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });

    for (const route of routes) {
      await page.goto(`${baseUrl}/#/${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000
      });
      await page.waitForSelector(".cutter-app[data-cutter-web-ready]", { timeout: 10_000 });
      await page.waitForTimeout(300);

      const result = await page.evaluate(() => {
        const offenders = [...document.querySelectorAll("*")]
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            cls: typeof el.className === "string" ? el.className : "",
            id: el.id,
            dx: el.scrollWidth - el.clientWidth,
            ox: getComputedStyle(el).overflowX,
            oy: getComputedStyle(el).overflowY
          }))
          .filter((item) => item.dx > 1 && ["auto", "scroll"].includes(item.ox))
          .slice(0, 8);

        return {
          htmlDx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          bodyDx: document.body.scrollWidth - document.body.clientWidth,
          htmlDy: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          bodyDy: document.body.scrollHeight - document.body.clientHeight,
          offenders
        };
      });

      if (
        result.htmlDx > 1 ||
        result.bodyDx > 1 ||
        result.htmlDy > 1 ||
        result.bodyDy > 1 ||
        result.offenders.length > 0
      ) {
        failures.push({ viewport, route, ...result });
      }
    }

    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, checked: routes.length * viewports.length, failures }, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
