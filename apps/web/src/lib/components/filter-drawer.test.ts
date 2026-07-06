import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import FilterDrawer from "./FilterDrawer.svelte";
import { LibraryParams } from "@readmepls/types";

// SourceFilter (used for the source group) calls browserPb() at init.
vi.mock("$lib/pb.js", () => ({ browserPb: () => ({ files: { getURL: () => "" }, baseURL: "" }) }));

const options = { sources: [], languages: ["en"], authors: ["Jane"] };
const props = (over = {}) => ({
  open: true, onClose: () => {}, params: LibraryParams.parse({}),
  options, tags: [{ id: "t1", name: "Dev" }], collections: [{ id: "c1", name: "Read later", slug: "read-later" }],
  onChange: () => {}, onToggleFavorite: () => {}, ...over,
});

describe("FilterDrawer", () => {
  it("renders facet groups when open", () => {
    const { getByText } = render(FilterDrawer, props());
    expect(getByText("read")).toBeTruthy();
    expect(getByText("reading time")).toBeTruthy();
    expect(getByText("tags")).toBeTruthy();
  });

  it("toggling a read value emits the additive patch", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({ onChange }));
    await fireEvent.click(getByLabelText("unread"));
    expect(onChange).toHaveBeenCalledWith({ read: ["unread"] });
  });

  it("toggling an already-selected value removes it", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({
      params: LibraryParams.parse({ read: ["unread"] }), onChange,
    }));
    await fireEvent.click(getByLabelText("unread"));
    expect(onChange).toHaveBeenCalledWith({ read: [] });
  });

  it("saved-date is single-select and emits a scalar", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({ onChange }));
    await fireEvent.click(getByLabelText("saved this week"));
    expect(onChange).toHaveBeenCalledWith({ saved: "week" });
  });

  it("clicking the active saved preset clears it back to null", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({
      params: LibraryParams.parse({ saved: "week" }), onChange,
    }));
    await fireEvent.click(getByLabelText("saved this week"));
    expect(onChange).toHaveBeenCalledWith({ saved: null });
  });
});
