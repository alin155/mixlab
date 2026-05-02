import { GalleryGrid, InspectorPanel } from "@mixlab/ui-foundation";
import { formatDuration, type LocalClipCatalog } from "../../api.ts";

export function LocalLibraryPage({
  catalog,
  query = ""
}: {
  catalog: LocalClipCatalog;
  query?: string;
}) {
  const filtered = query
    ? catalog.clips.filter((clip) => `${clip.title} ${clip.source_title} ${clip.selected_text}`.includes(query))
    : catalog.clips;
  const selected = filtered[0] ?? catalog.clips[0];

  return (
    <section className="cutter-page cutter-local-library" data-page="local-library">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">剪辑端本地</p>
            <h1>本地素材库</h1>
            <p>{catalog.local_clip_count} 个可复用片段，来自本机剪切输出。</p>
          </div>
          <label className="cutter-search-box">
            <span>⌕</span>
            <input defaultValue={query} aria-label="搜索本地素材" placeholder="搜索本地素材" />
          </label>
        </header>

        <GalleryGrid
          items={filtered.map((clip) => ({
            id: clip.local_clip_id,
            title: clip.title,
            image:
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%232a2f36'/%3E%3Cpath d='M124 55l78 35-78 35z' fill='%23ffffff' opacity='.9'/%3E%3Ctext x='18' y='158' font-family='Arial' font-size='18' fill='%23fff'%3ELocal Clip%3C/text%3E%3C/svg%3E",
            meta: `${formatDuration(clip.duration_ms ?? 0)} · ${clip.source_title ?? "本地片段"}`,
            tags: ["可复用片段"],
            description: clip.selected_text
          }))}
        />
      </div>

      <InspectorPanel title="来源追踪">
        <div className="cutter-inspector-stack">
          <strong>{selected?.title ?? "未选择片段"}</strong>
          <span>{selected?.source_title}</span>
          <span>
            {formatDuration(selected?.begin_ms ?? 0)} - {formatDuration(selected?.end_ms ?? 0)}
          </span>
          <p>{selected?.selected_text}</p>
          <div className="cutter-button-group">
            <button type="button">打开视频</button>
            <button type="button">显示文件夹</button>
            <button type="button">复用</button>
          </div>
        </div>
      </InspectorPanel>
    </section>
  );
}
