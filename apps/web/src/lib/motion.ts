// Shared reduced-motion probe. Guards matchMedia because jsdom (tests) and any
// non-browser context lack it — absence means "no preference", so animate.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
