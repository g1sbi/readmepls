import { expect, test, vi } from "vitest";
import { releaseTransformContainingBlock } from "./release-transform-containing-block";

function withAnimations(node: HTMLElement, animations: { playState: string; cancel: () => void }[]) {
  (node as unknown as { getAnimations: () => typeof animations }).getAnimations = () => animations;
}

test("cancels finished animations once the CSS animation ends", () => {
  const node = document.createElement("div");
  const cancel = vi.fn();
  withAnimations(node, [{ playState: "finished", cancel }]);

  releaseTransformContainingBlock(node);
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
  withAnimations(node, [{ playState: "finished", cancel }]);

  const action = releaseTransformContainingBlock(node);
  action?.destroy();
  node.dispatchEvent(new Event("animationend"));

  expect(cancel).not.toHaveBeenCalled();
});
