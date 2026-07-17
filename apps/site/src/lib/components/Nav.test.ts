import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Nav from "./Nav.svelte";
import { GITHUB_URL } from "$lib/site";

test("renders the GitHub link", () => {
  render(Nav);
  const gh = screen.getByRole("link", { name: "GitHub" });
  expect(gh.getAttribute("href")).toBe(GITHUB_URL);
});

test("renders the Docs link pointing at /docs", () => {
  render(Nav);
  const docs = screen.getByRole("link", { name: "Docs" });
  expect(docs.getAttribute("href")).toBe("/docs");
});
