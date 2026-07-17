import { render, screen, fireEvent } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import CodeBlock from "./CodeBlock.svelte";

test("renders the given code verbatim", () => {
  render(CodeBlock, { props: { code: "docker compose pull" } });
  expect(screen.getByText("docker compose pull")).toBeTruthy();
});

test("copies the code to the clipboard on click", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(CodeBlock, { props: { code: "docker compose up -d" } });
  await fireEvent.click(screen.getByRole("button", { name: "copy" }));

  expect(writeText).toHaveBeenCalledWith("docker compose up -d");
  expect(await screen.findByText("copied!")).toBeTruthy();
});
