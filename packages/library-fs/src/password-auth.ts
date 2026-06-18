import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_HASH_KEY_LENGTH = 32;
const PASSWORD_HASH_DIGEST = "sha256";

export function assertPasswordPolicy(password: string): void {
  if (password.length < 8) {
    throw new Error("密码至少需要 8 位");
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("密码需要同时包含字母和数字");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);

  const salt = randomBytes(16);
  const derived = await pbkdf2Async(
    password,
    salt,
    PASSWORD_HASH_ITERATIONS,
    PASSWORD_HASH_KEY_LENGTH,
    PASSWORD_HASH_DIGEST
  );

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = passwordHash.split("$");
  if (parts.length !== 4) {
    return false;
  }

  const [algorithm, iterationsText, saltText, hashText] = parts;
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsText || !saltText || !hashText) {
    return false;
  }

  const iterations = Number.parseInt(iterationsText, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltText, "base64");
    expected = Buffer.from(hashText, "base64");
  } catch {
    return false;
  }

  if (expected.length === 0) {
    return false;
  }

  const actual = await pbkdf2Async(
    password,
    salt,
    iterations,
    expected.length,
    PASSWORD_HASH_DIGEST
  );

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
