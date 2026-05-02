import path from "node:path";

function selectPathImplementation(mountRoot: string): typeof path.posix | typeof path.win32 {
  const isWindowsMount =
    /^[a-zA-Z]:[\\/]*$/.test(mountRoot) || mountRoot.startsWith("\\\\");

  return isWindowsMount ? path.win32 : path.posix;
}

export function resolveSourceVideoPath(input: {
  mount_root: string;
  relative_path: string;
}): string {
  const normalizedRelativePath = input.relative_path.replace(/\\/g, "/");

  if (
    normalizedRelativePath.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalizedRelativePath)
  ) {
    throw new Error("relative_path must be a library-relative path");
  }

  const parts = normalizedRelativePath.split("/").filter(Boolean);

  if (parts.includes("..")) {
    throw new Error("relative_path cannot escape source-videos");
  }

  return selectPathImplementation(input.mount_root).join(
    input.mount_root,
    "source-videos",
    ...parts
  );
}

export function resolveIndexPackageFilePath(input: {
  mount_root: string;
  index_version: string;
  file_name: string;
}): string {
  if (!/^v\d{6}$/.test(input.index_version)) {
    throw new Error("index_version must use v000001 format");
  }

  if (
    input.file_name.includes("/") ||
    input.file_name.includes("\\") ||
    input.file_name === "." ||
    input.file_name === ".."
  ) {
    throw new Error("file_name must be a simple file name");
  }

  return selectPathImplementation(input.mount_root).join(
    input.mount_root,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    input.index_version,
    input.file_name
  );
}

export function resolveIndexCurrentPointerPath(input: { mount_root: string }): string {
  return selectPathImplementation(input.mount_root).join(
    input.mount_root,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    "current.json"
  );
}
