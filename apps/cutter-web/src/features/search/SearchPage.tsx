import { type FormEvent } from "react";
import { InspectorPanel, SegmentedControl } from "@mixlab/ui-foundation";
import { formatDuration, type SearchResponse } from "../../api.ts";
import { sourceDetailHash } from "../../app/navigation.ts";

export function SearchPage({
  search,
  query,
  onSearch
}: {
  search: SearchResponse;
  query: string;
  onSearch?: (query: string) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearch?.(String(formData.get("query") ?? ""));
  }

  return (
    <section className="cutter-page cutter-search-page" data-page="search">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">搜索与文案</p>
            <h1>按原素材分组</h1>
            <p>{search.groups.length} 组命中 · 当前搜索「{query}」</p>
          </div>
          <form className="cutter-search-form" onSubmit={handleSubmit}>
            <label className="cutter-search-box">
              <span>⌕</span>
              <input
                name="query"
                defaultValue={query}
                aria-label="搜索文案关键词或粘贴文案"
                placeholder="搜索文案关键词或粘贴文案"
              />
            </label>
            <button className="cutter-primary-button" type="submit">
              执行搜索
            </button>
          </form>
        </header>

        {search.groups.length === 0 ? (
          <div className="cutter-empty-state">
            <strong>没有找到匹配的原素材</strong>
            <span>请调整搜索词，或等待管理端发布更多可用素材。</span>
          </div>
        ) : (
          <div className="cutter-search-groups">
            {search.groups.map((group) => {
              const segmentIds = group.hit_segments.map((segment) => segment.segment_id);
              return (
                <article className="cutter-search-group" key={group.source_video_id}>
                  <img src={group.cover_url} alt="" />
                  <div>
                    <header>
                      <strong>{group.title}</strong>
                      <span>{group.hit_count} 条上下文文案</span>
                    </header>
                    <p>{group.best_excerpt}</p>
                    <div className="cutter-context-list">
                      {group.hit_segments.map((segment) => (
                        <span key={segment.segment_id}>
                          {formatDuration(segment.begin_ms)} {segment.text}
                        </span>
                      ))}
                    </div>
                    <a
                      className="cutter-inline-action"
                      href={sourceDetailHash(group.source_video_id, { query, segmentIds })}
                    >
                      查看完整文案
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <InspectorPanel title="搜索规则">
        <div className="cutter-inspector-stack">
          <SegmentedControl options={["原素材", "标签", "课程"]} active="原素材" />
          <span>搜索命中按原素材聚合，进入详情后阅读完整文案。</span>
          <span>避免句子瀑布流，减少剪辑师从上下文中迷路。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
