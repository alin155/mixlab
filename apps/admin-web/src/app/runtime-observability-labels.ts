import type { AdminRuntimeEndpointMeta } from "../api.ts";

export function adminRuntimeScanModeLabel(scanMode: AdminRuntimeEndpointMeta["scan_mode"]): string {
  const labels: Record<AdminRuntimeEndpointMeta["scan_mode"], string> = {
    "no-scan": "不扫描",
    "single-id": "单素材读取",
    "paged-list": "分页列表",
    "folder-scan": "目录扫描",
    "status-scan": "状态集合",
    "full-reconcile": "后台全量对账"
  };

  return labels[scanMode];
}

export function adminRuntimeDataSourceLabel(source: AdminRuntimeEndpointMeta["data_source"]): string {
  const labels: Record<AdminRuntimeEndpointMeta["data_source"], string> = {
    "admin-settings": "管理设置",
    "admin-read-model": "读模型",
    "command-snapshot": "命令快照",
    "current-index": "当前索引",
    "data-loading-contract": "加载契约",
    "doctor-probes": "系统检查",
    "index-version-packages": "索引版本",
    "library-manifest": "素材库清单",
    "operation-log": "操作记录",
    "path-checks": "路径检查",
    "read-model-reconcile": "读模型对账",
    "runtime-telemetry": "运行时遥测",
    "runtime-secrets": "运行配置",
    "source-folders": "素材来源目录",
    "source-video-manifest": "素材清单",
    "supervisor-runtime": "预处理服务",
    "transcript-artifacts": "文稿产物",
    "usage-events": "使用事件",
    "user-store": "用户存储"
  };

  return labels[source];
}

export function adminRuntimeScanReasonLabel(reason: AdminRuntimeEndpointMeta["scan_reason"]): string {
  const labels: Record<AdminRuntimeEndpointMeta["scan_reason"], string> = {
    "background-metrics": "后台指标",
    "doctor-route": "系统检查",
    "explicit-reconcile-cancel": "显式停止对账",
    "explicit-read-model-reconcile": "显式读模型对账",
    "explicit-scan-apply": "显式应用扫描",
    "explicit-scan-preview": "显式扫描预览",
    "index-version-page": "索引版本页",
    "operation-log-tail": "操作日志尾部",
    "read-model-health": "读模型健康",
    "route-owned-page": "页面路由读取",
    "selected-record": "选中记录",
    "settings-route": "设置页",
    "shell-contract": "Shell 契约",
    "shell-summary": "Shell 摘要",
    "user-management-route": "用户管理页"
  };

  return labels[reason];
}

export function adminRuntimeCacheStatusLabel(status: AdminRuntimeEndpointMeta["cache_status"]): string {
  const labels: Record<AdminRuntimeEndpointMeta["cache_status"], string> = {
    hit: "命中",
    miss: "未命中",
    pending: "等待中",
    "not-applicable": "不适用",
    unknown: "未知"
  };

  return labels[status];
}

export function adminRuntimeFallbackReasonLabel(reason?: string): string {
  switch (reason) {
    case "status-store:store-not-fresh":
      return "读模型过期";
    case "status-store:incomplete-manifest-rows":
      return "读模型行不完整";
    case "status-store:unsupported-status":
      return "当前状态暂不支持读模型";
    case "status-store:unreadable-store":
      return "读模型不可读";
    case "status-store:miss":
      return "读模型未命中";
    case "status-read-model:id-fallback":
      return "清单补全";
    case "manifest-fallback:forbidden":
      return "清单回退已阻断";
    default:
      return reason ? "已回退" : "";
  }
}

export function adminRuntimeSlowReasonLabel(runtime: AdminRuntimeEndpointMeta): string {
  if (!runtime.slow) {
    return "未超过目标耗时";
  }

  return runtime.slow_reason.trim() ? "已超过目标耗时" : "已标记为慢请求";
}

export function adminRuntimeComponentLabel(name: string): string {
  const labels: Record<string, string> = {
    concurrency_policy: "并发策略",
    library_counts: "素材库计数",
    preprocess_job_page: "预处理分页",
    runtime_load: "运行负载",
    job_record_supplement: "任务记录补全",
    current_pointer_fast_page: "当前指针快读",
    directory_listing: "索引目录读取",
    current_pointer_validation: "当前指针校验",
    index_package_validation: "索引包校验",
    pending_wait: "等待中的读取",
    cache_lookup: "缓存读取",
    status_page: "状态分页",
    status_store: "状态读模型",
    status_filter: "状态筛选",
    manifest_fallback: "清单回退",
    source_video_manifest: "素材清单",
    read_model: "读模型"
  };

  return labels[name] ?? "运行组件";
}

export function adminRuntimeComponentSummary(runtime: AdminRuntimeEndpointMeta): string {
  const components = runtime.components ?? [];
  if (!components.length) {
    return "暂无组件耗时";
  }

  const visibleComponents = components.slice(0, 2).map((component) => {
    const source = component.data_source ? adminRuntimeDataSourceLabel(component.data_source) : "数据源未知";
    const scanMode = component.scan_mode ? adminRuntimeScanModeLabel(component.scan_mode) : "扫描策略未知";
    const cacheStatus = component.cache_status ? adminRuntimeCacheStatusLabel(component.cache_status) : "缓存未知";
    return `${adminRuntimeComponentLabel(component.name)} ${component.duration_ms}ms / ${source} / ${scanMode} / ${cacheStatus}`;
  });
  const remainingCount = components.length - visibleComponents.length;

  return remainingCount > 0
    ? `${visibleComponents.join("；")}；另 ${remainingCount} 个组件`
    : visibleComponents.join("；");
}
