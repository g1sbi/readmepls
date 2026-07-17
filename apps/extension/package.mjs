import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";

// Importing build.mjs runs it (top-level await) → fresh dist/ with manifest at root.
await import("./build.mjs");

const { version } = createRequire(import.meta.url)("./manifest.json");
const zip = `readmepls-extension-${version}.zip`;
await rm(zip, { force: true });

// Zip the CONTENTS of dist/ (manifest must sit at the archive root), minus
// sourcemaps — they aren't needed in production and dominate the size.
execFileSync("zip", ["-r", "-X", `../${zip}`, ".", "-x", "*.map"], {
  cwd: "dist",
  stdio: "inherit",
});

console.log(`packaged → apps/extension/${zip}`);
