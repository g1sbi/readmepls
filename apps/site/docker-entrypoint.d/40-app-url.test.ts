// @vitest-environment node
// This suite shells out to a POSIX-sh script and resolves it via a file:// URL
// (fileURLToPath). The site project's default jsdom environment replaces the
// global URL with a browser-oriented polyfill that can't resolve file: URLs,
// so this file overrides to the node environment.
import { expect, test, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./40-app-url.sh", import.meta.url));
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "site-sub-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("rewrites the sentinel in html and js to APP_URL", () => {
  writeFileSync(join(dir, "index.html"), '<a href="__APP_URL__">Open app</a>');
  writeFileSync(join(dir, "app.js"), 'const u="__APP_URL__";');
  writeFileSync(join(dir, "hero.png"), "__APP_URL__"); // non-target, must stay

  execFileSync("sh", [script], {
    env: { ...process.env, APP_URL: "https://app.example.com", SITE_ROOT: dir },
  });

  expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(
    '<a href="https://app.example.com">Open app</a>',
  );
  expect(readFileSync(join(dir, "app.js"), "utf8")).toBe(
    'const u="https://app.example.com";',
  );
  // .png is not an html/js target — left untouched.
  expect(readFileSync(join(dir, "hero.png"), "utf8")).toBe("__APP_URL__");
});

test("falls back to the SaaS URL when APP_URL is unset", () => {
  writeFileSync(join(dir, "index.html"), '<a href="__APP_URL__">Open app</a>');
  const env = { ...process.env, SITE_ROOT: dir };
  delete env.APP_URL;
  execFileSync("sh", [script], { env });
  expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(
    '<a href="https://app.readmepls.com">Open app</a>',
  );
});
