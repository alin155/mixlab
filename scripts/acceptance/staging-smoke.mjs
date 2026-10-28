/**
 * Round6 staging acceptance executor (read-only / dry-run by default).
 *
 * Runs the same phased checks on a target Windows/NAS staging machine and locally:
 * environment/node, paths/permissions, ports, SQLite open/write probe, account+usage service
 * health, migration dry-run (account/usage), release current/verify (admin API), rollback
 * readiness, service locks, disk space.
 *
 * Safety: never starts services, never applies migrations/rollback, never writes service state.
 * The only writes are the temporary SQLite probe (OS tmp dir, removed) and the evidence files
 * requested with --out-dir.
 *
 * Usage:
 *   node scripts/acceptance/staging-smoke.mjs --dry-run --json
 *   node scripts/acceptance/staging-smoke.mjs --skip-services --skip-release --legacy-library <path> --accounts-state-root <path> --usage-state-root <path> --out-dir <dir>
 *
 * Exit codes: 0 = no FAIL (WARN/SKIP allowed), 1 = at least one FAIL, 2 = bad arguments.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs, constants as fsConstants } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_SHA256 = createHash("sha256").update(await fs.readFile(SCRIPT_PATH)).digest("hex");
const STARTED_AT = new Date().toISOString();

const HELP = [
  "MixLab staging acceptance executor (read-only / dry-run)",
  "",
  "用法: node scripts/acceptance/staging-smoke.mjs [options]",
  "",
  "  --dry-run                 默认开启；只检查，不写服务状态、不执行 apply/rollback、不启动服务",
  "  --json                    只输出 JSON 证据（日志写 stderr）",
  "  --out-dir <dir>           同时写出 evidence-<host>-<ts>.json / .md",
  "  --skip-services           跳过账号/事件服务健康检查",
  "  --skip-release            跳过发布 current/verify 检查",
  "  --skip-migrations         跳过迁移 dry-run",
  "  --repo-root <dir>         仓库根（默认 cwd）",
  "  --legacy-library <dir>    公共库根（迁移 dry-run / 磁盘检查）",
  "  --accounts-state-root <dir>  账号服务 state root（权限/锁/回滚检查）",
  "  --usage-state-root <dir>     事件服务 state root（权限/锁/迁移检查）",
  "  --smart-state-root <dir>     智能端 state root（实例锁检查）",
  "  --ports 3889,3891,...      端口占用检查列表",
  "  --admin-api-base <url>     管理端 API base（发布检查）",
  "  --accounts-service-base <url>  账号服务 base（默认 http://127.0.0.1:3891）",
  "  --usage-service-base <url>     事件服务 base（默认 http://127.0.0.1:3892）",
  "  --admin-cookie '<cookie>'  管理端会话 Cookie（仅内存，证据中脱敏）",
  "  --release-id <id/version>  指定发布版本做 verify",
  "  --require-services         服务不可达判 FAIL（安装后门禁）",
  "  --require-release          管理端/发布不可用判 FAIL（发布后门禁）",
  "  --expect-services          端口被占用视为预期",
  "  --min-free-gb 20           磁盘 WARN 阈值（<5GB 直接 FAIL）",
  "  --timeout-ms 15000         单个 check 超时",
  "  --only id1,id2 / --skip id1,id2  按 check id 过滤",
  "",
  "check id: env.node env.platform env.repo paths.state-roots paths.legacy-library ports",
  "  ports.services sqlite.probe services.usage-health services.accounts-tcp",
  "  migrations.account-dry-run migrations.usage-dry-run release.current release.verify",
  "  rollback.readiness locks.services locks.smart disk.space"
].join("\n");

function parseArgs(argv) {
  const options = {
    repo_root: process.cwd(), json: false, dry_run: true, skip: new Set(), only: null,
    ports: [3889, 3891, 3892, 3789, 3799],
    accounts_state_root: "", usage_state_root: "", smart_state_root: "", legacy_library: "",
    admin_api_base: "http://127.0.0.1:3889", accounts_service_base: "http://127.0.0.1:3891",
    usage_service_base: "http://127.0.0.1:3892", admin_cookie: "", release_id: "",
    expect_services: false, require_services: false, require_release: false,
    min_free_gb: 20, timeout_ms: 15000, out_dir: "", skip_services: false, skip_release: false,
    skip_migrations: false, skip_locks: false, skip_disk: false, skip_evidence: false, help: false
  };
  const takeValue = (name, index) => {
    if (index + 1 >= argv.length) throw new Error("缺少参数值: " + name);
    return argv[index + 1];
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help": case "-h": options.help = true; break;
      case "--json": options.json = true; break;
      case "--dry-run": options.dry_run = true; break;
      case "--no-dry-run": options.dry_run = false; break;
      case "--repo-root": options.repo_root = path.resolve(takeValue(arg, index)); index += 1; break;
      case "--accounts-state-root": options.accounts_state_root = path.resolve(takeValue(arg, index)); index += 1; break;
      case "--usage-state-root": options.usage_state_root = path.resolve(takeValue(arg, index)); index += 1; break;
      case "--smart-state-root": options.smart_state_root = path.resolve(takeValue(arg, index)); index += 1; break;
      case "--legacy-library": options.legacy_library = path.resolve(takeValue(arg, index)); index += 1; break;
      case "--ports": options.ports = takeValue(arg, index).split(",").map(value => Number.parseInt(value.trim(), 10)).filter(value => Number.isInteger(value) && value > 0 && value < 65536); index += 1; break;
      case "--admin-api-base": options.admin_api_base = takeValue(arg, index); index += 1; break;
      case "--accounts-service-base": options.accounts_service_base = takeValue(arg, index); index += 1; break;
      case "--usage-service-base": options.usage_service_base = takeValue(arg, index); index += 1; break;
      case "--admin-cookie": options.admin_cookie = takeValue(arg, index); index += 1; break;
      case "--release-id": options.release_id = takeValue(arg, index); index += 1; break;
      case "--expect-services": options.expect_services = true; break;
      case "--require-services": options.expect_services = true; options.require_services = true; break;
      case "--require-release": options.require_release = true; break;
      case "--skip-services": options.skip_services = true; break;
      case "--skip-release": options.skip_release = true; break;
      case "--skip-migrations": options.skip_migrations = true; break;
      case "--skip-locks": options.skip_locks = true; break;
      case "--skip-disk": options.skip_disk = true; break;
      case "--skip-evidence": options.skip_evidence = true; break;
      case "--min-free-gb": options.min_free_gb = Number.parseFloat(takeValue(arg, index)); index += 1; break;
      case "--timeout-ms": options.timeout_ms = Number.parseInt(takeValue(arg, index), 10); index += 1; break;
      case "--out-dir": options.out_dir = path.resolve(takeValue(arg, index)); index += 1; break;
      case "--only": options.only = new Set(takeValue(arg, index).split(",").map(value => value.trim()).filter(Boolean)); index += 1; break;
      case "--skip": for (const id of takeValue(arg, index).split(",")) options.skip.add(id.trim()); index += 1; break;
      default: throw new Error("未知参数: " + arg);
    }
  }
  return options;
}

function log(line) { process.stderr.write(line + "\n"); }

function redactOptions(options) {
  return {
    ...options,
    skip: [...options.skip],
    only: options.only ? [...options.only] : null,
    admin_cookie: options.admin_cookie ? "<redacted>" : ""
  };
}

async function withTimeout(promise, timeout_ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("超时: " + label + " (" + timeout_ms + "ms)")), timeout_ms);
    timer.unref?.();
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(timer); }
}

function makeResult(check, status, detail, data) {
  return { id: check.id, phase: check.phase, title: check.title, status, detail, data: data ?? null, duration_ms: 0 };
}

function freePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", error => resolve({ free: false, code: error.code ?? "unknown" }));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve({ free: true, code: "" })));
  });
}

function tcpReachable(host, port, timeout_ms) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (reachable, error) => { socket.destroy(); resolve({ reachable, error: error ?? "" }); };
    socket.setTimeout(timeout_ms, () => done(false, "timeout"));
    socket.once("connect", () => done(true, ""));
    socket.once("error", error => done(false, error.code ?? "error"));
  });
}

function parseJsonLoose(text) {
  if (typeof text !== "string") throw new Error("无输出");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("输出中没有 JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function runNodeScript(repoRoot, scriptRelative, args, timeout_ms) {
  const script = path.join(repoRoot, scriptRelative);
  try { await fs.access(script); } catch { return { ok: false, skipped: true, reason: "脚本不存在: " + scriptRelative }; }
  try { await fs.access(path.join(repoRoot, "node_modules", "tsx")); } catch {
    return { ok: false, skipped: true, reason: "node_modules/tsx 不存在（验收机禁止 npm install；请预置 tsx 或使用预构建 CLI）" };
  }
  return await new Promise((resolve) => {
    execFile(process.execPath, ["--import", "tsx", script, ...args], {
      cwd: repoRoot, timeout: timeout_ms, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: "" }
    }, (error, stdout, stderr) => {
      const output = String(stdout ?? "");
      const errorText = String(stderr ?? "");
      if (error) { resolve({ ok: false, skipped: false, reason: error.message, stdout: output, stderr: errorText }); return; }
      try { resolve({ ok: true, skipped: false, json: parseJsonLoose(output), stdout: output, stderr: errorText }); }
      catch (parseError) { resolve({ ok: false, skipped: false, reason: "输出不是 JSON: " + parseError.message, stdout: output, stderr: errorText }); }
    });
  });
}

async function gitHead(repoRoot) {
  return await new Promise((resolve) => {
    execFile("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], { timeout: 5000, windowsHide: true }, (error, stdout) => {
      if (error) { resolve({ ok: false, head: "", reason: error.message }); return; }
      resolve({ ok: true, head: String(stdout).trim(), reason: "" });
    });
  });
}

async function repoPackage(repoRoot) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
    return { name: typeof value.name === "string" ? value.name : "", version: typeof value.version === "string" ? value.version : "" };
  } catch { return { name: "", version: "" }; }
}

function servicePort(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return Number.parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10);
  } catch { return 0; }
}

async function getJson(url, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(options.timeout_ms ?? 5000) });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

function isNetworkPath(target) {
  return target.startsWith("\\\\") || target.startsWith("//");
}

async function runChecks(options) {
  const checks = [];
  const stateRoots = [options.accounts_state_root, options.usage_state_root, options.smart_state_root].filter(Boolean);
  const packageInfo = await repoPackage(options.repo_root);
  const git = await gitHead(options.repo_root);
  const isWindows = process.platform === "win32";

  checks.push({ id: "env.node", phase: "env", title: "Node 版本与 node:sqlite 可用", async run() {
    const version = process.versions.node;
    const [major, minor] = version.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 5)) return makeResult(this, "FAIL", "Node " + version + " < 22.5，node:sqlite 不可用");
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(":memory:");
      db.close();
    } catch (error) {
      return makeResult(this, "FAIL", "node:sqlite 导入/打开失败: " + error.message + "（Node 26 需候选已修复 DatabaseSync options 兼容）");
    }
    return makeResult(this, "PASS", "Node " + version + "，node:sqlite 可用", { version });
  }});

  checks.push({ id: "env.platform", phase: "env", title: "平台/仓库信息", async run() {
    if (!["win32", "darwin", "linux"].includes(process.platform)) return makeResult(this, "WARN", "未验证平台: " + process.platform);
    return makeResult(this, "PASS", process.platform + " " + os.release() + " " + process.arch, {
      platform: process.platform, release: os.release(), arch: process.arch,
      repo_name: packageInfo.name, repo_version: packageInfo.version, git_head: git.head, git_ok: git.ok
    });
  }});

  checks.push({ id: "env.repo", phase: "env", title: "仓库根与脚本完整性", async run() {
    const exists = await fs.stat(path.join(options.repo_root, "package.json")).then(() => true, () => false);
    if (!exists) return makeResult(this, "FAIL", "repo-root 下没有 package.json: " + options.repo_root);
    return makeResult(this, "PASS", "repo-root=" + options.repo_root + "，脚本 sha256=" + SCRIPT_SHA256.slice(0, 16) + "...", { repo_root: options.repo_root, script_sha256: SCRIPT_SHA256 });
  }});

  checks.push({ id: "paths.state-roots", phase: "paths", title: "服务 state root 存在性与权限", async run() {
    if (!stateRoots.length) return makeResult(this, "SKIP", "未提供 --accounts-state-root / --usage-state-root / --smart-state-root");
    const rows = [];
    for (const root of stateRoots) {
      if (isNetworkPath(root)) { rows.push({ root, status: "FAIL", detail: "state root 指向网络共享（禁止）" }); continue; }
      const exists = await fs.stat(root).then(value => value.isDirectory(), () => false);
      if (!exists) { rows.push({ root, status: "WARN", detail: "目录尚不存在（部署前正常，dry-run 不创建）" }); continue; }
      try {
        await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
        const stat = await fs.stat(root);
        const mode = stat.mode & 0o777;
        const tooOpen = !isWindows && (mode & 0o077) !== 0;
        rows.push({ root, status: tooOpen ? "WARN" : "PASS", detail: tooOpen ? "目录权限过宽 mode=" + mode.toString(8) : "存在且可读写 mode=" + mode.toString(8) });
      } catch (error) {
        rows.push({ root, status: "FAIL", detail: "不可读写: " + error.message });
      }
    }
    const status = rows.some(row => row.status === "FAIL") ? "FAIL" : rows.some(row => row.status === "WARN") ? "WARN" : "PASS";
    return makeResult(this, status, rows.map(row => path.basename(row.root) + "=" + row.status).join(", "), { rows });
  }});

  checks.push({ id: "paths.legacy-library", phase: "paths", title: "公共素材库只读可达", async run() {
    if (!options.legacy_library) return makeResult(this, "SKIP", "未提供 --legacy-library");
    const pointer = path.join(options.legacy_library, ".mixlab-library", "current-release.json");
    const pointerOk = await fs.stat(pointer).then(value => value.isFile(), () => false);
    let writable = false;
    try { await fs.access(options.legacy_library, fsConstants.W_OK); writable = true; } catch { writable = false; }
    const detail = (pointerOk ? "current-release.json 存在" : "current-release.json 缺失") + (writable ? "；本机可写（生产建议只读）" : "；只读（预期）");
    return makeResult(this, pointerOk ? (writable ? "WARN" : "PASS") : "WARN", detail, { pointer, writable });
  }});

  checks.push({ id: "ports", phase: "ports", title: "端口占用检查", async run() {
    const rows = [];
    for (const port of options.ports) {
      const result = await freePort(port);
      const expectedOccupied = options.expect_services && rows.length >= 0;
      let status = "PASS";
      let detail = "空闲";
      if (!result.free) {
        status = expectedOccupied ? "PASS" : "WARN";
        detail = "已被占用（" + result.code + "）" + (expectedOccupied ? "，--expect-services 视为预期" : "，若服务已部署请加 --expect-services");
      }
      rows.push({ port, free: result.free, status, detail });
    }
    const status = rows.some(row => row.status === "WARN") ? "WARN" : "PASS";
    return makeResult(this, status, rows.map(row => row.port + ":" + (row.free ? "free" : "in-use")).join(", "), { rows });
  }});

  checks.push({ id: "ports.services", phase: "ports", title: "服务 base URL 一致性", async run() {
    const rows = [
      { name: "admin-api", url: options.admin_api_base, port: servicePort(options.admin_api_base) },
      { name: "accounts", url: options.accounts_service_base, port: servicePort(options.accounts_service_base) },
      { name: "usage", url: options.usage_service_base, port: servicePort(options.usage_service_base) }
    ];
    const invalid = rows.filter(row => !row.port || !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(row.url));
    if (invalid.length) return makeResult(this, "FAIL", "base URL 必须是本机回环 http://127.0.0.1:port：" + invalid.map(row => row.name).join(","));
    return makeResult(this, "PASS", rows.map(row => row.name + "=" + row.port).join(", "), { rows });
  }});

  checks.push({ id: "sqlite.probe", phase: "sqlite", title: "SQLite 打开/WAL/写读探测（临时目录）", async run() {
    const { DatabaseSync } = await import("node:sqlite");
    let db;
    let probeDir = "";
    try {
      probeDir = await fs.mkdtemp(path.join(os.tmpdir(), "mixlab-staging-smoke-sqlite-"));
      const file = path.join(probeDir, "probe.sqlite");
      db = new DatabaseSync(file);
      db.exec("PRAGMA journal_mode=WAL; CREATE TABLE probe(id TEXT PRIMARY KEY, value TEXT NOT NULL);");
      db.prepare("INSERT INTO probe VALUES(?,?)").run("k1", "v1");
      const row = db.prepare("SELECT value FROM probe WHERE id=?").get("k1");
      const journal = db.prepare("PRAGMA journal_mode").get();
      return makeResult(this, row?.value === "v1" ? "PASS" : "FAIL", "WAL/写读正常 journal_mode=" + JSON.stringify(journal), { file });
    } catch (error) {
      return makeResult(this, "FAIL", "SQLite 探测失败: " + (error && error.message ? error.message : String(error)));
    } finally {
      try { db?.close(); } catch { /* ignore */ }
      if (probeDir) await fs.rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }});

  checks.push({ id: "services.usage-health", phase: "services", title: "事件服务 /health", async run() {
    if (options.skip_services) return makeResult(this, "SKIP", "--skip-services");
    try {
      const response = await getJson(new URL("/health", options.usage_service_base).toString(), { timeout_ms: 3000 });
      const body = response.body ?? {};
      if (response.status === 200 && body.status === "ok" && typeof body.store_id === "string" && body.store_id.length > 0) {
        return makeResult(this, "PASS", "usage ok store_id=" + body.store_id.slice(0, 8) + "... contract=" + String(body.contract_version ?? ""), { body });
      }
      return makeResult(this, options.require_services ? "FAIL" : "WARN", "usage /health 非预期: " + response.status);
    } catch (error) {
      return makeResult(this, options.require_services ? "FAIL" : "WARN", "usage 服务不可达（" + error.message + "）" + (options.require_services ? "" : "，安装前 WARN 属预期"));
    }
  }});

  checks.push({ id: "services.accounts-tcp", phase: "services", title: "账号服务 TCP 可达（无 /health 路由）", async run() {
    if (options.skip_services) return makeResult(this, "SKIP", "--skip-services");
    const port = servicePort(options.accounts_service_base);
    const result = await tcpReachable("127.0.0.1", port, 3000);
    return makeResult(this, result.reachable ? "PASS" : options.require_services ? "FAIL" : "WARN",
      result.reachable ? "accounts TCP 127.0.0.1:" + port + " 可达" : "accounts 不可达（" + result.error + "）", { port });
  }});

  checks.push({ id: "migrations.account-dry-run", phase: "migrations", title: "账号迁移 dry-run（只读）", async run() {
    if (options.skip_migrations) return makeResult(this, "SKIP", "--skip-migrations");
    if (!options.legacy_library || !options.accounts_state_root) return makeResult(this, "SKIP", "需要 --legacy-library 与 --accounts-state-root");
    const result = await runNodeScript(options.repo_root, "scripts/operations/cutter-account-migration.ts",
      ["dry-run", options.legacy_library, options.accounts_state_root], options.timeout_ms);
    if (result.skipped) return makeResult(this, "SKIP", result.reason);
    if (!result.ok) return makeResult(this, "FAIL", "账号迁移 dry-run 失败: " + result.reason);
    const blockers = Array.isArray(result.json.blockers) ? result.json.blockers : [];
    const digest = result.json.source_digest ?? result.json.sourceDigest ?? "";
    if (blockers.length) return makeResult(this, "FAIL", "dry-run blockers: " + JSON.stringify(blockers), { digest, blockers });
    return makeResult(this, "PASS", "dry-run ok samples=" + String(digest).slice(0, 16) + "...", { digest, blockers });
  }});

  checks.push({ id: "migrations.usage-dry-run", phase: "migrations", title: "事件迁移 dry-run（只读）", async run() {
    if (options.skip_migrations) return makeResult(this, "SKIP", "--skip-migrations");
    if (!options.legacy_library || !options.usage_state_root) return makeResult(this, "SKIP", "需要 --legacy-library 与 --usage-state-root");
    const result = await runNodeScript(options.repo_root, "scripts/operations/usage-service-migration.ts",
      ["import", options.legacy_library, options.usage_state_root, "--dry-run"], options.timeout_ms);
    if (result.skipped) return makeResult(this, "SKIP", result.reason);
    if (!result.ok) return makeResult(this, "FAIL", "事件迁移 dry-run 失败: " + result.reason);
    const data = result.json;
    return makeResult(this, "PASS", "usage dry-run ok keys=" + Object.keys(data).slice(0, 6).join(","), { summary_keys: Object.keys(data).slice(0, 20) });
  }});

  checks.push({ id: "release.current", phase: "release", title: "发布 current（管理端 API）", async run() {
    if (options.skip_release) return makeResult(this, "SKIP", "--skip-release");
    if (!options.admin_cookie) return makeResult(this, "SKIP", "需要 --admin-cookie（管理端会话）");
    try {
      const response = await getJson(new URL("/api/admin/releases/current", options.admin_api_base).toString(), { cookie: options.admin_cookie, timeout_ms: 5000 });
      if (response.status === 401 || response.status === 403) return makeResult(this, "SKIP", "管理端会话无效（HTTP " + response.status + "）");
      if (response.status !== 200) return makeResult(this, options.require_release ? "FAIL" : "WARN", "发布 current HTTP " + response.status);
      const data = (response.body && response.body.data) || response.body;
      return makeResult(this, "PASS", "发布 current ok schema=" + String(data?.schema_version ?? data?.schemaVersion ?? "") + " release=" + String(data?.release_id ?? data?.releaseId ?? ""), { summary: data });
    } catch (error) {
      return makeResult(this, options.require_release ? "FAIL" : "WARN", "管理端 API 不可达（" + error.message + "）");
    }
  }});

  checks.push({ id: "release.verify", phase: "release", title: "发布 v2 verify（只读）", async run() {
    if (options.skip_release) return makeResult(this, "SKIP", "--skip-release");
    if (!options.admin_cookie || !options.release_id) return makeResult(this, "SKIP", "需要 --admin-cookie 与 --release-id");
    try {
      const started = Date.now();
      const response = await getJson(new URL("/api/admin/releases/" + encodeURIComponent(options.release_id) + "/verify?max_files=20000", options.admin_api_base).toString(), { cookie: options.admin_cookie, timeout_ms: options.timeout_ms });
      const duration = Date.now() - started;
      if (response.status === 401 || response.status === 403) return makeResult(this, "SKIP", "管理端会话无效（HTTP " + response.status + "）");
      if (response.status !== 200) return makeResult(this, options.require_release ? "FAIL" : "WARN", "发布 verify HTTP " + response.status);
      const verification = (response.body && response.body.data && (response.body.data.verification || response.body.data)) || {};
      const ok = verification.ok === true || verification.mismatch_count === 0;
      return makeResult(this, ok ? "PASS" : "FAIL", "verify " + (ok ? "ok" : "FAILED") + " files=" + String(verification.file_count ?? "") + " mismatch=" + String(verification.mismatch_count ?? "") + " duration=" + duration + "ms", { verification, http_duration_ms: duration });
    } catch (error) {
      return makeResult(this, options.require_release ? "FAIL" : "WARN", "发布 verify 不可用（" + error.message + "）");
    }
  }});

  checks.push({ id: "rollback.readiness", phase: "rollback", title: "回滚前置条件（只读）", async run() {
    if (!options.accounts_state_root) return makeResult(this, "SKIP", "未提供 --accounts-state-root");
    const backupRoot = path.join(options.accounts_state_root, "backups");
    const importFile = path.join(options.accounts_state_root, "account-import.json");
    const backupExists = await fs.stat(backupRoot).then(value => value.isDirectory(), () => false);
    const importExists = await fs.stat(importFile).then(value => value.isFile(), () => false);
    const backups = backupExists ? await fs.readdir(backupRoot).catch(() => []) : [];
    const detail = "backups=" + backups.length + "，account-import.json=" + (importExists ? "存在" : "缺失");
    if (!backupExists && !importExists) return makeResult(this, "WARN", "尚未迁移（无备份/导入记录）：首次 staging 属预期；迁移后必须 PASS");
    return makeResult(this, backupExists && importExists && backups.length > 0 ? "PASS" : "WARN", detail, { backups, import_exists: importExists });
  }});

  function inspectLockDir(lockDir) {
    return fs.stat(lockDir).then(async (stat) => {
      if (!stat.isDirectory()) return { kind: "invalid", pid: 0, detail: "锁不是目录" };
      const owner = await fs.readFile(path.join(lockDir, "owner.json"), "utf8").then(raw => { try { return JSON.parse(raw); } catch { return null; } }, () => null);
      const pid = owner && Number.isInteger(owner.pid) ? owner.pid : 0;
      return { kind: owner ? "managed" : "legacy-or-invalid", pid, detail: owner ? "owner pid=" + pid : "无 owner.json" };
    }).catch(() => null);
  }

  checks.push({ id: "locks.services", phase: "locks", title: "账号/事件服务锁检查（只读）", async run() {
    if (options.skip_locks) return makeResult(this, "SKIP", "--skip-locks");
    if (!options.accounts_state_root && !options.usage_state_root) return makeResult(this, "SKIP", "未提供 accounts/usage state root");
    const rows = [];
    if (options.accounts_state_root) {
      const base = path.join(options.accounts_state_root, ".mixlab-library", "cutter-users");
      for (const [name, lockDir] of [["users-write", path.join(base, ".users-write.lock")], ["account-service", path.join(base, ".account-service.lock")]]) {
        const info = await inspectLockDir(lockDir);
        if (info) rows.push({ name, status: "WARN", detail: info.detail });
      }
      const owned = await fs.stat(path.join(base, "service-owned.json")).then(() => true, () => false);
      rows.push({ name: "service-owned.json", status: owned ? "PASS" : "WARN", detail: owned ? "存在（服务已接管）" : "缺失（未迁移/未启动）" });
    }
    if (options.usage_state_root) {
      const ownerExists = await fs.stat(path.join(options.usage_state_root, "owner.sqlite")).then(() => true, () => false);
      rows.push({ name: "usage owner.sqlite", status: ownerExists ? "WARN" : "PASS", detail: ownerExists ? "文件存在（服务运行时持独占锁）" : "无" });
    }
    const status = rows.some(row => row.status === "WARN") ? "WARN" : "PASS";
    return makeResult(this, status, rows.map(row => row.name + "=" + row.status).join(", "), { rows });
  }});

  checks.push({ id: "locks.smart", phase: "locks", title: "智能端实例锁检查（可选）", async run() {
    if (options.skip_locks) return makeResult(this, "SKIP", "--skip-locks");
    if (!options.smart_state_root) return makeResult(this, "SKIP", "未提供 --smart-state-root");
    const raw = await fs.readFile(path.join(options.smart_state_root, "lock.json"), "utf8").catch(() => null);
    if (raw === null) return makeResult(this, "PASS", "无 lock.json（智能端未运行）");
    let record = null;
    try { record = JSON.parse(raw); } catch { return makeResult(this, "WARN", "lock.json 不可解析（可能损坏）"); }
    let alive = false;
    if (Number.isInteger(record.pid)) { try { process.kill(record.pid, 0); alive = true; } catch { alive = false; } }
    return makeResult(this, "WARN", "lock.json 存在 pid=" + String(record.pid ?? "") + " alive=" + alive, { record });
  }});

  checks.push({ id: "disk.space", phase: "disk", title: "磁盘可用空间", async run() {
    if (options.skip_disk) return makeResult(this, "SKIP", "--skip-disk");
    const targets = [...stateRoots];
    if (options.legacy_library) targets.push(options.legacy_library);
    if (!targets.length) targets.push(options.repo_root);
    const rows = [];
    for (const target of targets) {
      let statfs = await fs.statfs(target).catch(() => null);
      if (!statfs) {
        let parent = path.dirname(target);
        while (parent !== path.dirname(parent)) {
          statfs = await fs.statfs(parent).catch(() => null);
          if (statfs) break;
          parent = path.dirname(parent);
        }
      }
      if (!statfs) { rows.push({ target, status: "WARN", detail: "无法读取 statfs" }); continue; }
      const freeGb = (statfs.bavail * statfs.bsize) / (1024 ** 3);
      rows.push({ target, status: freeGb < 5 ? "FAIL" : freeGb < options.min_free_gb ? "WARN" : "PASS", free_gb: Number(freeGb.toFixed(2)) });
    }
    const status = rows.some(row => row.status === "FAIL") ? "FAIL" : rows.some(row => row.status === "WARN") ? "WARN" : "PASS";
    return makeResult(this, status, rows.map(row => path.basename(row.target) + "=" + row.free_gb + "GB/" + row.status).join(", "), { rows, min_free_gb: options.min_free_gb });
  }});

  return checks.filter(check => {
    if (options.only && !options.only.has(check.id)) return false;
    if (options.skip.has(check.id)) return false;
    return true;
  });
}

