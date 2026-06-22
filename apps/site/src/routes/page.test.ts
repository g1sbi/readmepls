import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Page from "./+page.svelte";
import { TAGLINE } from "$lib/site";

test("landing page mounts all four sections", () => {
  render(Page);
  expect(screen.getByText(TAGLINE)).toBeTruthy(); // Hero
  expect(screen.getByText("How it works")).toBeTruthy(); // HowItWorks
  expect(screen.getByText("What you get")).toBeTruthy(); // Features
  expect(screen.getByText(/open source · self-hostable/i)).toBeTruthy(); // Footer
});
