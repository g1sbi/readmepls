// Scroll-triggered reveal. Progressive enhancement: the element is visible by
// default, so it stays visible without JS, with reduced motion, or anywhere
// IntersectionObserver is missing (e.g. jsdom in tests). When motion is allowed
// we hide it first (.reveal), then reveal it (.is-visible) as it scrolls in.
export function reveal(node: HTMLElement, params?: { delay?: number }) {
  const delay = params?.delay ?? 0;
  node.style.setProperty("--reveal-delay", `${delay}ms`);

  const prefersReduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced || typeof IntersectionObserver === "undefined") {
    node.classList.add("is-visible");
    return;
  }

  node.classList.add("reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          node.classList.add("is-visible");
          observer.unobserve(node);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
  );
  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    },
  };
}
