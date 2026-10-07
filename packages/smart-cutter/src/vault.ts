import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
import { SmartError } from "./types.ts";

const DPAPI_SCRIPT = `Add-Type -AssemblyName System.Security
$v=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
if($env:MIXLAB_VAULT_ACTION -eq 'protect') {
 $v=[Security.Cryptography.ProtectedData]::Protect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
} else {
 $v=[Security.Cryptography.ProtectedData]::Unprotect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
}
[Console]::Out.Write([Convert]::ToBase64String($v))`;

async function dpapi(value: Buffer, action: "protect" | "unprotect"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", DPAPI_SCRIPT], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, MIXLAB_VAULT_ACTION: action }
    });
    const output: Buffer[] = [];
    child.stdout.on("data", chunk => output.push(Buffer.from(chunk)));
    child.stderr.resume();
    child.once("error", () => reject(new SmartError("credential_store", "无法访问本机凭据存储", 503)));
    child.once("exit", code => code === 0
      ? resolve(Buffer.from(Buffer.concat(output).toString().trim(), "base64"))
      : reject(new SmartError("credential_store", "本机凭据解密失败，请重新配置 Key", 503)));
    child.stdin.end(value.toString("base64"));
  });
}

export async function atomicPrivateJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.pending`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, file);
  if (process.platform !== "win32") await chmod(file, 0o600);
}

export class CredentialVault {
  private key: Buffer | null = null;
  private values: Record<string, string> = {};
  private writes: Promise<void> = Promise.resolve();
  constructor(readonly root: string) {}
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const keyFile = path.join(this.root, "credential-key.json");
    try {
      const saved = JSON.parse(await readFile(keyFile, "utf8")) as { platform: string; value: string };
      const bytes = Buffer.from(saved.value, "base64");
      if (saved.platform === "win32" && process.platform !== "win32") throw new Error("wrong user/platform");
      this.key = saved.platform === "win32" ? await dpapi(bytes, "unprotect") : bytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SmartError("credential_store", "无法解密本机凭据，请检查用户和应用数据目录", 503);
      this.key = randomBytes(32);
      const stored = process.platform === "win32" ? await dpapi(this.key, "protect") : this.key;
      await atomicPrivateJson(keyFile, { platform: process.platform, value: stored.toString("base64") });
    }
    if (this.key.length !== 32) throw new SmartError("credential_store", "本机凭据存储已损坏", 503);
    try {
      const saved = JSON.parse(await readFile(path.join(this.root, "credentials.json"), "utf8")) as { iv: string; tag: string; data: string };
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(saved.iv, "base64"));
      decipher.setAuthTag(Buffer.from(saved.tag, "base64"));
      this.values = JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data, "base64")), decipher.final()]).toString());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SmartError("credential_store", "本机凭据校验失败，请恢复应用配置", 503);
    }
  }
  has(name: string): boolean { return !!this.values[name]; }
  get(name: string): string { return this.values[name] ?? ""; }
  set(name: string, value: string): Promise<void> {
    const operation = this.writes.then(() => this.persist(name, value));
    this.writes = operation.catch(() => undefined);
    return operation;
  }
  private async persist(name: string, value: string): Promise<void> {
    if (!this.key) throw new Error("vault not initialized");
    const before = { ...this.values };
    if (value) this.values[name] = value; else delete this.values[name];
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(this.values)), cipher.final()]);
    try { await atomicPrivateJson(path.join(this.root, "credentials.json"), {
      iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: bytes.toString("base64")
    }); } catch (error) { this.values = before; throw error; }
  }
  redact(message: string): string {
    let result = message;
    for (const value of Object.values(this.values)) if (value) result = result.replaceAll(value, "[redacted]");
    return result;
  }
}
