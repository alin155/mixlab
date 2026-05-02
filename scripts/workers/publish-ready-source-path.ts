import type { SourceVideoManifest } from "../../packages/protocol/src/index.ts";
import { resolveSourceVideoFilePath } from "../../packages/library-fs/src/index.ts";

export async function resolveReadyPublishSourceVideoPath(input: {
  library_root: string;
  manifest: SourceVideoManifest;
}): Promise<string> {
  return resolveSourceVideoFilePath(input.library_root, input.manifest);
}
