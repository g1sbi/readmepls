import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { page } from "$app/stores";
import ProfilePage from "./+page.svelte";

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/profile"),
  route: { id: "/profile" as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

const update = vi.fn(async () => ({}));
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1", tier: "standard" } },
    collection: () => ({ update }),
  }),
}));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

beforeEach(() => update.mockClear());

describe("/profile", () => {
  it("hosted SaaS, standard tier: shows a Go Pro toggle", () => {
    page.set({ ...basePageValue, data: { tier: "standard", selfHosted: false } });
    render(ProfilePage);
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go pro/i })).toBeInTheDocument();
  });

  it("hosted SaaS: clicking the toggle flips tier and refreshes layout data", async () => {
    page.set({ ...basePageValue, data: { tier: "standard", selfHosted: false } });
    render(ProfilePage);
    await fireEvent.click(screen.getByRole("button", { name: /go pro/i }));
    expect(update).toHaveBeenCalledWith("u1", { tier: "pro" });
  });

  it("hosted SaaS, pro tier: shows a downgrade toggle", () => {
    page.set({ ...basePageValue, data: { tier: "pro", selfHosted: false } });
    render(ProfilePage);
    expect(screen.getByText(/^pro$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to standard/i })).toBeInTheDocument();
  });

  it("self-hosted: shows the operator-set tier with no toggle", () => {
    page.set({ ...basePageValue, data: { tier: "pro", selfHosted: true } });
    render(ProfilePage);
    expect(screen.getByText(/^pro$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /go pro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to standard/i })).not.toBeInTheDocument();
    expect(screen.getByText(/set by this instance's operator/i)).toBeInTheDocument();
  });
});
