import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader, MetricBand } from "../shared.tsx";

export function DoctorPage({
  data,
  onRunDoctor,
  onExportDoctor
}: {
  data: AdminDashboardData;
  onRunDoctor?: () => void;
  onExportDoctor?: () => void;
}) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="健康诊断"
          eyebrow="诊断系统问题"
          action={<AdminControlButton label="重新运行 Doctor" state="m9b-api" reason="M9B 接入 Doctor 运行接口。" variant="primary" onClick={onRunDoctor} />}
        />
        <MetricBand
          items={[
            { label: "通过", value: data.doctor.summary.pass, caption: "检查通过" },
            { label: "警告", value: data.doctor.summary.warn, caption: "需要关注" },
            { label: "失败", value: data.doctor.summary.fail, caption: "需要处理" }
          ]}
        />
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
        <AdminControlButton label="导出诊断 JSON" state="m9b-api" reason="M9B 接入报告导出。" variant="primary" onClick={onExportDoctor} />
      </InspectorPanel>
    </>
  );
}
