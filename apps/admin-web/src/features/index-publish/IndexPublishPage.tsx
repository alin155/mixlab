import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { validationStatusLabel } from "../../app/chinese.ts";
import { AdminControlButton, AdminPageHeader, IndexTable, MetricBand } from "../shared.tsx";

export function IndexPublishPage({
  data,
  onRepairIndex,
  onRunDoctor
}: {
  data: AdminDashboardData;
  onRepairIndex?: () => void;
  onRunDoctor?: () => void;
}) {
  const current = data.indexes.versions.find((version) => version.is_current);

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
          <AdminControlButton label="原子切换当前索引" state="native-boundary" reason="手动切换当前索引不作为 Web 常规操作暴露。" />
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
