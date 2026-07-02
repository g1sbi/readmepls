import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const activeItems = [
  { id: "a1", url: "https://example.com/a", status: "unread", progress: 0,
    expand: { content: { title: "Active one", extract_status: "ok", ai_tags_json: [] } } },
];
const archivedItems = [
  { id: "a2", url: "https://example.com/b", status: "archived", progress: 0,
    expand: { content: { title: "Archived one", extract_status: "ok", ai_tags_json: [] } } },
];

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" }, token: "tok" },
    filter: (expr: string, params: Record<string, unknown>) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => String(params[k])),
    collection: (name: string) => {
      if (name === "articles") {
        return {
          // return archived vs active based on the operator in the filter string
          getList: vi.fn((_p: number, _pp: number, opts: { filter: string }) =>
            Promise.resolve({ items: opts.filter.includes("!=") ? activeItems : archivedItems })),
          subscribe: vi.fn().mockResolvedValue(() => {}),
          update: vi.fn().mockResolvedValue({}),
        };
      }
      // tags + collections
      return { getFullList: vi.fn().mockResolvedValue([]) };
    },
  }),
}));

import Library from "./+page.svelte";

describe("library archived filter", () => {
  it("shows active articles by default and hides archived", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Active one")).toBeInTheDocument());
    expect(screen.queryByText("Archived one")).not.toBeInTheDocument();
  });

  it("swaps to archived articles when the toggle is pressed", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Active one")).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: /archived/i }));
    await waitFor(() => expect(screen.getByText("Archived one")).toBeInTheDocument());
    expect(screen.queryByText("Active one")).not.toBeInTheDocument();
  });
});
