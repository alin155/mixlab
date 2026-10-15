import React, { useEffect, useState } from "react";
import { IconCheck, IconRefresh } from "@tabler/icons-react";
import type { MatchPhase, Work } from "../../../packages/smart-cutter/src/types.ts";

const labels: Record<MatchPhase, string> = {
  snapshot_check: "正在检查公共素材库与本机快照",
  snapshot_sync: "正在从公共素材库同步本机快照",
  snapshot_ready: "素材快照已就绪，即将逐句检索",
  text_search: "正在检索相同原文",
  source_check: "正在核对候选片段、时间范围与源文件",
  semantic_wait: "正在等待另一素材版本的语义索引",
  semantic_index: "正在为当前素材版本建立语义索引",
  semantic_search: "正在查找含义相近的原声片段",
  complete: "原声匹配已完成",
  failed: "匹配已中断",
};
const count = (value: number) => value.toLocaleString("zh-CN");

export function MatchingProgress({ work }: { work: Work }) {
  const [time, setTime] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setTime(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const progress = work.match_progress;
  const seconds = Math.max(0, Math.floor((time - Date.parse(progress?.started_at ?? work.updated_at)) / 1000));
  const elapsed = seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  const indexing = progress?.phase === "semantic_wait" || progress?.phase === "semantic_index";
  const semantic = progress?.semantic;
  const percent = semantic?.total ? Math.min(100, Math.floor(semantic.done / semantic.total * 100)) : null;
  return <section className="panel matching-progress" aria-label="原声匹配进度">
    <div className="row between"><div className="row"><IconRefresh size={21} /><h2>正在匹配真实原声片段</h2></div><span className="small muted">已用时 {elapsed}</span></div>
    <p className="matching-current" role="status">{progress ? labels[progress.phase] : "正在读取本次匹配的实际进度…"}{!!progress?.current_sentence && ` · 第 ${progress.current_sentence} / ${progress.total_sentences} 句`}</p>
    {progress && <>
      <div className="matching-checkpoints">
        <div><IconCheck size={15} /><span>文案已拆分为 {progress.total_sentences} 句</span></div>
        <div>{progress.snapshot_id ? <IconCheck size={15} /> : <IconRefresh size={15} />}<span>{progress.snapshot_id ? `素材快照 ${progress.snapshot_version} 已就绪并锁定` : progress.phase === "snapshot_sync" ? `正在同步素材快照 ${progress.snapshot_version}，尚未完成` : "正在检查素材快照"}</span></div>
        <div>{progress.completed_sentences === progress.total_sentences ? <IconCheck size={15} /> : <IconRefresh size={15} />}<span>已完成 {progress.completed_sentences} / {progress.total_sentences} 句：精确匹配 {progress.exact_matches}，近似待审 {progress.near_matches}，缺句待补 {progress.missing_matches}</span></div>
      </div>
      {indexing && <div className="matching-index">
        <div className="row between"><strong>{progress.phase === "semantic_wait" ? "等待中的索引任务" : "当前作品的语义索引"}{semantic?.version ? ` · ${semantic.version}` : ""}</strong><span>{percent === null ? "正在读取数量" : `${percent}%`}</span></div>
        {semantic?.total ? <><progress aria-label="语义索引完成数量" value={semantic.done} max={semantic.total} /><p>已完成 {count(semantic.done)} / {count(semantic.total)} 段，剩余 {count(Math.max(0, semantic.total - semantic.done))} 段</p></> : <p>正在加载模型或读取索引检查点；尚无可报告的完成数量。</p>}
        <p>{progress.phase === "semantic_wait" ? `当前作品使用 ${progress.snapshot_version}。等待前一版本任务结束后，将检查本作品的索引；未就绪时还需建立。` : "未找到完全相同的原文，需要语义索引寻找近似表述。首次建立会较久，已落盘的进度会保留。"}</p>
        <p className="small muted">这里的百分比仅代表该索引任务，不代表整条作品的匹配进度。</p>
      </div>}
    </>}
    <p className="module-note">进度来自本机引擎，每 2 秒刷新。匹配在后台继续，可以返回作品列表；关闭窗口仍在后台运行，明确退出应用会中断匹配。当前阶段没有可靠的剩余时间估计。</p>
  </section>;
}
