// Stub for $app/stores in vitest component tests.
// Real implementation is supplied by SvelteKit's Vite plugin at build time.
// `page` is writable so tests can call page.set({...}) to control page.data
// (e.g. viewer tier) before rendering a component that reads $page.
import { writable } from "svelte/store";

export const page = writable({
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
});

export const navigating = writable(null);
export const updated = { subscribe: writable(false).subscribe, check: async () => false };
