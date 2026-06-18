export type SurfaceKey = "comparison" | "admin" | "cutter-web" | "cutter-desktop";

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
  transcript: string[];
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

export interface CutterUserFixture {
  id: string;
  name: string;
  role: string;
  status: "待审核" | "已启用" | "已停用";
  device: string;
  jobs: number;
  lastActive: string;
}

export interface PreprocessJobFixture {
  id: string;
  source: string;
  stage: string;
  progress: number;
  status: "等待中" | "处理中" | "失败" | "已完成";
  updatedAt: string;
}

const cover = (seed: string, accent: string) =>
  `linear-gradient(135deg, ${accent}, #1d39c4 52%, #061178), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'%3E%3Crect width='480' height='270' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='350' cy='70' r='72' fill='rgba(255,255,255,.16)'/%3E%3Crect x='52' y='54' width='150' height='22' rx='11' fill='rgba(255,255,255,.45)'/%3E%3Crect x='52' y='88' width='240' height='14' rx='7' fill='rgba(255,255,255,.24)'/%3E%3Cpath d='M126 230c18-70 72-116 139-116 66 0 121 46 139 116' fill='rgba(0,0,0,.24)'/%3E%3Ctext x='52' y='150' font-family='Arial' font-size='34' font-weight='700' fill='white'%3E${seed}%3C/text%3E%3C/svg%3E")`;

export const projects: ProjectFixture[] = [
  { id: "P-0604-2", name: "6月4日-2", date: "6月4日 23:50", owner: "Allen", cuts: 9, searches: 18, pending: 0, cover: cover("王牧笛", "#69b1ff") },
  { id: "P-0611-2", name: "6月11日-2", date: "6月11日 11:01", owner: "Allen", cuts: 0, searches: 2, pending: 4, cover: cover("C0035", "#9254de") },
  { id: "P-0603", name: "6月3日-会议", date: "6月3日 19:20", owner: "Allen", cuts: 10, searches: 6, pending: 6, cover: cover("资产配置", "#13c2c2") },
  { id: "P-0604-1", name: "6月4日-1", date: "6月4日 18:12", owner: "Allen", cuts: 1, searches: 1, pending: 0, cover: cover("沈阳", "#36cfc9") }
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
    cover: cover("第一场", "#40a9ff"),
    transcript: [
      "2026 年我跟陶老师我们的第一场公开课，我们一起携手走过了这么多地方。",
      "我知道很多用户会担心风险，所以系统需要把信息讲清楚。",
      "第一点是资产配置，第二点是现金流，第三点是长期稳定性。",
      "所以这段文案适合用于项目开场，也适合快速剪成短视频。"
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
    cover: cover("读书赚钱", "#597ef7"),
    transcript: [
      "唯一读书和赚钱，才是一个人最好的修行。",
      "我每年都会做一场复盘，把重要的事情重新梳理一遍。",
      "这个片段适合做观点型短视频，节奏要紧凑。"
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
    cover: cover("资产优化", "#faad14"),
    transcript: [
      "资产置换不是简单买卖，而是找到新的确定性。",
      "每一次配置都需要考虑周期、流动性和风险。"
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
    cover: cover("现金流", "#52c41a"),
    transcript: [
      "现金流是长期稳定的核心指标。",
      "我们看一个项目，先看它能不能持续产生现金流。",
      "这个段落适合剪成解释型内容。"
    ]
  }
];

export const cutTasks: CutTaskFixture[] = [
  { id: "CJ-001", source: "C0629", range: "00:23 - 02:04", duration: "01:41", text: "第二点是资产配置，第三呢是现金流...", status: "已完成", issue: "剪切成功", mode: "极速剪切" },
  { id: "CJ-002", source: "C0482", range: "01:37 - 06:09", duration: "04:32", text: "所以这是今天中国的真相，所以20...", status: "已完成", issue: "剪切成功", mode: "精准剪切" },
  { id: "CJ-003", source: "直播复盘", range: "11:58 - 12:38", duration: "00:40", text: "原因其实很简单，投放费用增加...", status: "失败", issue: "source video not found", mode: "极速剪切" },
  { id: "CJ-004", source: "C0510", range: "02:21 - 11:48", duration: "09:27", text: "现金流决定一个系统是否健康...", status: "剪切中", issue: "准备源素材", mode: "极速剪切" },
  { id: "CJ-005", source: "C0035", range: "04:18 - 04:19", duration: "00:01", text: "短句测试片段", status: "等待中", issue: "等待本机队列", mode: "精准剪切" }
];

export const cutterUsers: CutterUserFixture[] = [
  { id: "U-001", name: "Allen", role: "剪辑师", status: "已启用", device: "Windows-ASUS", jobs: 42, lastActive: "刚刚" },
  { id: "U-002", name: "Mia", role: "剪辑师", status: "待审核", device: "Windows-Laptop", jobs: 0, lastActive: "待审核" },
  { id: "U-003", name: "Kai", role: "剪辑师", status: "已停用", device: "Windows-Office", jobs: 19, lastActive: "2 天前" }
];

export const preprocessJobs: PreprocessJobFixture[] = [
  { id: "PJ-001", source: "040A1022", stage: "生成封面与缩略图", progress: 73, status: "处理中", updatedAt: "10:31" },
  { id: "PJ-002", source: "C0510", stage: "发布搜索索引", progress: 100, status: "已完成", updatedAt: "10:12" },
  { id: "PJ-003", source: "直播复盘", stage: "校验原视频路径", progress: 24, status: "失败", updatedAt: "09:45" },
  { id: "PJ-004", source: "C0629", stage: "等待 ASR 文案", progress: 0, status: "等待中", updatedAt: "09:22" }
];

export const diagnostics = [
  { label: "公共素材库", value: "可读取 7950 条", status: "success" },
  { label: "搜索索引", value: "v007950 / searchd 就绪", status: "success" },
  { label: "本地工作区", value: "117 条本地素材", status: "success" },
  { label: "剪切工具", value: "FFmpeg 可用", status: "success" },
  { label: "源视频缓存", value: "27.6GB / 3 条", status: "processing" }
];
