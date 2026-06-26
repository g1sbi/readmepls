import { describe, it, expect } from "vitest";
import { exportFilename } from "./filename.js";

describe("exportFilename", () => {
  it("slugifies the title", () => {
    expect(exportFilename("Hello World!", "abc123", new Set())).toBe("hello-world.md");
  });

  it("appends the id suffix on collision", () => {
    const used = new Set<string>();
    expect(exportFilename("Same Title", "aaaaaa", used)).toBe("same-title.md");
    expect(exportFilename("Same Title", "bbbbbb", used)).toBe("same-title-bbbbbb.md");
  });

  it("falls back to untitled for empty slugs", () => {
    expect(exportFilename("!!!", "abc123", new Set())).toBe("untitled.md");
  });
});
