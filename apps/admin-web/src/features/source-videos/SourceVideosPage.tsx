import type { AdminDashboardData } from "../../api.ts";
import {
  AdminPageHeader,
  SourceMetadataInspector,
  SourceVideoTable
} from "../shared.tsx";

export function SourceVideosPage({ data }: { data: AdminDashboardData }) {
  const selected =
    data.source_videos.find((video) => video.source_video_id === "P000042") ??
    data.source_videos[0];

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="原视频管理"
          eyebrow="封面、标签、说明和可见性由管理端配置"
          action={<span className="ml-search">⌕<input readOnly value="" placeholder="搜索文件名 / 标签 / 相对路径" /></span>}
        />
        <section className="admin-action-row">
          <button className="admin-primary-button" type="button">扫描新增视频</button>
          <button className="admin-secondary-button" type="button">重新扫描</button>
          <button className="admin-secondary-button" type="button">重新处理选中视频</button>
          <button className="admin-secondary-button" type="button">查看 Manifest</button>
        </section>
        <SourceVideoTable videos={data.source_videos} />
      </div>
      {selected ? <SourceMetadataInspector video={selected} /> : null}
    </>
  );
}
