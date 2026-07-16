# Center-stage capture hero — design

## Goal

Remove the static `save any link. actually read it.` tagline from the home page
(`apps/web/src/routes/+page.svelte`) and make the capture input the visual
center of the page — an AI-chat-style hero: a fading friendly greeting, one big
rounded "pill" input with a typewriter placeholder, and quick-action chips
beneath it.

Mobile is the primary target (reader app — most reading is on phones).

## Layout

Centered column, mobile-first, top → bottom:

1. **Cycling greeting** — the friendly sentence, fades between phrases on a
   timer. Replaces the old `<h1>` tagline.
2. **Pill input** — one rounded container holding: leading bookmark icon, the
   URL field (typewriter placeholder), and a circular accent send button on the
   right.
3. **Quick-action chips** — clickable pills that navigate:
   - `browse library` → `/library`
   - `your collections` → `/collections`
4. **Existing feeds** (`working on it`, `recently saved`) unchanged below.

## Copy

Lowercase playful voice per the design language. No user names (we don't have
them). Final wording confirmed in spec review.

- **Greetings (fade-swap):**
  - `what do you feel like reading?`
  - `found something worth keeping?`
  - `paste it now, read it later.`
  - `your reading pile, minus the clutter.`
- **Placeholder examples (typewriter: type → pause → delete → next):**
  - `en.wikipedia.org/wiki/…`
  - `a youtube video`
  - `that newsletter you never open`
  - `any blog post, really`

## Architecture

Keeps the repo's pure-core / thin-IO-shell convention.

### `typewriter.svelte.ts` (new)

- **Pure step reducer** — `nextTypewriterState(state, phrases) → { phraseIndex,
  text, mode, delayMs }` where `mode` is a union
  `'typing' | 'pausing' | 'deleting'`. Given the current state and the phrase
  list it returns the next state and how long to wait before the following step.
  No DOM, no timers — deterministic, unit-tested with plain assertions.
  - `typing`: append one char; when the phrase is complete → `pausing`.
  - `pausing`: single hold step → `deleting`.
  - `deleting`: remove one char; when empty → advance `phraseIndex` (wrap) and
    → `typing`.
  - `delayMs` differs per mode (type speed, pause hold, delete speed) — exported
    as named constants so tests assert them.
- **Thin runes wrapper** — a factory that holds the state in `$state`, schedules
  the next step with `setTimeout(step, delayMs)`, and exposes the current
  `text`. Cleans up its timer on teardown. Respects reduced motion (see below)
  and a `paused` input.

### `CaptureBar.svelte` (rework)

- Reworked from the current `<Input> + <Button>` flex row into a single pill
  container: leading bookmark icon, URL `<input>`, circular send button.
- `placeholder` bound to the typewriter's `text`.
- **Stable `aria-label`** ("paste a link to save") on the input so the animating
  placeholder is never the accessible name.
- Circular send button: accent fill, send/arrow icon, `aria-label` ("save
  link"), ≥44px. Busy state disables it and shows a saving affordance.
- Typewriter **pauses while the field is focused or non-empty** — never animates
  over the user.
- Preserves existing capture behavior: POST `/api/capture`, 402 → quota message,
  other non-ok → generic error, success → clear + `onCaptured()`. Error line
  renders below the pill.

### `CyclingGreeting.svelte` (new)

- `$state` index advanced on an interval; CSS opacity transition fades between
  phrases.
- Rendered `aria-hidden="true"` (decorative animation).
- A visually-hidden static `<h1>` ("save any link and actually read it") remains
  in the page for SEO and screen readers.

### `+page.svelte` (edit)

- Remove the `<h1>save any link. …</h1>` block.
- Hero becomes: `CyclingGreeting` + visually-hidden `<h1>` + `CaptureBar` +
  chips. Feeds below unchanged.

## Motion & accessibility

- `prefers-reduced-motion: reduce` →
  - Typewriter: no animation; show the first placeholder statically.
  - Greeting: no fade; show the first phrase statically.
- The visually-hidden `<h1>` guarantees a stable, meaningful page heading
  regardless of animation state.
- All interactive targets ≥44px.

## Mobile

- Pill full-width; input font ≥16px (avoids iOS focus zoom); comfortable
  padding.
- Send button a 44px circle.
- Greeting scales `text-xl` (mobile) → `text-2xl` (≥ tablet).
- Chips wrap to the next line; each ≥44px tap target.
- No horizontal overflow at 360px.

## Tokens

All colors, fonts, radii, shadows reference `tokens.css`. Nothing hardcoded.
The pill uses existing surface/border/radius tokens; the send button uses the
accent tokens.

## Testing (TDD)

- **`typewriter.svelte.ts` reducer** — pure unit tests: typing appends chars;
  completion transitions to `pausing`; pausing → `deleting`; deleting removes
  chars; empty advances and wraps `phraseIndex`; `delayMs` matches the exported
  per-mode constants.
- **`CaptureBar.svelte`** — renders the pill with a stable `aria-label`; send
  button has an `aria-label`; submit posts to `/api/capture`; 402 shows the
  quota message; success clears the field and calls `onCaptured`.
- **`CyclingGreeting.svelte`** — renders the first phrase; advancing the timer
  swaps to the next; static first phrase under reduced motion.
- Reduced-motion behavior asserted where feasible (matchMedia mocked).

## Out of scope

- Login page tagline (`login/+page.svelte`) — unchanged.
- Any change to capture/extraction backend behavior.
- A third chip (e.g. `highlights`) — not included unless requested.
