import { routeTo } from "../../app/routing";
import { cutTasks, diagnostics, preprocessJobs, selectedSource, sources, users, type CutTaskFixture, type PreprocessJobFixture, type SourceFixture, type Tone, type UserFixture } from "../../domain/fixtures";
import { AppShell, Button, DataTable, FieldList, InspectorPanel, MediaCard, MetricGrid, PageHeader, SearchBox, StatusBadge, Tabs, TranscriptPanel, WorkbenchCard } from "../../foundation/components";

const navItems = [
  { key: "dashboard", label: "仪表盘", icon: "⌂", href: routeTo("admin", "dashboard") },
  { key: "source-videos", label: "原视频管理", icon: "▤", href: routeTo("admin", "source-videos") },
  { key: "preprocess-jobs", label: "预处理", icon: "◌", href: routeTo("admin", "preprocess-jobs") },
  { key: "index-publish", label: "索引发布", icon: "◇", href: routeTo("admin", "index-publish") },
  { key: "cutter-users", label: "剪辑师用户", icon: "⌘", href: routeTo("admin", "cutter-users") },
  { key: "settings", label: "设置", icon: "⚙", href: routeTo("admin", "settings") }
];

const stats = [
  { label: "当前索引", value: "v007950", tone: "success" as Tone },
  { label: "活跃剪辑", value: "18/50", tone: "success" as Tone },
  { label: "预处理", value: "运行中", tone: "processing" as Tone }
];

export function AdminSurface({ page }: { page: string }) {
  return (
    <AppShell title="MixLab Admin" subtitle="公共素材库生产" navItems={navItems} activeKey={page} stats={stats} user={{ name: "Admin", meta: "本机 Web" }}>
      <div className="mf-surface">
        {renderAdminPage(page)}
      </div>
    </AppShell>
  );
}

function renderAdminPage(page: string) {
  if (page === "source-videos") return <SourceVideosPage />;
  if (page === "source-detail") return <SourceDetailPage />;
  if (page === "preprocess-jobs") return <PreprocessPage />;
  if (page === "index-publish") return <IndexPublishPage />;
  if (page === "cutter-users") return <UsersPage />;
  if (page === "settings") return <SettingsPage />;
  return <DashboardPage />;
}

function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin / Dashboard"
        title="公共素材库仪表盘"
        description="查看索引、预处理和剪辑端可用性的关键状态。"
        actions={<Button tone="primary">重试失败视频</Button>}
      />
      <div className="mf-surface-scroll mf-admin-grid">
        <div className="mf-admin-main">
          <MetricGrid
            metrics={[
              { label: "可搜索总时长", value: "0h" },
              { label: "可用视频", value: "7950" },
              { label: "句子片段", value: "684,281" },
              { label: "失败任务", value: "2", tone: "warning" }
            ]}
          />
          <div className="mf-admin-panels">
            <WorkbenchCard>
              <div className="mf-section-title">
                <h2>下一步建议</h2>
                <StatusBadge tone="warning">待处理</StatusBadge>
              </div>
              <h3>有 2 个失败视频可重试</h3>
              <p className="mf-muted-text">单个视频失败不会阻塞其他队列。</p>
              <Button tone="primary">重试失败视频</Button>
            </WorkbenchCard>
            <WorkbenchCard>
              <div className="mf-section-title">
                <h2>核心链路健康</h2>
                <StatusBadge tone="success">可用</StatusBadge>
              </div>
              <div className="mf-admin-dashboard-status">
                {diagnostics.map((item) => (
                  <div className="mf-status-line" key={item.label}>
                    <strong>{item.label}</strong>
                    <StatusBadge tone={item.tone}>{item.value}</StatusBadge>
                  </div>
                ))}
              </div>
            </WorkbenchCard>
          </div>
          <WorkbenchCard>
            <div className="mf-section-title">
              <h2>预处理流水线</h2>
              <a href={routeTo("admin", "preprocess-jobs")}>查看队列</a>
            </div>
            <JobTable compact />
          </WorkbenchCard>
        </div>
        <InspectorPanel title="公共库摘要" meta="/Volumes/MixLab/PublicLibrary">
          <FieldList
            rows={[
              { label: "已发布版本", value: "v007950" },
              { label: "最近扫描", value: "2026-06-18 10:31" },
              { label: "刷新方式", value: "局部刷新" },
              { label: "索引状态", value: <StatusBadge tone="success">已发布</StatusBadge> }
            ]}
          />
        </InspectorPanel>
      </div>
    </>
  );
}

function SourceVideosPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin / Sources"
        title="原视频管理"
        description="管理公共素材库中可被剪辑端搜索和剪切的原视频。"
        actions={<SearchBox placeholder="搜索视频编号或标题" compact />}
      />
      <div className="mf-surface-scroll mf-admin-grid">
        <WorkbenchCard className="mf-admin-main">
          <Tabs
            activeKey="all"
            items={[
              { key: "all", label: "全部", count: sources.length, href: routeTo("admin", "source-videos") },
              { key: "published", label: "已发布", count: 3, href: routeTo("admin", "source-videos") },
              { key: "processing", label: "处理中", count: 1, href: routeTo("admin", "source-videos") }
            ]}
          />
          <DataTable<SourceFixture>
            rows={sources}
            getKey={(row) => row.id}
            selectedKey={selectedSource.id}
            columns={[
              { key: "id", title: "编号", width: "16%", render: (row) => <strong>{row.id}</strong> },
              { key: "title", title: "标题", width: "34%", render: (row) => row.title },
              { key: "duration", title: "时长", width: "14%", render: (row) => row.duration },
              { key: "words", title: "文案", width: "16%", render: (row) => `${row.words.toLocaleString()} 字` },
              { key: "status", title: "状态", width: "14%", render: (row) => <StatusBadge tone={sourceTone(row.status)}>{row.status}</StatusBadge> },
              { key: "action", title: "操作", width: "6%", render: () => <a href={routeTo("admin", "source-detail")}>详情</a> }
            ]}
          />
        </WorkbenchCard>
        <SourceInspector />
      </div>
    </>
  );
}

function SourceDetailPage() {
  return (
    <>
      <PageHeader eyebrow="Admin / Source Detail" title={selectedSource.title} description={`${selectedSource.id} · ${selectedSource.duration} · ${selectedSource.words.toLocaleString()} 字`} />
      <div className="mf-surface-scroll mf-admin-grid">
        <div className="mf-stack">
          <MediaCard title={selectedSource.title} meta={`${selectedSource.duration} · ${selectedSource.resolution} · ${selectedSource.codec}`} image={selectedSource.cover} selected />
          <WorkbenchCard>
            <div className="mf-section-title">
              <h2>视频文案</h2>
              <StatusBadge tone="success">已索引</StatusBadge>
            </div>
            <TranscriptPanel lines={selectedSource.transcript} selectedRange={[1, 1]} />
          </WorkbenchCard>
        </div>
        <SourceInspector />
      </div>
    </>
  );
}

function PreprocessPage() {
  return (
    <>
      <PageHeader eyebrow="Admin / Preprocess" title="预处理任务" description="跟踪公共素材库从扫描到可搜索的处理状态。" actions={<Button tone="primary">启动预处理</Button>} />
      <div className="mf-surface-scroll mf-admin-grid">
        <WorkbenchCard className="mf-admin-main">
          <JobTable />
        </WorkbenchCard>
        <InspectorPanel title="任务详情" meta="040A1022">
          <FieldList
            rows={[
              { label: "阶段", value: "生成封面与缩略图" },
              { label: "进度", value: "73%" },
              { label: "状态", value: <StatusBadge tone="processing">处理中</StatusBadge> },
              { label: "更新时间", value: "10:31" }
            ]}
          />
        </InspectorPanel>
      </div>
    </>
  );
}

function IndexPublishPage() {
  return (
    <>
      <PageHeader eyebrow="Admin / Index" title="索引发布" description="发布剪辑端搜索需要的最新索引版本。" actions={<Button tone="primary">发布索引</Button>} />
      <div className="mf-surface-scroll mf-admin-grid">
        <div className="mf-stack">
          {["扫描素材", "构建搜索索引", "校验源视频路径", "发布版本"].map((step, index) => (
            <WorkbenchCard key={step}>
              <div className="mf-section-title">
                <h2>{step}</h2>
                <StatusBadge tone={index < 3 ? "success" : "processing"}>{index < 3 ? "完成" : "就绪"}</StatusBadge>
              </div>
              <div className="mf-progress"><span style={{ width: `${index < 3 ? 100 : 78}%` }} /></div>
            </WorkbenchCard>
          ))}
        </div>
        <InspectorPanel title="发布摘要" meta="v007950">
          <FieldList
            rows={[
              { label: "可用素材", value: "7950" },
              { label: "文案片段", value: "684,281" },
              { label: "失败项", value: "2" },
              { label: "目标端", value: "Web / Windows" }
            ]}
          />
        </InspectorPanel>
      </div>
    </>
  );
}

