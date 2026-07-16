import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initialTypewriterState,
  nextTypewriterState,
  TYPE_MS,
  DELETE_MS,
  PAUSE_MS,
  createTypewriter,
} from "./typewriter.svelte.js";
import { vi } from "vitest";

const PHRASES = ["hi", "yo"];

describe("nextTypewriterState", () => {
  it("types one character at a time", () => {
    const step = nextTypewriterState(initialTypewriterState(), PHRASES);
    expect(step.state).toEqual({ phraseIndex: 0, text: "h", mode: "typing" });
    expect(step.delayMs).toBe(TYPE_MS);
  });

  it("switches to pausing when the phrase is complete", () => {
    const step = nextTypewriterState(
      { phraseIndex: 0, text: "h", mode: "typing" },
      PHRASES,
    );
    expect(step.state).toEqual({ phraseIndex: 0, text: "hi", mode: "pausing" });
    expect(step.delayMs).toBe(TYPE_MS);
  });

  it("holds the full phrase then begins deleting", () => {
    const step = nextTypewriterState(
      { phraseIndex: 0, text: "hi", mode: "pausing" },
      PHRASES,
    );
    expect(step.state).toEqual({ phraseIndex: 0, text: "hi", mode: "deleting" });
    expect(step.delayMs).toBe(PAUSE_MS);
  });

  it("deletes one character at a time", () => {
    const step = nextTypewriterState(
      { phraseIndex: 0, text: "hi", mode: "deleting" },
      PHRASES,
    );
    expect(step.state).toEqual({ phraseIndex: 0, text: "h", mode: "deleting" });
    expect(step.delayMs).toBe(DELETE_MS);
  });

  it("advances to the next phrase after fully deleting", () => {
    const step = nextTypewriterState(
      { phraseIndex: 0, text: "h", mode: "deleting" },
      PHRASES,
    );
    expect(step.state).toEqual({ phraseIndex: 1, text: "", mode: "typing" });
    expect(step.delayMs).toBe(DELETE_MS);
  });

  it("wraps back to the first phrase", () => {
    const step = nextTypewriterState(
      { phraseIndex: 1, text: "y", mode: "deleting" },
      PHRASES,
    );
    expect(step.state.phraseIndex).toBe(0);
    expect(step.state.mode).toBe("typing");
  });
});

describe("createTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("types the first phrase over successive ticks", () => {
    const tw = createTypewriter(["hi"]);
    tw.start();
    expect(tw.text).toBe("");
    vi.advanceTimersByTime(TYPE_MS);
    expect(tw.text).toBe("h");
    vi.advanceTimersByTime(TYPE_MS);
    expect(tw.text).toBe("hi");
    tw.stop();
  });

  it("does not advance while paused", () => {
    let paused = true;
    const tw = createTypewriter(["hi"], { paused: () => paused });
    tw.start();
    vi.advanceTimersByTime(TYPE_MS * 5);
    expect(tw.text).toBe("");
    paused = false;
    vi.advanceTimersByTime(PAUSE_MS + TYPE_MS);
    expect(tw.text).toBe("h");
    tw.stop();
  });

  it("shows the full first phrase statically under reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
    const tw = createTypewriter(["hello"]);
    tw.start();
    vi.advanceTimersByTime(TYPE_MS * 10);
    expect(tw.text).toBe("hello");
    tw.stop();
  });
});
