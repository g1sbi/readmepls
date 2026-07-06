import { render } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import BottomNav from "./BottomNav.svelte";

describe("BottomNav", () => {
  it("renders the three primary tabs with correct hrefs", () => {
    const { getByRole } = render(BottomNav, { pathname: "/library" });
    expect(getByRole("link", { name: /library/i })).toHaveAttribute("href", "/library");
    expect(getByRole("link", { name: /search/i })).toHaveAttribute("href", "/library?focus=search");
    expect(getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("marks the active tab from the pathname", () => {
    const { getByRole } = render(BottomNav, { pathname: "/profile" });
    expect(getByRole("link", { name: /profile/i })).toHaveAttribute("aria-current", "page");
    expect(getByRole("link", { name: /library/i })).not.toHaveAttribute("aria-current");
  });

  it("treats the reader route as within the library tab", () => {
    const { getByRole } = render(BottomNav, { pathname: "/read/abc123" });
    expect(getByRole("link", { name: /library/i })).toHaveAttribute("aria-current", "page");
  });
});
