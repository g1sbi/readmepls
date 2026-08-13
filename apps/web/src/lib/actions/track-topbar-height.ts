// Publishes the sticky TopBar's height as `--topbar-h` on the document root.
//
// The bar is `position: sticky; top: 0`, opaque, and — because `.page` is a
// stacking context of its own — always paints above anything in the page. Any
// other sticky column (the reader's rail and highlights sidebar) therefore has
// to pin *below* it, and cap its height to the space that's left, or it hides
// underneath the bar and runs off the bottom of the viewport.
//
// Measured rather than tokenized because the bar's height is content-driven
// (search field, wrapping rows), so a hardcoded token would silently drift.
// Pages without a TopBar never set the variable; the token's 0px default keeps
// their sticky offsets exactly as they were.
export function trackTopbarHeight(node: HTMLElement) {
  const root = document.documentElement;
  const sync = () =>
    root.style.setProperty(
      "--topbar-h",
      `${node.getBoundingClientRect().height}px`,
    );

  sync();

  // Feature-detected, same as the reveal action: without ResizeObserver the
  // measurement simply doesn't track later reflows.
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
  observer?.observe(node);

  return {
    destroy() {
      observer?.disconnect();
      // Clear on teardown: the reader hides the bar below 1024px, and a stale
      // offset would push its sticky columns down by a bar that isn't there.
      root.style.removeProperty("--topbar-h");
    },
  };
}
