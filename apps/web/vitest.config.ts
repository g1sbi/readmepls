import { defineConfig } from "vitest/config";

// The web app has no unit tests in Phase 1 — capture logic is tested in
// @readmepls/core. This config keeps vitest from loading vite.config.ts (and the
// SvelteKit plugin, which needs a full SK project) during the workspace run.
export default defineConfig({
  test: { include: [] },
});
