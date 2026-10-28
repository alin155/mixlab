import { createUsageService } from "../../packages/admin-api/src/usage-service.ts";
import {
  resolveUsageServiceCapacityConfig
} from "../../packages/library-fs/src/usage-service-store.ts";

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function nonNegativeInteger(value: string | undefined, label: string): number | undefined {
  const raw = optionalTrimmed(value);

  if (raw === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(label + " 必须是非负整数");
  }

  return Number.parseInt(raw, 10);
}

const stateRoot = optionalTrimmed(process.env.MIXLAB_USAGE_SERVICE_STATE_ROOT);
const portValue = optionalTrimmed(process.env.MIXLAB_USAGE_SERVICE_PORT) ?? "3892";
const port = Number.parseInt(portValue, 10);
const clientToken = optionalTrimmed(process.env.MIXLAB_USAGE_SERVICE_TOKEN);
const adminToken = optionalTrimmed(process.env.MIXLAB_USAGE_SERVICE_ADMIN_TOKEN);

if (!stateRoot) {
  throw new Error("统计服务需要显式 MIXLAB_USAGE_SERVICE_STATE_ROOT（本机私有目录）");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("MIXLAB_USAGE_SERVICE_PORT 必须是 1-65535 的整数");
}

if (!clientToken) {
  throw new Error("统计服务需要 MIXLAB_USAGE_SERVICE_TOKEN");
}

const capacity = resolveUsageServiceCapacityConfig(process.env);
const retentionDays = nonNegativeInteger(
  process.env.MIXLAB_USAGE_SERVICE_RETENTION_DAYS,
  "MIXLAB_USAGE_SERVICE_RETENTION_DAYS"
);
const maxEvents = nonNegativeInteger(
  process.env.MIXLAB_USAGE_SERVICE_MAX_EVENTS,
  "MIXLAB_USAGE_SERVICE_MAX_EVENTS"
);
const service = await createUsageService({
  state_root: stateRoot,
  client_token: clientToken,
  ...(adminToken ? { admin_token: adminToken } : {}),
  retention_days: retentionDays ?? capacity.retention_days,
  max_events: maxEvents ?? capacity.max_events
});

service.server.listen(port, "127.0.0.1", () => {
  const address = service.server.address();
  const listeningPort = typeof address === "object" && address ? address.port : port;
  console.log(JSON.stringify({
    event: "usage_service_ready",
    url: "http://127.0.0.1:" + listeningPort,
    store_id: service.store_id
  }));
});

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void service.close().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
