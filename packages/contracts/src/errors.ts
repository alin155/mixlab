/**
 * MixLab contract error registry v1.
 *
 * Every cross-boundary API/agent error must use a stable machine code from this
 * registry. UI and clients branch on the code (never on localized messages) and may
 * show the shared Chinese message/remediation. Codes are additive; removing or
 * re-meaning a code requires a contract major version bump.
 */

export type ErrorRetryability = "never" | "retryable" | "after-fix";

export interface ContractErrorDefinition {
  code: string;
  http_status: number;
  retryable: ErrorRetryability;
  user_message: string;
  remediation: string;
  /** Owning product area, useful for logs and routing. */
  area: "auth" | "library" | "release" | "cut" | "agent" | "contract" | "generic";
}

export const CONTRACT_ERRORS = [
  { code: "AUTH_REQUIRED", http_status: 401, retryable: "after-fix", user_message: "登录已过期，请重新登录", remediation: "重新登录后重试", area: "auth" },
  { code: "AUTH_FORBIDDEN", http_status: 403, retryable: "after-fix", user_message: "当前账号无权执行该操作", remediation: "联系管理员开通权限", area: "auth" },
  { code: "LOGIN_RATE_LIMITED", http_status: 429, retryable: "retryable", user_message: "登录失败次数过多，请稍后再试", remediation: "等待锁定时间结束后重试", area: "auth" },
  { code: "REGISTRATION_FORBIDDEN", http_status: 403, retryable: "after-fix", user_message: "首次注册被拒绝，请向管理员索取注册令牌或在本机操作", remediation: "配置/获取注册令牌，或从本机回环地址注册", area: "auth" },
  { code: "LIBRARY_UNAVAILABLE", http_status: 503, retryable: "retryable", user_message: "素材库暂时不可用", remediation: "检查网络/NAS 后重试；本地已缓存内容仍可使用", area: "library" },
  { code: "LIBRARY_NOT_READY", http_status: 503, retryable: "retryable", user_message: "素材库依赖尚未就绪", remediation: "查看 /ready 返回的 checks 与 reasons", area: "library" },
  { code: "RELEASE_POINTER_INVALID", http_status: 503, retryable: "after-fix", user_message: "发布指针异常，剪辑端可能读不到公共库", remediation: "运行发布恢复/重新发布，禁止手工改指针", area: "release" },
  { code: "RELEASE_NOT_FOUND", http_status: 404, retryable: "after-fix", user_message: "指定发布版本不存在", remediation: "刷新发布列表或重新发布", area: "release" },
  { code: "RELEASE_BUNDLE_CORRUPT", http_status: 500, retryable: "after-fix", user_message: "发布制品校验失败", remediation: "重新发布并保留现场用于诊断", area: "release" },
  { code: "RELEASE_BUSY", http_status: 409, retryable: "retryable", user_message: "已有发布任务在执行", remediation: "等待当前发布结束后重试", area: "release" },
  { code: "CONTRACT_TOO_OLD", http_status: 426, retryable: "after-fix", user_message: "客户端版本过低，请升级", remediation: "下载并安装最新客户端", area: "contract" },
  { code: "CAPABILITY_UNAVAILABLE", http_status: 409, retryable: "never", user_message: "当前版本不支持该能力", remediation: "升级客户端或使用替代操作", area: "contract" },
  { code: "CUT_RANGE_OUT_OF_SOURCE", http_status: 400, retryable: "after-fix", user_message: "剪切区间超出源视频时长", remediation: "调整选区后重试", area: "cut" },
  { code: "CUT_OUTPUT_MISMATCH", http_status: 500, retryable: "after-fix", user_message: "输出未通过完整性校验", remediation: "复剪或查看诊断信息", area: "cut" },
  { code: "CUT_SOURCE_UNPROBEABLE", http_status: 500, retryable: "after-fix", user_message: "无法读取源视频媒体信息", remediation: "检查源文件是否完整/可访问", area: "cut" },
  { code: "CUT_TIMEOUT", http_status: 504, retryable: "retryable", user_message: "剪辑执行超时", remediation: "稍后重试或降低片段长度", area: "cut" },
  { code: "CUT_PROCESS_INTERRUPTED", http_status: 500, retryable: "retryable", user_message: "剪辑进程意外中断", remediation: "重试任务", area: "cut" },
  { code: "CUT_JOB_NOT_RETRYABLE", http_status: 409, retryable: "never", user_message: "该任务当前不可复剪", remediation: "查看任务状态说明", area: "cut" },
  { code: "WORKSPACE_LEASE_UNAVAILABLE", http_status: 409, retryable: "retryable", user_message: "本机工作区正被其他实例占用", remediation: "等待其他实例退出后重试", area: "agent" },
  { code: "AGENT_UNAVAILABLE", http_status: 503, retryable: "retryable", user_message: "本机引擎不可用", remediation: "重启桌面端或检查引擎日志", area: "agent" },
  { code: "SMART_AI_TIMEOUT", http_status: 504, retryable: "retryable", user_message: "智能分析超时", remediation: "重试或改用精确检索", area: "agent" },
  { code: "SMART_AI_UNAVAILABLE", http_status: 503, retryable: "retryable", user_message: "智能分析组件不可用", remediation: "检查本地模型/运行时，精确检索仍可用", area: "agent" },
  { code: "VALIDATION_FAILED", http_status: 400, retryable: "after-fix", user_message: "请求参数不合法", remediation: "检查输入后重试", area: "generic" },
  { code: "NOT_FOUND", http_status: 404, retryable: "never", user_message: "请求的资源不存在", remediation: "刷新后重试", area: "generic" },
  { code: "INTERNAL_ERROR", http_status: 500, retryable: "retryable", user_message: "服务内部错误", remediation: "稍后重试；持续出现请查看日志", area: "generic" }
] as const satisfies readonly ContractErrorDefinition[];

export type ContractErrorCode = (typeof CONTRACT_ERRORS)[number]["code"];

const BY_CODE = new Map<string, ContractErrorDefinition>(
  CONTRACT_ERRORS.map((definition) => [definition.code, definition])
);

export function isContractErrorCode(value: unknown): value is ContractErrorCode {
  return typeof value === "string" && BY_CODE.has(value);
}

export function contractErrorDefinition(code: string): ContractErrorDefinition | undefined {
  return BY_CODE.get(code);
}

export interface ContractErrorBody {
  ok: false;
  error_code: string;
  code: ContractErrorCode | string;
  message: string;
  remediation?: string;
  retryable?: ErrorRetryability;
  http_status: number;
  details?: Record<string, unknown>;
  contract_version?: string;
}

/** Convert any error code into the shared envelope, keeping unknown codes visible but safe. */
export function toContractErrorBody(input: {
  code: string;
  message?: string;
  httpStatus?: number;
  details?: Record<string, unknown>;
  contractVersion?: string;
}): ContractErrorBody {
  const definition = contractErrorDefinition(input.code);
  return {
    ok: false,
    error_code: input.code,
    code: input.code,
    message: input.message ?? definition?.user_message ?? "操作失败，请稍后重试",
    ...(definition?.remediation ? { remediation: definition.remediation } : {}),
    ...(definition ? { retryable: definition.retryable } : {}),
    http_status: input.httpStatus ?? definition?.http_status ?? 500,
    ...(input.details ? { details: input.details } : {}),
    ...(input.contractVersion ? { contract_version: input.contractVersion } : {})
  };
}
