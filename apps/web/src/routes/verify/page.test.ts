import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const h = vi.hoisted(() => ({
  confirmVerification: vi.fn(async () => true),
  authRefresh: vi.fn(async () => ({})),
  requestVerification: vi.fn(async () => true),
  clear: vi.fn(),
  goto: vi.fn(async () => {}),
  isValid: true,
  email: "new@user.co",
}));

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: {
      get isValid() { return h.isValid; },
      get model() { return { email: h.email }; },
      clear: h.clear,
    },
    collection: () => ({
      confirmVerification: h.confirmVerification,
      authRefresh: h.authRefresh,
      requestVerification: h.requestVerification,
    }),
  }),
}));
vi.mock("$app/navigation", () => ({ goto: h.goto }));

import Page from "./+page.svelte";

beforeEach(() => {
  h.confirmVerification.mockClear();
  h.requestVerification.mockClear();
  h.goto.mockClear();
  h.confirmVerification.mockResolvedValue(true);
  h.isValid = true;
});

describe("/verify page", () => {
  it("confirms a token then refreshes and redirects home", async () => {
    render(Page, { props: { data: { token: "tok123" } } });
    await waitFor(() => expect(h.confirmVerification).toHaveBeenCalledWith("tok123"));
    await waitFor(() => expect(h.goto).toHaveBeenCalledWith("/"));
  });

  it("shows an error and resend option when the token is invalid", async () => {
    h.confirmVerification.mockRejectedValueOnce(new Error("expired"));
    render(Page, { props: { data: { token: "bad" } } });
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
  });

  it("without a token, resend calls requestVerification with the current email", async () => {
    render(Page, { props: { data: { token: null } } });
    await fireEvent.click(screen.getByRole("button", { name: /resend/i }));
    expect(h.requestVerification).toHaveBeenCalledWith("new@user.co");
  });

  it("confirms a token but does not redirect home when there is no valid session", async () => {
    h.isValid = false;
    render(Page, { props: { data: { token: "tok123" } } });
    await waitFor(() => expect(h.confirmVerification).toHaveBeenCalledWith("tok123"));
    expect(await screen.findByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(h.goto).not.toHaveBeenCalledWith("/");
  });
});
