import { expect, test, vi } from "vitest";
import { releaseTransformContainingBlock } from "./release-transform-containing-block";

function withAnimations(
  node: HTMLElement,
  animations: { playState: string; cancel: () => void }[],
) {
  (
    node as unknown as { getAnimations: () => typeof animations }
  ).getAnimations = () => animations;
}

// A cold load can finish the reveal before hydration attaches the listener —
// there is no animationend left to wait for, and the stale transform keeps the
// reader's fixed edge rails sized to the whole document instead of the viewport.
test("cancels an animation that finished before the action mounted", () => {
  const node = document.createElement("div");
  const cancel = vi.fn();
  withAnimations(node, [{ playState: "finished", cancel }]);

  releaseTransformContainingBlock(node);

  expect(cancel).toHaveBeenCalledOnce();
});

test("cancels finished animations once the CSS animation ends", () => {
  const node = document.createElement("div");
  const cancel = vi.fn();
  const anim = { playState: "running", cancel };
  withAnimations(node, [anim]);

  releaseTransformContainingBlock(node);
  anim.playState = "finished";
  node.dispatchEvent(new Event("animationend"));

  expect(cancel).toHaveBeenCalledOnce();
});

test("leaves still-running animations alone", () => {
  const node = document.createElement("div");
  const cancel = vi.fn();
  withAnimations(node, [{ playState: "running", cancel }]);

  releaseTransformContainingBlock(node);
  node.dispatchEvent(new Event("animationend"));

  expect(cancel).not.toHaveBeenCalled();
});

test("destroy stops listening for animationend", () => {
  const node = document.createElement("div");
  const cancel = vi.fn();
  const anim = { playState: "running", cancel };
  withAnimations(node, [anim]);

  const action = releaseTransformContainingBlock(node);
  anim.playState = "finished";
  action?.destroy();
  node.dispatchEvent(new Event("animationend"));

  expect(cancel).not.toHaveBeenCalled();
});

// jsdom (and anything older than the Web Animations API) has no
// getAnimations; the action must stay harmless there.
test("does nothing where the Web Animations API is missing", () => {
  const node = document.createElement("div");

  expect(() => {
    const action = releaseTransformContainingBlock(node);
    node.dispatchEvent(new Event("animationend"));
    action?.destroy();
  }).not.toThrow();
});
