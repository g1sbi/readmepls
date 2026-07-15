// A CSS animation that ever animates `transform` keeps establishing a
// containing block for `position: fixed` descendants even after it finishes
// — browsers don't revert this until the finished Animation is actually
// cancelled, regardless of the animation's end value (see the .page reveal
// animation, which broke Sheet's fixed backdrop/panel and the reader's fixed
// progress bar). Cancelling the finished animation releases the containing
// block without changing the element's visible end state.
export function releaseTransformContainingBlock(node: HTMLElement) {
  function onAnimationEnd() {
    for (const anim of node.getAnimations()) {
      if (anim.playState === "finished") anim.cancel();
    }
  }
  node.addEventListener("animationend", onAnimationEnd);

  return {
    destroy() {
      node.removeEventListener("animationend", onAnimationEnd);
    },
  };
}
