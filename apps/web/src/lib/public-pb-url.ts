import { env } from "$env/dynamic/public";

/**
 * Browser-facing PocketBase origin, resolved at runtime (not baked at build).
 * Operators set PUBLIC_PB_URL per host; adapter-node ships it to the browser via
 * the SSR bootstrap. Fallback covers local `vite dev` with no env set.
 */
export function publicPbUrl(): string {
  return env.PUBLIC_PB_URL || "http://127.0.0.1:8090";
}
