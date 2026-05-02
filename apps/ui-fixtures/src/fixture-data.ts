import type { GalleryItem, StatusTone } from "@mixlab/ui-foundation";

function cover(seed: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23f4f6f8"/><rect y="96" width="320" height="84" fill="%23${tint}"/><path d="M0 116h320v64H0z" fill="%231c2733" opacity=".22"/><path d="M28 114h24v-38h26v38h16V62h28v52h18V86h22v28h23V48h29v66h19V75h24v39h35v14H28z" fill="%23262f3a"/><circle cx="266" cy="48" r="24" fill="%23ffffff" opacity=".68"/><text x="18" y="164" font-family="Arial" font-size="19" fill="%23ffffff">${seed}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

export const cutterSources: GalleryItem[] = [
  {
    id: "P000042",
    title: "现金流管理与风险控制",
    image: cover("ML-01", "9bb8d6"),
    meta: "56:14 · 讲师 李明",
    tags: ["财务", "风险控制"],
    description: "现金流安全边界与经营节奏"
  },
  {
    id: "P000043",
    title: "利润增长的估价优化",
    image: cover("ML-02", "d8b16f"),
    meta: "01:12:09 · 讲师 孙悦",
    tags: ["利润", "模型"],
    description: "从毛利结构看企业增长"
  },
  {
    id: "P000044",
    title: "规模复制的组织方法",
    image: cover("ML-03", "86a98b"),
    meta: "47:39 · 讲师 周航",
    tags: ["组织", "流程"],
    description: "复制能力与团队边界"
  },
  {
    id: "P000045",
    title: "品牌定价与客户筛选",
    image: cover("ML-04", "b0a2cb"),
    meta: "31:46 · 讲师 林青",
    tags: ["品牌", "定价"],
    description: "价格锚点与客户质量"
  },
  {
    id: "P000046",
    title: "商业模式拆解实战",
    image: cover("ML-05", "9fb9be"),
    meta: "01:05:14 · 讲师 陈远",
    tags: ["商业模式"],
    description: "收入结构与关键假设"
  },
  {
    id: "P000047",
    title: "团队目标与绩效闭环",
    image: cover("ML-06", "c79f8d"),
    meta: "42:21 · 讲师 白屿",
    tags: ["团队", "绩效"],
    description: "目标拆分与反馈机制"
  }
];

export const transcriptLines = [
  ["00:00:00", "现金流是企业的生命线，现金流健康时现金边界不会被库存和应收款拖垮。"],
  ["00:00:26", "在企业经营中，现金储备不足则增长越快，风险暴露也越快。"],
  ["00:01:15", "经营安全线应该先于利润目标被定义，然后再讨论规模化扩张。"],
  ["00:02:18", "这段可以加入待剪清单，用于解释财务安全边界。"],
  ["00:11:37", "当周转效率提高后，预算节奏和销售节奏需要重新校准。"]
];

export const cutRows = [
  ["1", "现金流管理与风险控制", "00:02:18 - 00:11:37", "00:09:19", "现金安全线与预算节奏", "smart"],
  ["2", "利润增长的估价优化", "00:15:33 - 00:24:18", "00:08:45", "毛利结构如何影响估值", "smart"],
  ["3", "品牌定价与客户筛选", "00:18:07 - 00:27:55", "00:09:48", "客户质量决定复购效率", "precise"],
  ["4", "团队目标与绩效闭环", "00:06:05 - 00:15:02", "00:08:57", "目标拆分与反馈机制", "copy"]
];

export const localClips: GalleryItem[] = [
  {
    id: "LC000001",
    title: "现金安全线",
    image: cover("LC-01", "9bb8d6"),
    meta: "00:09:19 · 来自 P000042",
    tags: ["财务", "可复用"],
    description: "现金流风险说明片段"
  },
  {
    id: "LC000002",
    title: "利润结构优化",
    image: cover("LC-02", "d8b16f"),
    meta: "00:08:45 · 来自 P000043",
    tags: ["利润"],
    description: "估价模型中的利润变量"
  },
  {
    id: "LC000003",
    title: "客户筛选方法",
    image: cover("LC-03", "c79f8d"),
    meta: "00:06:31 · 来自 P000045",
    tags: ["客户", "复用"],
    description: "用于相似主题混剪"
  }
];

export const adminCounts = [
  ["Ready", "120", "对剪辑师可见"],
  ["Processing", "3", "处理中"],
  ["Queued", "28", "队列中"],
  ["Unprocessed", "465", "未处理"],
  ["Failed", "2", "失败可重试"],
  ["Index Required", "5", "待发布索引"]
];

export const adminSources = [
  ["P000043", "现金流课程片段.mp4", "处理中 65%", "否", "10:24:18"],
  ["P000042", "现金流管理与风险控制.mp4", "Ready", "是", "10:22:07"],
  ["P000041", "利润增长估价优化.mp4", "Ready", "是", "10:20:13"],
  ["P000039", "组织复制方法.mp4", "Index Required", "否", "10:16:44"],
  ["P000037", "客户筛选与品牌定价.mp4", "Failed", "否", "10:12:51"]
];

export const jobRows: Array<[StatusTone, string, string, string]> = [
  ["processing", "P000043", "build-keyframes 空间风帧", "65%"],
  ["queued", "P000044", "extract-audio 等待处理", "等待中"],
  ["ready", "P000042", "publish-ready 发布可用", "100%"],
  ["failed", "P000037", "ASR 返回错误", "重试"]
];

export const doctorRows: Array<[StatusTone, string, string, string]> = [
  ["ready", "公共路径", "公共素材库可访问，子目录完整", "通过"],
  ["ready", "Manifest", "manifest.json 与 source-video.json 有效", "通过"],
  ["warning", "视频产物", "有 5 个视频缺少可视化产物", "警告"],
  ["ready", "FFmpeg", "bundled ffmpeg 可用", "通过"],
  ["ready", "ASR", "DashScope key 已配置且未暴露", "通过"],
  ["warning", "状态计数", "index-required 与 ready 边界需发布", "警告"]
];
