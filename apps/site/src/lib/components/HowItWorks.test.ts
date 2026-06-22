import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import HowItWorks from "./HowItWorks.svelte";
import { STEPS } from "$lib/site";

test("renders the section heading", () => {
  render(HowItWorks);
  expect(screen.getByText("How it works")).toBeTruthy();
});

test("renders every step title", () => {
  render(HowItWorks);
  for (const step of STEPS) {
    expect(screen.getByText(step.title)).toBeTruthy();
  }
});
