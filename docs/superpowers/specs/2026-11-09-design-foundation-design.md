# Design foundation: Marker theme, unified components, new shell

**Date:** 2026-11-09
**Issue:** #10 (epic). Unblocks #12 collections hub, #13 websites page,
#14 dynamic homepage, #15 reading goals, #16 README + landing page.
**Supersedes:** `2026-06-22-design-system.md` (warm-paper concept). Rewrite
that doc to describe Marker as part of this work; it remains the living
design-system reference.

## Why

The app works but feels unpolished: little attention to detail, components
that don't behave consistently, and a sepia/paper look the owner wants gone.
A fix made to one button doesn't reach the others because the same primitive
exists twice (hand-rolled `ui/Button.svelte` and shadcn `ui/button/`, same for
`Input`), and feature components carry large private `<style>` blocks
(`TopBar` ~180 lines, the reader page ~178).

The owner's bar is **thorough attention to detail**: the redesign fails if it
isn't well animated, doesn't use good type, or ships components whose UX
wasn't thought through state by state.

Success looks like this:

- the app reads as a modern, calm, confident product of its own
- changing a primitive changes it everywhere
- every component has been deliberately designed in every state, on phones first

## Goals

1. **A new visual language, "Marker"**, in light and dark modes, replacing
   warm-paper entirely.
2. **One component per primitive.** All styling lives in shared primitives
   and tokens; feature components only compose them.
3. **A new app shell.** A Notion-like sidebar on desktop, and on phones a
   bottom tab bar with a "More" sheet.
4. **A curated reader.** No typography settings; hand-tuned per screen size
   and per mode.
5. **A motion system.** A small, named set of easings and animations that
   every component draws from.
6. **Every existing page restyled** onto the above: home, library,
   collections index and detail, reader, login, verify, profile, connectors
   settings, plus search palette, capture, dialogs, and menus.

## Non-goals

- **No new features.** The websites page, collections hub, homepage modules,
  and reading goals are separate issues and get their own designs. This work
  restyles what exists and builds the shell they will slot into.
