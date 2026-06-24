import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      getFullList: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(() => {}),
    }),
  }),
}));

import Library from "./+page.svelte";

describe("library page", () => {
  it("shows a warm empty state when there are no articles", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText(/nothing saved yet/i)).toBeInTheDocument());
  });
});
