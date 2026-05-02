import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import { AdminPageHeader } from "../shared.tsx";

export function DoctorPage({ data }: { data: AdminDashboardData }) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="健康诊断" eyebrow="Doctor 诊断报告可导出 JSON" />
        <section className="admin-list-panel">
          {data.doctor.checks.map((item) => (
            <StatusRow
              tone={adminStatusTone(item.status)}
              label={item.label}
              detail={item.message}
              value={item.status === "pass" ? "通过" : "需处理"}
              key={item.check_id}
            />
          ))}
        </section>
      </div>
      <InspectorPanel title="诊断报告">
        <GroupedForm
          groups={[
            {
              title: "报告",
              rows: [
                { label: "生成时间", value: data.doctor.generated_at },
                { label: "schema", value: data.doctor.schema_version },
                { label: "库路径", value: data.doctor.library_root },
                { label: "通过", value: data.doctor.summary.pass },
                { label: "警告", value: data.doctor.summary.warn },
                { label: "失败", value: data.doctor.summary.fail }
              ]
            }
          ]}
        />
        <button className="admin-primary-button" type="button">导出诊断 JSON</button>
      </InspectorPanel>
    </>
  );
}
