import { readFileSync, readdirSync, statSync } from "node:fs";

function referencedVars(relativePath) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return new Set(
    [...text.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g)].map((m) => m[1])
  );
}

function declaredVars(relativePath) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return new Set(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=")[0])
  );
}

// Each compose file's ${VAR} references must all be declared in its paired
// env template. compose.yml/.env.example (self-host) and
// compose.site.yml/.env.site.example (landing page, maintainer-only) are
// independent pairs — self-hosters never load the site file, so its vars
// don't belong in .env.example.
const pairs = [
  { compose: "../compose.yml", env: "../.env.example" },
  { compose: "../compose.site.yml", env: "../.env.site.example" },
];

for (const { compose, env } of pairs) {
  const referenced = referencedVars(compose);
  const declared = declaredVars(env);
  const missing = [...referenced].filter((v) => !declared.has(v));
  if (missing.length) {
    console.error(`${compose} references vars absent from ${env}:`, missing);
    process.exit(1);
  }
  console.log(
    `env-parity OK: ${compose} — ${referenced.size} referenced vars all declared in ${env}`
  );
}

// --- code-vs-env: every PUBLIC_* read in web source must be declared in the
// self-host .env.example (the only env file `web` actually reads) ---
const declaredMain = declaredVars("../.env.example");
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

const undeclaredPublic = [...usedPublic].filter((v) => !declaredMain.has(v));
if (undeclaredPublic.length) {
  console.error(
    "web source uses PUBLIC_* vars absent from .env.example:",
    undeclaredPublic
  );
  process.exit(1);
}
console.log(`env-parity OK: ${usedPublic.size} PUBLIC_* code vars all declared`);
