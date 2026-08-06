import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
      // SvelteKit's plugin supplies $app/* at build time; the standalone
      // component-test setup doesn't load it, so wire it here too.
      "$app/paths": fileURLToPath(
        new URL("./src/__mocks__/app-paths.ts", import.meta.url),
      ),
      "$env/dynamic/public": fileURLToPath(
        new URL("./src/__mocks__/env-dynamic-public.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "docker-entrypoint.d/**/*.test.ts"],
  },
});
