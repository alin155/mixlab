import { CutterApiError } from "../api.ts";
import {
  contractErrorDefinition,
  isContractErrorCode,
  type ErrorRetryability
} from "../../../../packages/contracts/src/errors.ts";
import { userFacingErrorMessage } from "./notice.ts";

/**
 * Legacy backend codes (pre contract-v1) mapped onto stable contract codes.
 * The mapping is additive: unknown legacy codes keep their existing message.
 */
export const LEGACY_ERROR_CODE_ALIASES: Readonly<Record<string, string>> = {
  login_required: "AUTH_REQUIRED",
  session_expired: "AUTH_REQUIRED",
  unauthorized: "AUTH_REQUIRED",
  invalid_credentials: "AUTH_REQUIRED",
  api_error: "INTERNAL_ERROR"
};

/**
 * When the service did not send a stable code we only infer a code from HTTP
 * status for the least ambiguous cases; everything else stays "unknown" so the
 * existing text is preserved instead of guessed.
 */
const HTTP_STATUS_CODE_FALLBACK: Readonly<Record<number, string>> = {
  401: "AUTH_REQUIRED",
  403: "AUTH_FORBIDDEN",
  404: "NOT_FOUND",
  500: "INTERNAL_ERROR"
};

export interface CutterErrorPresentation {
  /** Stable contract code when known, otherwise the raw backend code / status based fallback. */
  code: string;
  known: boolean;
  retryability: ErrorRetryability | "unknown";
  message: string;
  remediation: string;
  /** Technical detail for the expandable section; never only a localized message. */
  technical: string;
  expandable: boolean;
}

function rawCodeForError(error: unknown): string {
  if (error instanceof CutterApiError) {
    return error.code.trim();
  }

  return "";
}

export function normalizeContractErrorCode(input: {
  code?: string;
  status?: number;
}): string | undefined {
  const code = input.code?.trim();
  if (code) {
    const aliased = LEGACY_ERROR_CODE_ALIASES[code] ?? code;
    if (isContractErrorCode(aliased)) {
      return aliased;
    }
  }

  if (typeof input.status === "number") {
    const statusCode = HTTP_STATUS_CODE_FALLBACK[input.status];
    if (statusCode && isContractErrorCode(statusCode)) {
      return statusCode;
    }
  }

  return undefined;
}

export function isAuthRequiredError(error: unknown): boolean {
  if (!(error instanceof CutterApiError)) {
    return false;
  }

  return error.status === 401 || normalizeContractErrorCode({
    code: error.code,
    status: error.status
  }) === "AUTH_REQUIRED";
}

function technicalForError(error: unknown): string {
  if (!(error instanceof CutterApiError)) {
    if (error instanceof Error) {
      return [error.name, error.message].filter(Boolean).join(": ");
    }
    return typeof error === "string" ? error : "";
  }

  const lines = [
    "HTTP " + error.status,
    "code=" + error.code,
    error.message
  ];

  if (error.remediation) {
    lines.push("remediation=" + error.remediation);
  }
  if (error.details) {
    try {
      lines.push("details=" + JSON.stringify(error.details));
    } catch {
      lines.push("details=[unserializable]");
    }
  }
  if (error.contract_version) {
    lines.push("contract_version=" + error.contract_version);
  }

  return lines.filter(Boolean).join("\n");
}

export function contractErrorPresentation(
  error: unknown,
  fallbackMessage: string
): CutterErrorPresentation {
  const rawCode = rawCodeForError(error);
  const status = error instanceof CutterApiError ? error.status : undefined;
  const knownCode = normalizeContractErrorCode({ code: rawCode, status });
  const technical = technicalForError(error);

  if (knownCode) {
    const definition = contractErrorDefinition(knownCode);
    if (definition) {
      const serverRemediation = error instanceof CutterApiError ? error.remediation : undefined;
      const serverRetryable = error instanceof CutterApiError ? error.retryable : undefined;
      return {
        code: definition.code,
        known: true,
        retryability: serverRetryable ?? definition.retryable,
        message: definition.user_message,
        remediation: serverRemediation?.trim() || definition.remediation,
        technical,
        expandable: Boolean(technical)
      };
    }
  }

  const serverRemediation = error instanceof CutterApiError ? error.remediation?.trim() : "";
  const serverRetryable = error instanceof CutterApiError ? error.retryable : undefined;
  const fallback = userFacingErrorMessage(error, fallbackMessage);

  return {
    code: rawCode || (status ? "HTTP_" + status : "UNKNOWN"),
    known: false,
    retryability: serverRetryable ?? "unknown",
    message: fallback,
    remediation: serverRemediation || "",
    technical,
    expandable: Boolean(technical) || Boolean(serverRemediation)
  };
}

export function contractCodePresentation(
  code: string,
  technical = ""
): CutterErrorPresentation | null {
  const definition = contractErrorDefinition(code);
  if (!definition) {
    return null;
  }

  return {
    code: definition.code,
    known: true,
    retryability: definition.retryable,
    message: definition.user_message,
    remediation: definition.remediation,
    technical,
    expandable: Boolean(technical)
  };
}

export function retryabilityLabel(retryability: CutterErrorPresentation["retryability"]): string {
  switch (retryability) {
    case "retryable":
      return "可重试";
    case "after-fix":
      return "处理后重试";
    case "never":
      return "不可重试";
    default:
      return "重试策略未知";
  }
}
