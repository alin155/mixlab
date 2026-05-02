import {
  CUTTER_REQUIRED_PAGES,
  GalleryGrid,
  GroupedForm,
  InspectorPanel,
  MacWindow,
  MediaPanel,
  PageBoard,
  SegmentedControl,
  Sidebar,
  SourceTable,
  StatusRow,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import type { ReactNode } from "react";
import { cutRows, cutterSources, localClips, transcriptLines } from "./fixture-data.ts";

const nav = [
  { label: "公共原素材库", icon: "archive" },
  { label: "搜索与文案", icon: "search" },
  { label: "待剪清单", icon: "list" },
  { label: "本地素材库", icon: "folder" },
  { label: "剪切队列", icon: "queue" },
  { label: "设置", icon: "settings" }
];

function Frame({
  title,
  active,
  children,
  inspector
}: {
  title: string;
  active: string;
  children: ReactNode;
  inspector?: ReactNode;
}) {
  return (
    <MacWindow title={title} meta="可用原素材 120个">
      <div className="ml-shell">
        <Sidebar items={nav} active={active} />
        <section className="ml-workspace">
          <UnifiedToolbar
            title="MixLab V3 - 剪辑师工作台"
            libraryLabel="默认公共库"
            availableCountLabel="可用原素材 120个"
            healthLabel="就绪"
          />
          <div className={inspector ? "ml-content-split" : "fixture-single-content"}>
            <div className="ml-content">{children}</div>
            {inspector}
          </div>
        </section>
      </div>
    </MacWindow>
  );
}

export function CutterFixture() {
  return (
    <PageBoard>
      <Frame title="1 公共原素材库" active="公共原素材库">
        <div className="fixture-section-header">
          <div>
            <h1>公共原素材库</h1>
            <p>只显示 ready 原视频</p>
          </div>
          <SegmentedControl options={["网格", "预览", "列表"]} active="网格" />
        </div>
        <div className="fixture-filter-row">
          <span className="ml-search">⌕<input value="" readOnly placeholder="搜索标题 / 标签 / 描述" /></span>
          <span className="ml-select">分类</span>
          <span className="ml-select">标签</span>
          <span className="ml-select">讲师</span>
        </div>
        <GalleryGrid items={cutterSources} />
      </Frame>

      <Frame
        title="2 原素材详情"
        active="公共原素材库"
        inspector={
          <InspectorPanel title="当前素材">
            <GroupedForm
              groups={[
                {
                  title: "公开元数据",
                  rows: [
                    { label: "讲师", value: "李明" },
                    { label: "课程", value: "企业现金流" },
                    { label: "分类", value: "公开课" },
                    { label: "状态", value: "只读 ready" }
                  ]
                },
                {
                  title: "选择片段",
                  rows: [
                    { label: "起始片段", value: "004" },
                    { label: "结束片段", value: "010" },
                    { label: "预计时长", value: "00:09:19" }
                  ]
                }
              ]}
            />
            <button className="fixture-primary-button" type="button">加入待剪清单</button>
          </InspectorPanel>
        }
      >
        <MediaPanel title="现金流管理与风险控制" image={cutterSources[0].image}>
          预览原视频，文案与时间戳保持同屏。
        </MediaPanel>
        <TranscriptBlock />
      </Frame>

      <Frame
        title="3 搜索与文案"
        active="搜索与文案"
        inspector={
          <InspectorPanel title="当前选段">
            <GroupedForm
              groups={[
                {
                  title: "范围",
                  rows: [
                    { label: "起始片段", value: "004" },
                    { label: "结束片段", value: "010" },
                    { label: "时间范围", value: "00:02:18 - 00:11:37" }
                  ]
                }
              ]}
            />
            <button className="fixture-primary-button" type="button">加入待剪清单</button>
          </InspectorPanel>
        }
      >
        <div className="fixture-search-layout">
          <section>
            <span className="ml-search">⌕<input value="现金流" readOnly /></span>
            <div className="fixture-result-groups">
              {cutterSources.slice(0, 4).map((source, index) => (
                <article className="fixture-result-group" key={source.id}>
                  <img src={source.image} alt="" />
                  <div>
                    <strong>{source.title}</strong>
                    <p>{index + 1}/18 · 命中 {index + 2} 处</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <TranscriptBlock />
        </div>
      </Frame>

      <Frame
        title="4 待剪清单"
        active="待剪清单"
        inspector={
          <InspectorPanel title="清单摘要">
            <GroupedForm
              groups={[
                {
                  title: "片段数量",
                  rows: [
                    { label: "总数", value: "4" },
                    { label: "预计时长", value: "00:36:49" },
                    { label: "默认模式", value: "smart" }
                  ]
                }
              ]}
            />
          </InspectorPanel>
        }
      >
        <div className="fixture-section-header">
          <h1>待剪清单</h1>
          <button className="fixture-primary-button" type="button">提交本地剪切</button>
        </div>
        <SourceTable
          columns={["#", "来源", "时间范围", "预计时长", "选中文案预览", "剪切模式"]}
          rows={cutRows}
        />
      </Frame>

      <Frame
        title="5 本地素材库"
        active="本地素材库"
        inspector={
          <InspectorPanel title="片段信息">
            <MediaPanel title="现金安全线" image={localClips[0].image} />
            <GroupedForm
              groups={[
                {
                  title: "来源追溯",
                  rows: [
                    { label: "原素材", value: "P000042" },
                    { label: "时间段", value: "00:02:18 - 00:11:37" },
                    { label: "导出", value: "2024-05-07 10:21" }
                  ]
                }
              ]}
            />
          </InspectorPanel>
        }
      >
        <div className="fixture-section-header">
          <div>
            <h1>本地素材库</h1>
            <p>/Users/mixlab/Workspace</p>
          </div>
          <SegmentedControl options={["网格", "列表"]} active="网格" />
        </div>
        <GalleryGrid items={localClips} />
      </Frame>

      <Frame
        title="6 剪切队列与设置"
        active="剪切队列"
        inspector={
          <InspectorPanel title="设置">
            <GroupedForm
              groups={[
                {
                  title: "路径与运行",
                  rows: [
                    { label: "公共素材库", value: "/Volumes/PublicLibrary" },
                    { label: "本地工作区", value: "/Users/mixlab/Workspace" },
                    { label: "FFmpeg", value: "bundled 就绪" }
                  ]
                },
                {
                  title: "剪切",
                  rows: [
                    { label: "默认模式", value: "smart" },
                    { label: "并发数", value: "2" }
                  ]
                }
              ]}
            />
          </InspectorPanel>
        }
      >
        <h1>剪切队列</h1>
        <div className="fixture-status-list">
          <StatusRow tone="processing" label="运行中" detail="现金流管理与风险控制" value="72%" />
          <StatusRow tone="queued" label="等待中" detail="利润增长的估价优化" value="0%" />
          <StatusRow tone="ready" label="已完成" detail="品牌定价与客户筛选" value="100%" />
          <StatusRow tone="failed" label="失败" detail="团队目标与绩效闭环" value="重试" />
        </div>
      </Frame>
      <span className="fixture-page-sentinel" data-pages={CUTTER_REQUIRED_PAGES.join(",")} />
    </PageBoard>
  );
}

function TranscriptBlock() {
  return (
    <section className="fixture-transcript">
      <h2>完整文案</h2>
      {transcriptLines.map(([time, text]) => (
        <p key={time}>
          <time>{time}</time>
          <span>{text}</span>
        </p>
      ))}
    </section>
  );
}
