import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import ComingSoon from "./ComingSoon.svelte";
import { PRO_STRIP } from "$lib/site";

test("renders the Pro coming-soon badge", () => {
  render(ComingSoon);
  expect(screen.getByText(PRO_STRIP.badge)).toBeTruthy();
});

test("renders the AI extension copy", () => {
  render(ComingSoon);
  expect(screen.getByText(PRO_STRIP.body)).toBeTruthy();
});
