// A CSS animation that ever animates `transform` keeps establishing a
// containing block for `position: fixed` descendants even after it finishes
// — browsers don't revert this until the finished Animation is actually
// cancelled, regardless of the animation's end value (see the .page reveal
// animation, which broke Sheet's fixed backdrop/panel and the reader's fixed
// progress bar). Cancelling the finished animation releases the containing
// block without changing the element's visible end state.
export function releaseTransformContainingBlock(node: HTMLElement) {
  function releaseFinished() {
    // Not every environment implements the Web Animations API (jsdom).
    if (typeof node.getAnimations !== "function") return;
    for (const anim of node.getAnimations()) {
      if (anim.playState === "finished") anim.cancel();
    }
  }
  // A cold load can finish the animation before hydration attaches the
  // listener below, leaving no animationend to wait for — so sweep once on
  // mount as well, or the stale transform outlives the animation for good.
  releaseFinished();
  node.addEventListener("animationend", releaseFinished);

  return {
    destroy() {
      node.removeEventListener("animationend", releaseFinished);
    },
  };
}
