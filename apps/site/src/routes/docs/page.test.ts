import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Page from "./+page.svelte";

const data = {
  compose:
    "name: readmepls\nservices:\n  pocketbase:\n    image: ghcr.io/g1sbi/readmepls-pocketbase:latest\n",
  envExample: "PB_ADMIN_EMAIL=admin@example.com\n",
};

test("renders the self-hosting steps", () => {
  render(Page, { props: { data } });
  expect(screen.getByRole("heading", { name: /self-hosting/i })).toBeTruthy();
  expect(screen.getByText(/prerequisites/i)).toBeTruthy();
  expect(screen.getAllByText(/docker compose pull/).length).toBeGreaterThan(0);
});

test("renders the loaded compose.yml content verbatim", () => {
  render(Page, { props: { data } });
  expect(screen.getByText(/readmepls-pocketbase:latest/)).toBeTruthy();
});

test("renders the AI on/off explainer, not a tiers/plans pitch", () => {
  render(Page, { props: { data } });
  expect(
    screen.getByText(/no tiers, no plans, no subscriptions/i),
  ).toBeTruthy();
});

test("surfaces the browser extension with a store link", () => {
  render(Page, { props: { data } });
  expect(
    screen.getByRole("heading", { name: /browser extension/i }),
  ).toBeTruthy();
  const link = screen.getByRole("link", { name: /chrome web store/i });
  expect(link.getAttribute("href")).toBe(
    "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje",
  );
});
