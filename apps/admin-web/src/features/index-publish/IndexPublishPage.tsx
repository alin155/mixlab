import {
  GroupedForm,
  InspectorPanel,
  SourceTable
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { validationStatusLabel } from "../../app/chinese.ts";
import { AdminControlButton, AdminPageHeader, IndexTable, MetricBand } from "../shared.tsx";

export function IndexPublishPage({
  data,
  onRepairIndex,
  onPublishSourceVideo,
  onRunDoctor
}: {
  data: AdminDashboardData;
  onRepairIndex?: () => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
  onRunDoctor?: () => void;
}) {
  const current = data.indexes.versions.find((version) => version.is_current);
  const indexRequiredVideos = data.source_videos.filter(
    (video) => video.preprocess_status === "index-required"
  );

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="索引与发布"
          eyebrow="保证已可用视频可搜索"
        />
        <MetricBand
          items={[
            { label: "当前索引", value: data.indexes.current_version, caption: "当前搜索索引指针" },
            { label: "已可用数量", value: current?.ready_video_count ?? 0, caption: "当前索引中可搜索视频" },
            { label: "待发布索引", value: data.status.index_required_video_count, caption: "发布后可见" }
          ]}
        />
        <section className="admin-action-row">
          <AdminControlButton label="发布待索引视频" state="m9b-api" reason="M9B 接入索引修复接口。" variant="primary" onClick={onRepairIndex} />
          <AdminControlButton label="校验索引" state="m9b-api" reason="M9B 接入健康诊断和索引校验。" onClick={onRunDoctor} />
        </section>
        <section className="admin-list-section">
          <header className="admin-section-header">
            <h2>待发布视频清单</h2>
            <p>发布前会自动生成封面和关键帧；发布成功后剪辑端才可搜索和进入详情。</p>
          </header>
          {indexRequiredVideos.length ? (
            <SourceTable
              columns={["ID", "文件名", "状态", "可见性", "操作"]}
              rows={indexRequiredVideos.map((video) => [
                video.source_video_id,
                video.file_name,
                "待发布索引",
                video.visible_to_cutters ? "已可见" : "未可见",
                <AdminControlButton
                  label="发布此视频"
                  state="m9b-api"
                  reason="只发布这一条待索引视频，发布前会补齐封面和关键帧。"
                  onClick={() => onPublishSourceVideo?.(video.source_video_id)}
                  key={`${video.source_video_id}-publish`}
                />
              ])}
            />
          ) : (
            <p className="admin-note">没有待发布索引的视频。</p>
          )}
        </section>
        <IndexTable versions={data.indexes.versions} />
      </div>
      <InspectorPanel title="版本详情">
        <GroupedForm
          groups={[
            {
              title: current?.index_version ?? "current",
              rows: [
                { label: "当前索引", value: data.indexes.current_version },
                { label: "已可用数量", value: current?.ready_video_count ?? 0 },
                { label: "协议版本", value: current?.schema_version ?? "-" },
                { label: "校验", value: current ? validationStatusLabel(current.validation_status) : "需处理" },
                { label: "发布人", value: current?.published_by ?? "-" }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
