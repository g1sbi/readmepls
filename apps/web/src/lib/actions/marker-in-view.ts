// Draws the highlighter swipe (.marker-swipe) on touch devices, where there is
// no hover: once, the first time the node is mostly in view. On hover-capable
// pointers CSS handles :hover, so this does nothing. Visible-by-default
// fallbacks (reduced motion, no IntersectionObserver) draw immediately.
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function matches(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

export function markerInView(node: HTMLElement): { destroy(): void } | void {
  if (matches(HOVER_QUERY)) return;

  if (
    matches("(prefers-reduced-motion: reduce)") ||
    typeof IntersectionObserver === "undefined"
  ) {
    node.classList.add("is-drawn");
    return;
  }

  let drawn = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (drawn) return;
      if (entries.some((e) => e.isIntersecting)) {
        drawn = true;
        node.classList.add("is-drawn");
        observer.disconnect();
      }
    },
    { threshold: 0.6 },
  );
  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    },
  };
}
