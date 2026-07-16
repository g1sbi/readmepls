import { prefersReducedMotion } from "./motion";

export type TypewriterMode = "typing" | "pausing" | "deleting";

export interface TypewriterState {
  phraseIndex: number;
  text: string;
  mode: TypewriterMode;
}

// per-mode delays (ms): brisk typing, longer hold on the full phrase, quick delete
export const TYPE_MS = 90;
export const DELETE_MS = 45;
export const PAUSE_MS = 1400;

export function initialTypewriterState(): TypewriterState {
  return { phraseIndex: 0, text: "", mode: "typing" };
}

export function nextTypewriterState(
  state: TypewriterState,
  phrases: string[],
): { state: TypewriterState; delayMs: number } {
  const phrase = phrases[state.phraseIndex] ?? "";
  switch (state.mode) {
    case "typing": {
      const text = phrase.slice(0, state.text.length + 1);
      const mode: TypewriterMode = text === phrase ? "pausing" : "typing";
      return {
        state: { phraseIndex: state.phraseIndex, text, mode },
        delayMs: TYPE_MS,
      };
    }
    case "pausing":
      return {
        state: { ...state, mode: "deleting" },
        delayMs: PAUSE_MS,
      };
    case "deleting": {
      const text = state.text.slice(0, -1);
      if (text === "") {
        return {
          state: {
            phraseIndex: (state.phraseIndex + 1) % phrases.length,
            text: "",
            mode: "typing",
          },
          delayMs: DELETE_MS,
        };
      }
      return {
        state: { phraseIndex: state.phraseIndex, text, mode: "deleting" },
        delayMs: DELETE_MS,
      };
    }
  }
}

// Thin runes wrapper: holds state in $state and schedules the next step with
// setTimeout. `paused()` (e.g. input focused/non-empty) freezes advancement so
// the animation never fights the user. Reduced motion => static first phrase.
export function createTypewriter(
  phrases: string[],
  opts?: { paused?: () => boolean },
) {
  let state = $state(initialTypewriterState());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wasPaused = opts?.paused?.() ?? false;

  function schedule(delayMs: number) {
    timer = setTimeout(tick, delayMs);
  }

  function tick() {
    const isPausedNow = opts?.paused?.() ?? false;
    const justResumed = wasPaused && !isPausedNow;
    wasPaused = isPausedNow;

    if (isPausedNow) {
      schedule(PAUSE_MS);
      return;
    }
    const step = nextTypewriterState(state, phrases);
    state = step.state;
    const delayMs = justResumed ? PAUSE_MS + TYPE_MS : step.delayMs;
    schedule(delayMs);
  }

  return {
    get text() {
      return state.text;
    },
    start() {
      if (prefersReducedMotion()) {
        state = { phraseIndex: 0, text: phrases[0] ?? "", mode: "pausing" };
        return;
      }
      schedule(TYPE_MS);
    },
    stop() {
      if (timer) clearTimeout(timer);
    },
  };
}