function UsersPage() {
  return (
    <>
      <PageHeader eyebrow="Admin / Users" title="剪辑师账号" description="注册、审核和管理剪辑师登录账号。" actions={<Button tone="primary">新建账号</Button>} />
      <div className="mf-surface-scroll mf-admin-grid">
        <WorkbenchCard className="mf-admin-main">
          <DataTable<UserFixture>
            rows={users}
            getKey={(row) => row.id}
            selectedKey="U-001"
            columns={[
              { key: "name", title: "用户名", width: "24%", render: (row) => <strong>{row.name}</strong> },
              { key: "role", title: "角色", width: "18%", render: (row) => row.role },
              { key: "jobs", title: "任务", width: "16%", render: (row) => row.jobs },
              { key: "active", title: "最近活跃", width: "20%", render: (row) => row.lastActive },
              { key: "status", title: "状态", width: "22%", render: (row) => <StatusBadge tone={userTone(row.status)}>{row.status}</StatusBadge> }
            ]}
          />
        </WorkbenchCard>
        <InspectorPanel title="账号详情" meta="Allen">
          <FieldList
            rows={[
              { label: "登录模式", value: "用户名 / 密码" },
              { label: "任务数", value: "42" },
              { label: "状态", value: <StatusBadge tone="success">已启用</StatusBadge> },
              { label: "最近活跃", value: "刚刚" }
            ]}
          />
        </InspectorPanel>
      </div>
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Admin / Settings" title="系统设置" description="管理公共素材库、本机服务和系统诊断。" />
      <div className="mf-surface-scroll mf-admin-grid">
        <div className="mf-stack">
          <WorkbenchCard>
            <div className="mf-section-title"><h2>服务状态</h2><StatusBadge tone="success">可用</StatusBadge></div>
            <FieldList
              rows={[
                { label: "连接", value: "可用" },
                { label: "当前剪辑师", value: "18/50" },
                { label: "可用原素材", value: "7950" },
                { label: "本地素材数", value: "117" }
              ]}
            />
          </WorkbenchCard>
          <WorkbenchCard>
            <div className="mf-section-title"><h2>系统诊断</h2><Button tone="secondary">运行诊断</Button></div>
            <div className="mf-admin-dashboard-status">
              {diagnostics.map((item) => (
                <div className="mf-status-line" key={item.label}>
                  <strong>{item.label}</strong>
                  <StatusBadge tone={item.tone}>{item.value}</StatusBadge>
                </div>
              ))}
            </div>
          </WorkbenchCard>
        </div>
        <InspectorPanel title="环境检查" meta="本机 Web">
          <FieldList rows={diagnostics.map((item) => ({ label: item.label, value: <StatusBadge tone={item.tone}>{item.value}</StatusBadge> }))} />
        </InspectorPanel>
      </div>
    </>
  );
}

function JobTable({ compact = false }: { compact?: boolean }) {
  const rows = compact ? preprocessJobs.slice(0, 3) : preprocessJobs;
  return (
    <DataTable<PreprocessJobFixture>
      rows={rows}
      getKey={(row) => row.id}
      selectedKey="PJ-001"
      columns={[
        { key: "source", title: "来源", width: "18%", render: (row) => <strong>{row.source}</strong> },
        { key: "stage", title: "阶段", width: "38%", render: (row) => row.stage },
        { key: "progress", title: "进度", width: "22%", render: (row) => <div className="mf-progress"><span style={{ width: `${row.progress}%` }} /></div> },
        { key: "status", title: "状态", width: "14%", render: (row) => <StatusBadge tone={jobTone(row.status)}>{row.status}</StatusBadge> },
        { key: "updated", title: "更新", width: "8%", render: (row) => row.updatedAt }
      ]}
    />
  );
}

function SourceInspector() {
  return (
    <InspectorPanel title="原素材详情" meta={selectedSource.id} actions={<Button tone="secondary">打开目录</Button>}>
      <MediaCard title={selectedSource.title} meta={`${selectedSource.duration} · ${selectedSource.resolution}`} image={selectedSource.cover} />
      <FieldList
        rows={[
          { label: "状态", value: <StatusBadge tone={sourceTone(selectedSource.status)}>{selectedSource.status}</StatusBadge> },
          { label: "文案", value: `${selectedSource.words.toLocaleString()} 字` },
          { label: "命中", value: `${selectedSource.hits} 处` },
          { label: "编码", value: selectedSource.codec }
        ]}
      />
    </InspectorPanel>
  );
}

function sourceTone(status: SourceFixture["status"]): Tone {
  if (status === "已发布") return "success";
  if (status === "处理中") return "processing";
  if (status === "失败") return "danger";
  return "warning";
}

function jobTone(status: PreprocessJobFixture["status"]): Tone {
  if (status === "已完成") return "success";
  if (status === "处理中") return "processing";
  if (status === "失败") return "danger";
  return "warning";
}

function userTone(status: UserFixture["status"]): Tone {
  if (status === "已启用") return "success";
  if (status === "待审核") return "warning";
  return "neutral";
}

export function taskTone(status: CutTaskFixture["status"]): Tone {
  if (status === "已完成") return "success";
  if (status === "剪切中") return "processing";
  if (status === "失败") return "danger";
  return "warning";
}
