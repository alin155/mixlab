import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { AdminControlButton, AdminPageHeader, IndexTable, MetricBand } from "../shared.tsx";

export function IndexPublishPage({ data }: { data: AdminDashboardData }) {
  const current = data.indexes.versions.find((version) => version.is_current);

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="索引健康与修复"
          eyebrow="保证 ready 视频可搜索"
        />
        <MetricBand
          items={[
            { label: "current.json", value: data.indexes.current_version, caption: "当前搜索索引指针" },
            { label: "Ready 数量", value: current?.ready_video_count ?? 0, caption: "current 中可搜索视频" },
            { label: "Index Required", value: data.status.index_required_video_count, caption: "待修复后可见" }
          ]}
        />
        <section className="admin-action-row">
          <AdminControlButton label="修复 index-required" state="m9b-api" reason="M9B 接入索引修复接口。" variant="primary" />
          <AdminControlButton label="校验索引" state="m9b-api" reason="M9B 接入 Doctor/索引校验。" />
          <AdminControlButton label="原子切换 current" state="native-boundary" reason="手动切换 current 不作为 Web 常规操作暴露。" />
        </section>
        <IndexTable versions={data.indexes.versions} />
      </div>
      <InspectorPanel title="版本详情">
        <GroupedForm
          groups={[
            {
              title: current?.index_version ?? "current",
              rows: [
                { label: "current.json", value: data.indexes.current_version },
                { label: "Ready 数量", value: current?.ready_video_count ?? 0 },
                { label: "schema", value: current?.schema_version ?? "-" },
                { label: "校验", value: current?.validation_status === "pass" ? "通过" : "需处理" },
                { label: "发布人", value: current?.published_by ?? "-" }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