- **No theme gallery, no user-made themes, no extra themes** (#11 closed).
  Light and dark only.
- **No marketing site** (`apps/site`) and no browser extension
  (`apps/extension`) restyle. The landing page is #16.
- **No native app work.** But see the native-readiness constraints.
- **No bug fixes** from #7, #8, #9. They ship separately. #8 (equations)
  still needs reader styling for math, covered under the reader section.

## Anti-goals

These would count as failure even if everything technically works:

- **Copying the references.** uncut.wtf and collletttivo.it are
  inspiration, not templates. No mid-gray page, mascot, color-block hero,
  or floating-tile page layout lifted from them.
- **A second accent color.** An earlier mockup paired orange with yellow,
  and it was rejected.
- **Hover-only affordances.** Anything reachable only by hover is broken on
  phones and in the future native app.
- **"Looks done" components** with unconsidered focus, disabled, loading,
  empty, or error states.
- **Motion that is decorative noise,** or that ignores reduced-motion.

## Constraints

- **Repo conventions** (CLAUDE.md) apply in full:
  - TDD.
  - Tokens only, never a hardcoded color or font.
  - shadcn-svelte for new primitives, with the tokens bridge and no preflight.
  - Mobile-first at 360px with tap targets of at least 44px.
  - Small files.
  - PocketBase migrations for any schema or data change.
- **Native-app readiness.** The owner wants an App Store app eventually.
  `2026-06-29-tauri-mobile-port-design.md` already plans a Tauri shell over
  the same SvelteKit UI. So:
  - no hover-only interactions;
  - touch equivalents (long-press or a visible "⋯") for every secondary action;
  - safe-area insets respected by the tab bar and sheets;
  - business rules stay server-side.
- **Fonts are self-hosted** (no CDN), as today.

## The decisions

These were made with the owner, from mockups.

### Visual language: Marker

- **Surfaces (light):**
  - cool, neutral gray page;
  - off-white cards outlined by a 1px hairline (a translucent ink ring, not
    a heavy border);
  - **ink black** (`#020203`-ish) for active and inverted elements, such as
    the active nav item, the selected chip, and the featured tile.

  Reference values from the approved mockup:

  | Role     | Value             |
  | -------- | ----------------- |
  | page     | `#e4e4e2`         |
  | card     | `#f7f7f6`         |
  | ink      | `#020203`         |
  | muted    | `#5c5e62`         |
  | faint    | `#8a9094`         |
  | hairline | `rgba(2,2,3,.12)` |
  | chip     | `#d6d6d4`         |

- **One accent: highlighter yellow** (`#ffce00` in the mockup). It is used
  sparingly to mark what matters (the current day of the weekly goal, the
  primary call to action, the selected item in the tab bar). It is also the
  **brand motif**.
- **The marker motif.** A highlighter swipe, meaning a yellow band across
  the lower ~40% of the text box, drawn left to right:
  - on the wordmark's "pls";
  - under the active tab label;
  - on key words of featured titles.

  Its animation is the signature motion: on hover on pointer devices, and
  once on scroll-into-view on touch. On an inverted ink surface the swipe
  fills the full line height and flips the text to ink, so it stays legible.
  This was a bug found in the mockup.

- **Type: Ronzino** (Collletttivo, SIL OFL), self-hosted, regular, medium,
  and bold plus their obliques. It is used for **both UI and article
  reading.**
  - Headings are large, with tight negative tracking (about −0.035 to −0.05em
    at display sizes).
  - Labels are small and quiet.
  - Numerals are tabular wherever they're compared (stats, counts, progress).
  - A mono face stays for code; which one is the builder's call.
- **Shapes:**
  - pill-shaped controls: nav items, chips, buttons, icon buttons;
  - cards with about 14–16px corners;
  - sheets with a top radius of about 26px.
- **Voice:** sentence case, plain and friendly, as in the approved mockups
  ("Library", "Start reading"). This replaces the old all-lowercase voice.
  Keep it warm and never scolding. (Builder's note: confirm with the owner
  if unsure. This is inferred from the mockups, not stated outright.)
- **Removed:** Fredoka, terracotta, the paper palette, grain texture, the
  dog-ear motif (`PaperCorner`), warm-brown shadows, the sepia theme.

### Dark mode

Same character, inverted: near-black surfaces, off-white text, the same
yellow marker, hairlines from a translucent light ring. Not designed in
detail yet. **The builder proposes the dark palette as a mockup for the
owner's approval before implementing it** (see review gates).

**My call:** the default follows the OS setting (`prefers-color-scheme`), and
the user can override it to light or dark. That override is the only
appearance setting in the app.

### Motion

Borrowed in spirit from collletttivo.it's system:

- **Named easings as tokens:**
  - a snappy expo-out for most transitions, `cubic-bezier(0.075, 0.82, 0.165, 1)`
    in the mockups;
  - a plain ease-in for exits;
  - a slight overshoot "bounce" for presses and primary buttons,
    `cubic-bezier(.175,.885,.325,1.275)`.
- **A small duration scale as tokens.**
- **A shared library of enter/exit animations** (fade, slide from each edge,
  scale, sheet up/down, toast) that every component uses instead of inventing
  its own.
- **Signature moments:**
  - the marker swipe;
  - cards lift slightly on hover (pointer devices only);
  - nav items nudge on hover;
  - presses scale down a touch.
- **Reduced motion:** all of it collapses under `prefers-reduced-motion`. The
  marker then appears already drawn.

### App shell and navigation

- **Desktop / tablet:** a persistent left sidebar sitting flush on the page
  (not floating in its own panel).
  - Top: the wordmark.
  - Main sections: Home, Library, then later Websites (#13) and Goals (#15).
  - A "Collections" section listing the user's collections with counts and
    a "+" to create one.
  - Bottom: account and settings.
  - The active item is an ink pill.
- **Phone: tabs plus a "More" sheet** (option C from the mockups).
  - The bottom tab bar holds Home, Library, Goals, and More. It floats with
    a rounded top, sits clear of safe areas, and marks the active label with
    the marker underline.
  - "More" opens a bottom sheet with Websites, Settings, and the collections
    list (each with a count) plus "+ new".
  - **My call:** until Goals (#15) and Websites (#13) exist, their entries
    are simply absent (so the tabs are Home, Library, More), not
    placeholders.
- **Page header** on every screen: the title on the left; on the right, a
  search icon button (opens the existing `SearchPalette`) and a black **+**
  icon button for saving a link (opens capture). Both are present on every
  main screen, on phones and desktop alike. The reader is the exception
  (see Reader).

### Home page (this phase: restyle only)

The current home is restyled into the new shell. For #14, the owner already
chose the **"ink feature" style** for the featured-article module: an
inverted black tile with a big title, marker-swiped key words, a one-line
"why this pick" (for example, "Saved 3 weeks ago, never opened"), the source,
and a yellow "Start reading" button. Building that module is #14's job, not
this one. It's recorded here so the shell and tokens support it.

### Reader

- **Focused screen, no app navigation.** This was decided by the owner after
  a UX comparison.
  - **Hidden while reading:** the sidebar and the phone tab bar, as the
    reader does today (`showsGlobalNav` already excludes `/read/`). Reading
    apps (Readwise Reader, Instapaper, Matter, Apple Books) do the same.
    Four desktop columns would squeeze the measure, and a phone tab bar costs
    ~12% of the height and stacks with the reader's control bar.
  - **Reader header:** a back button returns to where the user came from
    (library, collection, website), falling back to library. A search icon
    is also there.
  - **Menu button:** it opens the full navigation **as an overlay**. On
    desktop the sidebar slides in over the page; on phones it's the
    More-style sheet. It never takes permanent space.
  - **Phone:** the reader header and control bar hide on scroll down and
    reappear on scroll up or tap.
  - **Desktop:** the existing three-column layout stays (chapters rail,
    article, highlights), restyled.
- **No reader settings** except the global light/dark override. The
  font/size/line-height/width prefs and their UI are removed.
- **Hand-tuned typography instead:**
  - size, leading, and measure chosen per breakpoint (phone, tablet,
    desktop), not one value scaled;
  - dark mode gets its own tuning (light-on-dark reads heavier and tighter);
  - every article element is designed deliberately: headings, paragraphs,
    links, lists, blockquotes, code, pre, images and captions, figures,
    tables, horizontal rules, footnotes, and **math** (rendering comes from
    #8; the styling belongs here).
- **Accessibility:** sizes are in `rem` so the OS/browser text-size setting
  still scales reading text.
- **Highlights:** the stored highlight color keys (`terracotta`, `amber`,
  `sage`) are kept so no data migrates. They are recolored for Marker. The
  primary is the marker yellow, and the other two are Marker-compatible
  tints the builder picks. **My call.**
- **Data:** `users.reader_prefs` is migrated so only `theme` survives:
  `sepia` becomes light (or follow-system), and the other keys are dropped.
  The `ReaderPrefs` type and `withReaderDefaults` shrink to match.

### Components

- **One primitive per concept.** Remove the hand-rolled duplicates
  (`ui/Button.svelte`, `ui/Input.svelte`, and any other primitive with a
  shadcn-svelte equivalent). The grandfathered `Sheet.svelte` and
  `ConfirmDialog.svelte` move to shadcn equivalents as part of this work.
- **Feature components carry no visual CSS of their own** beyond layout
  glue. If a feature needs a new look, that look becomes a primitive or a
  variant of one.
- **Shared breakpoints.** The duplicated `640px` (7 files) and `1024px`
  become shared breakpoint definitions. CSS custom properties can't be used
  in media queries, so use Tailwind v4 theme breakpoints or a single shared
  mechanism; the builder chooses.
- **The component review process** is the owner's request: "compare them
  with more popular apps". For every primitive, and for each feature
  component's composition:
  1. List its states: default, hover (pointer only), focus-visible, pressed,
     disabled, loading, selected, empty, error, long-press or touch
     equivalent, plus light and dark.
  2. Benchmark it against Notion's equivalent, the owner's named reference
     for look and navigation. Note what Notion does better (spacing, timing,
     affordances, copy) and adopt it in Marker's style.
  3. Show it to the owner as a component sheet, in both modes and at 360px
     and desktop width, before the pages that use it are restyled.

### Tokens and file structure

- `tokens.css` stays the single source of truth with the same layering
  (primitives, then semantic, then modes). The semantic names can change to
  fit Marker (for example, a `--color-marker` and an inverted-surface pair)
  as long as the shadcn bridge is updated to match.
- `data-theme` keeps being the switch, with values `light` and `dark` only.
  `@custom-variant dark` is unchanged.
- **The existing theme-as-data idea is dropped.** Two modes don't need it.

## Review gates

These are owner checkpoints during building:

1. **Tokens + dark palette:** a mockup of the light and dark Marker palettes
   on a sample screen.
2. **Component sheets:** primitives in every state, both modes, phone and
   desktop. One sheet per group: controls, overlays, cards and lists, nav.
3. **Shell:** the sidebar and the phone tabs plus More sheet, in the real
   app.
4. **Reader typography:** a long real article (including the Navier–Stokes
   Wikipedia page) on a phone and on desktop, in both modes.
5. **Page restyles:** screenshots per page before closing #10.

## Related docs and stale plans

- `2026-06-22-design-system.md`: rewrite it for Marker (living doc).
- `2026-07-07-ui-refactor-foundation.md` (plan) and the
  `2026-07-07-ui-library-refactor-*` docs: the Tailwind/shadcn foundation
  they describe has shipped (commits `7b63152`, `a6c2ad4`), but their
  checkboxes were never ticked. The unfinished part, migrating the remaining
  primitives, is absorbed by this work. Delete those docs once the plan for
  this spec is written, per CLAUDE.md.
- `2026-06-29-tauri-mobile-port-design.md`: unchanged, and stays parked.
  This work must not make it harder (see Constraints).

## Settled after the builder check

These are marked as my calls; the owner can override any of them.

- **Capture.** The **+** opens a capture **dialog on desktop** and a
  **bottom sheet on phones**. It's one feature component that wraps the
  existing capture logic. **Owner decision (2026-11-09):** home also
  keeps a prominent inline "Save a link" field, driven by the same capture
  form, at least until #14 redesigns home. This is a relocation of an
  existing feature, not a new one.
- **Theme storage.** `theme` becomes `light | dark | system`, defaulting to
  `system`.
  - **Existing users:** the PocketBase migration maps `sepia` and `light` to
    `system`, because `light` was the old default and almost nobody chose
    it, and keeps `dark` as `dark`.
  - **Browser storage:** `localStorage.theme` gets a one-time reset, keyed
    by a version marker, so the stored values don't pin users to light.
  - **After that:** the account value wins over the local value.
- **Settings.** `/settings` becomes a small hub with Appearance (the
  light/dark/system control), Connectors (the existing page), and Account
  (sign out, plus email if available). `/profile` stays hidden and redirects
  to `/settings`. Sidebar and More sheet link to `/settings`.
- **Fonts.** Ronzino ships Regular, Medium, and Bold plus all three
  obliques. Its OpenType features include `tnum`, `pnum`, `case`, `frac`,
  `sups`/`subs`, `smcp`, and `ss01`–`ss04`. Get the files from Collletttivo's
  official release (OFL), not from the mockup folder.
- **Component sheets.** A permanent dev-only route (for example,
  `/dev/components`, absent in production builds), reused for review gates
  2–5 and later visual regression checks.
- **Mockups preserved.** The approved mockups are copied to
  `docs/superpowers/mockups/2026-11-09-design-foundation/`:
  - `home-v2.html` (ink feature, marker motif);
  - `fonts-compare.html` (Ronzino);
  - `mobile-nav.html` (option C).

  They are the reference for the Marker values above.

## Left to the builder

- Exact dark palette (subject to gate 1), the two secondary highlight tints,
  the mono font, and the final duration values.
- Breakpoint mechanism, file layout for the motion library, and the order of
  component migration.
- How to slice this into plans. A suggested order: (1) tokens, fonts, and
  motion; (2) primitives consolidation plus component sheets; (3) shell;
  (4) reader plus prefs migration; (5) page-by-page restyle.
