// Stub for $app/stores in vitest component tests.
// Real implementation is supplied by SvelteKit's Vite plugin at build time.
// Individual tests override this via vi.mock("$app/stores", factory) when
// they need to control page.params, page.url, etc.
import { readable } from "svelte/store";

export const page = readable({
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
});

export const navigating = readable(null);
export const updated = { subscribe: readable(false).subscribe, check: async () => false };
