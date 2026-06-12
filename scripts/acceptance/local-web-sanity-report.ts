import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateLocalWebSanityReport } from "./local-web-sanity.ts";

const DEFAULT_REPORT_PATH = "docs/acceptance/artifacts/local-web-sanity.json";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function validateLocalWebSanityReportFile(reportPath: string): Promise<{
  ok: boolean;
  path: string;
  errors: string[];
}> {
  let parsedReport: unknown;

  try {
    parsedReport = JSON.parse(await readFile(reportPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      path: reportPath,
      errors: [`local web sanity report must be readable JSON: ${errorMessage(error)}`]
    };
  }

  const errors = validateLocalWebSanityReport(parsedReport);

  return {
    ok: errors.length === 0,
    path: reportPath,
    errors
  };
}

async function main(): Promise<void> {
  const reportPath = process.argv[2] ?? process.env.MIXLAB_LOCAL_WEB_SANITY_REPORT ?? DEFAULT_REPORT_PATH;
  const result = await validateLocalWebSanityReportFile(reportPath);

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
