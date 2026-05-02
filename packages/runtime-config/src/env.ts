import { readFile } from "node:fs/promises";

export interface LoadEnvFileInput {
  file_path: string;
  env?: NodeJS.ProcessEnv;
  override?: boolean;
  optional?: boolean;
}

export interface LoadEnvFileResult {
  loaded: boolean;
  file_path: string;
  loaded_keys: string[];
  skipped_existing_keys: string[];
}

function unescapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function stripInlineComment(value: string): string {
  const commentMatch = value.match(/\s+#/);

  if (!commentMatch || commentMatch.index === undefined) {
    return value;
  }

  return value.slice(0, commentMatch.index).trimEnd();
}

function parseValue(rawValue: string): string {
  const value = rawValue.trim();

  if (value.startsWith("\"") && value.endsWith("\"")) {
    return unescapeDoubleQuoted(value.slice(1, -1));
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return stripInlineComment(value).trim();
}

export function parseEnvFileContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = withoutExport.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    const rawValue = withoutExport.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    parsed[key] = parseValue(rawValue);
  }

  return parsed;
}

export async function loadEnvFile(input: LoadEnvFileInput): Promise<LoadEnvFileResult> {
  let content: string;

  try {
    content = await readFile(input.file_path, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (input.optional && nodeError.code === "ENOENT") {
      return {
        loaded: false,
        file_path: input.file_path,
        loaded_keys: [],
        skipped_existing_keys: []
      };
    }

    throw error;
  }

  const targetEnv = input.env ?? process.env;
  const parsed = parseEnvFileContent(content);
  const loadedKeys: string[] = [];
  const skippedExistingKeys: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (!input.override && targetEnv[key] !== undefined) {
      skippedExistingKeys.push(key);
      continue;
    }

    targetEnv[key] = value;
    loadedKeys.push(key);
  }

  return {
    loaded: true,
    file_path: input.file_path,
    loaded_keys: loadedKeys,
    skipped_existing_keys: skippedExistingKeys
  };
}
