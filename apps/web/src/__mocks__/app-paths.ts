// Stub for $app/paths in vitest component tests.
// Real implementation is supplied by SvelteKit's Vite plugin at build time.
// No `paths.base` is configured, so resolving is just filling in the dynamic
// segments of a route id — assertions can compare against the plain pathname.
export const base = "";
export const assets = "";

export function asset(file: string): string {
  return file;
}

export function resolve(
  route: string,
  params?: Record<string, string>,
): string {
  if (!params) return route;
  return route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (match, name: string) =>
    name in params ? params[name] : match,
  );
}
