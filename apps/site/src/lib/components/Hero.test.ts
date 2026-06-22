import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Hero from "./Hero.svelte";
import { APP_URL, GITHUB_URL, TAGLINE } from "$lib/site";

test("hero renders the tagline", () => {
  render(Hero);
  expect(screen.getByText(TAGLINE)).toBeTruthy();
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
