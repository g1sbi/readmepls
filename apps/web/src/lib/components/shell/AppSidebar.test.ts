import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const { createCollection, rejecting } = vi.hoisted(() => ({
  createCollection: vi.fn(),
  rejecting: { on: false },
}));
// Wrapper so a rejecting call is a plain promise, not one vitest's spy tracks
// (it re-surfaces tracked rejections as a failure of the test).
vi.mock("$lib/collections/actions.js", () => ({
  createCollection: (...args: unknown[]) =>
    rejecting.on
      ? Promise.reject(new Error("boom"))
      : createCollection(...args),
}));
vi.mock("$lib/pb.js", () => ({ browserPb: () => ({}) }));

import AppSidebar from "./AppSidebar.svelte";

const collections = [
  { id: "c1", name: "Physics", slug: "physics", count: 4 },
  { id: "c2", name: "Cooking", slug: "cooking", count: 12 },
];

const mount = (over: Record<string, unknown> = {}) => {
  const onCreated = vi.fn();
  render(AppSidebar, {
    pathname: "/",
    collections,
    onCreated,
    ...over,
  } as never);
  return { onCreated };
};

beforeEach(() => {
  createCollection.mockReset();
  rejecting.on = false;
});

describe("AppSidebar", () => {
  it("renders Home and Library but no unbuilt sections", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.queryByText(/websites/i)).toBeNull();
    expect(screen.queryByText(/goals/i)).toBeNull();
  });

  it("marks the active nav link", () => {
    mount({ pathname: "/library" });
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks the matching collection current", () => {
    mount({ pathname: "/collections/physics" });
    expect(screen.getByRole("link", { name: /Physics/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Cooking/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows counts and links collections", () => {
    mount();
    expect(screen.getByRole("link", { name: /Cooking/ })).toHaveAttribute(
      "href",
      "/collections/cooking",
    );
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("pins Settings outside the scrolling region", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      name: `Col ${i}`,
      slug: `col-${i}`,
      count: i,
    }));
    const { container } = render(AppSidebar, {
      pathname: "/",
      collections: many,
      onCreated: vi.fn(),
    } as never);
    const scroller = container.querySelector("[data-sidebar-scroll]")!;
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(scroller.contains(settings)).toBe(false);
    expect(
      scroller.contains(screen.getByRole("link", { name: /Col 29/ })),
    ).toBe(true);
  });

  it("creates a collection on Enter, then notifies", async () => {
    createCollection.mockResolvedValue({ ok: true });
    const { onCreated } = mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    const input = screen.getByLabelText("New collection name");
    await fireEvent.input(input, { target: { value: "Long reads" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createCollection).toHaveBeenCalledWith(
      expect.anything(),
      "Long reads",
    );
  });

  it("cancels on Escape", async () => {
    mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    await fireEvent.keyDown(screen.getByLabelText("New collection name"), {
      key: "Escape",
    });
    expect(screen.queryByLabelText("New collection name")).toBeNull();
  });

  it("shows the duplicate error inline", async () => {
    createCollection.mockResolvedValue({ ok: false, error: "duplicate" });
    const { onCreated } = mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    const input = screen.getByLabelText("New collection name");
    await fireEvent.input(input, { target: { value: "Physics" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText("A collection with that name already exists"),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the empty error inline", async () => {
    createCollection.mockResolvedValue({ ok: false, error: "empty" });
    mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    await fireEvent.keyDown(screen.getByLabelText("New collection name"), {
      key: "Enter",
    });
    expect(await screen.findByText("Give it a name first")).toBeInTheDocument();
  });

  it("shows the failed and unauthenticated messages as alerts", async () => {
    createCollection.mockResolvedValue({ ok: false, error: "failed" });
    mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    const input = screen.getByLabelText("New collection name");
    await fireEvent.input(input, { target: { value: "x" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't create it. Try again.");
    expect(input).toHaveAttribute("aria-describedby", alert.id);

    createCollection.mockResolvedValue({ ok: false, error: "unauthenticated" });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText("Sign in again to create collections."),
    ).toBeInTheDocument();
  });

  it("does not throw when create rejects", async () => {
    rejecting.on = true;
    mount();
    await fireEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    const input = screen.getByLabelText("New collection name");
    await fireEvent.input(input, { target: { value: "x" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText("Couldn't create it. Try again."),
    ).toBeInTheDocument();
  });

  it("returns focus to + after Escape and after a create", async () => {
    createCollection.mockResolvedValue({ ok: true });
    mount();
    const plus = screen.getByRole("button", { name: "New collection" });
    await fireEvent.click(plus);
    const input = screen.getByLabelText("New collection name");
    expect(input).toHaveFocus();
    await fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(plus).toHaveFocus());

    await fireEvent.click(plus);
    const input2 = screen.getByLabelText("New collection name");
    await fireEvent.input(input2, { target: { value: "ok" } });
    await fireEvent.keyDown(input2, { key: "Enter" });
    await waitFor(() => expect(plus).toHaveFocus());
  });

  it("refocuses the input when + is clicked while open", async () => {
    mount();
    const plus = screen.getByRole("button", { name: "New collection" });
    await fireEvent.click(plus);
    plus.focus();
    await fireEvent.click(plus);
    await waitFor(() =>
      expect(screen.getByLabelText("New collection name")).toHaveFocus(),
    );
  });

  it("matches an encoded slug and labels the list", () => {
    mount({
      pathname: "/collections/caf%C3%A9",
      collections: [{ id: "c9", name: "Café", slug: "café", count: 1 }],
    });
    expect(screen.getByRole("link", { name: /Café/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("list", { name: "Collections" }),
    ).toBeInTheDocument();
  });

  it("survives a malformed encoded pathname", () => {
    expect(() => mount({ pathname: "/collections/%E0%A4%A" })).not.toThrow();
  });

  // app.css owns the reset and Tailwind preflight is excluded, so a bare <ul>
  // keeps its browser bullets and 40px indent (horizontal overflow in the
  // More sheet at 360px).
  it("strips the browser list styling from its lists", () => {
    mount();
    const lists = screen
      .getByRole("navigation", { name: "Main" })
      .querySelectorAll("ul");
    expect(lists.length).toBeGreaterThan(1);
    for (const ul of lists) {
      expect(ul).toHaveClass("m-0", "list-none", "p-0");
    }
  });

  it("offers the browser extension just above Settings", () => {
    mount();
    const ext = screen.getByRole("button", { name: /get the extension/i });
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(
      ext.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
