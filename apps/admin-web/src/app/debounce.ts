export const ADMIN_SEARCH_DEBOUNCE_MS = 300;

export interface AdminDebouncedCallback<T> {
  schedule(value: T): void;
  cancel(): void;
  flush(): void;
}

export function createAdminDebouncedCallback<T>(
  callback: (value: T) => void,
  delayMs: number
): AdminDebouncedCallback<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: { value: T } | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(value) {
      latest = { value };
      clear();
      timer = setTimeout(() => {
        const pending = latest;
        timer = null;
        latest = null;

        if (pending) {
          callback(pending.value);
        }
      }, Math.max(0, delayMs));
    },
    cancel() {
      latest = null;
      clear();
    },
    flush() {
      const pending = latest;
      latest = null;
      clear();

      if (pending) {
        callback(pending.value);
      }
    }
  };
}
