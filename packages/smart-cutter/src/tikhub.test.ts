import assert from "node:assert/strict";
import test from "node:test";
import { TikHubClient, normalizeProviderVideo } from "./tikhub.ts";

test("Douyin requests use documented APP V3 parameters and header-only credentials", async () => {
  const calls: Array<{ url: string; options: RequestInit | undefined }> = []; let reserved = 0;
  const client = new TikHubClient({ getKey: () => "fixture-tikhub-key", reserveRequest: () => reserved++, fetch: async (input, options) => {
    const url = String(input); calls.push({ url, options });
    return new Response(JSON.stringify(url.includes("handler_user_profile") ? { code: 200, data: { user: { sec_uid: "MS4fixture123456789", nickname: "测试账号", follower_count: 20 } } } :
      { code: 200, data: { aweme_list: [{ aweme_id: "123456789123", desc: "只是标题", create_time: 1700000000, video: { duration: 3000, play_addr: { url_list: ["https://cdn.example/video.mp4"] } }, statistics: { digg_count: 100 } }], max_cursor: 1234, has_more: 1 } }), { status: 200 });
  } });
  const account = await client.resolveAccount("douyin", "https://www.douyin.com/user/MS4fixture123456789");
  const page = await client.posts("douyin", account, "55");
  assert.equal(page.cursor, "1234"); assert.equal(page.has_more, true); assert.equal(page.videos[0]?.stats.plays, null);
  assert.equal(page.videos[0]?.title, "只是标题");
  assert.ok(calls[1]!.url.includes("/douyin/app/v3/fetch_user_post_videos"));
  const query = new URL(calls[1]!.url).searchParams;
  assert.equal(query.get("max_cursor"), "55"); assert.equal(query.get("count"), "20"); assert.equal(query.get("channel"), "normal");
  assert.equal(new Headers(calls[0]!.options?.headers).get("Authorization"), "Bearer fixture-tikhub-key");
  assert.ok(calls.every(call => !call.url.includes("fixture-tikhub-key"))); assert.equal(reserved, 2);
});
test("missing and unauthorized credentials or invalid successful payloads do not become fake success", async () => {
  let count = 0;
  const absent = new TikHubClient({ getKey: () => "", reserveRequest: () => count++ });
  await assert.rejects(absent.posts("douyin", { sec_user_id: "MS4fixture123456789", unique_id: "" }), /设置/); assert.equal(count, 0);
  const denied = new TikHubClient({ getKey: () => "never-return-this-key", reserveRequest: () => count++, fetch: async () => new Response("secret upstream body", { status: 401 }) });
  await assert.rejects(denied.posts("douyin", { sec_user_id: "MS4fixture123456789", unique_id: "" }), error => !String(error).includes("never-return-this-key") && /Key 无效/.test(String(error)));
  const malformed = new TikHubClient({ getKey: () => "fixture", reserveRequest: () => count++, fetch: async () => Response.json({ code: 200, data: null }) });
  await assert.rejects(malformed.posts("douyin", { sec_user_id: "MS4fixture123456789", unique_id: "" }), /有效作品列表/);
  assert.equal(normalizeProviderVideo({ id: "not-a-video-id" }), null);
});
test('video details accept official single and array forms without silently downloading a different video', async () => {
  let data: unknown = { aweme_details: [{ aweme_id: '72300000001', duration: 4000, video: { bit_rate: [{ play_addr: { url_list: ['https://cdn.example/video.mp4'] } }] } }] };
  const client = new TikHubClient({ getKey: () => 'fixture-only', reserveRequest: () => {}, fetch: async () => Response.json({ code: 200, data }) });
  const result = await client.video('douyin', '72300000001'); assert.equal(result.duration_ms, 4000); assert.equal(result.download_url, 'https://cdn.example/video.mp4');
  data = { aweme_detail: { aweme_id: '72300000002', video: { play_addr: { url_list: ['https://cdn.example/other.mp4'] } } } };
  await assert.rejects(client.video('douyin', '72300000001'), /其他作品/);
  data = {};
  await assert.rejects(client.resolveAccount('douyin', 'MS4fixture123456789'), /有效账号信息/);
});
