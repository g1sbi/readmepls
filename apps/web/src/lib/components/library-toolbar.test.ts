import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import LibraryToolbar from "./LibraryToolbar.svelte";
import { LibraryParams } from "@readmepls/types";

const base = LibraryParams.parse({});

describe("LibraryToolbar", () => {
  it("shows the result count", () => {
    const { getByText } = render(LibraryToolbar, {
      params: base,
      total: 42,
      onSort: () => {},
      onOpenFilters: () => {},
    });
    expect(getByText("42 articles")).toBeTruthy();
  });

  it("changing sort emits the raw Sort value", async () => {
    const onSort = vi.fn();
    const { getByLabelText } = render(LibraryToolbar, {
      params: base,
      total: 0,
      onSort,
      onOpenFilters: () => {},
    });
    await fireEvent.change(getByLabelText("sort"), {
      target: { value: "-read_time" },
    });
    expect(onSort).toHaveBeenCalledWith("-read_time");
  });

  it("filters button opens the drawer", async () => {
    const onOpenFilters = vi.fn();
    const { getByText } = render(LibraryToolbar, {
      params: base,
      total: 0,
      onSort: () => {},
      onOpenFilters,
    });
    await fireEvent.click(getByText("filters"));
    expect(onOpenFilters).toHaveBeenCalled();
  });

  it("no longer renders a text search input (search lives in the palette)", () => {
    render(LibraryToolbar, {
      params: base,
      total: 3,
      onSort: () => {},
      onOpenFilters: () => {},
    });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });
});
