#!/usr/bin/env node
/**
 * Round6 只读 release manifest v2 校验（产品流水线可选步骤）。
 * 使用目标仓库 packages/contracts 的 validateReleaseManifestV2，不写任何文件。
 *
 * 用法（需要 tsx 才能导入 .ts 契约；目标仓 node_modules 已存在即可，不安装）：
 *   node --import tsx scripts/ci/check-release-manifest.mjs  *     --repo /path/to/mixlab --manifest /path/to/release-manifest-v2.json --json
 * 退出码：0=合法，1=非法/异常，2=参数错误。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === "--repo") args.repo = next();
    else if (token === "--manifest") args.manifest = next();
    else if (token === "--json") args.json = true;
    else if (token === "--help" || token === "-h") { console.log("check-release-manifest.mjs: 见文件头注释"); process.exit(0); }
    else { console.error("未知参数: " + token); process.exit(2); }
  }
  if (!args.repo || !args.manifest) { console.error("必须提供 --repo 与 --manifest"); process.exit(2); }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(args.repo);
  const manifestPath = path.resolve(args.manifest);
  const result = { check: "release_manifest_v2", ok: false, repo, manifest_path: manifestPath, release_id: "", file_count: 0, errors: [] };
  try {
    const contracts = await import(pathToFileURL(path.join(repo, "packages/contracts/src/release-manifest.ts")).href);
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    const manifest = contracts.validateReleaseManifestV2(raw);
    result.ok = true;
    result.release_id = manifest.release_id;
    result.file_count = manifest.files.length;
    result.release_version = manifest.index_version;
    result.min_client_version = manifest.min_client_version;
  } catch (error) {
    result.errors.push(String(error?.message || error));
  }
  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log("== release manifest v2 校验 ==");
    console.log("manifest: " + manifestPath);
    console.log("结论: " + (result.ok ? "PASS release_id=" + result.release_id + " files=" + result.file_count : "FAIL"));
    for (const error of result.errors) console.log("   - " + error);
  }
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error("check-release-manifest 异常: " + (error?.stack || error));
  process.exit(1);
});
