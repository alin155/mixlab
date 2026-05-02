import { resolveIndexCurrentPointerPath, resolveSourceVideoPath } from "../../packages/protocol/src/index.ts";

const cases = [
  {
    label: "macOS mounted volume",
    mount_root: "/Volumes/MixLab-NAS-Simulated",
    relative_path: "课程/老板 现金流课程.mp4"
  },
  {
    label: "Windows drive",
    mount_root: "Z:\\",
    relative_path: "课程/老板 现金流课程.mp4"
  },
  {
    label: "Windows UNC",
    mount_root: "\\\\NAS01\\MixLab",
    relative_path: "课程/老板 现金流课程.mp4"
  },
  {
    label: "deep Chinese path",
    mount_root: "/Volumes/MixLab-NAS-Simulated",
    relative_path: "培训/2026 春季/老板财务课/第 01 讲 现金流.mp4"
  }
];

for (const item of cases) {
  console.log(`\n[${item.label}]`);
  console.log(`mount_root: ${item.mount_root}`);
  console.log(`relative_path: ${item.relative_path}`);
  console.log(
    `source_path: ${resolveSourceVideoPath({
      mount_root: item.mount_root,
      relative_path: item.relative_path
    })}`
  );
  console.log(
    `index_current: ${resolveIndexCurrentPointerPath({
      mount_root: item.mount_root
    })}`
  );
}
