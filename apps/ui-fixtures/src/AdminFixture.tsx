import {
  ADMIN_REQUIRED_PAGES,
  GroupedForm,
  InspectorPanel,
  MacWindow,
  PageBoard,
  Sidebar,
  SourceTable,
  StatusRow,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import type { ReactNode } from "react";
import { adminCounts, adminSources, doctorRows, jobRows } from "./fixture-data.ts";

const nav = [
  { label: "仪表盘", icon: "dashboard" },
  { label: "公共素材库设置", icon: "archive" },
  { label: "原视频管理", icon: "video" },
  { label: "预处理任务", icon: "queue" },
  { label: "索引发布", icon: "index" },
  { label: "健康诊断", icon: "doctor" },
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
    <MacWindow title={title} meta="健康">
      <div className="ml-shell">
        <Sidebar items={nav} active={active} />
        <section className="ml-workspace">
          <UnifiedToolbar
            title="MixLab V3 - 素材库管理端"
            libraryLabel="/Volumes/PublicLibrary"
            healthLabel="健康"
            actions={["扫描源视频", "处理", "Doctor"]}
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

export function AdminFixture() {
  return (
    <PageBoard>
      <Frame
        title="1 仪表盘"
        active="仪表盘"
        inspector={
          <InspectorPanel title="公共素材库健康摘要">
            <GroupedForm
              groups={[
                {
                  title: "状态",
                  rows: [
                    { label: "库状态", value: "健康" },
                    { label: "库 ID", value: "MLPUB-001" },
                    { label: "当前索引", value: "v000027" },
                    { label: "Ready", value: "120" }
                  ]
                }
              ]}
            />
          </InspectorPanel>
        }
      >
        <h1>仪表盘</h1>
        <div className="fixture-count-grid">
          {adminCounts.map(([label, value, detail]) => (
            <article className="fixture-count" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <section className="fixture-panel">
          <h2>当前预处理任务</h2>
          {jobRows.slice(0, 3).map(([tone, id, detail, value]) => (
            <StatusRow tone={tone} label={id} detail={detail} value={value} key={id} />
          ))}
        </section>
      </Frame>

      <Frame
        title="2 公共素材库设置"
        active="公共素材库设置"
        inspector={
          <InspectorPanel title="路径校验">
            <StatusRow tone="ready" label="source-videos" detail="可读" value="通过" />
            <StatusRow tone="ready" label=".mixlab-library" detail="可写" value="通过" />
            <StatusRow tone="ready" label="manifest.json" detail="有效" value="通过" />
            <StatusRow tone="warning" label="注意" detail="移动硬盘路径需保持挂载" value="提示" />
          </InspectorPanel>
        }
      >
        <h1>公共素材库设置</h1>
        <GroupedForm
          groups={[
            {
              title: "路径与基本信息",
              rows: [
                { label: "公共根路径", value: "/Volumes/PublicLibrary" },
                { label: "source-videos", value: "/Volumes/PublicLibrary/source-videos" },
                { label: ".mixlab-library", value: "/Volumes/PublicLibrary/.mixlab-library" },
                { label: "library_id", value: "MLPUB-001" },
                { label: "协议版本", value: "1.0.0" }
              ]
            }
          ]}
        />
      </Frame>

      <Frame
        title="3 原视频管理"
        active="原视频管理"
        inspector={
          <InspectorPanel title="P000042">
            <GroupedForm
              groups={[
                {
                  title: "公共元数据",
                  rows: [
                    { label: "标题", value: "现金流管理与风险控制" },
                    { label: "标签", value: "财务 / 风险控制" },
                    { label: "讲师", value: "李明" },
                    { label: "可见", value: "是" }
                  ]
                }
              ]}
            />
            <button className="fixture-primary-button" type="button">保存公开说明</button>
          </InspectorPanel>
        }
      >
        <div className="fixture-section-header">
          <h1>原视频管理</h1>
          <span className="ml-search">⌕<input value="" readOnly placeholder="搜索文件名 / 标签 / 相对路径" /></span>
        </div>
        <SourceTable
          columns={["ID", "文件名", "状态", "对剪辑师可见", "更新时间"]}
          rows={adminSources}
        />
      </Frame>

      <Frame
        title="4 预处理任务"
        active="预处理任务"
        inspector={
          <InspectorPanel title="任务控制">
            <GroupedForm
              groups={[
                {
                  title: "队列参数",
                  rows: [
                    { label: "并发任务", value: "3" },
                    { label: "失败策略", value: "继续后续视频" },
                    { label: "ASR 模型", value: "paraformer-v2" },
                    { label: "音频模式", value: "mp3_16k_mono_64k" }
                  ]
                }
              ]}
            />
          </InspectorPanel>
        }
      >
        <h1>预处理任务</h1>
        <section className="fixture-panel">
          {jobRows.map(([tone, id, detail, value]) => (
            <StatusRow tone={tone} label={id} detail={detail} value={value} key={id} />
          ))}
        </section>
      </Frame>

      <Frame
        title="5 索引发布"
        active="索引发布"
        inspector={
          <InspectorPanel title="版本详情">
            <GroupedForm
              groups={[
                {
                  title: "v000027",
                  rows: [
                    { label: "Ready", value: "120" },
                    { label: "schema", value: "1.0.0" },
                    { label: "校验", value: "通过" },
                    { label: "current", value: "已指向" }
                  ]
                }
              ]}
            />
          </InspectorPanel>
        }
      >
        <h1>索引发布</h1>
        <SourceTable
          columns={["版本", "创建时间", "Ready 数量", "schema", "状态", "操作"]}
          rows={[
            ["v000027", "2024-05-07 09:51", "120", "1.0.0", "已发布", "详情"],
            ["v000026", "2024-05-06 22:10", "118", "1.0.0", "已归档", "更多"],
            ["v000025", "2024-05-05 21:47", "114", "1.0.0", "已归档", "更多"]
          ]}
        />
      </Frame>

      <Frame
        title="6 健康诊断 / Doctor"
        active="健康诊断"
        inspector={
          <InspectorPanel title="诊断报告">
            <GroupedForm
              groups={[
                {
                  title: "导出",
                  rows: [
                    { label: "报告时间", value: "2024-05-07 10:26" },
                    { label: "Doctor", value: "1.2.0" },
                    { label: "索引", value: "v000027" },
                    { label: "导出", value: "JSON" }
                  ]
                }
              ]}
            />
            <button className="fixture-primary-button" type="button">导出诊断 JSON</button>
          </InspectorPanel>
        }
      >
        <h1>健康诊断</h1>
        <section className="fixture-panel">
          {doctorRows.map(([tone, label, detail, value]) => (
            <StatusRow tone={tone} label={label} detail={detail} value={value} key={label} />
          ))}
        </section>
      </Frame>
      <span className="fixture-page-sentinel" data-pages={ADMIN_REQUIRED_PAGES.join(",")} />
    </PageBoard>
  );
}
