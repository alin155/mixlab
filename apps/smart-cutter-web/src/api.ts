import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { SmartCore } from "../../../packages/smart-cutter/src/core.ts";
import type { Work, Job, OutputSettings, Account, HotVideo, Rule, WorkOrigin, Candidate } from "../../../packages/smart-cutter/src/types.ts";

export type AppState = Awaited<ReturnType<SmartCore["state"]>>;
export type WorkSummary = AppState["works"][number];
export type JobSummary = AppState["jobs"][number];
export type { Work, Job, OutputSettings, Account, HotVideo, Rule, WorkOrigin, Candidate };
export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }
interface Connection { api_base: string; token: string }
let connection: Connection = { api_base: "", token: "" };
let connecting: Promise<Connection> | null = null;
export async function connect(): Promise<Connection> {
  if (!connecting) connecting = isTauri() ? invoke<Connection>("runtime_connection").then(value => { connection = value; return value; }) : Promise.resolve(connection);
  return connecting;
}
export async function request<T>(route: string, method = "GET", payload?: unknown): Promise<T> {
  await connect();
  let response: Response;
  try {
    response = await fetch(`${connection.api_base}${route}`, { method,
      headers: { ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...(connection.token ? { "X-Smart-Token": connection.token } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(90_000) });
  } catch { throw new ApiError("engine_offline", "无法连接本机智能引擎，请检查应用运行状态", 503); }
  const value = await response.json() as T & { error?: { code: string; message: string } };
  if (!response.ok) throw new ApiError(value.error?.code ?? "request_failed", value.error?.message ?? "操作未完成", response.status);
  return value;
}
export function mediaUrl(route: string, candidate?: string): string {
  const params = new URLSearchParams();
  if (connection.token) params.set("access", connection.token);
  if (candidate) params.set("candidate", candidate);
  return `${connection.api_base}${route}${params.size ? `?${params}` : ""}`;
}
export function sourceUrl(workId: string, segmentId: number, type: "media" | "cover", candidate?: string): string {
  return mediaUrl(`/smart/media/works/${encodeURIComponent(workId)}/${segmentId}/${type}`, candidate);
}
export async function pickDirectory(title: string, current: string): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await open({ title, directory: true, multiple: false, ...(current ? { defaultPath: current } : {}) });
  return typeof result === "string" ? result : null;
}
export function modeName(origin: WorkOrigin): string { return origin.trigger === "automatic" ? "自动创作" : "手动创作"; }
export function originName(origin: WorkOrigin): string { return origin.kind === "rule" ? "自动规则" : origin.kind === "hot_manual" ? "热点手动" : "手动文案"; }
export function duration(value: number): string { const seconds = Math.max(0, Math.round(value / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
export function dateText(value: string): string { return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "尚未检查"; }
export const JOB_NAMES = { queued: "等待本机", running: "本机处理中", paused: "已暂停", cancelled: "已取消", failed: "需处理", needs_review: "需确认构图", done: "已完成" };
export const WORK_NAMES = { draft: "文案草稿", matching: "正在匹配", review: "待审核", ready: "可导出", rendering: "本机处理中", done: "已完成", failed: "需处理" };
