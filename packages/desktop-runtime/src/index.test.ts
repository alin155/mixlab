import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCutterApiEnv,
  defaultWindowsWorkspaceRoot,
  isSubPath,
  isWindowsUncPath,
  normalizeDesktopPathForStorage,
  redactDesktopDiagnostics,
  validateLocalWorkspaceCandidate,
  validatePublicLibraryCandidate,
  type DesktopRuntimeFsLike
} from "./index.ts";

function fakeFs(input: {
  directories?: string[];
  files?: string[];
  writable?: string[];
  readyMaterialCount?: number;
}): DesktopRuntimeFsLike {
  const directories = new Set((input.directories ?? []).map(normalizeDesktopPathForStorage));
  const files = new Set((input.files ?? []).map(normalizeDesktopPathForStorage));
  const writable = new Set((input.writable ?? []).map(normalizeDesktopPathForStorage));

  return {
    async stat(pathValue) {
      const normalized = normalizeDesktopPathForStorage(pathValue);
      if (directories.has(normalized)) {
        return { kind: "directory" };
      }
      if (files.has(normalized)) {
        return { kind: "file" };
      }
      throw new Error(`missing ${pathValue}`);
    },
    async canWrite(pathValue) {
      return writable.has(normalizeDesktopPathForStorage(pathValue));
    },
    async countReadyMaterials() {
      return input.readyMaterialCount ?? 0;
    }
  };
}

test("normalizes Windows drive, Chinese, spaced, deep, and UNC paths without mapping UNC", () => {
  const paths = [
    String.raw`D:\MixLabPublicLibrary`,
    String.raw`D:\MixLab Public Library`,
    String.raw`D:\素材库\MixLab公共素材库`,
    String.raw`D:\Team\Project\MixLabPublicLibrary`,
    String.raw`E:\MixLabPublicLibrary`,
    String.raw`\\NAS\MixLab\PublicLibrary`,
    String.raw`\\NAS\MixLab Public Library`,
    String.raw`\\NAS\素材库\MixLab公共素材库`
  ];

  for (const pathValue of paths) {
    assert.equal(normalizeDesktopPathForStorage(pathValue), pathValue);
  }

  assert.equal(isWindowsUncPath(String.raw`\\NAS\MixLab\PublicLibrary`), true);
  assert.equal(isWindowsUncPath(String.raw`D:\MixLabPublicLibrary`), false);
});

test("default Windows workspace uses the user's Videos directory", () => {
  assert.equal(
    defaultWindowsWorkspaceRoot({ USERPROFILE: String.raw`C:\Users\Allen` }),
    String.raw`C:\Users\Allen\Videos\MixLabLocal`
  );
  assert.equal(
    defaultWindowsWorkspaceRoot({ HOMEDRIVE: "D:", HOMEPATH: String.raw`\Users\Allen` }),
    String.raw`D:\Users\Allen\Videos\MixLabLocal`
  );
});

test("detects child paths across drive and UNC roots without case sensitivity", () => {
  assert.equal(isSubPath(String.raw`D:\MixLabPublicLibrary\child`, String.raw`D:\MixLabPublicLibrary`), true);
  assert.equal(isSubPath(String.raw`d:\mixlabpubliclibrary\child`, String.raw`D:\MixLabPublicLibrary`), true);
  assert.equal(isSubPath(String.raw`D:\MixLabPublicLibrary2`, String.raw`D:\MixLabPublicLibrary`), false);
  assert.equal(isSubPath(String.raw`\\NAS\MixLab\PublicLibrary\A`, String.raw`\\NAS\MixLab\PublicLibrary`), true);
  assert.equal(isSubPath(String.raw`\\NAS\MixLabOther\PublicLibrary`, String.raw`\\NAS\MixLab\PublicLibrary`), false);
});

test("validates public library candidates with required cutter-readable artifacts", async () => {
  const root = String.raw`\\NAS\MixLab\PublicLibrary`;
  const result = await validatePublicLibraryCandidate(root, fakeFs({
    directories: [
      root,
      String.raw`\\NAS\MixLab\PublicLibrary\source-videos`,
      String.raw`\\NAS\MixLab\PublicLibrary\.mixlab-library`
    ],
    files: [
      String.raw`\\NAS\MixLab\PublicLibrary\.mixlab-library\indexes\source-transcript-index\current.json`
    ],
    readyMaterialCount: 3
  }));

  assert.equal(result.status, "pass");
  assert.equal(result.checks.every((check) => check.status === "pass"), true);
});

