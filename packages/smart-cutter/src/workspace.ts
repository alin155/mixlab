import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { getExportClipDetail } from "../../cutter-local/src/index.ts";
import { SmartError, requireText } from "./types.ts";
import type { SmartCore } from "./core.ts";
import { atomicPrivateJson } from "./vault.ts";
import type { CutListItemInput } from "../../../apps/cutter-web/src/api.ts";

export interface BasicProject { id: string; title: string; items: CutListItemInput[]; created_at: string; updated_at: string }
export function saveBasicProject(core: SmartCore, input: Record<string, unknown>, id?: string): BasicProject {
  const previous = id ? core.store.get<BasicProject>("project", id) : null;
  if (id && !previous) throw new SmartError("project_missing", "项目不存在", 404);
  const timestamp = new Date().toISOString();
  const project = previous ?? { id: `P-${randomUUID()}`, title: "未命名检索项目", items: [], created_at: timestamp, updated_at: timestamp };
  if (input.title !== undefined) project.title = requireText(input.title, "项目名称", 120);
  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || input.items.length > 200) throw new SmartError("project_items", "单个清单最多 200 个片段");
    const items = input.items as CutListItemInput[];
    if (items.some(item => !item || typeof item !== "object" || !["source_video_id", "source_title", "source_relative_path", "start_segment_id", "end_segment_id", "selected_text"].every(key => typeof (item as unknown as Record<string, unknown>)[key] === "string" && !!(item as unknown as Record<string, unknown>)[key]) || !Number.isSafeInteger(item.begin_ms) || !Number.isSafeInteger(item.end_ms) || item.begin_ms < 0 || item.end_ms <= item.begin_ms || !["precise", "smart", "copy"].includes(item.cut_mode))) throw new SmartError("project_items", "片段文案、来源或时间范围无效");
    project.items = items;
  }
  project.updated_at = timestamp; return core.store.set("project", project);
}
export async function ownedPath(root: string, relative: string): Promise<string> {
  const resolved = path.resolve(root, relative), delta = path.relative(path.resolve(root), resolved);
  if (!delta || delta.startsWith("..") || path.isAbsolute(delta)) throw new SmartError("path_scope", "只能操作本机工作区内的文件", 403);
  const actualRoot = await realpath(root);
  let current = root;
  for (const part of delta.split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current).catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; });
    if (info?.isSymbolicLink()) throw new SmartError("path_scope", "不操作链接到其他目录的文件", 403);
    if (info) {
      const actual = await realpath(current), distance = path.relative(actualRoot, actual);
      if (distance.startsWith("..") || path.isAbsolute(distance)) throw new SmartError("path_scope", "文件路径超出工作区", 403);
    }
  }
  return resolved;
}
export async function manageLocalClip(core: SmartCore, id: string, title?: unknown): Promise<void> {
  if (!/^E\d{6}$/.test(id)) throw new SmartError("clip_id", "本地素材编号无效");
  if (await core.manual.busy() || core.store.listStatus("assembly", ["queued", "running", "paused", "failed"]).length) throw new SmartError("cut_busy", "请等待剪切队列完成后管理本地素材", 409);
  const root = core.manual.workspace;
  const clip = await getExportClipDetail({ workspace_root: root, export_clip_id: id });
  if (!clip) throw new SmartError("clip_missing", "本地素材不存在", 404);
  if (title !== undefined) {
    const file = await ownedPath(root, path.relative(root, clip.manifest_file_path));
    const manifest = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    manifest.title = requireText(title, "素材名称", 120); await atomicPrivateJson(file, manifest); return;
  }
  // Paths originate in the validated export manifest, never in the caller's request.
  const files = [path.join("export-clips", id), ...(clip.local_asset_relative_path ? [path.dirname(clip.local_asset_relative_path)] : []),
    ...(clip.project_output_file ? [clip.project_output_file] : [])];
  const targets = await Promise.all(files.map(file => ownedPath(root, file)));
  for (const target of targets) await rm(target, { recursive: true, force: true });
}