function markdownReport(evidence) {
  const lines = [];
  lines.push("# Staging Smoke Evidence");
  lines.push("");
  lines.push("- created_at: " + evidence.created_at);
  lines.push("- host: " + evidence.host);
  lines.push("- platform: " + evidence.platform + " / " + evidence.arch);
  lines.push("- node: " + evidence.node_version);
  lines.push("- repo: " + evidence.repo.name + "@" + evidence.repo.version + " head=" + evidence.repo.git_head);
  lines.push("- dry_run: " + evidence.dry_run);
  lines.push("- script_sha256: " + evidence.script_sha256);
  lines.push("- evidence_sha256: " + evidence.evidence_sha256);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| PASS | WARN | FAIL | SKIP | total |");
  lines.push("|---|---|---|---|---|");
  lines.push("| " + evidence.summary.PASS + " | " + evidence.summary.WARN + " | " + evidence.summary.FAIL + " | " + evidence.summary.SKIP + " | " + evidence.summary.total + " |");
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push("| id | phase | status | detail |");
  lines.push("|---|---|---|---|");
  for (const check of evidence.checks) lines.push("| " + check.id + " | " + check.phase + " | **" + check.status + "** | " + String(check.detail).replaceAll("|", "\\|").slice(0, 300) + " |");
  lines.push("");
  lines.push("## Next actions");
  lines.push("");
  const failed = evidence.checks.filter(check => check.status === "FAIL");
  const warned = evidence.checks.filter(check => check.status === "WARN");
  if (!failed.length && !warned.length) lines.push("- 无 FAIL/WARN：可作为该阶段证据归档。");
  for (const check of failed) lines.push("- FAIL " + check.id + "：" + check.detail);
  for (const check of warned) lines.push("- WARN " + check.id + "：" + check.detail);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(HELP + "\n"); return 0; }
  if (options.only && options.skip.size) {
    for (const id of options.only) options.skip.delete(id);
  }
  const checks = await runChecks(options);
  const results = [];
  for (const check of checks) {
    const started = Date.now();
    log("[RUN] " + check.id + " - " + check.title);
    let result;
    try {
      result = await withTimeout(Promise.resolve().then(() => check.run()), options.timeout_ms, check.id);
      if (!result) result = makeResult(check, "FAIL", "check 未返回结果");
    } catch (error) {
      result = makeResult(check, "FAIL", "异常: " + (error && error.message ? error.message : String(error)));
    }
    result.duration_ms = Date.now() - started;
    results.push(result);
    log("[" + result.status + "] " + check.id + " - " + result.detail);
  }
  const summary = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0, total: results.length };
  for (const result of results) summary[result.status] += 1;
  const repo = await repoPackage(options.repo_root);
  const git = await gitHead(options.repo_root);
  const hashPayload = JSON.stringify({ options: redactOptions(options), checks: results, summary });
  const evidence = {
    schema_version: "1.0",
    kind: "mixlab-staging-smoke",
    created_at: STARTED_AT,
    finished_at: new Date().toISOString(),
    dry_run: options.dry_run,
    host: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    node_version: process.versions.node,
    cwd: process.cwd(),
    repo: { root: options.repo_root, name: repo.name, version: repo.version, git_head: git.head, git_ok: git.ok },
    script_sha256: SCRIPT_SHA256,
    options: redactOptions(options),
    summary,
    checks: results,
    evidence_sha256: createHash("sha256").update(hashPayload).digest("hex")
  };
  if (options.json) process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
  else {
    process.stdout.write("\n=== MIXLAB STAGING SMOKE (" + evidence.host + " / " + evidence.platform + " / node " + evidence.node_version + ") ===\n");
    for (const result of results) process.stdout.write("[" + result.status + "] " + result.id.padEnd(30) + " " + result.detail + "\n");
    process.stdout.write("\nSUMMARY: PASS=" + summary.PASS + " WARN=" + summary.WARN + " FAIL=" + summary.FAIL + " SKIP=" + summary.SKIP + " total=" + summary.total + "\n");
    process.stdout.write("evidence_sha256=" + evidence.evidence_sha256 + "\n");
  }
  if (options.out_dir && !options.skip_evidence) {
    await fs.mkdir(options.out_dir, { recursive: true });
    const stamp = evidence.created_at.replace(/[:.]/g, "-");
    const base = path.join(options.out_dir, "staging-smoke-" + evidence.host.replace(/[^A-Za-z0-9._-]/g, "_") + "-" + stamp);
    await fs.writeFile(base + ".json", JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    await fs.writeFile(base + ".md", markdownReport(evidence) + "\n", { mode: 0o600 });
    log("[evidence] " + base + ".json");
    log("[evidence] " + base + ".md");
  }
  return summary.FAIL > 0 ? 1 : 0;
}

let exitCode = 2;
try { exitCode = await main(); }
catch (error) {
  process.stderr.write("STAGING_SMOKE_CRASH: " + (error && error.stack ? error.stack : String(error)) + "\n");
  exitCode = 2;
}
process.exitCode = exitCode;

