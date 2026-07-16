import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import CyclingGreeting from "./CyclingGreeting.svelte";

const PHRASES = ["first phrase", "second phrase"];

describe("CyclingGreeting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the first phrase initially", () => {
    render(CyclingGreeting, { phrases: PHRASES, intervalMs: 1000 });
    expect(screen.getByText("first phrase")).toBeInTheDocument();
  });

  it("advances to the next phrase on the interval", async () => {
    render(CyclingGreeting, { phrases: PHRASES, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.getByText("second phrase")).toBeInTheDocument();
  });

  it("stays on the first phrase under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
    render(CyclingGreeting, { phrases: PHRASES, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByText("first phrase")).toBeInTheDocument();
    expect(screen.queryByText("second phrase")).not.toBeInTheDocument();
  });
});
