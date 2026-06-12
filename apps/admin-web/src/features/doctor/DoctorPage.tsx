import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { strictChineseDiagnosticText } from "../../app/chinese.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader, MetricBand } from "../shared.tsx";

interface DoctorExplanation {
  name: string;
  purpose: string;
  impact: string;
  suggestion: string;
}

const DOCTOR_EXPLANATIONS: Record<string, DoctorExplanation> = {
  "public-root": {
    name: "公共素材库根目录",
    purpose: "确认管理端能访问公共素材库根目录。",
    impact: "不可访问时无法扫描、预处理和发布素材。",
    suggestion: "检查移动硬盘或网络盘是否挂载，并确认目录权限。"
  },
  "source-videos-readable": {
    name: "素材来源可读性",
    purpose: "确认原视频目录可以被管理端读取。",
    impact: "不可读时无法扫描新增视频，也无法建立预处理队列。",
    suggestion: "检查素材来源目录是否存在、是否挂载，以及读取权限。"
  },
  "mixlab-library-writable": {
    name: "预处理产物库可写性",
    purpose: "确认文案、索引、封面、日志等产物可以写入。",
    impact: "不可写时预处理任务无法完成，已处理素材也无法发布。",
    suggestion: "检查磁盘剩余空间、目录权限和移动硬盘写入状态。"
  },
  "preprocess-logs-writable": {
    name: "预处理日志目录可写性",
    purpose: "确认预处理任务日志目录可以创建和写入。",
    impact: "不可写时管理端无法追踪任务阶段、失败原因和恢复线索。",
    suggestion: "检查 .mixlab-library/logs 的目录权限和公共素材库所在磁盘状态。"
  },
  manifest: {
    name: "发布清单",
    purpose: "确认素材库清单和原视频协议文件有效。",
    impact: "清单损坏时剪辑端可能看不到可用素材。",
    suggestion: "重新扫描源视频，必要时从最近备份恢复协议文件。"
  },
  "library-counts": {
    name: "素材库计数",
    purpose: "确认素材库统计字段和实际状态一致。",
    impact: "计数异常会让仪表盘、队列和剪辑端可见数量失真。",
    suggestion: "重新扫描并发布索引，必要时检查 library.json。"
  },
  "source-video-manifests": {
    name: "原视频发布清单",
    purpose: "确认每个原视频的协议文件和产物路径有效。",
    impact: "单个清单异常会让对应原视频不可见、不可搜索或无法剪切。",
    suggestion: "打开原视频详情定位缺失产物，对异常视频重新预处理。"
  },
  "current-index": {
    name: "当前索引",
    purpose: "确认剪辑端搜索使用的当前索引存在且可读取。",
    impact: "当前索引异常时，已可用原视频可能无法被搜索到。",
    suggestion: "发布到剪辑端，或重新运行系统检查。"
  },
  "preprocess-logs": {
    name: "预处理任务日志",
    purpose: "确认已进入预处理生命周期的视频都有可读任务日志。",
    impact: "日志缺失时不影响已发布素材搜索，但会削弱失败定位、恢复和审计能力。",
    suggestion: "对缺失日志的视频重新入队，或确认历史迁移脚本是否保留任务日志。"
  },
  artifacts: {
    name: "视频产物",
    purpose: "确认文案、封面、关键帧等预处理产物完整。",
    impact: "产物缺失时原视频不可搜索或详情页不完整。",
    suggestion: "对缺失产物的视频重新进入预处理队列。"
  },
  ffmpeg: {
    name: "音视频工具",
    purpose: "确认本机可执行音视频提取和剪切任务。",
    impact: "工具不可用时无法提取音频、生成封面或执行本地剪切。",
    suggestion: "检查内置工具或系统路径配置。"
  },
  ffprobe: {
    name: "媒体探测工具",
    purpose: "确认系统可以读取视频编码、时长和分辨率信息。",
    impact: "探测失败时预处理无法准确生成元数据。",
    suggestion: "检查媒体探测工具路径和视频文件可读性。"
  },
  asr: {
    name: "语音识别配置",
    purpose: "确认语音识别所需配置可用且不会暴露密钥。",
    impact: "配置异常时新视频无法生成文案，也无法进入搜索索引。",
    suggestion: "检查阿里云百炼接口密钥和临时上传能力。"
  },
  "asr-config": {
    name: "语音识别配置",
    purpose: "确认语音识别所需模型和密钥配置正确。",
    impact: "配置异常时新视频无法生成文案，也无法进入搜索索引。",
    suggestion: "检查阿里云百炼接口密钥、模型名和临时上传配置。"
  },
  counts: {
    name: "状态计数",
    purpose: "确认素材状态统计与当前索引边界一致。",
    impact: "状态不一致时，剪辑端看到的素材和搜索结果可能不同步。",
    suggestion: "发布到剪辑端，并重新运行系统检查。"
  },
  "local-clips": {
    name: "本地剪辑片段",
    purpose: "确认本地剪切后生成的片段清单和媒体文件有效。",
    impact: "本地剪辑片段属于剪辑端本地工作区，不会阻断公共素材库扫描、预处理和发布，但会影响剪辑师复用本地片段。",
    suggestion: "让对应剪辑端重新生成缺失片段，或在后续本地素材库管理中清理失效片段。"
  }
};

