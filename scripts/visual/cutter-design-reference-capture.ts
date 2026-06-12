import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const designDir = "/Users/huaqihang/Desktop/Mixlab";
const artifactDir = resolve(root, "captures/cutter-design-reference");
const port = 4377;
const baseUrl = `http://127.0.0.1:${port}`;
const fixtureMediaUrl = (fileName: string) => `${baseUrl}/fixture-media/${fileName}`;
const viewport = { width: 1672, height: 941 };
const designCounts = {
  publicCount: 3632,
  publicLibraryPageCount: 3638,
  localCount: 110
} as const;
const mb = (value: number) => Math.round(value * 1024 * 1024);
const gb = (value: number) => Math.round(value * 1024 * 1024 * 1024);
const designPublicVideos = [
  ["V-PUBLIC-001", "1.房产置换与资产优化", "08:37", 517_000, 635.7, "MB", "design-public-card-1.png"],
  ["V-PUBLIC-002", "2.比特币暴涨与投资多元化", "09:24", 564_000, 694.3, "MB", "design-public-card-2.png"],
  ["V-PUBLIC-003", "3.理财避险核心资产+核心能力", "07:37", 457_000, 562.7, "MB", "design-public-card-3.png"],
  ["V-PUBLIC-004", "4.财富管理的精髓", "10:46", 646_000, 795.5, "MB", "design-public-card-4.png"],
  ["V-PUBLIC-005", "5.全球风云变幻，把握投资时机", "07:03", 423_000, 520.9, "MB", "design-public-card-5.png"],
  ["V-PUBLIC-006", "6.货币洪流下的资产配置", "12:33", 753_000, 926.9, "MB", "design-public-card-6.png"],
  ["V-PUBLIC-007", "C0144", "29:50", 1_790_000, 10.7, "GB", "design-public-card-7.png"],
  ["V-PUBLIC-008", "C0145", "11:41", 701_000, 4.2, "GB", "design-public-card-8.png"],
  ["V-PUBLIC-009", "C0146", "29:30", 1_770_000, 10.6, "GB", "design-public-card-9.png"]
].map(([sourceVideoId, title, _durationLabel, durationMs, fileSizeValue, fileSizeUnit, coverFile], index) => ({
  source_video_id: String(sourceVideoId),
  title: String(title),
  duration_label: String(_durationLabel),
  duration_ms: Number(durationMs),
  width: 1920,
  height: 1080,
  fps: 25,
  codec: "h264",
  file_size: fileSizeUnit === "GB" ? gb(Number(fileSizeValue)) : mb(Number(fileSizeValue)),
  relative_path: `王牧笛/2月教培视频课365（暂不能剪）/教音12月365视频课/${String(title)}.mp4`,
  description: undefined,
  tags: [],
  category: "教培视频课",
  course: "财富的门道",
  lecturer: "王牧笛",
  publish_status: "ready" as const,
  media_url: `/fixture-media/public-design-${index + 1}.mp4`,
  cover_url: fixtureMediaUrl(String(coverFile)),
  detail_url: `/cutter/source-videos/${String(sourceVideoId)}`,
  subtitles_url: `/fixture-subtitles/${String(sourceVideoId)}.vtt`
}));
const designPublicLibraryVideos = [
  ...designPublicVideos,
  ...Array.from({ length: 11 }, (_, index) => {
    const source = designPublicVideos[index % designPublicVideos.length]!;
    const extraIndex = index + 10;
    return {
      ...source,
      source_video_id: `V-PUBLIC-${String(extraIndex).padStart(3, "0")}`,
      title: `C${String(146 + extraIndex).padStart(4, "0")}`,
      detail_url: `/cutter/source-videos/V-PUBLIC-${String(extraIndex).padStart(3, "0")}`
    };
  })
];
const designProjects = [
  {
    project_id: "design-project-20260604-2",
    title: "6月4日-2",
    title_source: "manual",
    status: "active",
    created_at: "2026-06-04T23:50:00",
    updated_at: "2026-06-05T03:00:00",
    clip_count: 2,
    running_count: 0,
    failed_count: 0,
    cover_url: "/fixture-media/design-home-card-ref-1.png",
    detail_cover_url: "/fixture-media/design-home-cover-blue.png",
    source_title: "王牧笛",
    searches: [
      { query: "第一站公开课", hit_count: 10, searched_at: "2026-06-05T03:00:00.000Z" }
    ]
  },
  {
    project_id: "design-project-20260604",
    title: "6月4日",
    title_source: "manual",
    status: "active",
    created_at: "2026-06-04T20:40:00",
    updated_at: "2026-06-04T22:00:00",
    clip_count: 1,
    running_count: 0,
    failed_count: 0,
    cover_url: "/fixture-media/design-home-card-ref-2.png",
    source_title: "王牧笛",
    searches: [
      { query: "公开课", hit_count: 8, searched_at: "2026-06-04T22:00:00.000Z" }
    ]
  },
  {
    project_id: "design-project-20260603",
    title: "6月3日-会议",
    title_source: "manual",
    status: "active",
    created_at: "2026-06-03T21:00:00",
    updated_at: "2026-06-04T21:20:00",
    clip_count: 10,
    running_count: 0,
    failed_count: 0,
    cover_url: "/fixture-media/design-home-card-ref-3.png",
    searches: [
      { query: "会议", hit_count: 6, searched_at: "2026-06-03T21:20:00.000Z" }
    ]
  },
  {
    project_id: "design-project-20260604-1",
    title: "6月4日-1",
    title_source: "manual",
    status: "active",
    created_at: "2026-06-04T13:20:00",
    updated_at: "2026-06-04T18:00:00",
    clip_count: 1,
    running_count: 0,
    failed_count: 0,
    cover_url: "/fixture-media/design-home-card-ref-4.png",
    source_title: "王牧笛",
    searches: [
      { query: "关键词", hit_count: 4, searched_at: "2026-06-04T18:00:00.000Z" }
    ]
  }
] as const;
const designCutJobs = [
  {
    schema_version: "1.0",
    cut_job_id: "CJ-DESIGN-0002",
    clip_list_id: "CL-DESIGN-0002",
    clip_list_item_id: "CLI-DESIGN-0002",
    library_id: "lib_main_001",
    project_id: "design-project-20260604-2",
    source_video_id: "V000815",
    title: "2-6月4日-2-C0510",
    project_title: "6月4日-2",
    project_clip_order: 2,
    source_title: "C0510",
    start_segment_id: "V000815-S000001",
    end_segment_id: "V000815-S000024",
    begin_ms: 141000,
    end_ms: 708000,
    selected_text: "呢我跟陶老师是合伙人的，我是跟陶老师都是黑龙江人，我是...",
    cut_mode: "copy",
    status: "done",
    created_at: "2026-06-04T23:58:00",
    updated_at: "2026-06-05T00:02:00",
    finished_at: "2026-06-05T00:02:00",
    output_file: "export-clips/E000110/002-6月4日--C0510.mp4"
  },
  {
    schema_version: "1.0",
    cut_job_id: "CJ-DESIGN-0001",
    clip_list_id: "CL-DESIGN-0001",
    clip_list_item_id: "CLI-DESIGN-0001",
    library_id: "lib_main_001",
    project_id: "design-project-20260604-2",
    source_video_id: "V000815",
    title: "1-6月4日-2-C0510",
    project_title: "6月4日-2",
    project_clip_order: 1,
    source_title: "C0510",
    start_segment_id: "V000815-S000001",
    end_segment_id: "V000815-S000004",
    begin_ms: 51000,
    end_ms: 106000,
    selected_text: "抓总统呢。这个世界真是够疯狂的，一个主权国家可以到另一...",
    cut_mode: "copy",
    status: "done",
    created_at: "2026-06-04T23:50:00",
    updated_at: "2026-06-04T23:55:00",
    finished_at: "2026-06-04T23:55:00",
    output_file: "export-clips/E000109/001-6月4日--C0510.mp4"
  }
] as const;
const designLocalClips = [
  {
    local_clip_id: "E000109",
    project_id: "design-project-20260604-2",
    title: "1-6月4日-2-C0510",
    source_video_id: "V000815",
    source_title: "C0510",
    begin_ms: 51_000,
    end_ms: 106_000,
    duration_ms: 54_000,
    width: 1920,
    height: 1080,
    codec: "h264",
    file_size: 103_200_000,
    selected_text: "抓总统呢。这个世界真是够疯狂的，一个主权国家可以到另一个主权国家的总统的卧室里，把他跟老婆给抓走了。",
    cover_url: fixtureMediaUrl("design-home-cover-blue.png"),
    media_url: "/local-clips/E000109.mp4",
    detail_url: "/cutter/local-clips/E000109"
  },
  {
    local_clip_id: "E000110",
    project_id: "design-project-20260604-2",
    title: "2-6月4日-2-C0510",
    source_video_id: "V000815",
    source_title: "C0510",
    begin_ms: 141_000,
    end_ms: 708_000,
    duration_ms: 567_000,
    width: 1920,
    height: 1080,
    codec: "h264",
    file_size: 1_000_000_000,
    selected_text: "呃我跟陶老师是合伙人哈，我是跟陶老师都是黑龙江人，我是黑龙江2001年的高考状元。",
    cover_url: fixtureMediaUrl("design-home-card-blue-clean.png"),
    media_url: "/local-clips/E000110.mp4",
    detail_url: "/cutter/local-clips/E000110"
  }
] as const;

