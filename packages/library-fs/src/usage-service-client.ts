/**
 * Cutter 事件服务客户端适配层（Round5）：实现收敛到共享包 packages/service-clients。
 * 保持 Round4 的导出名/行为（contract 错误码、/usage/v1 路径），供 usage-outbox 与 cutter-api 使用。
 */
import {
  createContractUsageServiceClient,
  type UsageServiceConnection
} from "../../service-clients/src/usage-service-client.ts";

export type {
  UsageServiceConnection,
  UsageServiceMetricsResponse
} from "../../service-clients/src/usage-service-client.ts";
export type UsageServiceMode = "isolated-service" | "legacy-ndjson";

export const USAGE_SERVICE_MODE_ENV = "MIXLAB_USAGE_SERVICE_URL";
export const USAGE_SERVICE_TOKEN_ENV = "MIXLAB_USAGE_SERVICE_TOKEN";
export const USAGE_SERVICE_ADMIN_TOKEN_ENV = "MIXLAB_USAGE_SERVICE_ADMIN_TOKEN";
export const USAGE_SERVICE_REQUEST_TIMEOUT_MS = 2_000;

const contract = createContractUsageServiceClient();

export const usageServiceMode = contract.usageServiceMode;
export const usageServiceFromEnv = contract.usageServiceFromEnv;
export const usageServiceUrl = contract.usageServiceUrl;
export const requestUsageService = contract.requestUsageService;
export const readUsageServiceMetrics = contract.readUsageServiceMetrics;

