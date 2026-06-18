import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Progress,
  Result,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Timeline,
  Typography,
  type TableColumnsType
} from "antd";
import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SlidersOutlined,
  TeamOutlined,
  VideoCameraOutlined
} from "@ant-design/icons";
import { useState } from "react";
import {
  cutTasks,
  cutterUsers,
  diagnostics,
  preprocessJobs,
  projects,
  sources,
  type CutTaskFixture,
  type CutterUserFixture,
  type PreprocessJobFixture,
  type ProjectFixture,
  type SourceFixture,
  type SurfaceKey
} from "../domain/fixtures.ts";
import { setHash } from "../app/routing.ts";

const { Title, Text } = Typography;

type AdminPageKey =
  | "dashboard"
  | "source-videos"
  | "source-detail"
  | "preprocess-jobs"
  | "index-publish"
  | "doctor"
  | "cutter-users"
  | "settings";
type CutterPageKey =
  | "project-home"
  | "material-locator"
  | "cut-tasks"
  | "local-library"
  | "public-library"
  | "source-detail"
  | "cache-management"
  | "settings";
type DesktopPageKey = "first-run" | "project-home" | "material-locator" | "cut-tasks";

type PageOption<Key extends string> = {
  key: Key;
  label: string;
  icon: React.ReactNode;
};

function statusColor(status: string) {
  if (status.includes("失败") || status.includes("停用")) return "error";
  if (status.includes("处理") || status.includes("剪切中")) return "processing";
  if (status.includes("等待") || status.includes("待审核")) return "warning";
  return "success";
}

function statusTag(status: string) {
  return <Tag color={statusColor(status)}>{status}</Tag>;
}

