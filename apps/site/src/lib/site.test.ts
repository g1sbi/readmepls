import { expect, test, vi, beforeEach } from "vitest";

// Mutable mock of the SvelteKit runtime-public-env virtual module.
const mockEnv: Record<string, string> = {};
vi.mock("$env/dynamic/public", () => ({ env: mockEnv }));

beforeEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  vi.resetModules();
});

test("APP_URL uses PUBLIC_APP_URL when set", async () => {
  mockEnv.PUBLIC_APP_URL = "https://app.example.com";
  const { APP_URL } = await import("$lib/site");
  expect(APP_URL).toBe("https://app.example.com");
});

test("APP_URL falls back to localhost dev default when unset", async () => {
  const { APP_URL } = await import("$lib/site");
  expect(APP_URL).toBe("http://localhost:3000");
});

test("GITHUB_URL is an absolute https url", async () => {
  const { GITHUB_URL } = await import("$lib/site");
  expect(GITHUB_URL.startsWith("https://github.com/")).toBe(true);
});

test("tagline matches the brand line", async () => {
  const { TAGLINE } = await import("$lib/site");
  expect(TAGLINE).toBe("save any link. actually read it. pls.");
});

test("there are exactly three how-it-works steps", async () => {
  const { STEPS } = await import("$lib/site");
  expect(STEPS).toHaveLength(3);
  expect(STEPS[0]?.title.length).toBeGreaterThan(0);
});

test("there is at least one feature, each with title and body", async () => {
  const { FEATURES } = await import("$lib/site");
  expect(FEATURES.length).toBeGreaterThan(0);
  for (const f of FEATURES) {
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.body.length).toBeGreaterThan(0);
  }
});