const designTranscriptSegments = [
  ["V000816-S000001", 0, 6_000, "谢谢刘青梅，各位马年好，这是我们马年的第一站公开课。"],
  ["V000816-S000002", 6_000, 13_000, "跟陶老师我们一起走过了山山水水，走过了很多的春秋。"],
  ["V000816-S000003", 13_000, 19_000, "马年奔腾的一年，第一场公开课来到了上海，上海好不好？"],
  ["V000816-S000004", 19_000, 23_000, "上海的中国经济排第几啊？"],
  ["V000816-S000005", 23_000, 33_000, "第二是点，第三呢第一上海，第二北京，这两个都是过5万亿了。"],
  ["V000816-S000006", 33_000, 34_000, "第三是谁？"],
  ["V000816-S000007", 34_000, 37_000, "深圳，第四是谁？"],
  ["V000816-S000008", 37_000, 40_000, "你们活在每个年代吗？"],
  ["V000816-S000009", 40_000, 70_000, "第四是重庆，第五呢我跟陶老师所在的广州，第六苏州，第七哪七座城市，第八第八是杭州，第九是武汉，第十是南京，第十一是宁波，第十二是天津，第十三是青岛第十三是无锡，第十四第十四是哪里？"],
  ["V000816-S000010", 70_000, 71_000, "嗯，猜猜吗？"],
  ["V000816-S000011", 71_000, 72_000, "青岛青岛，然后呢三十五是长沙，接下来是郑州、福州、济南、合肥。"],
  ["V000816-S000012", 84_000, 91_000, "第二十是西安。"],
  ["V000816-S000013", 91_000, 92_000, "我在干嘛呢？"],
  ["V000816-S000014", 92_000, 105_000, "我在给你们讲，如果你们的城市在这20个还行，如果我我念了20个名额都没有你的城市知道干嘛吗？"],
  ["V000816-S000015", 105_000, 108_000, "别听课了，回去卖房去吧。"],
  ["V000816-S000016", 108_000, 117_000, "你的核心资产，你的主要的财富，连接刚才从第一期到第二十的城市都没排到。"],
  ["V000816-S000017", 117_000, 124_000, "可能要打心自问一下，自己这些年选择投放财富的地方是不是不靠谱了？"],
  ["V000816-S000018", 124_000, 131_000, "那另一句话是，如果中国A股都到了4100点，你还没赚到钱。"],
  ["V000816-S000019", 131_000, 146_000, "那就是人民大学的副校长吴晓求大概一个月前说的话。4100点的A股你都没赚到钱，是不是要反思一下自己是否具备驾驭投资的能力啊，这两件事打开场送给你们，欢迎大家来到商学院哈，我是穆迪。"]
].map(([segmentId, beginMs, endMs, text]) => ({
  segment_id: String(segmentId),
  begin_ms: Number(beginMs),
  end_ms: Number(endMs),
  text: String(text)
}));

