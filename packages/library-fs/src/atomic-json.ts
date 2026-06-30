import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function stripTrailingNulls(text: string): string {
  return text.replace(/\u0000+$/u, "");
}

export function parseJsonText<T>(text: string): T {
  return JSON.parse(stripTrailingNulls(text)) as T;
}

function temporaryWritePath(targetPath: string): string {
  const parsed = path.parse(targetPath);
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return path.join(parsed.dir, `.${parsed.base}.tmp-${nonce}`);
}

export async function writeTextAtomically(targetPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = temporaryWritePath(targetPath);

  try {
    await writeFile(tempPath, text, "utf8");
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeJsonFileAtomically(targetPath: string, value: unknown): Promise<void> {
  await writeTextAtomically(targetPath, jsonBytes(value));
}