function doctorExplanation(checkId: string, label: string): DoctorExplanation {
  return DOCTOR_EXPLANATIONS[checkId] ?? {
    name: "技术检查项",
    purpose: "技术检查项用于确认系统运行条件。",
    impact: "异常时可能影响素材管理、预处理或剪辑端使用。",
    suggestion: "查看技术详情并结合日志定位问题。"
  };
}

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
          title="系统检查"
          eyebrow="检查系统状态"
          action={<AdminControlButton label="重新检查" state="m9b-api" reason="重新检查路径、索引、工具和预处理产物。" variant="primary" onClick={onRunDoctor} />}
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
              label={doctorExplanation(item.check_id, item.label).name}
              detail={`${doctorExplanation(item.check_id, item.label).name} · ${strictChineseDiagnosticText(item.message)}`}
              value={item.status === "pass" ? "通过" : item.status === "warn" ? "需关注" : "需处理"}
              key={item.check_id}
            />
          ))}
        </section>
        <section className="admin-list-section">
          <header className="admin-section-header">
            <h2>检查结果</h2>
            <p>每个检查项都说明检查目的、失败影响和处理建议；原始技术信息可导出报告查看。</p>
          </header>
          <GroupedForm
            groups={data.doctor.checks.map((item) => {
              const explanation = doctorExplanation(item.check_id, item.label);
              return {
                title: explanation.name,
                rows: [
                  { label: "检查目的", value: explanation.purpose },
                  { label: "失败影响", value: explanation.impact },
                  { label: "处理建议", value: explanation.suggestion },
                  { label: "技术详情", value: strictChineseDiagnosticText(item.message) }
                ]
              };
            })}
          />
        </section>
      </div>
      <InspectorPanel title="检查报告">
        <GroupedForm
          groups={[
            {
              title: "报告",
              rows: [
                { label: "生成时间", value: data.doctor.generated_at },
                { label: "协议版本", value: data.doctor.schema_version },
                { label: "库路径", value: data.doctor.library_root },
                { label: "通过", value: data.doctor.summary.pass },
                { label: "警告", value: data.doctor.summary.warn },
                { label: "失败", value: data.doctor.summary.fail }
              ]
            }
          ]}
        />
        <AdminControlButton label="导出检查报告" state="m9b-api" reason="导出当前检查结果，便于排障留档。" variant="primary" onClick={onExportDoctor} />
      </InspectorPanel>
    </>
  );
}
