import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";

describe("login page — single-account lock", () => {
  it("shows the sign-up toggle when unlocked", () => {
    render(Page, { props: { data: { locked: false } } });
    expect(
      screen.getByRole("button", { name: /need an account\? sign up/i })
    ).toBeInTheDocument();
  });

  it("hides the sign-up toggle and shows a note when locked", () => {
    render(Page, { props: { data: { locked: true } } });
    expect(
      screen.queryByRole("button", { name: /need an account\? sign up/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/locked to one account/i)).toBeInTheDocument();
  });
});