const designSourceVideoDetail = {
  source_video_id: "V000816",
  title: "C0629",
  duration_ms: 1_879_000,
  width: 1920,
  height: 1080,
  fps: 25,
  codec: "h264",
  file_size: 4_862_000_000,
  relative_path: "6月4日-2/C0629.mp4",
  description: "设计验收固定素材",
  tags: ["公开课"],
  category: "公开课",
  course: "项目化素材剪切",
  lecturer: "王牧笛",
  publish_status: "ready",
  media_url: "/fixture-media/cashflow.mp4",
  cover_url: "/fixture-media/design-home-card-ref-1.png",
  detail_url: "/cutter/source-videos/V000816",
  subtitles_url: "/fixture-subtitles/V000815.vtt",
  transcript: {
    full_text: designTranscriptSegments.map((segment) => segment.text).join(""),
    segments: designTranscriptSegments
  },
  keyframes: {
    keyframes_ms: designTranscriptSegments.map((segment) => segment.begin_ms)
  }
} as const;

const designMaterialCandidates = [
  ["V000816", "C0629", 8_232, 1_879_000, 2, "design-material-candidate-1.png"],
  ["V000817", "C0482", 8_757, 1_832_000, 3, "design-material-candidate-2.png"],
  ["V000818", "040A1022", 8_351, 1_823_000, 1, "design-material-candidate-3.png"],
  ["V000819", "040A1016", 9_839, 2_061_000, 3, "design-material-candidate-4.png"],
  ["V000820", "C0593", 9_092, 2_078_000, 1, "design-material-candidate-5.png"]
] as const;

