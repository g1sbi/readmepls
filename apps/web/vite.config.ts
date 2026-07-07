import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    // optimal-select@4.0.1 (transitive via @apache-annotator/dom, used by
    // highlight anchoring) declares `module: src/index.js` but ships no src/
    // dir — only lib/ (main, CJS) and dist/. Vite prefers `module` and dies
    // resolving the dead entry. Pin the bare specifier to the real CJS entry
    // (exact regex so subpath imports aren't rewritten).
    alias: [
      { find: /^optimal-select$/, replacement: "optimal-select/lib/index.js" },
    ],
  },
  build: {
    // @readmepls/core is a bundled workspace package; its transitive CJS deps
    // (turndown's lazy `require("@mixmark-io/domino")`, optimal-select's
    // `require("./select")`) mix `import` and `require`. Without this, the
    // bare `require` leaks into the ESM server bundle ("require is not
    // defined"). transformMixedEsModules makes rollup's commonjs plugin
    // rewrite those requires during bundling.
    commonjsOptions: { transformMixedEsModules: true },
  },
});
