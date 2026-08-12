// Stub for $app/paths in vitest component tests.
// Real implementation is supplied by SvelteKit's Vite plugin at build time.
// No `paths.base` is configured, so resolving a static route is the identity.
export const base = "";
export const assets = "";

export function asset(file: string): string {
  return file;
}

export function resolve(route: string): string {
  return route;
}
