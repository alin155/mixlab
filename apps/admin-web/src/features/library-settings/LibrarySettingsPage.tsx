import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import { AdminPageHeader } from "../shared.tsx";

export function LibrarySettingsPage({ data }: { data: AdminDashboardData }) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="公共素材库设置" eyebrow="路径、协议与权限" />
        <GroupedForm
          groups={[
            {
              title: "路径与基本信息",
              rows: [
                { label: "公共素材库", value: data.status.root_path },
                { label: "source-videos", value: data.status.source_videos_path },
                { label: ".mixlab-library", value: data.status.mixlab_library_path },
                { label: "library_id", value: data.status.library_id },
                { label: "协议版本", value: data.status.protocol_version }
              ]
            }
          ]}
        />
        <section className="admin-action-row">
          <button className="admin-primary-button" type="button">初始化素材库</button>
          <button className="admin-secondary-button" type="button">打开文件夹</button>
          <button className="admin-secondary-button" type="button">导出诊断</button>
        </section>
      </div>
      <InspectorPanel title="路径校验">
        <section className="admin-list-panel">
          {data.path_checks.map((item) => (
            <StatusRow
              tone={adminStatusTone(item.status)}
              label={item.label}
              detail={`${item.path} · ${item.message}`}
              value={item.status === "pass" ? "通过" : "处理"}
              key={item.label}
            />
          ))}
        </section>
      </InspectorPanel>
    </>
  );
}
