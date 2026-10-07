import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CredentialVault } from "./vault.ts";
import { SmartStore } from "./store.ts";
import { automaticTitle, validatePlatform } from "./types.ts";
import { classifyMatch } from "./library.ts";
import { publicAddress, downloadPublicFile } from "./download.ts";

test("credentials survive concurrent updates but plaintext never appears in their persisted file", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smart-vault-")); t.after(() => rm(root, { recursive: true, force: true }));
  const vault = new CredentialVault(root); await vault.initialize();
  await Promise.all([vault.set("tikhub", "fixture-secret-one"), vault.set("dashscope", "fixture-secret-two")]);
  const stored = await readFile(path.join(root, "credentials.json"), "utf8");
  assert.ok(!stored.includes("fixture-secret-one") && !stored.includes("fixture-secret-two"));
  const restored = new CredentialVault(root); await restored.initialize();
  assert.equal(restored.get("tikhub"), "fixture-secret-one"); assert.equal(restored.get("dashscope"), "fixture-secret-two");
  assert.equal(restored.redact("failure fixture-secret-one"), "failure [redacted]");
  if (process.platform !== "win32") assert.equal((await stat(path.join(root, "credentials.json"))).mode & 0o777, 0o600);
  const corrupted = JSON.parse(stored); corrupted.tag = Buffer.alloc(16).toString("base64");
  await writeFile(path.join(root, "credentials.json"), JSON.stringify(corrupted));
  await assert.rejects(new CredentialVault(root).initialize(), /凭据校验失败/);
});
test("request and creation claims persist and enforce a single budget", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smart-state-")); t.after(() => rm(root, { recursive: true, force: true }));
  const store = new SmartStore(root); store.reserveRequest("day", 1);
  assert.throws(() => store.reserveRequest("day", 1), /上限/);
  assert.equal(store.claimRule("r", "h", "now"), true); assert.equal(store.claimRule("r", "h", "later"), false);
  store.bindRuleWork("r", "h", "w"); store.close();
  const restored = new SmartStore(root); assert.equal(restored.requestCount("day"), 1); assert.equal(restored.claimRule("r", "h", "again"), false); restored.close();
});
test("names are automatic and critical numeric/negative conflicts cannot be passed as exact", () => {
  assert.equal(automaticTitle("现金流很重要。下一句。"), "现金流很重要");
  assert.equal(Array.from(automaticTitle("这是一段非常长的文案开头，用来确保自动生成的标题不会无限增长。" )).length, 22);
  assert.equal(classifyMatch("有利润，不等于有现金流。", "有利润不等于有现金流"), "exact");
  assert.equal(classifyMatch("利润率是15%。", "利润率是5%。"), "conflict");
  assert.equal(classifyMatch("有利润不等于有现金流。", "有利润等于有现金流。"), "conflict");
  assert.throws(() => validatePlatform("tiktok"), /首期/);
});
test("reference downloads reject local/network targets before requesting them", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smart-download-")); t.after(() => rm(root, { recursive: true, force: true }));
  for (const address of ["127.0.0.1", "10.2.3.4", "192.168.1.27", "::1", "fc00::1", "::ffff:127.0.0.1"]) assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(downloadPublicFile("https://127.0.0.1/private", path.join(root, "video"), 1024), /公开 HTTPS/);
  await assert.rejects(downloadPublicFile("http://example.com/video", path.join(root, "video"), 1024), /公开 HTTPS/);
});
