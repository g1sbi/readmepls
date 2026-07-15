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

test("GITHUB_URL points at the g1sbi repo", async () => {
  const { GITHUB_URL } = await import("$lib/site");
  expect(GITHUB_URL).toBe("https://github.com/g1sbi/readmepls");
});

test("tagline is the hero's second line", async () => {
  const { TAGLINE } = await import("$lib/site");
  expect(TAGLINE).toBe("actually read it. pls.");
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

test("reel has the five ordered content-type words", async () => {
  const { REEL_WORDS } = await import("$lib/site");
  expect([...REEL_WORDS]).toEqual([
    "link",
    "article",
    "video",
    "thread",
    "newsletter",
  ]);
});

test("there are four features and none is the AI card", async () => {
  const { FEATURES } = await import("$lib/site");
  expect(FEATURES).toHaveLength(4);
  const titles = FEATURES.map((f) => f.title.toLowerCase());
  expect(titles.some((t) => t.includes("ai"))).toBe(false);
});

test("pro strip has a badge and AI body copy", async () => {
  const { PRO_STRIP } = await import("$lib/site");
  expect(PRO_STRIP.badge).toBe("Coming soon · Pro");
  expect(PRO_STRIP.body).toContain("AI auto-tags");
});
