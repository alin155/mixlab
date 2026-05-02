import "./styles.css";
import {
  createCutterApiClient,
  formatDuration,
  formatFileSize,
  type CutterApiClient,
  type LocalClip,
  type LocalClipCatalog,
  type SearchResponse,
  type SourceLibraryResponse,
  type SourceVideoCard,
  type SourceVideoDetail,
  type TranscriptSegment
} from "./api.ts";

interface AppState {
  apiBaseUrl: string;
  client: CutterApiClient;
  activeView: "source" | "local";
  library: SourceLibraryResponse | null;
  localClips: LocalClipCatalog | null;
  selectedId: string;
  selectedLocalClipId: string;
  detail: SourceVideoDetail | null;
  search: SearchResponse | null;
  query: string;
  loading: boolean;
  error: string;
}

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("app root not found");
}

const appRoot = root;

const defaultApiBaseUrl =
  import.meta.env.VITE_MIXLAB_CUTTER_API_BASE_URL || "http://127.0.0.1:3789";
const storedApiBaseUrl = window.localStorage.getItem("mixlab.cutter.apiBaseUrl");

const state: AppState = {
  apiBaseUrl: storedApiBaseUrl || defaultApiBaseUrl,
  client: createCutterApiClient({
    base_url: storedApiBaseUrl || defaultApiBaseUrl
  }),
  activeView: "source",
  library: null,
  localClips: null,
  selectedId: "",
  selectedLocalClipId: "",
  detail: null,
  search: null,
  query: "",
  loading: true,
  error: ""
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mediaUrl(pathOrUrl: string | undefined): string {
  if (!pathOrUrl) {
    return "";
  }

  return state.client.resolveApiUrl(pathOrUrl);
}

function cardMeta(video: SourceVideoCard): string {
  const resolution = video.width && video.height ? `${video.width}x${video.height}` : "";
  const codec = video.codec ? video.codec.toUpperCase() : "";
  return [formatDuration(video.duration_ms), resolution, codec, formatFileSize(video.file_size)]
    .filter(Boolean)
    .join(" · ");
}

function renderVideoCard(video: SourceVideoCard): string {
  const active = video.source_video_id === state.selectedId ? " is-active" : "";
  return `
    <button class="video-card${active}" data-source-id="${escapeHtml(video.source_video_id)}">
      <span class="poster-wrap">
        <img src="${escapeHtml(mediaUrl(video.cover_url))}" alt="" loading="lazy" />
        <span class="duration-pill">${escapeHtml(formatDuration(video.duration_ms))}</span>
      </span>
      <span class="video-card-body">
        <span class="video-title">${escapeHtml(video.title)}</span>
        <span class="video-meta">${escapeHtml(cardMeta(video))}</span>
        <span class="video-path">${escapeHtml(video.relative_path || video.source_video_id)}</span>
      </span>
    </button>
  `;
}

function renderSearchResults(): string {
  if (!state.search || state.query.trim() === "") {
    return "";
  }

  if (state.search.groups.length === 0) {
    return `
      <section class="search-panel">
        <div class="section-heading">
          <h2>搜索结果</h2>
          <span>${escapeHtml(state.query)}</span>
        </div>
        <div class="empty-row">未找到匹配文案</div>
      </section>
    `;
  }

  return `
    <section class="search-panel">
      <div class="section-heading">
        <h2>搜索结果</h2>
        <span>${state.search.groups.length} 组命中</span>
      </div>
      <div class="result-list">
        ${state.search.groups
          .map(
            (group) => `
              <button class="result-row" data-source-id="${escapeHtml(group.source_video_id)}">
                <img src="${escapeHtml(mediaUrl(group.cover_url))}" alt="" loading="lazy" />
                <span>
                  <strong>${escapeHtml(group.title)}</strong>
                  <small>${escapeHtml(group.best_excerpt)}</small>
                </span>
                <em>${group.hit_count}</em>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderLibraryPane(): string {
  const videos = state.library?.videos ?? [];

  return `
    <main class="library-pane">
      <div class="topbar">
        <div>
          <p class="eyebrow">MixLab Cutter</p>
          <h1>原素材库</h1>
        </div>
        <form class="search-form" id="search-form">
          <span aria-hidden="true">⌕</span>
          <input id="search-input" type="search" value="${escapeHtml(state.query)}" placeholder="搜索文案、标题、标签" />
          <button type="submit">搜索</button>
        </form>
        <button class="icon-button" id="refresh-button" type="button" aria-label="刷新">↻</button>
      </div>

      <div class="library-summary">
        <span><strong>${videos.length}</strong> 可用原素材</span>
        <span>${escapeHtml(state.apiBaseUrl)}</span>
      </div>

      ${renderSearchResults()}

      <section class="source-section">
        <div class="section-heading">
          <h2>全部资源</h2>
          <span>${state.loading ? "同步中" : `${videos.length} 条`}</span>
        </div>
        ${
          videos.length > 0
            ? `<div class="video-grid">${videos.map(renderVideoCard).join("")}</div>`
            : `<div class="empty-state">暂无可用原素材</div>`
        }
      </section>
    </main>
  `;
}

function segmentText(segment: TranscriptSegment): string {
  return `
    <div class="segment-row">
      <button class="segment-jump" data-time-ms="${segment.begin_ms}">
        <span>${escapeHtml(formatDuration(segment.begin_ms))}</span>
        <p>${escapeHtml(segment.text)}</p>
      </button>
      <button class="mini-action" data-create-clip="${escapeHtml(segment.segment_id)}">剪入</button>
    </div>
  `;
}

function renderLocalClipCard(clip: LocalClip): string {
  const active = clip.local_clip_id === state.selectedLocalClipId ? " is-active" : "";
  return `
    <button class="local-clip-card${active}" data-local-clip-id="${escapeHtml(clip.local_clip_id)}">
      <span>
        <strong>${escapeHtml(clip.title)}</strong>
        <small>${escapeHtml(clip.source_title || clip.source_video_id || "")}</small>
      </span>
      <em>${escapeHtml(formatDuration(clip.duration_ms ?? 0))}</em>
      <p>${escapeHtml(clip.selected_text || "")}</p>
    </button>
  `;
}

function renderLocalClipPane(): string {
  const clips = state.localClips?.clips ?? [];

  return `
    <main class="library-pane">
      <div class="topbar local-topbar">
        <div>
          <p class="eyebrow">MixLab Cutter</p>
          <h1>本地素材库</h1>
        </div>
        <button class="icon-button" id="refresh-button" type="button" aria-label="刷新">↻</button>
      </div>
      <div class="library-summary">
        <span><strong>${clips.length}</strong> 可复用片段</span>
        <span>来自剪辑端本地切片</span>
      </div>
      <section class="source-section">
        <div class="section-heading">
          <h2>全部片段</h2>
          <span>${clips.length} 条</span>
        </div>
        ${
          clips.length > 0
            ? `<div class="local-clip-list">${clips.map(renderLocalClipCard).join("")}</div>`
            : `<div class="empty-state">还没有本地素材</div>`
        }
      </section>
    </main>
  `;
}

function selectedLocalClip(): LocalClip | null {
  const clips = state.localClips?.clips ?? [];
  return clips.find((clip) => clip.local_clip_id === state.selectedLocalClipId) ?? clips[0] ?? null;
}

function renderLocalClipDetailPane(): string {
  const clip = selectedLocalClip();

  if (!clip) {
    return `
      <aside class="detail-pane">
        <div class="detail-empty">
          <h2>本地素材</h2>
          <p>从原素材文案中剪入片段</p>
        </div>
      </aside>
    `;
  }

  const media = mediaUrl(clip.media_url);

  return `
    <aside class="detail-pane">
      <div class="player-shell">
        <video id="source-video" controls preload="metadata">
          <source src="${escapeHtml(media)}" />
        </video>
      </div>
      <div class="detail-header">
        <div>
          <h2>${escapeHtml(clip.title)}</h2>
          <p>${escapeHtml(`${formatDuration(clip.duration_ms ?? 0)} · ${clip.source_title || ""}`)}</p>
        </div>
        <a class="soft-link" href="${escapeHtml(media)}" target="_blank" rel="noreferrer">打开</a>
      </div>
      <div class="local-text">
        <h2>来源文案</h2>
        <p>${escapeHtml(clip.selected_text || "")}</p>
      </div>
    </aside>
  `;
}

function renderDetailPane(): string {
  if (!state.detail) {
    return `
      <aside class="detail-pane">
        <div class="detail-empty">
          <h2>选择素材</h2>
          <p>从左侧进入原素材详情</p>
        </div>
      </aside>
    `;
  }

  const detail = state.detail;
  const sourceUrl = mediaUrl(detail.media_url);
  const coverUrl = mediaUrl(detail.cover_url);
  const subtitleUrl = mediaUrl(detail.subtitles_url);
  const segments = detail.transcript.segments.slice(0, 400);

  return `
    <aside class="detail-pane">
      <div class="player-shell">
        <video id="source-video" controls preload="metadata" poster="${escapeHtml(coverUrl)}">
          <source src="${escapeHtml(sourceUrl)}" />
          <track src="${escapeHtml(subtitleUrl)}" kind="subtitles" srclang="zh" label="中文" default />
        </video>
      </div>

      <div class="detail-header">
        <div>
          <h2>${escapeHtml(detail.title)}</h2>
          <p>${escapeHtml(cardMeta(detail))}</p>
        </div>
        <a class="soft-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">打开</a>
      </div>

      <div class="keyframe-strip">
        ${detail.keyframes.keyframes_ms
          .slice(0, 16)
          .map(
            (time) => `<button data-time-ms="${time}">${escapeHtml(formatDuration(time))}</button>`
          )
          .join("")}
      </div>

      <div class="transcript-panel">
        <div class="section-heading">
          <h2>完整文案</h2>
          <span>${segments.length} 句</span>
        </div>
        <div class="segment-list">${segments.map(segmentText).join("")}</div>
      </div>
    </aside>
  `;
}

function render(): void {
  appRoot.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="brand-mark">M</div>
        <button class="nav-item${state.activeView === "source" ? " is-active" : ""}" type="button" data-view="source">原素材</button>
        <button class="nav-item${state.activeView === "local" ? " is-active" : ""}" type="button" data-view="local">本地素材</button>
        <button class="nav-item" type="button">导出</button>
      </nav>
      <div class="workspace">
        ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ""}
        ${state.activeView === "source" ? renderLibraryPane() : renderLocalClipPane()}
        ${state.activeView === "source" ? renderDetailPane() : renderLocalClipDetailPane()}
      </div>
    </div>
  `;

  bindEvents();
}

function bindEvents(): void {
  document.querySelector("#search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#search-input");
    void runSearch(input?.value ?? "");
  });

  document.querySelector("#refresh-button")?.addEventListener("click", () => {
    void (state.activeView === "source" ? loadLibrary() : loadLocalClips());
  });

  document.querySelectorAll<HTMLElement>("[data-view]").forEach((element) => {
    element.addEventListener("click", () => {
      const view = element.dataset.view;

      if (view === "source" || view === "local") {
        state.activeView = view;
        render();
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-source-id]").forEach((element) => {
    element.addEventListener("click", () => {
      const sourceId = element.dataset.sourceId;

      if (sourceId) {
        void selectSourceVideo(sourceId);
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-time-ms]").forEach((element) => {
    element.addEventListener("click", () => {
      const video = document.querySelector<HTMLVideoElement>("#source-video");
      const timeMs = Number.parseInt(element.dataset.timeMs ?? "0", 10);

      if (video && Number.isFinite(timeMs)) {
        video.currentTime = timeMs / 1000;
        void video.play().catch(() => undefined);
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-create-clip]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const segmentId = element.dataset.createClip;

      if (segmentId) {
        void createClipFromSegment(segmentId);
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-local-clip-id]").forEach((element) => {
    element.addEventListener("click", () => {
      const localClipId = element.dataset.localClipId;

      if (localClipId) {
        state.selectedLocalClipId = localClipId;
        render();
      }
    });
  });
}

async function loadLibrary(): Promise<void> {
  state.loading = true;
  state.error = "";
  render();

  try {
    state.library = await state.client.listSourceLibrary();
    const firstVideo = state.library.videos[0];

    if (!state.selectedId && firstVideo) {
      await selectSourceVideo(firstVideo.source_video_id, false);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "素材库读取失败";
  } finally {
    state.loading = false;
    render();
  }
}

async function loadLocalClips(): Promise<void> {
  state.error = "";

  try {
    state.localClips = await state.client.listLocalClips();

    if (!state.selectedLocalClipId && state.localClips.clips[0]) {
      state.selectedLocalClipId = state.localClips.clips[0].local_clip_id;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "本地素材读取失败";
  }

  render();
}

async function selectSourceVideo(sourceVideoId: string, shouldRender = true): Promise<void> {
  state.selectedId = sourceVideoId;
  state.error = "";

  if (shouldRender) {
    render();
  }

  try {
    state.detail = await state.client.getSourceVideoDetail(sourceVideoId);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "素材详情读取失败";
  }

  render();
}

async function runSearch(query: string): Promise<void> {
  state.query = query.trim();
  state.error = "";

  if (!state.query) {
    state.search = null;
    render();
    return;
  }

  render();

  try {
    state.search = await state.client.searchSourceLibrary(state.query, 20);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "搜索失败";
  }

  render();
}

async function createClipFromSegment(segmentId: string): Promise<void> {
  if (!state.detail) {
    return;
  }

  state.error = "";
  render();

  try {
    const clip = await state.client.createLocalClip({
      source_video_id: state.detail.source_video_id,
      start_segment_id: segmentId,
      end_segment_id: segmentId,
      pre_roll_ms: 300,
      post_roll_ms: 300,
      cut_mode: "smart"
    });
    await loadLocalClips();
    state.selectedLocalClipId = clip.local_clip_id;
    state.activeView = "local";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "本地素材创建失败";
  }

  render();
}

render();
void loadLibrary();
void loadLocalClips();
