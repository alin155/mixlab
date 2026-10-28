/** Local Agent API v1 shared types (cutter/smart desktop engines). */
export const LOCAL_AGENT_API_VERSION = "1.0";

export type LocalJobStatus =
  | "accepted"
  | "running"
  | "verifying"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export type CutModeContract = "copy" | "smart" | "precise";

export interface LocalJobVerificationV1 {
  passed: boolean;
  expected_duration_ms: number;
  actual_duration_ms?: number;
  tolerance_ms: number;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
}

export interface LocalJobResultV1 {
  schema_version: "1.0";
  job_id: string;
  revision: number;
  status: LocalJobStatus;
  request: {
    begin_ms: number;
    end_ms: number;
    mode: CutModeContract;
  };
  output?: {
    path: string;
    size: number;
    duration_ms: number;
    sha256: string;
  };
  verification?: LocalJobVerificationV1;
  error?: {
    code: string;
    message: string;
    stage: string;
    retryable: boolean;
  };
}

export interface LocalAgentCapabilitiesV1 {
  contract_version: string;
  agent_version: string;
  product: "cutter" | "smart-cutter";
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

export function isLocalJobTerminal(status: LocalJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "partial" || status === "cancelled";
}
