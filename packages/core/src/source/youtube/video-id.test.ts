import { describe, it, expect } from "vitest";
import { parseVideoId } from "./video-id.js";

describe("parseVideoId", () => {
  it("parses watch?v= urls", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("parses youtu.be short urls", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  });
  it("returns null for non-video youtube urls", () => {
    expect(parseVideoId("https://www.youtube.com/feed/subscriptions")).toBeNull();
  });
  it("returns null for non-youtube hosts", () => {
    expect(parseVideoId("https://example.com/watch?v=abc")).toBeNull();
  });
});
