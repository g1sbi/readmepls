import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import "@testing-library/jest-dom/vitest";
import Page from "./+page.svelte";

describe("connectors settings page", () => {
  it("lists markdown as active with an export link", () => {
    const { getByText, getByRole } = render(Page);
    expect(getByText(/markdown/i)).toBeInTheDocument();
    const link = getByRole("link", { name: /export library/i });
    expect(link).toHaveAttribute("href", "/api/export?scope=library");
  });

  it("shows notion and obsidian as coming soon", () => {
    const { getAllByText } = render(Page);
    expect(getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(2);
  });
});
