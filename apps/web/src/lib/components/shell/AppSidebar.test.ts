import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const { createCollection } = vi.hoisted(() => ({ createCollection: vi.fn() }));
vi.mock("$lib/collections/actions.js", () => ({ createCollection }));
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

beforeEach(() => createCollection.mockReset());

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
});
