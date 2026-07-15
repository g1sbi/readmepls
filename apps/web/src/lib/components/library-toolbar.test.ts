import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import LibraryToolbar from "./LibraryToolbar.svelte";
import { LibraryParams } from "@readmepls/types";

const base = LibraryParams.parse({});

describe("LibraryToolbar", () => {
  it("shows the result count", () => {
    const { getByText } = render(LibraryToolbar, {
      params: base, total: 42, onSearch: () => {}, onSort: () => {}, onOpenFilters: () => {},
    });
    expect(getByText("42 articles")).toBeTruthy();
  });

  it("submitting the search emits the query", async () => {
    const onSearch = vi.fn();
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0, onSearch, onSort: () => {}, onOpenFilters: () => {},
    });
    const input = getByLabelText("search your library") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "neural" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("neural");
  });

  it("changing sort emits the raw Sort value", async () => {
    const onSort = vi.fn();
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0, onSearch: () => {}, onSort, onOpenFilters: () => {},
    });
    await fireEvent.change(getByLabelText("sort"), { target: { value: "-read_time" } });
    expect(onSort).toHaveBeenCalledWith("-read_time");
  });

  it("filters button opens the drawer", async () => {
    const onOpenFilters = vi.fn();
    const { getByText } = render(LibraryToolbar, {
      params: base, total: 0, onSearch: () => {}, onSort: () => {}, onOpenFilters,
    });
    await fireEvent.click(getByText("filters"));
    expect(onOpenFilters).toHaveBeenCalled();
  });

  it("autofocuses the search input when focusSearch is set", () => {
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0, focusSearch: true,
      onSearch: () => {}, onSort: () => {}, onOpenFilters: () => {},
    });
    expect(document.activeElement).toBe(getByLabelText("search your library"));
  });

  it("does not steal focus when focusSearch is absent", () => {
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0,
      onSearch: () => {}, onSort: () => {}, onOpenFilters: () => {},
    });
    expect(document.activeElement).not.toBe(getByLabelText("search your library"));
  });
});
