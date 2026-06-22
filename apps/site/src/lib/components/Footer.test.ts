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
