import { readFileSync } from "node:fs";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

// Vars referenced in compose as ${VAR} or ${VAR:-default}
const referenced = new Set(
  [...compose.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g)].map((m) => m[1])
);
// Vars declared in .env.example (KEY=...)
const declared = new Set(
  envExample
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=")[0])
);

const missing = [...referenced].filter((v) => !declared.has(v));
if (missing.length) {
  console.error("compose references vars absent from .env.example:", missing);
  process.exit(1);
}
console.log(`env-parity OK: ${referenced.size} referenced vars all declared`);
