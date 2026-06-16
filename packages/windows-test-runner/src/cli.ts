import { startWindowsTestRunner } from "./index.ts";

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

startWindowsTestRunner();
