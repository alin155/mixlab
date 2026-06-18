import {
  AppShell,
  Badge,
  Button,
  Card,
  InspectorPanel,
  SearchBox,
  Table,
  type SidebarItem
} from "@mixlab/ui-foundation";

const cutterNav: SidebarItem[] = [
  { key: "home", label: "首页", icon: "home" },
  { key: "search", label: "素材搜索", icon: "search" },
  { key: "tasks", label: "剪切任务", icon: "sliders" },
  { key: "local", label: "本地素材", icon: "folder" },
  { key: "public", label: "公共素材库", icon: "database" },
  { key: "cache", label: "缓存管理", icon: "list" },
  { key: "settings", label: "设置", icon: "settings" }
];

const adminNav: SidebarItem[] = [
  { key: "dashboard", label: "仪表盘", icon: "dashboard" },
  { key: "sources", label: "原视频管理", icon: "video" },
  { key: "preprocess", label: "预处理", icon: "queue" },
  { key: "users", label: "剪辑师用户", icon: "users" },
  { key: "settings", label: "设置", icon: "settings" }
];

const cutRows = [
  {
    id: "1",
    status: <Badge tone="done">已完成</Badge>,
    source: "C0510",
    range: "06:21 - 06:54",
    text: "因为所有的信息来源，就是新闻联播。",
    problem: <Badge tone="success">剪切成功</Badge>
  },
  {
    id: "2",
    status: <Badge tone="running">剪切中</Badge>,
    source: "C0629",
    range: "11:58 - 12:38",
    text: "投放费用增加，现金流健康度需要重新评估。",
    problem: <Badge tone="info">处理中</Badge>
  },
  {
    id: "3",
    status: <Badge tone="failed">失败</Badge>,
    source: "C0482",
    range: "01:37 - 06:09",
    text: "来源视频缺失，需要重新拉取缓存。",
    problem: <Badge tone="danger">source video not found</Badge>
  }
];

const adminRows = [
  {
    id: "V003291",
    status: <Badge tone="done">可用</Badge>,
    title: "现金流管理与风险控制",
    fragments: "124,830",
    updated: "12:03"
  },
  {
    id: "V003292",
    status: <Badge tone="running">处理中</Badge>,
    title: "房产置换与资产优化",
    fragments: "88,201",
    updated: "12:01"
  },
  {
    id: "V003293",
    status: <Badge tone="warning">待发布</Badge>,
    title: "商业模式拆解实战",
    fragments: "54,012",
    updated: "11:58"
  }
];

function SidebarFooter() {
  return (
    <Card className="fixture-v1-sidebar-card">
      <div className="fixture-v1-sidebar-row">
        <span>当前项目</span>
        <strong>6月4日-2</strong>
      </div>
      <div className="fixture-v1-sidebar-row">
        <span>素材库</span>
        <strong>公共 7105 / 本地 117</strong>
      </div>
      <div className="fixture-v1-sidebar-row">
        <span>本机服务</span>
        <Badge tone="success">正常</Badge>
      </div>
    </Card>
  );
}

