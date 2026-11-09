import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const { createCollection } = vi.hoisted(() => ({ createCollection: vi.fn() }));
vi.mock("$lib/collections/actions.js", () => ({
  createCollection: (...a: unknown[]) => createCollection(...a),
}));
vi.mock("$lib/pb.js", () => ({ browserPb: () => ({}) }));

import MoreSheet from "./MoreSheet.svelte";

const many = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i}`,
  name: `Coll ${i}`,
  slug: `coll-${i}`,
  count: i,
}));

const mount = (over: Record<string, unknown> = {}) => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(MoreSheet, {
    open: true,
    onClose,
    pathname: "/",
    collections: many,
    onCreated,
    ...over,
  } as never);
  return { onClose, onCreated };
};

beforeEach(() => {
  createCollection.mockReset();
  // jsdom can't navigate; keep link clicks from logging "not implemented".
  document.addEventListener("click", (e) => e.preventDefault());
});

describe("MoreSheet", () => {
  it("titles the sheet More", () => {
    mount();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("keeps Settings pinned outside the scroll region", () => {
    mount();
    const settings = screen.getByRole("link", { name: "Settings" });
    const scroll = document.querySelector("[data-more-scroll]")!;
    expect(scroll).not.toBeNull();
    expect(scroll.contains(settings)).toBe(false);
    expect(scroll.querySelectorAll("a")).toHaveLength(30);
  });

  it("closes when a collection link is tapped", async () => {
    const { onClose } = mount();
    await fireEvent.click(screen.getByRole("link", { name: /Coll 3\b/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when Settings is tapped", async () => {
    const { onClose } = mount();
    await fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a collection", async () => {
    createCollection.mockResolvedValue({ ok: true });
    const { onCreated } = mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    const input = screen.getByLabelText("New collection name");
    await fireEvent.input(input, { target: { value: "Reading" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createCollection).toHaveBeenCalledWith({}, "Reading");
  });
});
