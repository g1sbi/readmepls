import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

const h = vi.hoisted(() => ({
  create: vi.fn(async () => ({})),
  authWithPassword: vi.fn(async () => ({})),
  requestVerification: vi.fn(async () => true),
  goto: vi.fn(async () => {}),
}));

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      create: h.create,
      authWithPassword: h.authWithPassword,
      requestVerification: h.requestVerification,
    }),
  }),
}));
vi.mock("$app/navigation", () => ({ goto: h.goto }));

import Page from "./+page.svelte";

async function signUp(selfHosted: boolean) {
  render(Page, { props: { data: { locked: false, selfHosted } } });
  await fireEvent.click(
    screen.getByRole("button", { name: /need an account\? sign up/i }),
  );
  await fireEvent.input(screen.getByPlaceholderText("email"), {
    target: { value: "new@user.co" },
  });
  await fireEvent.input(screen.getByPlaceholderText("password"), {
    target: { value: "password1" },
  });
  await fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  h.create.mockClear();
  h.requestVerification.mockClear();
  h.goto.mockClear();
});

describe("signup verification (SaaS)", () => {
  it("requests verification and redirects to /verify", async () => {
    await signUp(false);
    expect(h.requestVerification).toHaveBeenCalledWith("new@user.co");
    expect(h.goto).toHaveBeenCalledWith("/verify");
  });
});

describe("signup verification (self-host)", () => {
  it("skips verification and redirects home", async () => {
    await signUp(true);
    expect(h.requestVerification).not.toHaveBeenCalled();
    // The root layout's data (sidebar collections, tier) was loaded signed
    // out; it only depends on the auth cookie, so it must be re-run.
    expect(h.goto).toHaveBeenCalledWith("/", { invalidateAll: true });
  });
});

describe("sign in", () => {
  it("re-runs the root layout load on the way home", async () => {
    render(Page, {
      props: { data: { locked: false, selfHosted: true } },
    } as never);
    await fireEvent.input(screen.getByPlaceholderText("email"), {
      target: { value: "me@user.co" },
    });
    await fireEvent.input(screen.getByPlaceholderText("password"), {
      target: { value: "password1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(h.goto).toHaveBeenCalledWith("/", { invalidateAll: true });
  });
});

describe("signup verification email failure", () => {
  it("still redirects to /verify and does not surface the create error when requestVerification rejects", async () => {
    h.requestVerification.mockRejectedValueOnce(new Error("smtp down"));
    await signUp(false);
    expect(h.goto).toHaveBeenCalledWith("/verify");
    expect(
      screen.queryByText("Could not create account."),
    ).not.toBeInTheDocument();
  });
});