function GlobalSwitch({ active }: { active: SurfaceKey }) {
  const items: Array<{ key: SurfaceKey; label: string; icon: React.ReactNode }> = [
    { key: "comparison", label: "总览", icon: <AppstoreOutlined /> },
    { key: "admin", label: "管理端", icon: <ApiOutlined /> },
    { key: "cutter-web", label: "Web 剪辑端", icon: <PlayCircleOutlined /> },
    { key: "cutter-desktop", label: "桌面预览", icon: <DesktopOutlined /> }
  ];

  return (
    <div className="zero-global-switch">
      {items.map((item) => (
        <button
          className={item.key === active ? "zero-global-item is-active" : "zero-global-item"}
          key={item.key}
          type="button"
          onClick={() => {
            if (item.key === "admin") setHash("admin", "dashboard");
            else if (item.key === "cutter-web") setHash("cutter-web", "project-home");
            else if (item.key === "cutter-desktop") setHash("cutter-desktop", "first-run");
            else setHash("comparison");
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function ZeroBrand({ eyebrow = "UI Lab" }: { eyebrow?: string }) {
  return (
    <div className="zero-brand">
      <div className="zero-logo">ML</div>
      <div>
        <Text strong>MixLab</Text>
        <Text type="secondary">{eyebrow}</Text>
      </div>
    </div>
  );
}

function SurfaceFrame<Key extends string>({
  activeSurface,
  title,
  subtitle,
  activePage,
  pages,
  onPageChange,
  context,
  children,
  desktop = false
}: {
  activeSurface: SurfaceKey;
  title: string;
  subtitle: string;
  activePage: Key;
  pages: Array<PageOption<Key>>;
  onPageChange: (key: Key) => void;
  context?: React.ReactNode;
  children: React.ReactNode;
  desktop?: boolean;
}) {
  return (
    <div className={desktop ? "zero-surface is-desktop" : "zero-surface"}>
      <header className="zero-global-bar">
        <ZeroBrand />
        <GlobalSwitch active={activeSurface} />
        <Tag color="blue">预览模式</Tag>
      </header>
      <main className="zero-workspace">
        <section className="zero-workbench">
          <div className="zero-workbench-header">
            <div>
              <Text type="secondary">{subtitle}</Text>
              <Title level={1}>{title}</Title>
            </div>
            <Segmented
              className="zero-page-switch"
              value={activePage}
              onChange={(value) => onPageChange(value as Key)}
              options={pages.map((page) => ({
                value: page.key,
                label: (
                  <span className="zero-page-option">
                    {page.icon}
                    <span>{page.label}</span>
                  </span>
                )
              }))}
            />
          </div>
          {context ? <div className="zero-context-strip">{context}</div> : null}
          <div className="zero-page-canvas">{children}</div>
        </section>
      </main>
    </div>
  );
}

function PageIntent({
  label,
  title,
  extra
}: {
  label: string;
  title: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="zero-page-intent">
      <div>
        <Text type="secondary">{label}</Text>
        <Title level={2}>{title}</Title>
      </div>
      {extra ? <div className="zero-page-intent-extra">{extra}</div> : null}
    </div>
  );
}

function SignalCard({
  icon,
  label,
  value,
  detail,
  tone = "blue"
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: "blue" | "green" | "orange" | "red" | "purple";
}) {
  return (
    <Card className={`zero-signal zero-${tone}`}>
      <Space align="start" size={14}>
        <div className="zero-signal-icon">{icon}</div>
        <div>
          <Text type="secondary">{label}</Text>
          <div className="zero-signal-value">{value}</div>
          <Text type="secondary">{detail}</Text>
        </div>
      </Space>
    </Card>
  );
}

function MediaBlock({ item, height = 170 }: { item: { cover: string; title?: string; name?: string }; height?: number }) {
  return (
    <div className="zero-media" style={{ background: item.cover, minHeight: height }}>
      <div>
        <span>{item.title ?? item.name}</span>
      </div>
    </div>
  );
}

function TranscriptBlock({ source, query = "第一场" }: { source: SourceFixture; query?: string }) {
  return (
    <div className="zero-transcript">
      {source.transcript.map((line, index) => {
        const hit = query && line.includes(query);
        return (
          <button className={hit ? "zero-transcript-row has-hit" : "zero-transcript-row"} key={`${source.id}-${index}`} type="button">
            <span className="zero-time">{`0${index}:0${index * 7 + 2}`}</span>
            <span className="zero-sentence">
              {hit ? (
                <>
                  {line.split(query)[0]}
                  <mark>{query}</mark>
                  {line.split(query).slice(1).join(query)}
                </>
              ) : line}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ComparisonHome() {
  return (
    <div className="zero-comparison">
      <header className="zero-global-bar">
        <ZeroBrand />
        <GlobalSwitch active="comparison" />
        <Tag color="blue">zero-base redesign</Tag>
      </header>
      <main className="zero-comparison-main">
        <section className="zero-hero">
          <Text type="secondary">MixLab / Ant Design</Text>
          <Title>三端 UI 对比工作台</Title>
          <Space wrap>
            <Button type="primary" size="large" onClick={() => setHash("cutter-web", "material-locator")}>
              先看素材搜索 <ArrowRightOutlined />
            </Button>
            <Button size="large" onClick={() => setHash("admin", "dashboard")}>看管理端</Button>
            <Button size="large" onClick={() => setHash("cutter-desktop", "first-run")}>看桌面壳</Button>
          </Space>
        </section>
        <Row gutter={[18, 18]}>
          <Col xs={24} lg={8}>
            <Card className="zero-decision-card">
              <ApiOutlined />
              <Title level={3}>管理端：运营控制台</Title>
              <Text>素材、索引、预处理、账号和诊断。</Text>
              <Divider />
              <Progress percent={88} />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card className="zero-decision-card">
              <SearchOutlined />
              <Title level={3}>Web 剪辑端：搜索工作流</Title>
              <Text>项目、搜索、文案、剪切和缓存。</Text>
              <Divider />
              <Progress percent={76} />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card className="zero-decision-card">
              <DesktopOutlined />
              <Title level={3}>桌面端：固定工具台</Title>
              <Text>首启、运行状态、本机服务和剪切任务。</Text>
              <Divider />
              <Progress percent={68} />
            </Card>
          </Col>
        </Row>
        <Card className="zero-manifesto" title="页面入口">
          <Row gutter={[16, 16]}>
            {[
              ["管理端", "8 个页面"],
              ["Web 剪辑端", "8 个页面"],
              ["桌面预览", "4 个页面"],
              ["截图", "10 张验收图"]
            ].map(([title, body]) => (
              <Col xs={24} md={12} xl={6} key={title}>
                <div className="zero-principle">
                  <Text strong>{title}</Text>
                  <Text type="secondary">{body}</Text>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      </main>
    </div>
  );
}

function AdminContext() {
  return (
    <>
      <Badge status="success" text="公共素材库可读" />
      <Badge status="success" text="searchd v007950" />
      <Badge status="processing" text="预处理队列 1 个进行中" />
      <Badge status="warning" text="260 个失败可重试" />
    </>
  );
}

function AdminDashboard() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Mission Control"
        title="先判断今天最需要处理什么"
        extra={<Button icon={<ReloadOutlined />}>刷新状态</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={6}>
          <SignalCard icon={<DatabaseOutlined />} label="可搜索素材" value="7,950" detail="当前发布索引" />
        </Col>
        <Col xs={24} xl={6}>
          <SignalCard icon={<FileSearchOutlined />} label="搜索索引" value="v007950" detail="p95 55ms" tone="green" />
        </Col>
        <Col xs={24} xl={6}>
          <SignalCard icon={<CloudServerOutlined />} label="缓存预热" value="27.6GB" detail="3 条源视频" tone="purple" />
        </Col>
        <Col xs={24} xl={6}>
          <SignalCard icon={<ExperimentOutlined />} label="失败处理" value="260" detail="可批量重试" tone="orange" />
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="今日工作流" className="zero-panel">
            <div className="zero-admin-flow">
              {[
                ["采集", "7950 条已发布", 100, "green"],
                ["预处理", "1 个进行中", 73, "blue"],
                ["索引", "v007950 可用", 100, "green"],
                ["剪辑端", "18/50 在线", 36, "orange"]
              ].map(([name, detail, percent, tone]) => (
                <div className={`zero-flow-node zero-${tone}`} key={name}>
                  <Text strong>{name}</Text>
                  <Progress percent={Number(percent)} showInfo={false} />
                  <Text type="secondary">{detail}</Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="待处理事项" className="zero-panel">
            <Alert
              showIcon
              type="warning"
              title="有 260 个失败视频可重试"
              description="失败队列已隔离，其他素材可继续搜索。"
              action={<Button type="primary">重试失败视频</Button>}
            />
            <Divider />
            <Timeline
              items={[
                { color: "blue", content: "确认 NAS 素材库可读" },
                { color: "green", content: "发布搜索索引到剪辑端" },
                { color: "orange", content: "失败视频进入重试队列" }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function AdminSources() {
  const [selected, setSelected] = useState<SourceFixture>(sources[0]);
  const grouped = {
    已发布: sources.filter((item) => item.status === "已发布"),
    处理中: sources.filter((item) => item.status === "处理中"),
    失败: sources.filter((item) => item.status === "失败"),
    待处理: sources.filter((item) => item.status === "待处理")
  };

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Source Triage"
        title="原视频资产"
        extra={<Input.Search className="zero-command-input" placeholder="搜索编号、标题、异常原因" enterButton="查找" />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <div className="zero-lane-board">
            {Object.entries(grouped).map(([status, items]) => (
              <Card className="zero-lane" title={status} extra={<Badge count={items.length} />} key={status}>
                {items.length ? items.map((item) => (
                  <button
                    className={selected.id === item.id ? "zero-source-tile is-selected" : "zero-source-tile"}
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                  >
                    <MediaBlock item={item} height={118} />
                    <Space orientation="vertical" size={2}>
                      <Text strong>{item.title}</Text>
                      <Text type="secondary">{item.id} · {item.duration} · {item.words.toLocaleString()} 字</Text>
                    </Space>
                  </button>
                )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无素材" />}
              </Card>
            ))}
          </div>
        </Col>
        <Col xs={24} xl={7}>
          <SourceInspector selected={selected} admin />
        </Col>
      </Row>
    </Space>
  );
}

function SourceInspector({ selected, admin = false }: { selected: SourceFixture; admin?: boolean }) {
  return (
    <Card className="zero-inspector" title={admin ? "处理决策" : "素材上下文"}>
      <MediaBlock item={selected} height={160} />
      <Descriptions column={1} size="small" className="zero-description">
        <Descriptions.Item label="编号">{selected.id}</Descriptions.Item>
        <Descriptions.Item label="标题">{selected.title}</Descriptions.Item>
        <Descriptions.Item label="状态">{statusTag(selected.status)}</Descriptions.Item>
        <Descriptions.Item label="规格">{selected.duration} · {selected.resolution} · {selected.codec}</Descriptions.Item>
        <Descriptions.Item label="命中">{selected.hits} 处</Descriptions.Item>
      </Descriptions>
      <Space orientation="vertical" className="zero-full">
        {admin ? <Button type="primary" block>发布或重试</Button> : <Button type="primary" block>定位到文案</Button>}
        <Button block>查看完整详情</Button>
      </Space>
    </Card>
  );
}

function AdminSourceDetail() {
  const selected = sources[0];
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Source Dossier"
        title="一条原视频的完整档案"
        extra={<Space><Button>回到资产泳道</Button><Button type="primary">重新发布索引</Button></Space>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title="画面证据">
            <MediaBlock item={selected} height={260} />
            <Descriptions column={1} size="small" className="zero-description">
              <Descriptions.Item label="素材">{selected.title}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(selected.status)}</Descriptions.Item>
              <Descriptions.Item label="规格">{selected.duration} · {selected.resolution}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} xl={15}>
          <Card title="文案与索引证据">
            <TranscriptBlock source={selected} />
            <Divider />
            <Timeline
              items={[
                { color: "green", content: "ASR 文案已生成" },
                { color: "green", content: "搜索索引已发布到 v007950" },
                { color: "blue", content: "缩略图已进入 release cache" }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function AdminPreprocess() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Processing Pipeline"
        title="预处理队列"
        extra={<Space><Button>暂停队列</Button><Button type="primary">启动预处理</Button></Space>}
      />
      <Row gutter={[16, 16]}>
        {preprocessJobs.map((job) => (
          <Col xs={24} lg={12} xl={6} key={job.id}>
            <Card className="zero-process-card">
              <Space orientation="vertical" className="zero-full">
                <Flex justify="space-between" align="center">
                  <Text strong>{job.source}</Text>
                  {statusTag(job.status)}
                </Flex>
                <Title level={4}>{job.stage}</Title>
                <Progress percent={job.progress} status={job.status === "失败" ? "exception" : undefined} />
                <Text type="secondary">更新时间 {job.updatedAt}</Text>
                <Button block type={job.status === "失败" ? "primary" : "default"} disabled={job.status === "已完成"}>
                  {job.status === "失败" ? "修复并重试" : job.status === "已完成" ? "已完成" : "查看队列"}
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}

function AdminIndexPublish() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Release Cockpit"
        title="索引发布是一次受控 release"
        extra={<Button type="primary" icon={<CloudDownloadOutlined />}>发布新索引</Button>}
      />
      <Card className="zero-release-card">
        <Steps
          current={2}
          items={[
            { title: "校验素材", content: "7950 条可读" },
            { title: "生成索引", content: "catalog.sqlite / search-index" },
            { title: "同步剪辑端", content: "v007950 已发布" },
            { title: "首屏检查", content: "等待执行" }
          ]}
        />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <SignalCard icon={<DatabaseOutlined />} label="Release Cache" value="1.1GB" detail="随索引版本更新" tone="green" />
        </Col>
        <Col xs={24} xl={8}>
          <SignalCard icon={<FileDoneOutlined />} label="文案片段" value="684,281" detail="可搜索句段" />
        </Col>
        <Col xs={24} xl={8}>
          <SignalCard icon={<SafetyCertificateOutlined />} label="回滚版本" value="v007842" detail="保留上一个可用版本" tone="purple" />
        </Col>
      </Row>
    </Space>
  );
}

function AdminDoctor() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin System Map"
        title="系统地图"
        extra={<Space><Button>导出诊断</Button><Button type="primary">重新检查</Button></Space>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <div className="zero-diagnostic-map">
            {diagnostics.map((item, index) => (
              <Card className="zero-diagnostic-node" key={item.label}>
                <Badge status={item.status as "success" | "processing"} />
                <Title level={4}>{item.label}</Title>
                <Text type="secondary">{item.value}</Text>
                <span className="zero-node-index">{index + 1}</span>
              </Card>
            ))}
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <Result
            status="success"
            title="核心链路可用"
            subTitle="公共素材库、索引、本地工作区和剪切工具已通过。"
          />
        </Col>
      </Row>
    </Space>
  );
}

function AdminUsers() {
  const columns: TableColumnsType<CutterUserFixture> = [
    { title: "状态", dataIndex: "status", width: 100, render: statusTag },
    { title: "用户名", dataIndex: "name" },
    { title: "角色", dataIndex: "role", width: 100 },
    { title: "设备", dataIndex: "device" },
    { title: "任务", dataIndex: "jobs", width: 80 },
    { title: "最近活跃", dataIndex: "lastActive", width: 110 },
    {
      title: "动作",
      width: 170,
      render: (_, record) =>
        record.status === "待审核" ? (
          <Space><Button size="small" type="primary">通过</Button><Button size="small">拒绝</Button></Space>
        ) : <Button size="small">账号策略</Button>
    }
  ];

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Account Desk"
        title="用户名密码注册后的账号治理"
        extra={<Button type="primary">创建剪辑师账号</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card>
            <Table rowKey="id" columns={columns} dataSource={cutterUsers} pagination={false} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="注册策略">
            <Space orientation="vertical" className="zero-full">
              <Alert type="info" showIcon title="注册审核开启" description="新剪辑师账号需要管理员确认。" />
              <Segmented options={["开放注册", "管理员审核", "关闭注册"]} defaultValue="管理员审核" />
              <Button type="primary">保存策略</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function AdminSettings() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Admin Policy Center"
        title="设置页收纳系统诊断和策略"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="系统策略">
            <Collapse
              defaultActiveKey={["library", "account"]}
              items={[
                {
                  key: "library",
                  label: "素材库与索引",
                  children: (
                    <Form layout="vertical">
                      <Form.Item label="公共素材库根目录"><Input value="/Volumes/MixLab/PublicLibrary" readOnly /></Form.Item>
                      <Form.Item label="索引发布方式"><Segmented options={["手动确认", "自动发布", "仅诊断"]} defaultValue="手动确认" /></Form.Item>
                    </Form>
                  )
                },
                {
                  key: "account",
                  label: "账号与注册",
                  children: (
                    <Form layout="vertical">
                      <Form.Item label="剪辑师注册"><Segmented options={["管理员审核", "关闭注册"]} defaultValue="管理员审核" /></Form.Item>
                      <Form.Item label="登录会话"><Segmented options={["7 天", "30 天", "每次登录"]} defaultValue="30 天" /></Form.Item>
                    </Form>
                  )
                },
                {
                  key: "doctor",
                  label: "Doctor 诊断",
                  children: <Button icon={<SafetyCertificateOutlined />}>运行系统诊断</Button>
                }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <AdminDoctorSummary />
        </Col>
      </Row>
    </Space>
  );
}

function AdminDoctorSummary() {
  return (
    <Card title="当前环境">
      <Space orientation="vertical" className="zero-full">
        {diagnostics.map((item) => (
          <Flex justify="space-between" align="center" key={item.label}>
            <Text>{item.label}</Text>
            <Badge status={item.status as "success" | "processing"} text={item.value} />
          </Flex>
        ))}
      </Space>
    </Card>
  );
}

const adminPages: Array<PageOption<AdminPageKey>> = [
  { key: "dashboard", icon: <HomeOutlined />, label: "决策台" },
  { key: "source-videos", icon: <VideoCameraOutlined />, label: "资产泳道" },
  { key: "source-detail", icon: <FileSearchOutlined />, label: "素材档案" },
  { key: "preprocess-jobs", icon: <CloudServerOutlined />, label: "预处理" },
  { key: "index-publish", icon: <DatabaseOutlined />, label: "发布" },
  { key: "doctor", icon: <SafetyCertificateOutlined />, label: "系统地图" },
  { key: "cutter-users", icon: <TeamOutlined />, label: "账号" },
  { key: "settings", icon: <SettingOutlined />, label: "策略" }
];

export function AdminSurface({ page }: { page: string }) {
  const active = (page || "dashboard") as AdminPageKey;
  const pages: Record<AdminPageKey, React.ReactNode> = {
    dashboard: <AdminDashboard />,
    "source-videos": <AdminSources />,
    "source-detail": <AdminSourceDetail />,
    "preprocess-jobs": <AdminPreprocess />,
    "index-publish": <AdminIndexPublish />,
    doctor: <AdminDoctor />,
    "cutter-users": <AdminUsers />,
    settings: <AdminSettings />
  };

  return (
    <SurfaceFrame
      activeSurface="admin"
      title="管理端运营控制台"
      subtitle="管理控制台"
      activePage={adminPages.some((item) => item.key === active) ? active : "dashboard"}
      pages={adminPages}
      onPageChange={(key) => setHash("admin", key)}
      context={<AdminContext />}
    >
      {pages[active] ?? pages.dashboard}
    </SurfaceFrame>
  );
}

function CutterContext() {
  return (
    <>
      <Badge status="success" text="当前项目 6月4日-2" />
      <Badge status="success" text="公共 7950 / 本地 117" />
      <Badge status="processing" text="源视频缓存 27.6GB" />
      <Badge status="success" text="本机服务正常" />
    </>
  );
}

function ProjectHomePage() {
  const [selected, setSelected] = useState<ProjectFixture>(projects[0]);

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Cutter Start Desk"
        title="先选任务目标，再进入搜索"
        extra={<Space.Compact><Input placeholder="搜索项目或会议主题" /><Button type="primary">搜索</Button><Button>新建项目</Button></Space.Compact>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card className="zero-focus-project" title="当前工作项目">
            <MediaBlock item={selected} height={220} />
            <Title level={3}>{selected.name}</Title>
            <Text type="secondary">已剪 {selected.cuts} · 搜索 {selected.searches} · 待剪 {selected.pending}</Text>
            <Divider />
            <Space orientation="vertical" className="zero-full">
              <Button type="primary" block onClick={() => setHash("cutter-web", "material-locator")}>进入素材搜索</Button>
              <Button block icon={<FolderOpenOutlined />}>打开项目目录</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={16}>
          <div className="zero-project-wall">
            {projects.map((project) => (
              <button className={project.id === selected.id ? "zero-project-card is-selected" : "zero-project-card"} key={project.id} type="button" onClick={() => setSelected(project)}>
                <MediaBlock item={project} height={152} />
                <Flex justify="space-between" align="center">
                  <div>
                    <Text strong>{project.name}</Text>
                    <Text type="secondary">{project.date} · {project.owner}</Text>
                  </div>
                  <Tag color={project.pending > 0 ? "orange" : "green"}>{project.pending > 0 ? `待剪 ${project.pending}` : "已清空"}</Tag>
                </Flex>
              </button>
            ))}
          </div>
        </Col>
      </Row>
    </Space>
  );
}

function MaterialSearchPage() {
  const [selected, setSelected] = useState<SourceFixture>(sources[0]);
  const [query, setQuery] = useState("第一场");
  const [open, setOpen] = useState(false);
  const hitCount = sources.reduce((sum, source) => sum + source.hits, 0);

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Cutter Search Studio"
        title="素材搜索"
        extra={<Tag color="blue">命中 {hitCount} 处</Tag>}
      />
      <Card className="zero-search-command">
        <Input.Search
          size="large"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入关键词，或粘贴要找的爆款文案"
          enterButton="搜索素材"
        />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={7}>
          <Card className="zero-result-stream" title="候选素材流" extra={<Text type="secondary">{sources.length} 条</Text>}>
            {sources.map((source) => (
              <button
                className={source.id === selected.id ? "zero-result-card is-selected" : "zero-result-card"}
                key={source.id}
                type="button"
                onClick={() => setSelected(source)}
              >
                <MediaBlock item={source} height={112} />
                <Flex justify="space-between" align="start">
                  <div>
                    <Text strong>{source.title}</Text>
                    <Text type="secondary">{source.id} · {source.words.toLocaleString()} 字</Text>
                  </div>
                  <Tag color="blue">命中 {source.hits}</Tag>
                </Flex>
              </button>
            ))}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            className="zero-reading-stage"
            title="完整文案阅读"
            extra={<Space><Button>上一个命中</Button><Button>下一个命中</Button></Space>}
          >
            <TranscriptBlock source={selected} query={query} />
          </Card>
        </Col>
        <Col xs={24} xl={7}>
          <Space orientation="vertical" size={16} className="zero-full">
            <Card title="画面验证" className="zero-video-card">
              <MediaBlock item={selected} height={184} />
              <Text type="secondary">{selected.duration} · {selected.resolution}</Text>
            </Card>
            <Card title="剪切意图">
              <div className="zero-selection-copy">{selected.transcript.join(" ")}</div>
              <Button type="primary" block onClick={() => setOpen(true)}>剪切这段</Button>
            </Card>
            <RecentCutsCard />
          </Space>
        </Col>
      </Row>
      <Modal open={open} title="提交剪切任务" onCancel={() => setOpen(false)} onOk={() => setOpen(false)} okText="确认剪切">
        <Descriptions column={1}>
          <Descriptions.Item label="来源">{selected.id}</Descriptions.Item>
          <Descriptions.Item label="模式">极速剪切</Descriptions.Item>
          <Descriptions.Item label="完整选区">{selected.transcript.join(" ")}</Descriptions.Item>
        </Descriptions>
      </Modal>
    </Space>
  );
}

function RecentCutsCard() {
  return (
    <Card title="最近任务">
      <Space orientation="vertical" size={10} className="zero-full">
        {cutTasks.slice(0, 4).map((task) => (
          <Flex className="zero-recent-task" justify="space-between" align="center" key={task.id}>
            <Space>
              {statusTag(task.status)}
              <Text strong>{task.source}</Text>
            </Space>
            <Text type="secondary">{task.duration}</Text>
          </Flex>
        ))}
      </Space>
    </Card>
  );
}

function CutTasksPage() {
  const [selected, setSelected] = useState<CutTaskFixture>(cutTasks[0]);
  const lanes = ["失败", "剪切中", "等待中", "已完成"] as const;

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Cutter Job Monitor"
        title="任务按状态流转，不让失败淹没在表格里"
        extra={<Button icon={<FolderOpenOutlined />}>打开输出目录</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <div className="zero-task-lanes">
            {lanes.map((lane) => (
              <Card title={lane} extra={<Badge count={cutTasks.filter((task) => task.status === lane).length} />} key={lane}>
                <Space orientation="vertical" className="zero-full" size={10}>
                  {cutTasks.filter((task) => task.status === lane).map((task) => (
                    <button className={task.id === selected.id ? "zero-task-card is-selected" : "zero-task-card"} key={task.id} type="button" onClick={() => setSelected(task)}>
                      <Flex justify="space-between" align="center">
                        <Text strong>{task.source}</Text>
                        {statusTag(task.status)}
                      </Flex>
                      <Text type="secondary">{task.range} · {task.duration}</Text>
                      <Text ellipsis>{task.text}</Text>
                    </button>
                  ))}
                </Space>
              </Card>
            ))}
          </div>
        </Col>
        <Col xs={24} xl={7}>
          <Card title="当前任务处理">
            <Result
              status={selected.status === "失败" ? "error" : selected.status === "已完成" ? "success" : "info"}
              title={selected.status}
              subTitle={selected.issue}
            />
            <Descriptions column={1} size="small" className="zero-description">
              <Descriptions.Item label="来源">{selected.source}</Descriptions.Item>
              <Descriptions.Item label="时间段">{selected.range}</Descriptions.Item>
              <Descriptions.Item label="模式">{selected.mode}</Descriptions.Item>
            </Descriptions>
            <Button block type={selected.status === "失败" ? "primary" : "default"} icon={selected.status === "已完成" ? <CheckCircleOutlined /> : undefined}>
              {selected.status === "失败" ? "重新剪切" : selected.status === "已完成" ? "剪切成功" : "查看队列"}
            </Button>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function LibraryPage({ local }: { local: boolean }) {
  const [selected, setSelected] = useState<SourceFixture>(local ? sources[1] : sources[0]);
  const list = local ? sources.slice(0, 2) : sources;

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label={local ? "Cutter Local Asset Wall" : "Cutter Public Asset Wall"}
        title={local ? "项目本地素材墙" : "公共原素材墙"}
        extra={<Segmented options={["全部", "横版", "竖版", "最近使用"]} defaultValue="全部" />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <div className="zero-asset-wall">
            {list.map((item) => (
              <button className={item.id === selected.id ? "zero-asset-card is-selected" : "zero-asset-card"} key={item.id} type="button" onClick={() => setSelected(item)}>
                <MediaBlock item={item} height={180} />
                <Flex justify="space-between" align="center">
                  <div>
                    <Text strong>{item.title}</Text>
                    <Text type="secondary">{item.duration} · {item.words.toLocaleString()} 字</Text>
                  </div>
                  {statusTag(item.status)}
                </Flex>
              </button>
            ))}
          </div>
        </Col>
        <Col xs={24} xl={7}>
          <SourceInspector selected={selected} />
        </Col>
      </Row>
    </Space>
  );
}

function CutterSourceDetailPage() {
  const selected = sources[1];
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Cutter Source Dossier"
        title="剪辑师视角的原视频档案"
        extra={<Button type="primary">用此素材搜索</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="画面与可用性">
            <MediaBlock item={selected} height={300} />
            <Descriptions column={1} size="small" className="zero-description">
              <Descriptions.Item label="编号">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="规格">{selected.duration} · {selected.resolution}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(selected.status)}</Descriptions.Item>
              <Descriptions.Item label="命中">{selected.hits} 处</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="完整文案">
            <TranscriptBlock source={selected} query="赚钱" />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function CacheManagementPage() {
  const data = [
    { key: "release", name: "Release Cache", size: "1.1GB", content: "catalog.sqlite / search-index / thumbnails", policy: "跟随索引版本" },
    { key: "source", name: "Source Video Cache", size: "27.6GB", content: "3 条最近剪切原视频", policy: "按项目和最近使用 LRU" },
    { key: "temp", name: "Cut Temp", size: "0.4GB", content: "剪切中间文件", policy: "任务结束后清理" },
    { key: "ui", name: "界面缓存", size: "4KB", content: "偏好和会话 UI 状态", policy: "用户可手动清理" }
  ];
  const columns = [
    { title: "缓存类型", dataIndex: "name" },
    { title: "大小", dataIndex: "size" },
    { title: "内容", dataIndex: "content" },
    { title: "策略", dataIndex: "policy" },
    { title: "操作", render: () => <Button size="small">清理</Button> }
  ];

  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Cutter Cache Observatory"
        title="缓存管理"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}><SignalCard icon={<DatabaseOutlined />} label="Release Cache" value="1.1GB" detail="已就绪" tone="green" /></Col>
        <Col xs={24} lg={6}><SignalCard icon={<VideoCameraOutlined />} label="源视频缓存" value="27.6GB" detail="3 条素材" /></Col>
        <Col xs={24} lg={6}><SignalCard icon={<SlidersOutlined />} label="剪切临时区" value="0.4GB" detail="自动清理" tone="orange" /></Col>
        <Col xs={24} lg={6}><SignalCard icon={<SettingOutlined />} label="界面缓存" value="4KB" detail="偏好设置" tone="purple" /></Col>
      </Row>
      <Card>
        <Table columns={columns} dataSource={data} pagination={false} />
      </Card>
    </Space>
  );
}

function CutterSettingsPage() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Cutter Preference Center"
        title="偏好设置"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="剪辑偏好">
            <Form layout="vertical">
              <Form.Item label="本地工作区"><Input value="/Users/huaqihang/Movies/MixLabLocal" readOnly /></Form.Item>
              <Form.Item label="默认剪切模式"><Segmented options={["极速剪切", "精准剪切"]} defaultValue="极速剪切" /></Form.Item>
              <Form.Item label="显示密度"><Segmented options={["紧凑", "标准", "宽松"]} defaultValue="标准" /></Form.Item>
              <Button type="primary">保存偏好</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <AdminDoctorSummary />
        </Col>
      </Row>
    </Space>
  );
}

const cutterPages: Array<PageOption<CutterPageKey>> = [
  { key: "project-home", icon: <HomeOutlined />, label: "开工台" },
  { key: "material-locator", icon: <SearchOutlined />, label: "搜索流" },
  { key: "cut-tasks", icon: <SlidersOutlined />, label: "任务流" },
  { key: "local-library", icon: <FolderOpenOutlined />, label: "本地墙" },
  { key: "public-library", icon: <DatabaseOutlined />, label: "公共墙" },
  { key: "source-detail", icon: <FileSearchOutlined />, label: "素材档案" },
  { key: "cache-management", icon: <CloudServerOutlined />, label: "缓存" },
  { key: "settings", icon: <SettingOutlined />, label: "偏好" }
];

export function CutterSurface({ page }: { page: string }) {
  const normalizedPage = page === "material-search" ? "material-locator" : page;
  const active = (normalizedPage || "project-home") as CutterPageKey;
  const pageNodes: Record<CutterPageKey, React.ReactNode> = {
    "project-home": <ProjectHomePage />,
    "material-locator": <MaterialSearchPage />,
    "cut-tasks": <CutTasksPage />,
    "local-library": <LibraryPage local />,
    "public-library": <LibraryPage local={false} />,
    "source-detail": <CutterSourceDetailPage />,
    "cache-management": <CacheManagementPage />,
    settings: <CutterSettingsPage />
  };
  const safeActive = cutterPages.some((item) => item.key === active) ? active : "project-home";

  return (
    <SurfaceFrame
      activeSurface="cutter-web"
      title="Web 剪辑端创作工作台"
      subtitle="剪辑工作台"
      activePage={safeActive}
      pages={cutterPages}
      onPageChange={(key) => setHash("cutter-web", key)}
      context={<CutterContext />}
    >
      {pageNodes[safeActive]}
    </SurfaceFrame>
  );
}

function DesktopFirstRun() {
  return (
    <Space orientation="vertical" size={18} className="zero-stack">
      <PageIntent
        label="Desktop Runtime Gate"
        title="首启页只在运行条件未满足时出现"
        extra={<Button type="primary">运行 Doctor</Button>}
      />
      <Steps
        current={2}
        items={[
          { title: "公共素材库", content: "已选择并可读" },
          { title: "本地工作区", content: "已创建并可写" },
          { title: "Doctor 检查", content: "检查中" },
          { title: "本机引擎", content: "等待启动" }
        ]}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="运行检查">
            <Skeleton active paragraph={{ rows: 7 }} />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="诊断信息">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="应用版本">AntD Lab Desktop Preview</Descriptions.Item>
              <Descriptions.Item label="API">http://127.0.0.1:3789</Descriptions.Item>
              <Descriptions.Item label="本地工作区">%USERPROFILE%\Videos\MixLabLocal</Descriptions.Item>
              <Descriptions.Item label="FFmpeg">随安装包内置</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

const desktopPages: Array<PageOption<DesktopPageKey>> = [
  { key: "first-run", icon: <SafetyCertificateOutlined />, label: "运行闸门" },
  { key: "project-home", icon: <HomeOutlined />, label: "开工台" },
  { key: "material-locator", icon: <SearchOutlined />, label: "搜索流" },
  { key: "cut-tasks", icon: <SlidersOutlined />, label: "任务流" }
];

export function DesktopSurface({ page }: { page: string }) {
  const normalizedPage = page === "material-search" ? "material-locator" : page;
  const active = (normalizedPage || "first-run") as DesktopPageKey;
  const safeActive = desktopPages.some((item) => item.key === active) ? active : "first-run";
  const pageNodes: Record<DesktopPageKey, React.ReactNode> = {
    "first-run": <DesktopFirstRun />,
    "project-home": <ProjectHomePage />,
    "material-locator": <MaterialSearchPage />,
    "cut-tasks": <CutTasksPage />
  };

  return (
    <div className="zero-desktop-shell">
      <div className="zero-native-bar">
        <span>MixLab Cutter AntD Preview</span>
        <span>Fixed Windows Workbench</span>
      </div>
      <SurfaceFrame
        activeSurface="cutter-desktop"
        title="桌面剪辑端固定工具台"
        subtitle="Windows 工具台"
        activePage={safeActive}
        pages={desktopPages}
        onPageChange={(key) => setHash("cutter-desktop", key)}
        context={<CutterContext />}
        desktop
      >
        {pageNodes[safeActive]}
      </SurfaceFrame>
    </div>
  );
}
