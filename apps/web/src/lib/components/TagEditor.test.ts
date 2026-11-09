import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import TagEditor from "./TagEditor.svelte";

describe("TagEditor", () => {
  it("emits a new tag name on submit", async () => {
    const onadd = vi.fn();
    render(TagEditor, { tags: [], onadd, onremove: vi.fn() });
    const input = screen.getByLabelText(/add tag/i);
    await fireEvent.input(input, { target: { value: "machine learning" } });
    await fireEvent.submit(input.closest("form")!);
    expect(onadd).toHaveBeenCalledWith("machine learning");
  });

  it("emits remove for an existing tag", async () => {
    const onremove = vi.fn();
    render(TagEditor, {
      tags: [{ id: "t1", name: "ml" }],
      onadd: vi.fn(),
      onremove,
    });
    await fireEvent.click(screen.getByRole("button", { name: /remove ml/i }));
    expect(onremove).toHaveBeenCalledWith("t1");
  });

  it("remove button has a 44px hit area that its badge does not clip", () => {
    render(TagEditor, {
      tags: [{ id: "t1", name: "ml" }],
      onadd: vi.fn(),
      onremove: vi.fn(),
    });
    const btn = screen.getByRole("button", { name: /remove ml/i });
    expect(btn.className).toContain("after:-inset-1");
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("min-w-9");
    const badge = btn.closest('[data-slot="badge"]')!;
    expect(badge.className).toContain("overflow-visible");
    expect(badge.className).not.toContain("overflow-hidden");
  });
});
