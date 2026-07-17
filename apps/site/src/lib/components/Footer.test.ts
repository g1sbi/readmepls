import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Footer from "./Footer.svelte";
import { GITHUB_URL } from "$lib/site";

test("renders the GitHub link", () => {
  render(Footer);
  const gh = screen.getByRole("link", { name: "GitHub" });
  expect(gh.getAttribute("href")).toBe(GITHUB_URL);
});

test("renders the open-source line from the banner", () => {
  render(Footer);
  expect(screen.getByText(/open source · self-hostable/i)).toBeTruthy();
});

test("renders the Docs link pointing at /docs", () => {
  render(Footer);
  const docs = screen.getByRole("link", { name: "Docs" });
  expect(docs.getAttribute("href")).toBe("/docs");
});

test("renders the Privacy link pointing at /privacy", () => {
  render(Footer);
  const privacy = screen.getByRole("link", { name: "Privacy" });
  expect(privacy.getAttribute("href")).toBe("/privacy");
});
