import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

// Two articles; tag "ml" (t1) links only to a1 via article_tags.
const items = [
  {
    id: "a1",
    url: "https://example.com/ml",
    status: "ok",
    progress: 0,
    expand: { content: { title: "Machine learning intro", extract_status: "ok", ai_tags_json: ["ml"] } },
  },
  {
    id: "a2",
    url: "https://example.com/pasta",
    status: "ok",
    progress: 0,
    expand: { content: { title: "Cooking pasta", extract_status: "ok", ai_tags_json: [] } },
  },
];

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" }, token: "tok" },
    // Minimal pb.filter binding implementation for tests
    filter: (expr: string, params: Record<string, unknown>) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => String(params[k])),
    collection: (name: string) => {
      if (name === "tags") {
        return { getFullList: vi.fn().mockResolvedValue([{ id: "t1", name: "ml" }]) };
      }
      if (name === "article_tags") {
        return {
          getFullList: vi.fn().mockResolvedValue([{ id: "l1", article: "a1", tag: "t1" }]),
        };
      }
      // articles + collections fall through here
      return {
        getList: vi.fn().mockResolvedValue({ items }),
        getFullList: vi.fn().mockResolvedValue([]),
        subscribe: vi.fn().mockResolvedValue(() => {}),
      };
    },
  }),
}));

import Library from "./+page.svelte";

describe("library tag filter", () => {
  it("filters the grid to the selected tag", async () => {
    render(Library);
    await waitFor(() =>
      expect(screen.getByText("Machine learning intro")).toBeInTheDocument(),
    );
    expect(screen.getByText("Cooking pasta")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: /^ml$/i }));

    await waitFor(() =>
      expect(screen.queryByText("Cooking pasta")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Machine learning intro")).toBeInTheDocument();
  });
});
