import { startWindowsTestRunner } from "./index.ts";

function readStartupRunJsonArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--start-run-json") {
      return argv[index + 1];
    }
    if (argument?.startsWith("--start-run-json=")) {
      return argument.slice("--start-run-json=".length);
    }
  }
  return undefined;
}

process.on("uncaughtException", (error) => {
  console.error("MixLab Windows Test Runner crashed.");
  console.error(error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("MixLab Windows Test Runner rejected an async operation.");
  console.error(error);
  process.exit(1);
});

startWindowsTestRunner({
  startupRunJson: readStartupRunJsonArg(process.argv.slice(2))
});
