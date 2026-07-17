import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Page from "./+page.svelte";

test("renders the privacy policy heading and effective date", () => {
  render(Page);
  expect(
    screen.getByRole("heading", { name: /privacy policy/i }),
  ).toBeTruthy();
  expect(screen.getByText(/last updated/i)).toBeTruthy();
});

test("discloses the extension's data handling", () => {
  render(Page);
  expect(screen.getByRole("heading", { name: /browser extension/i })).toBeTruthy();
  expect(screen.getByText(/activeTab/)).toBeTruthy();
  expect(screen.getByText(/chrome\.storage/)).toBeTruthy();
});

test("states data is not sold and no remote code runs", () => {
  render(Page);
  expect(screen.getByText(/do not sell or rent it/i)).toBeTruthy();
  expect(screen.getByText(/runs no remote code/i)).toBeTruthy();
});
