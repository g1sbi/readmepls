import { expect, test } from "vitest";
import { APP_URL, GITHUB_URL, TAGLINE, STEPS, FEATURES } from "$lib/site";

test("APP_URL points at the app subdomain", () => {
  expect(APP_URL).toBe("https://app.readmepls.com");
});

test("GITHUB_URL is an absolute https url", () => {
  expect(GITHUB_URL.startsWith("https://github.com/")).toBe(true);
});

test("tagline matches the brand line", () => {
  expect(TAGLINE).toBe("save any link. actually read it. pls.");
});

test("there are exactly three how-it-works steps", () => {
  expect(STEPS).toHaveLength(3);
  expect(STEPS[0]?.title.length).toBeGreaterThan(0);
});

test("there is at least one feature, each with title and body", () => {
  expect(FEATURES.length).toBeGreaterThan(0);
  for (const f of FEATURES) {
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.body.length).toBeGreaterThan(0);
  }
});