const designMaterialSearchResponse = {
  query: "第一站公开课",
  normalized_query: "第一站公开课",
  returned_count: designMaterialCandidates.length,
  limit: 40,
  index_version: "v003683",
  search_ms: 12,
  search_mode: "searchd",
  groups: designMaterialCandidates.map(([sourceVideoId, title, characterCount, durationMs, hitCount, coverUrl], index) => ({
    source_video_id: sourceVideoId,
    title,
    duration_ms: durationMs,
    hit_count: hitCount,
    transcript_character_count: characterCount,
    best_excerpt: "谢谢刘青梅，各位马年好，这是我们马年的第一站公开课。",
    media_url: "/fixture-media/cashflow.mp4",
    cover_url: fixtureMediaUrl(coverUrl),
    detail_url: `/cutter/source-videos/${sourceVideoId}`,
    subtitles_url: `/fixture-subtitles/${sourceVideoId}.vtt`,
    hit_segments: [
      {
        ...designTranscriptSegments[Math.min(index + 1, designTranscriptSegments.length - 1)]!,
        segment_id: `${sourceVideoId}-H000001`,
        match_ranges: [[13, 18]]
      }
    ]
  }))
} as const;

const pages = [
  { route: "project-home", hash: "#/project-home", design: "1.png", actual: "01-project-home.actual.png" },
  {
    route: "material-locator",
    hash: "#/material-locator?query=%E7%AC%AC%E4%B8%80%E7%AB%99%E5%85%AC%E5%BC%80%E8%AF%BE",
    design: "2.png",
    actual: "02-material-locator.actual.png"
  },
  { route: "cut-tasks", hash: "#/cut-tasks", design: "3.png", actual: "03-cut-tasks.actual.png" },
  { route: "local-library", hash: "#/local-library", design: "4.png", actual: "04-local-library.actual.png" },
  { route: "public-library", hash: "#/public-library", design: "5.png", actual: "05-public-library.actual.png" },
  { route: "settings", hash: "#/settings", design: "6.png", actual: "06-settings.actual.png" }
] as const;

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(payload)
  });
}

function designRuntimePublicCount(route: (typeof pages)[number]["route"]): number {
  if (route === "public-library" || route === "settings" || route === "cut-tasks" || route === "local-library") {
    return designCounts.publicLibraryPageCount;
  }

  if (route === "material-locator") {
    return 3683;
  }

  return designCounts.publicCount;
}

