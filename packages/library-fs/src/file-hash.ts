import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export type FileIdentityMode = "stat" | "sha256";

export async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return `sha256:${hash.digest("hex")}`;
}

export async function getFileIdentity(
  filePath: string,
  mode: FileIdentityMode = "stat"
): Promise<string> {
  if (mode === "sha256") {
    return hashFileSha256(filePath);
  }

  const fileStat = await stat(filePath);

  return `stat:size:${fileStat.size}:mtime_ms:${Math.trunc(fileStat.mtimeMs)}`;
}
