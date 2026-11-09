# readmepls — design system

The canonical, machine-readable source of truth is
`apps/web/src/lib/styles/tokens.css`. This doc explains the _why_ and the rules
that keep components retheme-able. The design language is **Marker**; it
replaces the earlier warm-paper concept (see
`2026-11-09-design-foundation-design.md` for the decisions behind it).

## Concept

**Marker.** A calm, near-monochrome product: a cool neutral gray page,
off-white cards held by a hairline, ink black for what is active or inverted,
and exactly **one accent**, a highlighter yellow, used the way a marker is
used on a page: sparingly, to point at what matters. The yellow is also the
brand motif. Reading is the hero; chrome stays quiet.

Anti-goals: a second accent hue, hover-only affordances, decorative motion,
components that were never designed in their focus, disabled, loading, empty
and error states, copying the reference sites.

## Color

One neutral ramp, one ink, one accent.

- **Surfaces** — `--color-bg` (page), `--color-surface` (cards),
  `--color-surface-raised`, `--color-surface-sunken` (chips, wells).
- **Ink** — `--color-text` is `#020203`; `-muted` and `-subtle` are the two
  quieter text roles. Ink is also the primary action (`--color-accent`).
- **Inverse pair** — `--color-inverse` / `--color-text-inverse` for the active
  nav pill, selected chip and featured tile. Swaps polarity in dark.
- **Marker** (`--marker-400`, `--color-marker`, base `#ffce00`) — THE accent.
  Same in light and dark. `--color-text-on-marker` is ink; never put light text
  on it. If a screen looks busy with yellow, it is overused.
- **Hairlines** — `--color-hairline` (a translucent ink ring, not a heavy
  border) is the default outline; `--color-border-strong` for emphasis.
- **Status** — `--color-success/warning/danger/info`.
- **Highlight colors** — the stored keys `terracotta`, `amber`, `sage` are kept
  so no data migrates, but are recolored: `--hl-terracotta` is marker yellow,
  `--hl-amber` rose, `--hl-sage` mint.

Components consume **semantic** tokens (`--color-bg`, `--color-accent`, …),
never primitives. Two themes remap semantics only: `light` (`:root`) and
`dark` (`[data-theme="dark"]`, near-black surfaces, off-white text, the same
marker). There is no third theme.

**Theme preference** is `light | dark | system` (default `system`).
`data-theme` only ever takes `light` or `dark`: `system` resolves to one of
them from `prefers-color-scheme`. A boot script in `app.html` sets it before
first paint to avoid a flash. This is the only appearance setting in the app.

## Type

- **Ronzino** (`--font-ui`, `--font-reading`; SIL OFL, self-hosted, regular,
  medium, bold plus obliques) for both UI chrome and article reading. Headings
  are large with tight negative tracking at display sizes
  (`--tracking-display`); labels are small and quiet; numerals are tabular
  wherever they are compared (stats, counts, progress). Reading sizes are in
  `rem` so the OS text-size setting still scales them.
- **IBM Plex Mono** (`--font-mono`) for code only.

Font faces are declared in `apps/web/src/lib/styles/fonts.css`.

## Shape, depth

- **Pills** for controls: nav items, chips, buttons, icon buttons
  (`--radius-pill`).
- **Cards** about 14-16px (`--radius-md` / `--radius-lg`); **sheets** have a
  26px top radius (`--radius-xl`).
- **Hairline outlines** rather than shadows to separate surfaces. Shadows are
  neutral black (`--shadow-color`) and used only for lift (menus, sheets); dark
  mode doubles the alpha.
- No grain, no folded corners, no tinted shadows.

### The marker motif

A highlighter swipe: a yellow band across the lower ~40% of a text box, drawn
left to right. Used on the wordmark's "pls", under the active tab label, and on
key words of featured titles. Implemented in
`apps/web/src/lib/styles/marker.css` (`.marker`, `.marker-swipe`,
`.marker-inverse`, `.is-drawn`) and driven by the `markerInView` action
(`apps/web/src/lib/actions/marker-in-view.ts`): it draws on hover on fine
pointers, once on scroll-into-view on touch, and is pre-drawn under reduced
motion. On an inverted ink surface the swipe fills the full line height and
flips the text to ink so it stays legible.

## Motion

A small named set, all in `tokens.css`:

- **Easings** — `--ease-out` `cubic-bezier(0.075, 0.82, 0.165, 1)` (snappy
  expo-out, the default), `--ease-in` for exits, `--ease-bounce` (via
  `--motion-bounce`) for presses and primary buttons.
- **Durations** — `--dur-fast`, `--dur-base`, `--dur-slow`, `--dur-marker`.
- **Enter/exit** — `tw-animate-css` is the one shared library of enter and
  exit animations (fade, slide, scale); components use it rather than inventing
  their own.
- **Signature moments** — the marker swipe; cards lifting on hover (pointer
  devices only); presses scaling down slightly.

All durations are zero under `prefers-reduced-motion`, and the marker then
appears already drawn. Motion is never the only way to see a state.

## Voice

Sentence case, plain, friendly, a little polite: "Library", "Start reading",
"Save a link". This replaces the earlier all-lowercase voice. Empty states are
warm, never scolding. No ALL CAPS except a small tracked eyebrow label.

Note: much existing UI copy is still lowercase. This section describes the
target; copy migrates as each page is restyled in the later plans of the
design-foundation work.

## Rules for components

1. Reference semantic + reader tokens only — **never** a hardcoded hex, font
   name, px radius, or gray shadow. A literal color in a component is a bug.
2. Shared primitives live in `$lib/components/ui/`; features compose them. One
   component per primitive.
3. A theme change edits `tokens.css` (`:root` / `[data-theme]` blocks).
   Components don't change.
4. Focus is always visible: `--color-ring`, never `outline: none` alone.
5. No hover-only affordances: every hover behavior has a touch and keyboard
   equivalent (a visible control, or long-press).
6. Mobile first at 360px, tap targets at least 44px, safe-area insets respected.
7. Motion comes from the named easings and durations, and respects reduced
   motion.
