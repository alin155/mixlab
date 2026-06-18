export type Tone = "neutral" | "success" | "warning" | "danger" | "processing" | "accent";

export interface ProjectFixture {
  id: string;
  name: string;
  date: string;
  owner: string;
  cuts: number;
  searches: number;
  pending: number;
  cover: string;
}

export interface SourceFixture {
  id: string;
  title: string;
  duration: string;
  words: number;
  hits: number;
  orientation: "横版" | "竖版";
  status: "已发布" | "待处理" | "处理中" | "失败";
  resolution: string;
  codec: string;
  cover: string;
  transcript: Array<{ time: string; text: string; hit?: boolean }>;
}

export interface CutTaskFixture {
  id: string;
  source: string;
  range: string;
  duration: string;
  text: string;
  status: "等待中" | "剪切中" | "失败" | "已完成";
  issue: string;
  mode: "极速剪切" | "精准剪切";
}

export interface PreprocessJobFixture {
  id: string;
  source: string;
  stage: string;
  progress: number;
  status: "等待中" | "处理中" | "失败" | "已完成";
  updatedAt: string;
}

export interface UserFixture {
  id: string;
  name: string;
  role: string;
  status: "待审核" | "已启用" | "已停用";
  jobs: number;
  lastActive: string;
}

const cover = (seed: string, accent: string) =>
  `linear-gradient(180deg, rgba(5, 10, 25, .08), rgba(5, 10, 25, .55)), linear-gradient(135deg, ${accent}, #7fb3ff 45%, #1d2b6e), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='520' height='292' viewBox='0 0 520 292'%3E%3Cpath d='M0 218c92-32 170-38 253-14 92 27 157 15 267-32v120H0z' fill='rgba(8,18,38,.38)'/%3E%3Ccircle cx='394' cy='78' r='62' fill='rgba(255,255,255,.18)'/%3E%3Crect x='46' y='46' width='164' height='16' rx='8' fill='rgba(255,255,255,.45)'/%3E%3Crect x='46' y='74' width='248' height='10' rx='5' fill='rgba(255,255,255,.28)'/%3E%3Ctext x='46' y='148' font-family='Arial' font-size='38' font-weight='700' fill='white'%3E${seed}%3C/text%3E%3C/svg%3E")`;

export const projects: ProjectFixture[] = [
  { id: "P-0604-2", name: "6月4日-2", date: "6月4日 23:50", owner: "Allen", cuts: 9, searches: 18, pending: 0, cover: cover("王牧笛", "#60a5fa") },
  { id: "P-0611-2", name: "6月11日-2", date: "6月11日 11:01", owner: "Allen", cuts: 0, searches: 2, pending: 4, cover: cover("C0035", "#8b5cf6") },
  { id: "P-0603", name: "6月3日-会议", date: "6月3日 19:20", owner: "Allen", cuts: 10, searches: 6, pending: 6, cover: cover("资产配置", "#14b8a6") },
  { id: "P-0604-1", name: "6月4日-1", date: "6月4日 18:12", owner: "Allen", cuts: 1, searches: 1, pending: 0, cover: cover("沈阳", "#22c55e") }
];

