# Center-stage Capture Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static home-page tagline with a center-stage capture hero — a fading greeting, a big pill input with a typewriter placeholder, and quick-action chips.

**Architecture:** A pure typewriter step-reducer (no DOM/timers) drives a thin runes wrapper that schedules `setTimeout` ticks. `CaptureBar` is reworked into a rounded pill consuming that wrapper for its placeholder; `CyclingGreeting` fades between phrases on an interval. `+page.svelte` wires them together and drops the old `<h1>` tagline, keeping a visually-hidden `<h1>` for SEO/screen readers. A shared `prefersReducedMotion()` helper gates all animation.

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind v4 + `tokens.css`, `@lucide/svelte` icons, Vitest + `@testing-library/svelte` (jsdom).

## Global Constraints

- **Lowercase playful voice** in all user-facing copy (design language).
- **Tokens only** — never hardcode a color, font, radius, or shadow; reference `tokens.css` vars.
- **Mobile-first:** usable at 360px with no horizontal overflow; tap targets ≥44px; text inputs ≥16px font (avoids iOS focus zoom).
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the typewriter (static first placeholder) and the greeting fade (static first phrase).
- **Stable accessible name:** the animating placeholder must never be the input's accessible name — the input keeps a fixed `aria-label`.
- **TDD:** failing test first, then minimal implementation. Conventional Commits, one logical change per commit.
- **Run tests with** `pnpm exec vitest run <pattern>` (NOT `pnpm --filter`). Typecheck: `pnpm typecheck`.

---

### Task 1: `prefersReducedMotion()` shared helper

Both new components need the same reduced-motion check (the repo currently inlines it in `reveal.ts` and `+layout.svelte`). Add one shared helper.

**Files:**
- Create: `apps/web/src/lib/motion.ts`
- Test: `apps/web/src/lib/motion.test.ts`

**Interfaces:**
- Produces: `prefersReducedMotion(): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/motion.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersReducedMotion } from "./motion";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefersReducedMotion", () => {
  it("is true when the media query matches", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: true,
      media: q,
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when the media query does not match", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
    }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/motion.test.ts`
Expected: FAIL — cannot resolve `./motion`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/motion.ts
// Shared reduced-motion probe. Guards matchMedia because jsdom (tests) and any
// non-browser context lack it — absence means "no preference", so animate.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/motion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/motion.ts apps/web/src/lib/motion.test.ts
git commit -m "feat(web): add shared prefersReducedMotion helper"
```

---

### Task 2: Typewriter reducer + runes wrapper

**Files:**
- Create: `apps/web/src/lib/typewriter.svelte.ts`
- Test: `apps/web/src/lib/typewriter.test.ts`

**Interfaces:**
- Consumes: `prefersReducedMotion` from `$lib/motion` (Task 1).
- Produces:
  - `type TypewriterMode = "typing" | "pausing" | "deleting"`
  - `interface TypewriterState { phraseIndex: number; text: string; mode: TypewriterMode }`
  - `const TYPE_MS = 90`, `const DELETE_MS = 45`, `const PAUSE_MS = 1400`
  - `initialTypewriterState(): TypewriterState`
  - `nextTypewriterState(state, phrases): { state: TypewriterState; delayMs: number }`
  - `createTypewriter(phrases: string[], opts?: { paused?: () => boolean }): { readonly text: string; start(): void; stop(): void }`

**Reducer contract:** each call performs the action for the current `mode` and returns the next state plus how long the caller should wait before the following call.
- `typing`: append one char of `phrases[phraseIndex]`; when the text becomes the full phrase, set `mode: "pausing"`; `delayMs: TYPE_MS`.
- `pausing`: leave text unchanged, set `mode: "deleting"`; `delayMs: PAUSE_MS` (this is the hold on the complete phrase).
- `deleting`: remove the last char; when the text becomes empty, advance `phraseIndex` (wrapping) and set `mode: "typing"`; `delayMs: DELETE_MS`.

- [ ] **Step 1: Write the failing reducer tests**

```ts
// apps/web/src/lib/typewriter.test.ts
import { describe, it, expect } from "vitest";
import {
  initialTypewriterState,
  nextTypewriterState,
  TYPE_MS,
  DELETE_MS,
  PAUSE_MS,
} from "./typewriter.svelte.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/typewriter.test.ts`
Expected: FAIL — cannot resolve `./typewriter.svelte.js`.

