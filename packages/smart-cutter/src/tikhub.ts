import { SmartError, type Platform, type VideoStats } from "./types.ts";

type JsonObject = Record<string, unknown>;
export interface ProviderVideo {
  video_id: string; title: string; author: string; published_at: string;
  duration_ms: number; download_url: string; cover_url: string; stats: VideoStats;
}
export interface ProviderAccount { sec_user_id: string; unique_id: string; name: string; followers: number | null }
export interface ProviderPage { videos: ProviderVideo[]; cursor: string; has_more: boolean }
const API = "https://api.tikhub.io";
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown): string => typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
const numeric = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
function firstUrl(value: unknown): string {
  const data = object(value);
  const values = Array.isArray(value) ? value : data.url_list ?? data.UrlList;
  if (!Array.isArray(values)) return "";
  return values.find(url => typeof url === "string" && url.startsWith("https://")) ?? "";
}
function providerError(status: number): SmartError {
  if (status === 401 || status === 403) return new SmartError("provider_unauthorized", "TikHub Key 无效、已失效或没有此接口权限", 401);
  if (status === 402) return new SmartError("provider_balance", "TikHub 余额或调用额度不足", 402);
  if (status === 429) return new SmartError("provider_rate_limit", "TikHub 请求频率受限，请稍后重试", 429);
  return new SmartError("provider_failed", `TikHub 请求失败（${status}），本轮未完成采集`, 502);
}

export function normalizeProviderVideo(value: unknown): ProviderVideo | null {
  const row = object(value), video = object(row.video), author = object(row.author), statistics = object(row.statistics);
  const id = text(row.aweme_id ?? row.id);
  if (!/^\d{5,30}$/.test(id)) return null;
  const created = numeric(row.create_time);
  const play = firstUrl(video.play_addr) || firstUrl(video.play_addr_h264) || firstUrl(video.download_addr);
  return {
    video_id: id, title: text(row.desc ?? row.title), author: text(author.nickname ?? author.unique_id),
    published_at: created === null ? "" : new Date(created * 1000).toISOString(),
    duration_ms: numeric(video.duration) ?? 0,
    download_url: play, cover_url: firstUrl(video.cover) || firstUrl(video.origin_cover),
    stats: { likes: numeric(statistics.digg_count), comments: numeric(statistics.comment_count),
      shares: numeric(statistics.share_count), plays: numeric(statistics.play_count) }
  };
}

export class TikHubClient {
  constructor(private options: {
    getKey: () => string;
    reserveRequest: () => void;
    fetch?: typeof fetch;
  }) {}
  private async request(endpoint: string, query: Record<string, string | number> = {}): Promise<JsonObject> {
    const key = this.options.getKey();
    if (!key) throw new SmartError("tikhub_key_missing", "请在设置中配置 TikHub API Key", 409);
    this.options.reserveRequest();
    const url = new URL(endpoint, API);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(url.toString(), {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(25_000), redirect: "error"
      });
    } catch { throw new SmartError("provider_network", "无法连接 TikHub，请检查网络；没有返回有效采集数据", 503); }
    if (!response.ok) throw providerError(response.status);
    let data: JsonObject;
    try { data = object(await response.json()); } catch { throw new SmartError("provider_payload", "TikHub 返回了无法解析的数据", 502); }
    if (typeof data.code === "number" && data.code !== 200) throw providerError(data.code);
    return data;
  }
  async testConnection(): Promise<{ connected: true }> {
    const payload = await this.request("/api/v1/tikhub/user/get_user_info");
    const user = object(payload.user_data ?? object(payload.data).user_data);
    const key = object(payload.api_key_data);
    if (user.account_disabled === true || user.is_active === false || key.api_key_status === 0) throw providerError(403);
    if (!Object.keys(user).length) throw new SmartError("provider_payload", "接口已响应，但未返回有效的 TikHub 账户信息", 502);
    return { connected: true };
  }
  async resolveAccount(platform: Platform, input: string): Promise<ProviderAccount> {
    let sec = "", unique = "";
    if (/^MS4[A-Za-z0-9_.=-]{8,250}$/.test(input)) sec = input;
    else {
      let url: URL;
      try { url = new URL(input); } catch { throw new SmartError("account_input", "请输入抖音主页链接或 sec_user_id，不能仅填写昵称"); }
      if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)douyin\.com$/i.test(url.hostname)) throw new SmartError("account_url", "请输入抖音主页链接");
      const extracted = decodeURIComponent(url.pathname.match(/\/user\/([^/?]+)/)?.[1] ?? "");
      if (/^MS4[A-Za-z0-9_.=-]{8,250}$/.test(extracted)) sec = extracted;
      else {
        const payload = await this.request("/api/v1/douyin/web/get_sec_user_id", { url: input });
        sec = typeof payload.data === "string" ? payload.data : text(object(payload.data).sec_user_id ?? payload.sec_user_id);
        if (!/^MS4[A-Za-z0-9_.=-]{8,250}$/.test(sec)) throw new SmartError("account_resolution", "无法解析此主页的账号 ID，请填写完整主页链接", 422);
      }
    }
    const payload = await this.request(`/api/v1/${platform}/app/v3/handler_user_profile`,
      { sec_user_id: sec });
    const data = object(payload.data), user = object(data.user ?? data.user_info ?? payload.user ?? data);
    sec = text(user.sec_uid ?? user.sec_user_id) || sec;
    unique = text(user.unique_id) || unique;
    if (!sec && !unique) throw new SmartError("account_resolution", "未找到可监控的账号", 422);
    return { sec_user_id: sec, unique_id: unique, name: text(user.nickname ?? user.unique_id), followers: numeric(user.follower_count) };
  }
  async posts(platform: Platform, account: { sec_user_id: string; unique_id: string }, cursor = "0"): Promise<ProviderPage> {
    const params: Record<string, string | number> = { sec_user_id: account.sec_user_id, max_cursor: cursor, count: 20, sort_type: 0 };
    params.channel = "normal";
    const payload = await this.request(`/api/v1/${platform}/app/v3/fetch_user_post_videos`, params);
    const data = object(payload.data);
    const rows = data.aweme_list;
    if (typeof data.status_code === "number" && data.status_code !== 0) throw new SmartError("account_unavailable", "账号作品暂不可访问，不能把此次采集视为成功", 422);
    if (!Array.isArray(rows)) throw new SmartError("provider_payload", "接口没有返回有效作品列表，不能把此次采集视为成功", 502);
    return { videos: rows.map(normalizeProviderVideo).filter((item): item is ProviderVideo => !!item),
      cursor: text(data.max_cursor) || cursor, has_more: data.has_more === 1 || data.has_more === true };
  }
  async video(platform: Platform, videoId: string): Promise<ProviderVideo> {
    if (!/^\d{5,30}$/.test(videoId)) throw new SmartError("video_id", "作品 ID 无效");
    const payload = await this.request(`/api/v1/${platform}/app/v3/fetch_one_video`, { aweme_id: videoId });
    const data = object(payload.data);
    const video = normalizeProviderVideo(data.aweme_detail ?? data);
    if (!video?.download_url) throw new SmartError("video_unavailable", "没有可下载的视频地址，作品可能不可访问或不是视频", 422);
    return video;
  }
}
