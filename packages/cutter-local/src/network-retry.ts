import { setTimeout as delay } from "node:timers/promises";

const connectionCodes = new Set(["EBADF", "ESTALE", "ENOTCONN", "EHOSTDOWN", "EHOSTUNREACH", "ENETDOWN", "ENETUNREACH", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EPIPE", "library_unavailable"]);
export function isSourceConnectionError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code && connectionCodes.has(code)) return true;
  if (code && code !== "runtime_process") return false;
  return /\b(?:EBADF|ESTALE|ENOTCONN|EHOSTDOWN|ECONNRESET|ETIMEDOUT)\b|bad file descriptor|stale file handle|transport endpoint is not connected|connection reset by peer|host is down|network is unreachable|connection timed out/i.test(error.message)
    || isSourceConnectionError(error.cause);
}

/** Reopen the source on each attempt. Cancellation and permanent failures never retry. */
export async function retrySourceConnection<T>(operation: () => Promise<T>, options: {
  signal?: AbortSignal;
  onRetry?: (retry: number, total: number) => void | Promise<void>;
} = {}): Promise<T> {
  const waits = [2000, 5000, 10000];
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try { return await operation(); }
    catch (error) {
      options.signal?.throwIfAborted();
      if (!isSourceConnectionError(error) || attempt === waits.length) throw error;
      await options.onRetry?.(attempt + 1, waits.length);
      await delay(waits[attempt], undefined, { signal: options.signal });
    }
  }
}
