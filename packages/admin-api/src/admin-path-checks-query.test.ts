import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  directoryAdminPathAccessStatus,
  fileAdminPathAccessStatus,
  getAdminPathChecks,
  type AdminPathAccessStatus
} from "./admin-path-checks-query.ts";

test("path checks project source folders and core library paths", async () => {
  const accessCalls: Array<{ path: string; mode: number }> = [];
  const fileAccessCalls: Array<{ path: string; mode: number }> = [];
  const accessByPath = new Map<string, AdminPathAccessStatus>([
    ["/library", "ok"],
    ["/source/main", "ok"],
    ["/source/archive", "missing"],
    ["/library/.mixlab-library", "missing"],
    ["/library/.mixlab-library/library.json", "missing"]
  ]);

  const checks = await getAdminPathChecks({
    library_root: "/library",
    source_folders: [
      {
        name: "主素材",
        path: "/source/main",
        enabled: true
      },
      {
        name: "归档素材",
        path: "/source/archive",
        enabled: false
      }
    ],
    mixlab_library_path(libraryRoot) {
      return `${libraryRoot}/.mixlab-library`;
    },
    library_manifest_path(libraryRoot) {
      return `${libraryRoot}/.mixlab-library/library.json`;
    },
    async directory_access_status(filePath, mode) {
      accessCalls.push({ path: filePath, mode });
      return accessByPath.get(filePath) ?? "denied";
    },
    async file_access_status(filePath, mode) {
      fileAccessCalls.push({ path: filePath, mode });
      return accessByPath.get(filePath) ?? "denied";
    }
  });

  assert.deepEqual(checks, [
    {
      label: "公共素材库",
      path: "/library",
      status: "pass",
      message: "根路径可读写"
    },
    {
      label: "素材来源：主素材",
      path: "/source/main",
      status: "pass",
      message: "素材来源可读"
    },
    {
      label: "素材来源：归档素材",
      path: "/source/archive",
      status: "warn",
      message: "素材来源已停用"
    },
    {
      label: ".mixlab-library",
      path: "/library/.mixlab-library",
      status: "warn",
      message: "尚未初始化协议目录"
    },
    {
      label: "library.json",
      path: "/library/.mixlab-library/library.json",
      status: "warn",
      message: "library.json 尚未创建"
    }
  ]);
  assert.equal(accessCalls.some((call) => call.path === "/source/main"), true);
  assert.equal(fileAccessCalls.length, 1);
});

test("path checks mark denied enabled paths as failures", async () => {
  const checks = await getAdminPathChecks({
    library_root: "/library",
    source_folders: [
      {
        name: "权限不足素材",
        path: "/source/denied",
        enabled: true
      }
    ],
    mixlab_library_path(libraryRoot) {
      return `${libraryRoot}/.mixlab-library`;
    },
    library_manifest_path(libraryRoot) {
      return `${libraryRoot}/.mixlab-library/library.json`;
    },
    async directory_access_status(filePath) {
      if (filePath === "/library/.mixlab-library") {
        return "denied";
      }

      return filePath === "/library" ? "missing" : "denied";
    },
    async file_access_status() {
      return "denied";
    }
  });

  assert.deepEqual(checks.map((check) => ({
    label: check.label,
    status: check.status,
    message: check.message
  })), [
    {
      label: "公共素材库",
      status: "fail",
      message: "根路径不存在"
    },
    {
      label: "素材来源：权限不足素材",
      status: "fail",
      message: "素材来源权限不足"
    },
    {
      label: ".mixlab-library",
      status: "fail",
      message: "协议目录权限不足"
    },
    {
      label: "library.json",
      status: "fail",
      message: "library.json 权限不足"
    }
  ]);
});

test("path access helpers classify existing and missing filesystem paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mixlab-admin-path-checks-"));
  const nested = path.join(root, "nested");
  const filePath = path.join(root, "library.json");
  await mkdir(nested);
  await writeFile(filePath, "{}");

  assert.equal(await directoryAdminPathAccessStatus(nested, 0), "ok");
  assert.equal(await fileAdminPathAccessStatus(filePath, 0), "ok");
  assert.equal(await directoryAdminPathAccessStatus(filePath, 0), "missing");
  assert.equal(await fileAdminPathAccessStatus(nested, 0), "missing");
  assert.equal(await directoryAdminPathAccessStatus(path.join(root, "missing"), 0), "missing");
  assert.equal(await fileAdminPathAccessStatus(path.join(root, "missing.json"), 0), "missing");
});
