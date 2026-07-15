import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Hero from "./Hero.svelte";
import { APP_URL, GITHUB_URL, TAGLINE, REEL_WORDS } from "$lib/site";

test("hero renders the second tagline line", () => {
  render(Hero);
  expect(screen.getByText(TAGLINE)).toBeTruthy();
});

test("hero shows the 'save any' lead", () => {
  const { container } = render(Hero);
  expect(container.querySelector(".reel-lead")?.textContent).toMatch(
    /save any/i,
  );
});

test("reel column carries every reel word", () => {
  const { container } = render(Hero);
  const col = container.querySelector(".reel-col");
  expect(col).not.toBeNull();
  for (const w of REEL_WORDS) {
    expect(col?.textContent).toContain(w);
  }
});

test("reel is hidden from assistive tech", () => {
  const { container } = render(Hero);
  expect(container.querySelector(".reel")?.getAttribute("aria-hidden")).toBe(
    "true",
  );
});

test("hero exposes the full phrase to screen readers", () => {
  const { container } = render(Hero);
  const sr = container.querySelector(".sr-only");
  expect(sr?.textContent).toContain("save any");
  for (const w of REEL_WORDS) {
    expect(sr?.textContent).toContain(w);
  }
});

test("Open app CTA links to the app subdomain", () => {
  render(Hero);
  const cta = screen.getByRole("link", { name: "Open app" });
  expect(cta.getAttribute("href")).toBe(APP_URL);
});

test("GitHub link is present", () => {
  render(Hero);
  const gh = screen.getByRole("link", { name: "GitHub" });
  expect(gh.getAttribute("href")).toBe(GITHUB_URL);
});
