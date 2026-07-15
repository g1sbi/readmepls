import { expect, test } from "vitest";
import { reveal } from "./reveal";

test("reveals immediately when IntersectionObserver is unavailable (no-JS/jsdom safety)", () => {
  const node = document.createElement("div");
  reveal(node);
  expect(node.classList.contains("is-visible")).toBe(true);
});

test("records the stagger delay as a custom property", () => {
  const node = document.createElement("div");
  reveal(node, { delay: 120 });
  expect(node.style.getPropertyValue("--reveal-delay")).toBe("120ms");
});
