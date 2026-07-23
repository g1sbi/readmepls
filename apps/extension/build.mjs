import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

// popup + options load as <script type="module">; background is a module worker.
await esbuild.build({
  entryPoints: ["src/popup.ts", "src/options.ts", "src/background.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: "dist",
  sourcemap: true,
});

// Content scripts must be classic scripts, not ES modules.
await esbuild.build({
  entryPoints: ["src/content-marker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outdir: "dist",
  sourcemap: true,
});

await cp("manifest.json", "dist/manifest.json");
await cp("src/popup.html", "dist/popup.html");
await cp("src/options.html", "dist/options.html");
await cp("styles/tokens.css", "dist/tokens.css");

console.log("extension built → apps/extension/dist");
