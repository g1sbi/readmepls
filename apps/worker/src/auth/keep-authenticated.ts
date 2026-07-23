export interface KeepAuthenticatedDeps {
  refresh: () => Promise<unknown>;
  onError?: (err: unknown) => void;
}

/**
 * Calls `refresh` every `intervalMs` for the life of the process. The
 * PocketBase superuser token main.ts authenticates with once at startup has
 * a finite server-side duration (currently 24h) and the SDK never renews it
 * on its own — a long-lived worker process must do that itself, well before
 * expiry, or every request eventually starts failing with an auth error.
 * Returns a stop function that cancels further refreshes.
 */
export function keepAuthenticated(
  intervalMs: number,
  deps: KeepAuthenticatedDeps,
): () => void {
  const timer = setInterval(() => {
    deps.refresh().catch((err) => deps.onError?.(err));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
