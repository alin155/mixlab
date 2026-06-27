import type { AdminApiEnvelope } from "./admin-route-adapter.ts";

export type AdminJsonRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export type AdminJsonRouteHandler = () => Promise<AdminJsonRouteResult>;

export async function dispatchAdminJsonRoutes(
  handlers: AdminJsonRouteHandler[]
): Promise<AdminJsonRouteResult> {
  for (const handler of handlers) {
    const result = await handler();
    if (result.handled) {
      return result;
    }
  }

  return { handled: false };
}
