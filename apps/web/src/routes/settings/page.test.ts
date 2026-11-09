import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("$lib/auth/sign-out.js", () => ({ signOut }));
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({ authStore: { model: { email: "me@example.com" } } }),
}));

import Page from "./+page.svelte";

const set = vi.fn();
const context = new Map([["theme", { current: "light", mode: "light", set }]]);

describe("/settings", () => {
  beforeEach(() => {
    set.mockClear();
    signOut.mockClear();
  });

  it("has Appearance, Connectors and Account sections", () => {
    render(Page, { context });
    for (const name of ["Appearance", "Connectors", "Account"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("choosing Dark calls the theme context set", async () => {
    render(Page, { context });
    await fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(set).toHaveBeenCalledWith("dark");
  });

  it("links to connectors and shows the email", () => {
    render(Page, { context });
    expect(
      screen.getByRole("link", { name: /export and connections/i }),
    ).toHaveAttribute("href", "/settings/connectors");
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
  });

  it("Sign out calls signOut", async () => {
    render(Page, { context });
    await fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
