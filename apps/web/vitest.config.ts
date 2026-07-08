import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";

// SvelteKit's plugin supplies the `$lib` and `$app/*` aliases at build time;
// the standalone component-test setup doesn't load it, so wire them here too.
export default defineConfig({
  plugins: [svelte({ hot: false }), svelteTesting()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
      "$app/navigation": fileURLToPath(new URL("./src/__mocks__/app-navigation.ts", import.meta.url)),
      "$app/stores": fileURLToPath(new URL("./src/__mocks__/app-stores.ts", import.meta.url)),
      "$env/dynamic/public": fileURLToPath(new URL("./src/__mocks__/env-dynamic-public.ts", import.meta.url)),
      "$env/dynamic/private": fileURLToPath(new URL("./src/__mocks__/env-dynamic-private.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    setupFiles: ["./vitest-setup.ts"],
  },
});
