import { describe, it, expect } from "vitest";
import { classifySource } from "./classify.js";

describe("classifySource", () => {
  it("detects x/twitter", () => {
    expect(classifySource("https://x.com/u/status/1")).toBe("x");
    expect(classifySource("https://twitter.com/u/status/1")).toBe("x");
  });
  it("detects youtube", () => {
    expect(classifySource("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(classifySource("https://youtu.be/abc")).toBe("youtube");
    expect(classifySource("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
  });
  it("defaults to article", () => {
    expect(classifySource("https://example.com/post")).toBe("article");
  });
});
