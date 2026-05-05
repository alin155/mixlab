import os from "node:os";
import path from "node:path";

export interface PersistentRuntimePathInput {
  path_value: string;
  path_label: string;
  env?: NodeJS.ProcessEnv;
  allow_env_key?: string;
}

const DEFAULT_ALLOW_ENV_KEY = "MIXLAB_ALLOW_TEMP_RUNTIME_PATHS";

function normalizePath(value: string): string {
  return path.resolve(value.trim());
}

function isSameOrChildPath(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedRoot = normalizePath(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function temporaryRoots(): string[] {
  return Array.from(new Set([
    os.tmpdir(),
    "/tmp",
    "/private/tmp",
    "/var/tmp",
    "/private/var/tmp"
  ]));
}

export function isTemporaryRuntimePath(pathValue: string): boolean {
  if (!pathValue.trim()) {
    return false;
  }

  return temporaryRoots().some((root) => isSameOrChildPath(pathValue, root));
}

export function assertPersistentRuntimePath(input: PersistentRuntimePathInput): void {
  const allowKey = input.allow_env_key ?? DEFAULT_ALLOW_ENV_KEY;
  const env = input.env ?? process.env;

  if (env[allowKey] === "1") {
    return;
  }

  if (!isTemporaryRuntimePath(input.path_value)) {
    return;
  }

  throw new Error(
    [
      `检测到${input.path_label}位于临时目录：${input.path_value}`,
      "正式运行禁止使用临时目录保存公共素材库、预处理文案、封面、索引或本地剪切结果。",
      "临时目录会在系统重启、清理缓存或会话结束后丢失数据。",
      "请改用移动硬盘、NAS、用户选择的持久目录，或 App 模式下的用户 Application Support 目录。",
      `只有自动化测试可以设置 ${allowKey}=1 临时放行。`
    ].join(" ")
  );
}
