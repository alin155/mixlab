#!/usr/bin/env node
/**
 * Round6 三仓共享包 hash 门禁。
 * 校验三个仓库的 packages/{contracts,library-format,service-clients} 逐文件 sha256 一致，
 * 且每个包的 package.json 内容一致（逐字节 + JSON 深比较）。
 *
 * 用法（三仓任意位置均可）：
 *   node scripts/ci/shared-packages-gate.mjs  *     --admin-root /path/to/mixlab --cutter-root /path/to/mixlab-cutter  *     --smart-root /path/to/smart --json --summary
 * 选项：
 *   --packages a,b,c       默认 contracts,library-format,service-clients
 *   --json                 输出机器可读 JSON（stdout）
 *   --summary              额外输出一行式摘要（stdout；与 --json 同用时输出到 stderr）
 *   --summary-out <file>   写 JSON 摘要到文件（CI artifact 复用）
 *   --check-package-json   同时逐字节比较 package.json（默认开启）
 *   --dry-run              只列出将比较的包/文件数，不判定失败
 * 退出码：0=PASS，1=不一致/错误，2=参数错误。
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PACKAGES = ["contracts", "library-format", "service-clients"];
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".turbo", "target"]);
const EXCLUDED_FILES = new Set([".DS_Store"]);

function parseArgs(argv) {
  const args = { packages: DEFAULT_PACKAGES, json: false, summary: false, summaryOut: "", dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === "--admin-root") args.adminRoot = next();
    else if (token === "--cutter-root") args.cutterRoot = next();
    else if (token === "--smart-root") args.smartRoot = next();
    else if (token === "--repos-root") args.reposRoot = next();
    else if (token === "--packages") args.packages = (next() ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    else if (token === "--json") args.json = true;
    else if (token === "--summary") args.summary = true;
    else if (token === "--summary-out") args.summaryOut = next() ?? "";
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") { console.log("shared-packages-gate.mjs: 见文件头注释"); process.exit(0); }
    else { console.error("未知参数: " + token); process.exit(2); }
  }
  return args;
}

function resolveRepos(args) {
  const reposRoot = args.reposRoot ? path.resolve(args.reposRoot) : "";
  const pick = (flag, envName, dirName) => {
    const value = flag || process.env[envName] || (reposRoot ? path.join(reposRoot, dirName) : "");
    return value ? path.resolve(value) : "";
  };
  const repos = {
    admin: pick(args.adminRoot, "MIXLAB_ADMIN_ROOT", "mixlab"),
    cutter: pick(args.cutterRoot, "MIXLAB_CUTTER_ROOT", "mixlab-cutter"),
    smart: pick(args.smartRoot, "MIXLAB_SMART_ROOT", "mixlab-smart-cutter")
  };
  const missing = Object.entries(repos).filter(([, root]) => !root).map(([name]) => name);
  if (missing.length) {
    console.error("缺少仓库路径: " + missing.join(", ") + "（用 --admin-root/--cutter-root/--smart-root 或 --repos-root / MIXLAB_*_ROOT 提供）");
    process.exit(2);
  }
  return repos;
}

async function walkFiles(root, relative = "") {
  const directory = relative ? path.join(root, relative) : root;
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    if (EXCLUDED_FILES.has(entry.name)) continue;
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...await walkFiles(root, childRelative));
      continue;
    }
    if (entry.isFile()) files.push(childRelative.split(path.sep).join("/"));
  }
  return files.sort();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function comparePackage(name, repos) {
  const result = {
    package: name,
    status: "PASS",
    repos: {},
    files: { total: 0, compared: 0, missing: [], extra: [], mismatched: [] },
    package_json: { compared: true, mismatched: false, detail: "" },
    differences: []
  };
  const snapshots = {};
  for (const [repoName, repoRoot] of Object.entries(repos)) {
    const packageRoot = path.join(repoRoot, "packages", name);
    const exists = await stat(packageRoot).then((info) => info.isDirectory(), () => false);
    result.repos[repoName] = { root: packageRoot, exists };
    if (!exists) {
      result.differences.push("missing_package: " + repoName + "/packages/" + name);
      result.status = "FAIL";
      continue;
    }
    const files = await walkFiles(packageRoot);
    const entries = {};
    for (const file of files) {
      entries[file] = await sha256File(path.join(packageRoot, ...file.split("/")));
    }
    snapshots[repoName] = { files, entries };
    result.repos[repoName].file_count = files.length;
  }
  result.files.total = Object.values(snapshots)[0]?.files.length ?? 0;

  const allFiles = new Set();
  for (const snapshot of Object.values(snapshots)) snapshot.files.forEach((file) => allFiles.add(file));
  const repoNames = Object.keys(snapshots);
  for (const file of [...allFiles].sort()) {
    const present = repoNames.filter((repoName) => snapshots[repoName].entries[file] !== undefined);
    if (present.length !== repoNames.length) {
      for (const repoName of repoNames.filter((name) => !present.includes(name))) {
        result.files.missing.push({ file, missing_in: repoName });
        result.differences.push("missing_file: " + repoName + "/packages/" + name + "/" + file);
      }
      result.status = "FAIL";
      continue;
    }
    if (file === "package.json") {
      result.package_json.compared = true;
      continue;
    }
    const hashes = new Set(repoNames.map((repoName) => snapshots[repoName].entries[file]));
    result.files.compared += 1;
    if (hashes.size > 1) {
      result.files.mismatched.push({ file, hashes: Object.fromEntries(repoNames.map((repoName) => [repoName, snapshots[repoName].entries[file]])) });
      result.differences.push("hash_mismatch: packages/" + name + "/" + file);
      result.status = "FAIL";
    }
  }

  if (result.package_json.compared && snapshots.admin && snapshots.cutter && snapshots.smart) {
    const values = await Promise.all(repoNames.map(async (repoName) => ({
      repoName,
      text: await readFile(path.join(repos[repoName], "packages", name, "package.json"), "utf8")
    })));
    const texts = new Set(values.map((item) => item.text));
    const jsonValues = values.map((item) => { try { return JSON.parse(item.text); } catch { return { invalid: true, repoName: item.repoName }; } });
    const jsonSet = new Set(jsonValues.map((value) => JSON.stringify(value)));
    if (texts.size > 1 || jsonSet.size > 1) {
      result.package_json.mismatched = true;
      result.differences.push("package_json_mismatch: packages/" + name + "/package.json");
      result.status = "FAIL";
    }
  }
  return result;
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const repos = resolveRepos(args);
  const packages = args.packages;
  const results = [];
  for (const name of packages) results.push(await comparePackage(name, repos));
  if (args.dryRun) {
    for (const result of results) result.status = result.repos.admin?.exists === false ? "SKIP" : "DRY_RUN";
  }
  const failed = results.filter((result) => result.status === "FAIL");
  const summary = {
    gate: "shared-packages-gate",
    ok: failed.length === 0,
    dry_run: args.dryRun,
    repos,
    packages: results,
    failures: failed.flatMap((result) => result.differences),
    duration_ms: Date.now() - startedAt
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    console.log("== 三仓共享包 hash 门禁 ==");
    for (const result of results) {
      const counts = Object.entries(result.repos).map(([repoName, info]) => repoName + "=" + (info.exists ? info.file_count : "MISSING")).join(" ");
      console.log("[" + result.status + "] packages/" + result.package + "  " + counts);
      for (const difference of result.differences.slice(0, 20)) console.log("   - " + difference);
      if (result.differences.length > 20) console.log("   ... 共 " + result.differences.length + " 处差异");
    }
    console.log("结论: " + (summary.ok ? "PASS" : "FAIL") + " (" + summary.duration_ms + "ms)");
  }
  if (args.summary && !args.json) {
    console.log("SUMMARY " + JSON.stringify({ ok: summary.ok, failures: summary.failures.length, duration_ms: summary.duration_ms }));
  } else if (args.summary && args.json) {
    process.stderr.write("SUMMARY " + JSON.stringify({ ok: summary.ok, failures: summary.failures.length }) + "\n");
  }
  if (args.summaryOut) {
    await writeFile(args.summaryOut, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  console.error("shared-packages-gate 异常: " + (error?.stack || error));
  process.exit(1);
});
