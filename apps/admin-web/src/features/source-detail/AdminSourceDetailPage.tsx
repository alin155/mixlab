import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminSourceVideoDetail } from "../../api.ts";
import {
  booleanLabel,
  chineseDiagnosticText,
  jobStageLabel,
  preprocessStatusLabel
} from "../../app/chinese.ts";
import {
  formatAdminDuration,
  formatAdminFileSize
} from "../../app/view-model.ts";
import { AdminPageHeader } from "../shared.tsx";

function textOrEmpty(value: string, emptyLabel = "未记录"): string {
  return value.trim() ? value : emptyLabel;
}

function artifactRows(
  label: string,
  artifact: { path: string; file_path: string; exists: boolean }
): Array<{ label: string; value: string }> {
  return [
    { label: `${label}状态`, value: booleanLabel(artifact.exists) },
    { label: `${label}便携路径`, value: textOrEmpty(artifact.path) },
    { label: `${label}文件系统路径`, value: textOrEmpty(artifact.file_path) }
  ];
}

export function AdminSourceDetailPage({ detail }: { detail: AdminSourceVideoDetail }) {
  const video = detail.source_video;
  const transcriptText = detail.transcript.full_text.trim() || "暂无完整文案";
  const tags = video.tags.length ? video.tags.join(" / ") : "未设置";

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="原视频详情" eyebrow="预处理全量数据" />
        {video.cover_url ? (
          <img className="admin-inspector-cover" src={video.cover_url} alt="" />
        ) : null}
        <GroupedForm
          groups={[
            {
              title: "基本信息",
              rows: [
                { label: "原视频编号", value: video.source_video_id },
                { label: "标题", value: textOrEmpty(video.title) },
                { label: "文件名", value: video.file_name },
                { label: "相对路径", value: detail.technical.relative_path },
                { label: "更新时间", value: video.updated_at }
              ]
            },
            {
              title: "技术信息",
              rows: [
                { label: "时长", value: formatAdminDuration(detail.technical.duration_ms) },
                { label: "分辨率", value: `${detail.technical.width} × ${detail.technical.height}` },
                { label: "帧率", value: `${detail.technical.fps}` },
                { label: "编码", value: textOrEmpty(detail.technical.codec) },
                { label: "文件大小", value: formatAdminFileSize(detail.technical.file_size) },
                { label: "内容哈希", value: textOrEmpty(detail.technical.content_hash) }
              ]
            },
            {
              title: "预处理状态",
              rows: [
                { label: "状态", value: preprocessStatusLabel(detail.preprocess.status) },
                { label: "当前阶段", value: jobStageLabel(detail.preprocess.stage) },
                { label: "任务编号", value: textOrEmpty(detail.preprocess.job_id) },
                { label: "尝试次数", value: `${detail.preprocess.attempt}` },
                { label: "开始时间", value: textOrEmpty(detail.preprocess.started_at) },
                { label: "完成时间", value: textOrEmpty(detail.preprocess.completed_at) },
                { label: "失败时间", value: textOrEmpty(detail.preprocess.failed_at) },
                { label: "失败阶段", value: textOrEmpty(jobStageLabel(detail.preprocess.error_stage)) },
                {
                  label: "失败原因",
                  value: detail.preprocess.error_message
                    ? chineseDiagnosticText(detail.preprocess.error_message)
                    : "无"
                }
              ]
            },
            {
              title: "产物完整性",
              rows: [
                ...artifactRows("文案产物", detail.artifacts.transcript),
                ...artifactRows("字幕产物", detail.artifacts.subtitles),
                ...artifactRows("封面产物", detail.artifacts.cover),
                ...artifactRows("关键帧产物", detail.artifacts.keyframes),
                { label: "索引版本", value: textOrEmpty(detail.artifacts.index_version) }
              ]
            },
            {
              title: "文案数据",
              rows: [
                { label: "完整文案", value: transcriptText },
                { label: "分段数量", value: `${detail.transcript.segment_count}` },
                { label: "字符数量", value: `${detail.transcript.character_count}` }
              ]
            },
            {
              title: "视觉数据",
              rows: [
                { label: "封面地址", value: textOrEmpty(video.cover_url) },
                { label: "封面文件", value: textOrEmpty(detail.artifacts.cover.file_path) },
                { label: "关键帧文件", value: textOrEmpty(detail.artifacts.keyframes.file_path) }
              ]
            },
            {
              title: "公开元数据",
              rows: [
                { label: "公开标题", value: textOrEmpty(video.title) },
                { label: "标签", value: tags },
                { label: "说明", value: textOrEmpty(video.description) },
                { label: "讲师", value: textOrEmpty(video.lecturer) },
                { label: "课程", value: textOrEmpty(video.course) },
                { label: "分类", value: textOrEmpty(video.category) },
                { label: "可见原因", value: textOrEmpty(detail.visibility.reason, "已满足剪辑师可见条件") }
              ]
            }
          ]}
        />
      </div>
      <InspectorPanel title="剪辑师可见状态">
        <GroupedForm
          groups={[
            {
              title: "剪辑师可见",
              rows: [
                { label: "对剪辑师可见", value: booleanLabel(detail.visibility.visible_to_cutters) },
                { label: "状态说明", value: detail.visibility.label },
                { label: "原因", value: textOrEmpty(detail.visibility.reason, "已满足剪辑师可见条件") },
                { label: "公开说明", value: textOrEmpty(video.description) },
                { label: "标签", value: tags }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