test("reports public library failures without attempting writes", async () => {
  const root = String.raw`D:\MixLabPublicLibrary`;
  const result = await validatePublicLibraryCandidate(root, fakeFs({
    directories: [root, String.raw`D:\MixLabPublicLibrary\.mixlab-library`],
    files: [],
    readyMaterialCount: 0
  }));

  assert.equal(result.status, "fail");
  assert.deepEqual(
    result.checks.filter((check) => check.status === "fail").map((check) => check.id),
    ["source_videos", "current_index", "ready_materials"]
  );
});

test("validates local workspace writability and rejects workspace inside public library", async () => {
  const publicRoot = String.raw`D:\MixLabPublicLibrary`;
  const workspace = String.raw`C:\Users\Allen\Videos\MixLabLocal`;
  const valid = await validateLocalWorkspaceCandidate({
    workspace_root: workspace,
    public_library_root: publicRoot,
    fs: fakeFs({ directories: [workspace], writable: [workspace] })
  });

  assert.equal(valid.status, "pass");

  const invalid = await validateLocalWorkspaceCandidate({
    workspace_root: String.raw`D:\MixLabPublicLibrary\local`,
    public_library_root: publicRoot,
    fs: fakeFs({
      directories: [String.raw`D:\MixLabPublicLibrary\local`],
      writable: [String.raw`D:\MixLabPublicLibrary\local`]
    })
  });

  assert.equal(invalid.status, "fail");
  assert.equal(invalid.checks.find((check) => check.id === "outside_public_library")?.status, "fail");
});

test("builds cutter API environment from desktop config", () => {
  assert.deepEqual(
    buildCutterApiEnv({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`D:\MixLabPublicLibrary`,
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
      log_root: String.raw`C:\Users\Allen\AppData\Roaming\MixLab Cutter\logs`,
      ffmpeg_path: String.raw`C:\Program Files\MixLab Cutter\bin\ffmpeg.exe`,
      ffprobe_path: String.raw`C:\Program Files\MixLab Cutter\bin\ffprobe.exe`
    }),
    {
      MIXLAB_CUTTER_API_HOST: "127.0.0.1",
      MIXLAB_CUTTER_API_PORT: "3789",
      MIXLAB_CUTTER_LIBRARY_ROOT: String.raw`D:\MixLabPublicLibrary`,
      MIXLAB_CUTTER_WORKSPACE_ROOT: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
      MIXLAB_DESKTOP_LOG_DIR: String.raw`C:\Users\Allen\AppData\Roaming\MixLab Cutter\logs`,
      MIXLAB_FFMPEG_PATH: String.raw`C:\Program Files\MixLab Cutter\bin\ffmpeg.exe`,
      MIXLAB_FFPROBE_PATH: String.raw`C:\Program Files\MixLab Cutter\bin\ffprobe.exe`
    }
  );
});

test("redacts diagnostics while preserving operational fields", () => {
  const diagnostics = redactDesktopDiagnostics({
    app_version: "0.18.1",
    windows_version: "Windows 11",
    api_address: "http://127.0.0.1:3789",
    public_library_root: String.raw`D:\MixLabPublicLibrary`,
    local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
    latest_error_summary: "ASR token abc123 failed at signed URL https://example.test/a.mp4?Expires=123&Signature=secret",
    transcript_excerpt: "这是一段用户粘贴的完整文案，不应该进入诊断复制内容。",
    env: {
      DASHSCOPE_API_KEY: "sk-secret",
      MIXLAB_CUTTER_LIBRARY_ROOT: String.raw`D:\MixLabPublicLibrary`
    }
  });

  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("sk-secret"), false);
  assert.equal(serialized.includes("Signature=secret"), false);
  assert.equal(serialized.includes("用户粘贴的完整文案"), false);
  assert.equal(diagnostics.api_address, "http://127.0.0.1:3789");
  assert.equal(diagnostics.public_library_root, String.raw`D:\MixLabPublicLibrary`);
});
