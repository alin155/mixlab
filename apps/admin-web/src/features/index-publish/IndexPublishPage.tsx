import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { AdminPageHeader, IndexTable } from "../shared.tsx";

export function IndexPublishPage({ data }: { data: AdminDashboardData }) {
  const current = data.indexes.versions.find((version) => version.is_current);

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="索引发布"
          eyebrow="版本化只读索引包与 current.json 原子切换"
        />
        <section className="admin-action-row">
          <button className="admin-primary-button" type="button">构建新索引</button>
          <button className="admin-secondary-button" type="button">校验索引</button>
          <button className="admin-secondary-button" type="button">原子切换 current</button>
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