export function V1CutterFixture() {
  return (
    <AppShell
      activeKey="search"
      brand={{ title: "MixLab Cutter", subtitle: "项目化素材剪切" }}
      items={cutterNav}
      sidebarFooter={<SidebarFooter />}
    >
      <section className="fixture-v1-page">
        <header className="fixture-v1-header">
          <div>
            <p className="fixture-v1-eyebrow">Cutter / Material Search</p>
            <h1>搜索素材并剪切片段</h1>
          </div>
          <SearchBox placeholder="搜索文案关键词或粘贴爆款文案" buttonLabel="搜索" />
        </header>

        <div className="fixture-v1-layout">
          <Card title="候选素材" subtitle="已载入 17 条 · 命中 22 处">
            <div className="fixture-v1-list">
              {["C0510", "C0629", "C0482", "040A1022"].map((item, index) => (
                <button
                  className={`fixture-v1-material${index === 0 ? " is-selected" : ""}`}
                  type="button"
                  key={item}
                >
                  <span className="fixture-v1-thumb" />
                  <strong>{item}</strong>
                  <span>{index === 0 ? "36:43 · 命中 1" : "31:19 · 命中 2"}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="视频文案" actions={<Button variant="ghost">下一个</Button>}>
            <div className="fixture-v1-transcript">
              <p><time>00:05</time><span>2026 年我跟陶老师我们的第一场公开课，我们一起携手走过了这么多地方。</span></p>
              <p><time>00:15</time><span>那 2026 年开年就是大事不断，关键词只需要高亮，不要整句选中。</span></p>
              <p><time>00:26</time><span>上一波是 2015 年，再上一波是 2007 年，今天上午市场突破了关键点。</span></p>
              <p><time>00:37</time><span>终于我们整理出了十年来的结论和可以剪切的完整片段。</span></p>
            </div>
          </Card>

          <InspectorPanel
            title="选区信息"
            subtitle="已选 30 秒"
            footer={<Button variant="primary">剪切这段</Button>}
          >
            <p className="fixture-v1-selected-text">
              终于我们整理出了十年来的结论和可以剪切的完整片段，这段会完整显示在选区详情中。
            </p>
          </InspectorPanel>
        </div>

        <Card title="最近剪切任务">
          <Table
            columns={[
              { id: "status", header: "状态", render: (row) => row.status },
              { id: "source", header: "来源", accessor: "source" },
              { id: "range", header: "时间段", accessor: "range" },
              { id: "text", header: "选中文案", accessor: "text" },
              { id: "problem", header: "问题", render: (row) => row.problem }
            ]}
            density="compact"
            getRowKey={(row) => row.id}
            rows={cutRows}
            stickyHeader
          />
        </Card>
      </section>
    </AppShell>
  );
}

export function V1AdminFixture() {
  return (
    <AppShell
      activeKey="dashboard"
      brand={{ title: "MixLab Admin", subtitle: "公共素材库生产" }}
      items={adminNav}
      sidebarFooter={<SidebarFooter />}
    >
      <section className="fixture-v1-page">
        <header className="fixture-v1-header">
          <div>
            <p className="fixture-v1-eyebrow">Admin / Dashboard</p>
            <h1>公共素材库仪表盘</h1>
          </div>
          <div className="fixture-v1-actions">
            <Button>局部刷新</Button>
            <Button variant="primary">重试失败视频</Button>
          </div>
        </header>

        <div className="fixture-v1-metrics">
          <Card title="可用视频"><strong>3292</strong><span>占全部 29%</span></Card>
          <Card title="句子片段"><strong>412,128</strong><span>完整文案可搜索</span></Card>
          <Card title="失败任务"><strong>260</strong><span>可重试处理</span></Card>
        </div>

        <div className="fixture-v1-layout">
          <Card title="原视频管理" subtitle="真实 NAS 素材预处理状态">
            <Table
              columns={[
                { id: "id", header: "索引", accessor: "id" },
                { id: "status", header: "状态", render: (row) => row.status },
                { id: "title", header: "标题", accessor: "title" },
                { id: "fragments", header: "片段", accessor: "fragments", align: "right" },
                { id: "updated", header: "更新", accessor: "updated", align: "right" }
              ]}
              getRowKey={(row) => row.id}
              rows={adminRows}
              stickyHeader
            />
          </Card>

          <InspectorPanel title="公共库摘要" subtitle="/Volumes/MixLab/PublicLibrary">
            <div className="fixture-v1-detail-list">
              <span>发布版本</span><strong>v003292</strong>
              <span>刷新方式</span><strong>卡片局部刷新</strong>
              <span>链路健康</span><Badge tone="running">需要观察</Badge>
            </div>
          </InspectorPanel>
        </div>
      </section>
    </AppShell>
  );
}