export const sources: SourceFixture[] = [
  {
    id: "C0629",
    title: "第一场公开课",
    duration: "31:19",
    words: 8232,
    hits: 2,
    orientation: "横版",
    status: "已发布",
    resolution: "1920x1080",
    codec: "H264",
    cover: cover("第一场", "#3b82f6"),
    transcript: [
      { time: "00:02", text: "感谢你们学习状态很有热情。", hit: false },
      { time: "00:05", text: "2026 年我跟陶老师我们的第一场公开课，我们一起携手走过了这么多地方。", hit: true },
      { time: "00:15", text: "那 2026 年开年就是大事不断，今天上午中国 A 股突破了 4100。", hit: false },
      { time: "00:26", text: "上一波是 2015 年，再上一波是 2007 年。", hit: false },
      { time: "00:37", text: "终于哈我们整整忍了十年来到了 4100 点。", hit: false },
      { time: "00:48", text: "美国闹什么呢？", hit: false },
      { time: "01:01", text: "中国网友非常愤怒，说这太太欺负人了。", hit: false },
      { time: "01:20", text: "中国、俄罗斯、美国、英国、法国，这五个国家四个在打仗呢。", hit: false }
    ]
  },
  {
    id: "C0482",
    title: "唯一读书和赚钱",
    duration: "30:32",
    words: 8757,
    hits: 3,
    orientation: "横版",
    status: "已发布",
    resolution: "1920x1080",
    codec: "H264",
    cover: cover("读书赚钱", "#6366f1"),
    transcript: [
      { time: "04:49", text: "2025 年是 2008 年 4 万亿之后又一个大放水之年。", hit: false },
      { time: "05:05", text: "我明年我明年第一场公开课是哪个城市啊？", hit: true },
      { time: "05:22", text: "作为企业来讲啊，尤其你们很多人是企业家。", hit: false },
      { time: "06:01", text: "这五种姿态分别是做大到做重、做到极轻、做到微。", hit: false },
      { time: "06:30", text: "因为你们所有的信息来源，除了抖音视频号和朋友圈，就是新闻联播。", hit: false }
    ]
  },
  {
    id: "040A1022",
    title: "资产置换与资产优化",
    duration: "30:23",
    words: 8351,
    hits: 1,
    orientation: "竖版",
    status: "处理中",
    resolution: "1080x1920",
    codec: "H265",
    cover: cover("资产优化", "#f59e0b"),
    transcript: [
      { time: "02:14", text: "资产置换不是简单买卖，而是找到新的确定性。", hit: false },
      { time: "03:02", text: "每一次配置都需要考虑周期、流动性和风险。", hit: false }
    ]
  },
  {
    id: "C0510",
    title: "现金流健康度",
    duration: "36:43",
    words: 11081,
    hits: 1,
    orientation: "横版",
    status: "已发布",
    resolution: "1920x1080",
    codec: "H264",
    cover: cover("现金流", "#10b981"),
    transcript: [
      { time: "00:00", text: "现金流是长期稳定的核心指标。", hit: false },
      { time: "00:11", text: "我们看一个项目，先看它能不能持续产生现金流。", hit: true },
      { time: "00:25", text: "这个段落适合剪成解释型内容。", hit: false }
    ]
  }
];

export const cutTasks: CutTaskFixture[] = [
  { id: "CJ-001", source: "C0629", range: "00:23 - 02:04", duration: "01:41", text: "第二点是资产配置，第三呢是现金流，最终判断要看周期。", status: "已完成", issue: "剪切成功", mode: "极速剪切" },
  { id: "CJ-002", source: "C0482", range: "01:37 - 06:09", duration: "04:32", text: "所以这是今天中国的真相，所以 2026 年这件事很重要。", status: "已完成", issue: "剪切成功", mode: "精准剪切" },
  { id: "CJ-003", source: "直播复盘", range: "11:58 - 12:38", duration: "00:40", text: "原因其实很简单，投放费用增加，源文件需要重新定位。", status: "失败", issue: "source video not found", mode: "极速剪切" },
  { id: "CJ-004", source: "C0510", range: "02:21 - 11:48", duration: "09:27", text: "现金流决定一个系统是否健康，剪辑时要保留完整上下文。", status: "剪切中", issue: "准备源素材", mode: "极速剪切" },
  { id: "CJ-005", source: "C0035", range: "04:18 - 04:19", duration: "00:01", text: "短句测试片段。", status: "等待中", issue: "等待本机队列", mode: "精准剪切" }
];

export const preprocessJobs: PreprocessJobFixture[] = [
  { id: "PJ-001", source: "040A1022", stage: "生成封面与缩略图", progress: 73, status: "处理中", updatedAt: "10:31" },
  { id: "PJ-002", source: "C0510", stage: "发布搜索索引", progress: 100, status: "已完成", updatedAt: "10:12" },
  { id: "PJ-003", source: "直播复盘", stage: "校验原视频路径", progress: 24, status: "失败", updatedAt: "09:45" },
  { id: "PJ-004", source: "C0629", stage: "等待 ASR 文案", progress: 0, status: "等待中", updatedAt: "09:22" }
];

export const users: UserFixture[] = [
  { id: "U-001", name: "Allen", role: "剪辑师", status: "已启用", jobs: 42, lastActive: "刚刚" },
  { id: "U-002", name: "Mia", role: "剪辑师", status: "待审核", jobs: 0, lastActive: "待审核" },
  { id: "U-003", name: "Kai", role: "剪辑师", status: "已停用", jobs: 19, lastActive: "2 天前" }
];

export const diagnostics = [
  { label: "公共素材库", value: "可读取 7950 条", tone: "success" as Tone },
  { label: "搜索索引", value: "v007950 / searchd 就绪", tone: "success" as Tone },
  { label: "本地工作区", value: "117 条本地素材", tone: "success" as Tone },
  { label: "剪切工具", value: "FFmpeg 可用", tone: "success" as Tone },
  { label: "源视频缓存", value: "27.6GB / 3 条", tone: "processing" as Tone }
];

export const currentProject = projects[0];
export const selectedSource = sources[0];
