# readmepls — design system

Derived from `assets/_banner.html`. The canonical, machine-readable source of
truth is `apps/web/src/lib/styles/tokens.css`. This doc explains the *why* and
the rules that keep components retheme-able by the Phase 3 design phase.

## Concept

**warm-paper stationery.** A well-loved-paperback feel: warm paper substrate,
warm ink for type, exactly **one hot accent** (terracotta), and tactile analog
motifs — dog-ear folds, faint grain, soft *brown* shadows, generous rounding.
Friendly, lowercase voice. Reading is the hero; chrome stays quiet.

Anti-goals: cold grays, neon, purple-on-white gradients, hard 90° corners,
neutral gray drop shadows, SHOUTING UI copy.

## Color

One substrate, one ink, one accent.

- **paper** (`--paper-*`) — warm off-white → tan. The page. The light bg is the
  banner's radial gradient (`--color-bg-gradient`).
- **ink** (`--ink-*`) — warm near-black `#211E17` → muted taupe `#AC9F86`. All
  text. Three text roles: `--color-text` / `-muted` / `-subtle`.
- **terracotta** (`--terracotta-*`, base `#C24A38`) — THE accent. Primary
  actions, links, focus ring, selection, brand "pls". Used sparingly: if a
  screen looks busy with terracotta, it's overused.
- **status** — `sage` / `amber` / `clay` / `dusk`, all muted to sit on paper.
- **markers** — soft highlight tints for Phase 4 (`--marker-butter/rose/sky/mint`).

Components consume **semantic** tokens (`--color-bg`, `--color-accent`, …) never
primitives. Themes (`light` default, `dark` = warm-dark not cold-gray, `sepia` =
reading page) remap semantics only.

## Type

Two families, clear division of labor:

- **Fredoka** (`--font-display`) — brand, headings, all UI chrome, controls,
  numerals. Rounded and friendly; the icon's personality. Wants negative
  tracking at display sizes (`--tracking-display`), positive + uppercase when
  tiny (the banner eyebrow, `--tracking-eyebrow`).
- **Newsreader** (`--font-reading`) — long-form **article body only**, via the
  `--reading-*` knobs. An editorial serif with optical sizing — comfortable for
  the one screen where the user reads thousands of words. Fredoka is a display
  face and would fatigue at article length, so it never sets body copy.
- **IBM Plex Mono** (`--font-mono`) — code inside articles, metadata, token
  values. Its slab terminals echo Newsreader's serifs, so code sits *with* the
  reading column rather than clashing — warmer and more on-brand than the cold
  geometric coder monos. Embedded weights: 400 (code) + 600 (emphasis).

UI scale is a fixed modular ramp (`--text-*`). Reading is governed by runtime
prefs (`--reading-size/leading/measure/font`) the typography panel writes to.

Fonts are self-hosted (no external CDN): woff2 in `apps/web/static/fonts/`,
`@font-face` in `apps/web/src/lib/styles/fonts.css`, loaded by the root
`+layout.svelte`. Latin subset only for now. tokens.css declares the family
*stacks*; fonts.css loads the *files*.

## Shape, depth, texture

- **Radii are generous** (`--radius-*`, up to `40px`), echoing the 64px icon and
  40px dog-ear. Default cards `--radius-lg`/`xl`. No sharp corners on surfaces.
- **Shadows are warm** — tinted `rgb(54 44 22)`, never neutral gray. Scale
  `sm → xl`; `xl` is the banner icon's lift.
- **Grain** (`--texture-grain`) — the banner's feTurbulence overlay, applied at
  ~0.04 opacity / `multiply` as a page-level layer for paper tactility.
- **Dog-ear fold** — signature decorative motif (a 135° clipped corner in
  `--color-fold`) for cards, empty states, the brand mark.

## Motion

Soft and settled. `--ease-paper` for entrances, `--ease-out` for hovers.
`--dur-fast/base/slow`. High-impact moments (one staggered page-load reveal)
over scattered micro-jitter. All durations collapse to 0 under
`prefers-reduced-motion`.

## Voice

Lowercase, playful, plainspoken, a little polite. The banner sets it:
"save any link. actually read it. pls." Buttons say `save it` not `Submit`.
Empty states are warm, never scolding. Never use ALL CAPS except the tracked
eyebrow label.

## Rules for components

1. Reference semantic + reader tokens only — **never** a hardcoded hex, font
   name, px radius, or gray shadow. A literal color in a component is a bug.
2. Shared primitives live in `$lib/components/ui/`; features compose them.
3. New theme = add a `[data-theme]` block in `tokens.css`. Components don't change.
4. Focus is always visible: `--color-ring`, never `outline: none` alone.
