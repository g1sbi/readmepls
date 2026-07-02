import { describe, it, expect } from "vitest";
import { shouldAnimateNavigation } from "./view-transition";

const mql = (matches: boolean) => ({ matches }) as MediaQueryList;

describe("shouldAnimateNavigation", () => {
  it("is true when startViewTransition exists and motion is allowed", () => {
    const doc = { startViewTransition: () => {} } as unknown as Document;
    expect(shouldAnimateNavigation(doc, mql(false))).toBe(true);
  });

  it("is false when the API is missing", () => {
    const doc = {} as Document;
    expect(shouldAnimateNavigation(doc, mql(false))).toBe(false);
  });

  it("is false when the user prefers reduced motion", () => {
    const doc = { startViewTransition: () => {} } as unknown as Document;
    expect(shouldAnimateNavigation(doc, mql(true))).toBe(false);
  });
});
