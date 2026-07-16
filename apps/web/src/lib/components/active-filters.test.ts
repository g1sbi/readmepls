// apps/web/src/lib/components/active-filters.test.ts
import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import ActiveFilters from "./ActiveFilters.svelte";
import { LibraryParams } from "@readmepls/types";

const labels = { tag: { t1: "Dev" }, collection: {}, source: {} };

describe("ActiveFilters", () => {
  it("renders nothing when no filters are active", () => {
    const { container } = render(ActiveFilters, {
      params: LibraryParams.parse({}),
      labels,
      onRemove: () => {},
      onClear: () => {},
    });
    expect(container.querySelector("[data-testid='active-chip']")).toBeNull();
  });

  it("renders a chip per active value with resolved labels", () => {
    const { getAllByTestId, getByText } = render(ActiveFilters, {
      params: LibraryParams.parse({ read: ["unread"], tag: ["t1"] }),
      labels,
      onRemove: () => {},
      onClear: () => {},
    });
    expect(getAllByTestId("active-chip")).toHaveLength(2);
    expect(getByText((content) => content.startsWith("Dev"))).toBeTruthy(); // tag id resolved to name
    expect(getByText((content) => content.startsWith("unread"))).toBeTruthy();
  });

  it("removing a chip emits a patch dropping only that value", async () => {
    const onRemove = vi.fn();
    const { getByLabelText } = render(ActiveFilters, {
      params: LibraryParams.parse({ read: ["unread", "reading"] }),
      labels,
      onRemove,
      onClear: () => {},
    });
    await fireEvent.click(getByLabelText("remove unread"));
    expect(onRemove).toHaveBeenCalledWith({ read: ["reading"] });
  });

  it("clear-all calls onClear", async () => {
    const onClear = vi.fn();
    const { getByText } = render(ActiveFilters, {
      params: LibraryParams.parse({ read: ["unread"] }),
      labels,
      onRemove: () => {},
      onClear,
    });
    await fireEvent.click(getByText("clear all"));
    expect(onClear).toHaveBeenCalled();
  });

  it("q chip: label edits via onEditQuery, ✕ removes the query", async () => {
    const onRemove = vi.fn();
    const onEditQuery = vi.fn();
    render(ActiveFilters, {
      params: LibraryParams.parse({ q: "rust" }),
      labels: { tag: {}, collection: {}, source: {} },
      onRemove,
      onClear: () => {},
      onEditQuery,
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /edit search “rust”/i }),
    );
    expect(onEditQuery).toHaveBeenCalled();
    await fireEvent.click(
      screen.getByRole("button", { name: /remove search “rust”/i }),
    );
    expect(onRemove).toHaveBeenCalledWith({ q: "" });
  });
});
