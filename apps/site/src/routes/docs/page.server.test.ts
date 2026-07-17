import { expect, test } from "vitest";
import { load } from "./+page.server";

// Guards the ?raw wiring: load must return the real repo-root files inlined at
// build time (not empty strings), so the prerendered docs never drift and the
// build never regresses to the import.meta.url path bug.
test("load inlines the real compose.yml and .env.example", () => {
  const data = load({} as never) as { compose: string; envExample: string };
  expect(data.compose).toContain("services:");
  expect(data.compose).toContain("pocketbase");
  expect(data.envExample).toContain("PB_ADMIN_EMAIL");
});