- [ ] **Step 3: Write the reducer + wrapper**

```ts
// apps/web/src/lib/typewriter.svelte.ts
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

  function schedule(delayMs: number) {
    timer = setTimeout(tick, delayMs);
  }

  function tick() {
    if (opts?.paused?.()) {
      schedule(PAUSE_MS);
      return;
    }
    const step = nextTypewriterState(state, phrases);
    state = step.state;
    schedule(step.delayMs);
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
```

- [ ] **Step 4: Run reducer tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/lib/typewriter.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add wrapper tests (fake timers + reduced motion)**

Append to `apps/web/src/lib/typewriter.test.ts`:

```ts
import { afterEach, beforeEach, vi } from "vitest";
import { createTypewriter } from "./typewriter.svelte.js";

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
```

- [ ] **Step 6: Run all typewriter tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/lib/typewriter.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/typewriter.svelte.ts apps/web/src/lib/typewriter.test.ts
git commit -m "feat(web): add typewriter reducer and runes wrapper"
```

---

### Task 3: `CyclingGreeting` component

**Files:**
- Create: `apps/web/src/lib/components/CyclingGreeting.svelte`
- Test: `apps/web/src/lib/components/cyclinggreeting.test.ts`

**Interfaces:**
- Consumes: `prefersReducedMotion` from `$lib/motion` (Task 1).
- Produces: `CyclingGreeting` — props `{ phrases: string[]; intervalMs?: number }` (default `intervalMs = 4000`). Renders the current phrase inside an `aria-hidden` container.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/cyclinggreeting.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/cyclinggreeting.test.ts`
Expected: FAIL — cannot resolve `./CyclingGreeting.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- apps/web/src/lib/components/CyclingGreeting.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { prefersReducedMotion } from "$lib/motion";

  let { phrases, intervalMs = 4000 }: { phrases: string[]; intervalMs?: number } =
    $props();

  let index = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    if (prefersReducedMotion() || phrases.length < 2) return;
    timer = setInterval(() => {
      index = (index + 1) % phrases.length;
    }, intervalMs);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<!-- decorative animation; the page's visually-hidden <h1> carries the real heading -->
<p class="greeting" aria-hidden="true">
  {#key index}
    <span class="phrase">{phrases[index]}</span>
  {/key}
</p>

<style>
  .greeting {
    /* --font-ui, not --font-display: Fredoka is wordmark-only per tokens.css */
    font-family: var(--font-ui);
    font-size: var(--text-xl);
    color: var(--color-text);
    margin: 0 0 var(--space-5);
    min-height: 1.4em; /* reserve height so the pill doesn't jump between phrases */
  }
  @media (min-width: 48rem) {
    .greeting {
      font-size: var(--text-2xl);
    }
  }
  .phrase {
    display: inline-block;
    animation: fade-in var(--dur-slow, 320ms) var(--ease-out, ease) both;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .phrase {
      animation: none;
    }
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/cyclinggreeting.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/CyclingGreeting.svelte apps/web/src/lib/components/cyclinggreeting.test.ts
git commit -m "feat(web): add CyclingGreeting component"
```

---

### Task 4: Rework `CaptureBar` into a pill with typewriter placeholder

**Files:**
- Modify: `apps/web/src/lib/components/CaptureBar.svelte` (full rewrite of markup + styles; capture logic preserved)
- Test: `apps/web/src/lib/components/capturebar.test.ts` (new)

**Interfaces:**
- Consumes: `createTypewriter` from `$lib/typewriter.svelte.js` (Task 2).
- Produces: `CaptureBar` — props unchanged externally except a new optional `placeholders?: string[]` (defaults to the built-in source examples). Input has fixed `aria-label="paste a link to save"`; submit button has `aria-label="save link"`. Behavior unchanged: POST `/api/capture`, 402 → quota message, other non-ok → generic error, success → clear field + call `onCaptured`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/capturebar.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import CaptureBar from "./CaptureBar.svelte";

