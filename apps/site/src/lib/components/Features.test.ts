import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Features from "./Features.svelte";
import { FEATURES } from "$lib/site";

test("renders the section heading", () => {
  render(Features);
  expect(screen.getByText("What you get")).toBeTruthy();
});

test("renders every feature title", () => {
  render(Features);
  for (const feature of FEATURES) {
    expect(screen.getByText(feature.title)).toBeTruthy();
  }
});
