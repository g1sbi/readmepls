import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import GetExtensionDialog from "./GetExtensionDialog.svelte";

describe("GetExtensionDialog", () => {
  it("shows the pitch and a store CTA when open", () => {
    render(GetExtensionDialog, { open: true });

    expect(
      screen.getByRole("heading", { name: /save in one click/i }),
    ).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: /chrome extension/i });
    expect(cta).toHaveAttribute(
      "href",
      "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje",
    );
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener");
  });
});
