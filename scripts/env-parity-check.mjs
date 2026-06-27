import { readFileSync, readdirSync, statSync } from "node:fs";

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

// --- code-vs-env: every PUBLIC_* read in web source must be declared ---
const webSrc = new URL("../apps/web/src/", import.meta.url);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = new URL(name, dir);
    if (statSync(full).isDirectory()) out.push(...walk(new URL(name + "/", dir)));
    else if (/\.(ts|js|svelte)$/.test(name)) out.push(full);
  }
  return out;
}

const usedPublic = new Set();
for (const file of walk(webSrc)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bPUBLIC_[A-Z0-9_]+\b/g)) usedPublic.add(m[0]);
}

const undeclaredPublic = [...usedPublic].filter((v) => !declared.has(v));
if (undeclaredPublic.length) {
  console.error(
    "web source uses PUBLIC_* vars absent from .env.example:",
    undeclaredPublic
  );
  process.exit(1);
}
console.log(`env-parity OK: ${usedPublic.size} PUBLIC_* code vars all declared`);