describe("CaptureBar", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes a stable input aria-label and a labelled send button", () => {
    render(CaptureBar, {});
    expect(
      screen.getByRole("textbox", { name: /paste a link/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save link/i }),
    ).toBeInTheDocument();
  });

  it("posts the url to /api/capture and clears on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onCaptured = vi.fn();
    render(CaptureBar, { onCaptured });

    const input = screen.getByRole("textbox", { name: /paste a link/i });
    await fireEvent.input(input, { target: { value: "https://example.com" } });
    await fireEvent.click(screen.getByRole("button", { name: /save link/i }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/capture",
      expect.objectContaining({ method: "POST" }),
    );
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows a quota message on 402", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 402 })),
    );
    render(CaptureBar, {});
    await fireEvent.input(
      screen.getByRole("textbox", { name: /paste a link/i }),
      { target: { value: "https://example.com" } },
    );
    await fireEvent.click(screen.getByRole("button", { name: /save link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/quota/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/capturebar.test.ts`
Expected: FAIL — no accessible element named `/save link/i` (current button says "save it" with no aria-label, and current input has no aria-label).

- [ ] **Step 3: Rewrite the component**

```svelte
<!-- apps/web/src/lib/components/CaptureBar.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { BookmarkPlus, ArrowUp } from "@lucide/svelte";
  import { createTypewriter } from "$lib/typewriter.svelte.js";

  const DEFAULT_PLACEHOLDERS = [
    "en.wikipedia.org/wiki/…",
    "a youtube video",
    "that newsletter you never open",
    "any blog post, really",
  ];

  let {
    onCaptured,
    placeholders = DEFAULT_PLACEHOLDERS,
  }: { onCaptured?: () => void; placeholders?: string[] } = $props();

  let url = $state("");
  let busy = $state(false);
  let err = $state("");
  let focused = $state(false);

  // pause the animation whenever the user is engaged, so it never types over them
  const tw = createTypewriter(placeholders, {
    paused: () => focused || url.trim() !== "",
  });
  onMount(() => tw.start());
  onDestroy(() => tw.stop());

  async function submit() {
    if (!url.trim()) return;
    busy = true;
    err = "";
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 402) {
        err = "quota exceeded — upgrade to capture more.";
        return;
      }
      if (!res.ok) {
        err = "could not capture that link.";
        return;
      }
      url = "";
      onCaptured?.();
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div class="pill" data-focused={focused}>
    <BookmarkPlus class="lead" aria-hidden="true" />
    <input
      class="field"
      type="url"
      bind:value={url}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      placeholder={focused ? "paste a link…" : tw.text}
      aria-label="paste a link to save"
    />
    <button type="submit" class="send" disabled={busy} aria-label="save link" aria-busy={busy}>
      <ArrowUp class="icon-sm" aria-hidden="true" />
    </button>
  </div>
  {#if err}<p role="alert">{err}</p>{/if}
</form>

<style>
  form {
    max-width: 640px;
    margin: 0 auto;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    box-shadow: var(--shadow-sm);
    transition:
      border-color var(--dur-fast, 150ms) var(--ease-out, ease),
      box-shadow var(--dur-fast, 150ms) var(--ease-out, ease);
  }
  .pill[data-focused="true"] {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-md);
  }
  .pill :global(.lead) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--color-text-subtle);
  }
  .field {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-family: var(--font-ui);
    font-size: 1.05rem; /* ≥16px: avoids iOS focus zoom */
    color: var(--color-text);
    padding: var(--space-2) 0;
  }
  .field:focus {
    outline: none;
  }
  .field::placeholder {
    color: var(--color-text-subtle);
  }
  .send {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-surface);
    cursor: pointer;
    transition: background var(--dur-fast, 150ms) var(--ease-out, ease);
  }
  .send:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }
  .send:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .send:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
  p {
    margin: var(--space-3) 0 0;
    text-align: center;
    color: var(--color-danger);
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/capturebar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/CaptureBar.svelte apps/web/src/lib/components/capturebar.test.ts
git commit -m "feat(web): rework CaptureBar into pill with typewriter placeholder"
```

---

### Task 5: Wire the hero into `+page.svelte`

Drop the old `<h1>` tagline; render the cycling greeting, the pill, and quick-action chips. Keep a visually-hidden `<h1>` for SEO/screen readers.

**Files:**
- Modify: `apps/web/src/routes/+page.svelte`
- Test: `apps/web/src/routes/page.test.ts` (new)

**Interfaces:**
- Consumes: `CyclingGreeting` (Task 3), `CaptureBar` (Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/page.test.ts
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";

// Home page constructs a PocketBase client and subscribes on mount; stub it so
// the component renders without touching the network.
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      subscribe: vi.fn().mockResolvedValue(() => {}),
    }),
  }),
}));

import Page from "./+page.svelte";

describe("home page hero", () => {
  it("keeps a screen-reader heading but drops the visible tagline styling", () => {
    render(Page);
    expect(
      screen.getByRole("heading", { level: 1, name: /save any link/i }),
    ).toBeInTheDocument();
  });

  it("renders the capture pill", () => {
    render(Page);
    expect(
      screen.getByRole("textbox", { name: /paste a link/i }),
    ).toBeInTheDocument();
  });

  it("renders quick-action chips linking to library and collections", () => {
    render(Page);
    expect(
      screen.getByRole("link", { name: /browse library/i }),
    ).toHaveAttribute("href", "/library");
    expect(
      screen.getByRole("link", { name: /your collections/i }),
    ).toHaveAttribute("href", "/collections");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/page.test.ts`
Expected: FAIL — no link named `/browse library/i` (chips don't exist yet).

- [ ] **Step 3: Edit the hero markup**

Replace the `<section class="hero">…</section>` block (lines ~34-37) with:

```svelte
<section class="hero">
  <h1 class="sr-only">save any link and actually read it</h1>
  <CyclingGreeting phrases={GREETINGS} />
  <CaptureBar onCaptured={load} />
  <nav class="quick" aria-label="quick actions">
    <a href="/library">browse library</a>
    <a href="/collections">your collections</a>
  </nav>
</section>
```

Add the imports and greeting constant to the `<script>` block (alongside the existing imports):

```ts
  import CyclingGreeting from "$lib/components/CyclingGreeting.svelte";

  const GREETINGS = [
    "what do you feel like reading?",
    "found something worth keeping?",
    "paste it now, read it later.",
    "your reading pile, minus the clutter.",
  ];
```

Replace the `.hero` style rules (the old `.hero h1` / `.hero h1 span` rules are gone) and add `.sr-only` + `.quick` styles. The `<style>` block becomes:

```svelte
<style>
  .hero { text-align: center; padding: var(--space-7) 0 var(--space-6); }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .quick {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .quick a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 var(--space-4);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    transition: background var(--dur-fast, 150ms) var(--ease-out, ease);
  }
  .quick a:hover { background: var(--color-surface-sunken); color: var(--color-text); }
  .quick a:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .block { margin-top: var(--space-6); }
  .block h2 { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text-muted); margin: 0 0 var(--space-4); }
  .more { display: inline-block; margin-top: var(--space-4); font-family: var(--font-ui); color: var(--color-accent); text-decoration: none; }
  .more:hover { color: var(--color-accent-hover); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/page.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/+page.svelte apps/web/src/routes/page.test.ts
git commit -m "feat(web): center-stage capture hero with greeting and quick actions"
```

---

### Task 6: Full verification pass

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm exec vitest run apps/web`
Expected: PASS (all tests, including the 4 new files).

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual check in the dev server**

Run: `pnpm --filter @readmepls/web dev`, open the home page, and confirm:
- greeting fades between phrases; placeholder types/deletes example sources;
- focusing the input stops the animation and shows "paste a link…";
- pasting a link + clicking the round button captures (field clears);
- chips navigate to `/library` and `/collections`;
- at 360px width there is no horizontal overflow and tap targets feel ≥44px;
- with OS "reduce motion" on, greeting and placeholder are static.

- [ ] **Step 4: Delete the plan and spec (per working agreements — shipped)**

```bash
git rm docs/superpowers/plans/2026-07-16-center-stage-capture-hero.md \
       docs/superpowers/specs/2026-07-16-center-stage-capture-hero-design.md
git commit -m "chore(docs): remove shipped center-stage capture hero spec and plan"
```