async function installDesignApiOverrides(page: Page, pageRoute: (typeof pages)[number]["route"]): Promise<void> {
  const runtimePublicCount = designRuntimePublicCount(pageRoute);

  await page.route("**/cutter/runtime-status", async (route) => {
    try {
      const response = await route.fetch();
      const envelope = await response.json();
      await fulfillJson(route, {
        ...envelope,
        data: {
          ...envelope.data,
          available_video_count: runtimePublicCount,
          local_clip_count: designCounts.localCount,
          search_backend: envelope.data?.search_backend
            ? {
                ...envelope.data.search_backend,
                source_video_count: runtimePublicCount,
                index_version: `v${String(runtimePublicCount).padStart(6, "0")}`
              }
            : envelope.data?.search_backend
        }
      });
    } catch {
      await fulfillJson(route, {
        schema_version: "1.0",
        data: {
          mode: "api",
          mode_label: "视觉验收 Cutter API 模式",
          api_ready: true,
          generated_at: "2026-06-05T00:00:00.000Z",
          library_id: "lib_main_001",
          library_root_label: "PublicLibrary",
          library_root_path: "/Volumes/MixLab/PublicLibrary",
          available_video_count: runtimePublicCount,
          workspace_enabled: true,
          workspace_root_label: "MixLabLocal",
          workspace_root_path: "/Users/huaqihang/Movies/MixLabLocal",
          local_clip_count: designCounts.localCount,
          ffmpeg_status: "可用",
          ffmpeg_source: "内置",
          search_backend: {
            mode: "searchd",
            preferred_mode: "searchd",
            label: "本地 searchd",
            healthy: true,
            degraded: false,
            index_version: `v${String(runtimePublicCount).padStart(6, "0")}`,
            source_video_count: runtimePublicCount,
            segment_count: 412128,
            response_ms: 12,
            message: "本地 Tantivy 搜索索引可用"
          },
          current_user: {
            user_id: "local-cutter",
            username: "本机剪辑师",
            display_name: "本机剪辑师"
          }
        }
      });
    }
  });

  await page.route("**/cutter/local-clips", async (route) => {
    await fulfillJson(route, {
      schema_version: "1.0",
      data: {
        local_clip_count: designCounts.localCount,
        clips: designLocalClips
      }
    });
  });

  await page.route("**/cutter/source-library*", async (route) => {
    if (pageRoute === "public-library") {
      await fulfillJson(route, {
        schema_version: "1.0",
        data: {
          library_id: "lib_main_001",
          available_video_count: designCounts.publicLibraryPageCount,
          videos: designPublicLibraryVideos
        }
      });
      return;
    }

    try {
      const response = await route.fetch();
      const envelope = await response.json();
      await fulfillJson(route, {
        ...envelope,
        data: {
          ...envelope.data,
          available_video_count:
            pageRoute === "public-library"
              ? designCounts.publicLibraryPageCount
              : runtimePublicCount
        }
      });
    } catch {
      await route.continue();
    }
  });

  await page.route("**/cutter/source-search*", async (route) => {
    if (pageRoute !== "material-locator") {
      await route.continue();
      return;
    }

    await fulfillJson(route, {
      schema_version: "1.0",
      data: designMaterialSearchResponse
    });
  });

  await page.route("**/cutter/source-videos/*", async (route) => {
    if (pageRoute !== "material-locator") {
      await route.continue();
      return;
    }

    const sourceVideoId = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    await fulfillJson(route, {
      schema_version: "1.0",
      data: {
        ...designSourceVideoDetail,
        source_video_id: sourceVideoId || designSourceVideoDetail.source_video_id,
        title: sourceVideoId === "V000816" || !sourceVideoId
          ? designSourceVideoDetail.title
          : designMaterialCandidates.find(([candidateId]) => candidateId === sourceVideoId)?.[1] ?? designSourceVideoDetail.title,
        detail_url: `/cutter/source-videos/${sourceVideoId || designSourceVideoDetail.source_video_id}`
      }
    });
  });

  await page.route("**/cutter/cut-jobs", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await fulfillJson(route, {
      schema_version: "1.0",
      data: {
        job_count: designCutJobs.length,
        jobs: designCutJobs
      }
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`Timed out waiting for cutter web at ${url}`);
}

function startCutterServer(): ChildProcessWithoutNullStreams {
  const child = spawn(
    resolve(root, "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: resolve(root, "apps/cutter-web"),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return child;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

async function capturePage(browser: Browser, pageSpec: (typeof pages)[number]): Promise<void> {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1
  });
  await installDesignApiOverrides(page, pageSpec.route);
  await page.addInitScript(({ projects }) => {
    window.localStorage.setItem("mixlab.cutter.projects", JSON.stringify(projects));
    window.localStorage.setItem("mixlab.cutter.currentProjectId", "design-project-20260604-2");
    window.localStorage.setItem("mixlab:cutter:appearance_mode", "light");
  }, { projects: designProjects });

  await page.goto(`${baseUrl}/${pageSpec.hash}`, { waitUntil: "networkidle" });
  await page.locator("[data-cutter-web-ready='true']").waitFor({ timeout: 20_000 });
  await page.locator(`[data-page='${pageSpec.route}']`).waitFor({ timeout: 20_000 });
  if (pageSpec.route === "material-locator") {
    await page.locator(".cutter-transcript-time").filter({ hasText: "00:37" }).first().waitFor();
    await page.locator(".cutter-transcript-time").filter({ hasText: "01:32" }).first().waitFor();
    await page.evaluate(() => {
      const timeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".cutter-transcript-time"));
      const startTextElement = timeButtons
        .find((button) => button.textContent?.trim() === "00:37")
        ?.closest<HTMLElement>(".cutter-transcript-row")
        ?.querySelector<HTMLElement>(".cutter-transcript-text");
      const endTextElement = timeButtons
        .find((button) => button.textContent?.trim() === "01:32")
        ?.closest<HTMLElement>(".cutter-transcript-row")
        ?.querySelector<HTMLElement>(".cutter-transcript-text");
      const startWalker = document.createTreeWalker(startTextElement ?? document.body, NodeFilter.SHOW_TEXT);
      const endWalker = document.createTreeWalker(endTextElement ?? document.body, NodeFilter.SHOW_TEXT);
      const startNode = startWalker.nextNode() as Text | null;
      const endNode = endWalker.nextNode() as Text | null;
      if (!startNode || !endNode) {
        return;
      }

      const range = document.createRange();
      const endText = endNode.textContent ?? "";
      range.setStart(startNode, 0);
      range.setEnd(endNode, Math.max(1, Math.round(endText.length * 0.38)));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      document.querySelector<HTMLElement>(".cutter-transcript-body")?.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          clientX: 760,
          clientY: 420
        })
      );
    });
    await page.waitForTimeout(250);
    await page.locator(".cutter-locator-cut-panel").click({ position: { x: 18, y: 18 } });
    const videoLocator = page.locator(".cutter-video-panel video");
    if (await videoLocator.count()) {
      await videoLocator.evaluate(async (video) => {
        const media = video as HTMLVideoElement;
        if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise<void>((resolveLoaded) => {
            media.addEventListener("loadedmetadata", () => resolveLoaded(), { once: true });
            media.load();
          });
        }
        media.pause();
        media.currentTime = 39;
        await new Promise<void>((resolveSeeked) => {
          if (Math.abs(media.currentTime - 39) < 0.2) {
            resolveSeeked();
            return;
          }
          media.addEventListener("seeked", () => resolveSeeked(), { once: true });
        });
        media.pause();
      });
    }
    await page.waitForTimeout(250);
  }
  if (pageSpec.route === "public-library") {
    await page.locator(".cutter-public-library .ml-gallery-select").nth(2).click();
    await page.waitForTimeout(250);
  }
  await page.screenshot({
    path: resolve(artifactDir, pageSpec.actual),
    fullPage: false
  });
  await page.close();
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const server = startCutterServer();
  let browser: Browser | null = null;

  try {
    await waitForServer(baseUrl);
    browser = await launchBrowser();

    for (const pageSpec of pages) {
      await copyFile(resolve(designDir, pageSpec.design), resolve(artifactDir, pageSpec.design));
      await capturePage(browser, pageSpec);
    }

    await copyFile(resolve(designDir, "说明.png"), resolve(artifactDir, "说明.png"));
    await writeFile(
      resolve(artifactDir, "README.md"),
      [
        "# Cutter Design Reference Capture",
        "",
        `Viewport: ${viewport.width}x${viewport.height}`,
        "",
        "Design references are copied from `/Users/huaqihang/Desktop/Mixlab`.",
        "Actual screenshots are captured from the running Cutter web app with the same viewport.",
        "",
        ...pages.map((pageSpec) => `- ${pageSpec.route}: ${pageSpec.design} -> ${pageSpec.actual}`)
      ].join("\n")
    );
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }

  console.log(`Cutter design reference screenshots saved to ${artifactDir}`);
}

await main();
