# UI library refactor — effort analysis

Companion to the design spec at
`docs/superpowers/specs/2026-07-07-ui-library-refactor-design.md`, which
decides *that* the 15 hand-rolled primitives in
`apps/web/src/lib/components/ui/` are replaced with shadcn-svelte equivalents.
This document works out the *effort*: starting with the inventory below (what
exists, how big it is, how well it's tested, how many feature files touch it),
later sections map each primitive to its shadcn-svelte counterpart and
estimate the migration cost.

## 1. Component inventory

| Component | LOC | Purpose (1 line) | Test file | # import sites |
|---|---|---|---|---|
| Button | 52 | Clickable button primitive; props `type: "button"\|"submit"`, `disabled`, `variant: "default"\|"accent"`, `onclick`, `children` | covered by primitives.test.ts | 5 |
| Card | 33 | Raised paper-styled container (shadow, radius, hover lift); props `children` only | none | 1 |
| CardGrid | 16 | Responsive auto-fill grid wrapper for a list of cards; props `children` only | none | 3 |
| Chip | 35 | Pill-shaped tag/filter chip with optional trailing slot; props `selected`, `trailing`, `children` | chip.test.ts | 4 |
| ConfirmDialog | 87 | Confirm/cancel modal built on bits-ui `Dialog`; props `open`, `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel` | confirm-dialog.test.ts | 2 |
| DropdownMenu | 65 | Dropdown menu shell wrapping bits-ui `DropdownMenu` (trigger + content); props `label`, `trigger`, `align: "start"\|"center"\|"end"`, `children` | DropdownMenu.test.ts | 2 |
| Input | 32 | Styled text input with two-way bound value; props `value` (bindable), `placeholder`, `type`, `oninput`, `aria-label` | none | 3 |
| MenuItem | 18 | Single selectable row inside a DropdownMenu (bits-ui `DropdownMenu.Item` wrapper); props `onSelect`, `variant: "default"\|"danger"`, `children` | none | 2 |
| PaperCorner | 20 | Decorative aria-hidden "dog-ear" fold overlay motif; props `size` (px) | paper-corner.test.ts | 1 |
| Rail | 18 | Sticky sidebar layout wrapper (`<aside>`); props `label`, `children` | rail.test.ts | 1 |
| Sheet | 41 | Slide-in drawer/panel built on bits-ui `Dialog`, portal-rendered to escape the page's containing block; props `open`, `onClose`, `title`, `children` | sheet.test.ts | 2 |
| Skeleton | 34 | Shimmering loading-placeholder lines, reduced-motion aware; props `lines`, `radius` | skeleton.test.ts | 1 |
| SourcePill | 42 | Article-source pill showing favicon + host/name; props `name`, `host`, `iconUrl` | source-pill.test.ts | 2 |
| Spinner | 19 | Small accessible loading spinner (`role="status"`); props `label` | covered by primitives.test.ts | 1 |
| Tag | 9 | Thin wrapper that renders a non-interactive `Chip` for read-only tag display; props `children` only | covered by primitives.test.ts | 1 |

Notes on the data above:

- **LOC** is `wc -l` on each `.svelte` file (`apps/web/src/lib/components/ui/*.svelte`), template + script + style included.
- **Test file** naming is inconsistent in this directory — some components have a dedicated PascalCase (`DropdownMenu.test.ts`) or kebab-case (`confirm-dialog.test.ts`) file, others (Button, Tag, Spinner) are covered together in `primitives.test.ts`, and four components (Card, CardGrid, Input, MenuItem) have no test coverage at all.
- **# import sites** counts distinct feature files (outside `components/ui/`) that import the component, via `grep -rl "ui/<Component>\.svelte" apps/web/src --include=*.svelte --include=*.ts | grep -v "/components/ui/"`. The literal grep pattern (`grep -rl "components/ui/Button"`) only matches `$lib`-style absolute imports and misses relative imports (e.g. `ArticleCard.svelte` imports `Card` via `"./ui/Card.svelte"`), which would have undercounted Card's blast radius as 0. To capture both import styles, import counts were gathered by matching on `ui/<Component>\.svelte`; each count was cross-checked by listing the actual matching files.

## 2. Migration mapping

Catalog source: the real, current shadcn-svelte docs (`/websites/shadcn-svelte`
via context7 — `button`, `card`, `badge`, `input`, `dropdown-menu`, `sheet`,
`skeleton`, `alert-dialog`, `spinner` were each individually confirmed to exist
with their real install commands and usage snippets, not recalled from
training data).

**Repo-wide prerequisite (not priced into any single row below):** this repo
has **no Tailwind CSS at all** today (`grep tailwind apps/web/package.json`
and a search for `tailwind.config`/`components.json` both come up empty).
shadcn-svelte hard-requires Tailwind v4 (utility classes, `cva`,
`clsx`/`tailwind-merge`, the `cn()` helper, a `@theme inline` block) — that's
a one-time, repo-wide setup step that precedes migrating any component below,
not a per-component cost. The good news: the two dependencies shadcn-svelte
actually builds *on* are already in place — Svelte `^5.0.0` and `bits-ui
^2.18.1` — and `@lucide/svelte` (shadcn's default icon set) is already a
dependency too (already used by `SourcePill`).

**Theming confirmation (read, not assumed):** `tokens.css` only ever gets
touched by `[data-theme]` at the `--color-*` semantic layer. `dark` overrides
every `--color-*` referenced below; `sepia` overrides bg/surface/text/border/
fold but deliberately leaves `--color-accent` / `--color-ring` /
`--color-selection` pointing at `:root`'s terracotta (sepia keeps the accent,
it only mutes the page — a deliberate choice, not a gap). So: mapping a
shadcn CSS var to a `--color-*` token, done once, is picked up correctly by
all three themes with no per-theme shadcn override needed.

**Radius does not remap with one variable.** shadcn derives
`--radius-sm/md/lg/xl` from a single `--radius` via fixed ±2px/±4px offsets
(the whole scale spans about 8px). `tokens.css`'s ramp spans 6px → 40px in
much wider, non-linear steps (`--radius-xs` 6, `-sm` 10, `-md` 14, `-lg` 20,
`-xl` 28, `-2xl` 40, `-pill` 999). No single `--radius` value reproduces that
ramp, so most rows below need an explicit per-component radius override
rather than a global swap — `Sheet` (no radius either way) and `Chip`/`Tag`
(shadcn `Badge` is already `rounded-full`) are the exceptions that already
line up.

**Shadow and font aren't shadcn CSS variables at all** — no `--shadow-*` or
`--font-*` exists by default; shadcn applies both via Tailwind utility
classes written directly in each component's markup. Carrying over the
`--shadow-sm..xl` ramp and the Fredoka-display/IBM-Plex-UI split means either
editing the copied component's class strings per component, or extending
Tailwind's own `--shadow-*`/`--font-*` theme values (once Tailwind exists) to
point at `tokens.css` — a one-time setup in the same spirit as the radius
point above, so it isn't re-priced into every row either.

| Component | shadcn-svelte equivalent | Retheme notes | Test to port | Visual-identity risk | Size |
|---|---|---|---|---|---|
| Button | `button` | `--primary`/`--primary-foreground` → `--color-accent`/`--color-text-on-accent` (accent variant); `--background`/`--foreground` → `--color-surface`/`--color-text` (default variant); `--border` → `--color-border`; `--ring` → `--color-ring`. Colors covered by the one-time root remap. Radius is not: our pill shape (`--radius-pill`, 999px) has no relationship to shadcn's calc'd scale — needs an explicit override, not a var swap. | Rewrite selectors — the role/disabled/onclick assertions in `primitives.test.ts` port as-is, but `toHaveAttribute("data-variant", "accent")` targets our own attribute scheme and must be rewritten against shadcn's `variant` prop/class output. | Low | M — clean color remap and a mostly-reusable test, but the radius override + partial test rewrite + 5 import sites push it past S. |
| Card | `card` | `--card`/`--card-foreground` → `--color-surface-raised`/`--color-text`; covered by the root remap. Two things shadcn doesn't ship need adding back on the copied file: the grain-texture `::before` overlay and the hover-lift transform/`shadow-md`, plus a `--radius-lg` override. | No test — add smoke test. | Med — the grain overlay is a paper-polish detail, not the core dog-ear identity mark, but it's visibly lost without the override. | M — a clean remap plus two custom-CSS additions; only 1 import site keeps it off L. |
| CardGrid | no equivalent — keep bespoke | A 16-line `auto-fill` CSS grid wrapper; shadcn ships components, not layout primitives, so there's no catalog counterpart to move to. | No test — add smoke test. | Low — pure layout, no themed surface or motif. | S — zero migration cost; it just stays. |
| Chip | `badge` (extended) | shadcn `Badge` is already `rounded-full` — no radius override needed here. Unselected → `--secondary`/`--secondary-foreground` map to `--color-border`(outline)/`--color-text-muted`; selected → `--primary`/`--primary-foreground` map to `--color-accent`/`--color-surface` (matches Chip's current accent-fill + light-text selected look). Covered by the root remap. The `selected` toggle state and `trailing` slot aren't in stock `Badge` — kept as small additions on the copied file (shadcn is copy-in, so extending it this way is normal usage, not a fork). | Rewrite selectors — `chip.test.ts` asserts `container.querySelector(".chip")` and its `data-selected` attribute; the class breaks once `Badge`'s own class output replaces `.chip`, though the assertion can be re-pointed at the same `data-selected` attribute if it's preserved on the extended component. | Med — the accent-fill selected state is a real (if small) piece of the filter UI's identity; no dog-ear/grain involved. | M — radius is free, but the selected/trailing behavior + test rewrite + 4 import sites add up. |
| ConfirmDialog | `alert-dialog` | `--background`/`--foreground` → `--color-surface`/`--color-text`; `--border` → `--color-border`. Covered by the root remap. `--destructive`/`--destructive-foreground` (→ `--color-danger`/`--color-text-on-accent`) is available for `AlertDialog.Action`, but the current component paints confirm as `variant="accent"` terracotta, not danger-red — a design decision to carry over deliberately, not a var gap. `--radius` needs an explicit `--radius-xl` override, and the grain-texture `::before` overlay needs re-adding, same as Card. | Port as-is — `confirm-dialog.test.ts` only asserts on text content, button role names, and Escape-key behavior; `AlertDialog` is bits-ui `Dialog` underneath just like the current implementation, so the same semantics carry over. | Med — the grain overlay is a paper-texture detail; the rest (title/message/actions) is a fully generic confirm pattern. | M — a clean remap and a test that survives, but the radius + grain-overlay additions plus the danger-color decision keep it off S. |
| DropdownMenu | `dropdown-menu` | `--popover`/`--popover-foreground` → `--color-surface-raised`/`--color-text` (panel bg); `--accent`/`--accent-foreground` (shadcn's hover-highlight token, distinct from `--primary`) → `--color-accent-wash`/`--color-text` — an unusually clean match, it's almost exactly the existing `.menu-item:hover { background: var(--color-accent-wash) }`. `--border` → `--color-border`. Covered by the root remap. `--radius` needs an explicit `--radius-md` override. `--destructive` → `--color-danger` surfaces a pre-existing inconsistency worth a deliberate call: today's "danger" menu-item variant is colored with `--color-accent` (terracotta), not the semantic `--color-danger` (clay). | Port as-is — `DropdownMenu.test.ts` drives everything through `__fixtures__/DropdownMenuHarness.svelte` by role/text, no class-name assertions; the fixture needs rewiring to shadcn's import paths, but the assertions themselves are unchanged. | Low — generic menu control, no motif. | M — the accent-wash mapping is nearly free, but the harness rewrite + radius override + danger-color decision + 2 import sites keep it off S. |
| Input | `input` | `--background`/`--foreground` → `--color-surface`/`--color-text`; `--border`/`--input` → `--color-border`; `--ring` → `--color-ring`. Covered by the root remap. `--radius` needs an explicit `--radius-md` override. | No test — add smoke test. | Low — fully generic text field, no motif. | S — direct equivalent, remap + one radius override, no test to break, 3 import sites. |
| MenuItem | folds into `dropdown-menu`'s `DropdownMenu.Item` — not a separate top-level shadcn component, and doesn't need to be one; it's already only ever used inside `DropdownMenu`. Danger-variant color follows the same `--destructive` decision noted on the `DropdownMenu` row. | Reuses `DropdownMenu`'s `Item` primitive directly; no separate retheme surface. | No test — add smoke test (or fold an assertion into `DropdownMenu`'s). | Low. | S — the wrapper disappears entirely; both import sites just import `DropdownMenu.Item` instead. |
| PaperCorner | no equivalent — keep bespoke | This *is* the banner's dog-ear fold motif (`--color-fold`, `assets/_banner.html`'s `.fold`); no generic component library ships a decorative page-corner element. | Port as-is — unchanged, since the component isn't touched. | High — directly carries the visual-identity motif; swapping it out is the definition of losing the aesthetic. | S — zero migration cost. |
| Rail | no equivalent — keep bespoke | shadcn's closest analog is `sidebar`, a full collapsible app-shell system (provider, cookie-persisted state, keyboard shortcuts); `Rail` is an 18-line sticky `<aside>` with no collapse/toggle behavior — adopting `sidebar` would be strictly more code and complexity for less functionality. | Port as-is — unchanged. | Low — plain layout wrapper, no motif. | S — zero migration cost. |
| Sheet | `sheet` | `--background` → `--color-surface`; `--border` → `--color-border` (edge border); shadow needs a `--shadow-lg` override, same as before. Covered by the root remap. Radius is the one component with a clean match — neither the current `Sheet` nor shadcn's applies a border-radius to a full-height edge panel, so no override is needed here. | Port as-is — `sheet.test.ts` drives everything through `role="dialog"`, its accessible name, Escape, and a timed backdrop `pointerdown` that accounts for bits-ui's dismissable-layer debounce; shadcn's `Sheet` wraps the same bits-ui `Dialog` primitive, so the same portal/dismiss semantics apply. `data-testid="sheet-backdrop"` just needs preserving on the copied `Overlay`. | Low — generic slide-in drawer, no bespoke motif; the component was already refactored onto bits-ui `Dialog` in a prior commit specifically to match this pattern. | S — the closest to a 1:1 swap in the whole set: clean remap, no radius override, test ports as-is, 2 import sites. |
| Skeleton | `skeleton` | `--muted` → `--color-surface-sunken`; covered by the root remap. Two behavioral gaps need custom CSS/logic kept on top: shadcn's default is a single flat `animate-pulse` div (no shimmer sweep), and it has no `lines` prop — both need preserving by keeping the current shimmer keyframes/gradient and the `Array(lines)` loop layered onto the copied component, including the existing `prefers-reduced-motion` handling. | Rewrite selectors — the aria-hidden assertion ports as-is, but `container.querySelectorAll(".skeleton-line").length` targets our own class name, which won't exist under shadcn's per-instance-div default structure; needs rewriting once the `lines` loop is reimplemented. | Med — the shimmer sweep is part of the app's paper-polish feel, not core identity, but visibly flatter without it. | M — a clean color remap, but the shimmer effect and `lines` prop both need re-adding, plus a test rewrite. |
| SourcePill | no equivalent — keep bespoke | An app-specific favicon+host/name composite (Lucide `Globe` fallback), not a generic control; nothing in the shadcn catalog composes "icon + label with fallback" as a single primitive. | Port as-is — unchanged. | Low — no banner motif involved, just app-specific composition. | S — zero migration cost. |
| Spinner | `spinner` | shadcn's `Spinner` is a spinning-icon component colored via Tailwind text-color utilities (`currentColor`), not a CSS-var-driven ring — there's no `--background`/`--primary` to remap. Keeping our border-spin look (`--color-fold` track, `--color-accent` head) means overriding the copied component's style rather than remapping a variable. | Port as-is, contingent on keeping the accessible wrapper — `getByLabelText("Loading")` needs `role="status"`/`aria-label` preserved on the copied component, since shadcn's `Spinner` ships with neither by default. | Low — generic loading indicator; border-spin vs. icon-spin is a minor style choice, not an identity motif. | S — exact name match, one CSS override, a11y wrapper carried over, 1 import site. |
| Tag | `badge` (default variant) | Same `--secondary`/`--secondary-foreground` → `--color-surface-sunken`/`--color-text-muted` mapping as Chip's unselected state; `Tag` is non-interactive so it needs none of Chip's `selected`/`trailing` additions — the closest 1:1 match in the set. Covered by the root remap; `Badge`'s default `rounded-full` needs no radius override. | Port as-is — `primitives.test.ts` only checks `screen.getByText("ai")`, unaffected by markup changes. | Low — plain read-only label. | S — direct swap, test ports as-is, 1 import site. |

Every component from Section 1 appears above. Four are kept bespoke
(`CardGrid`, `PaperCorner`, `Rail`, `SourcePill`), each with a one-line reason
tied to either "shadcn has no layout/decorative-motif primitive for this" or
"the closest shadcn analog is disproportionately heavier than what this does."
`PaperCorner` is the only High-risk row, and it's High specifically because
it's kept bespoke to preserve the banner's dog-ear visual-identity motif. No TBDs.

## 3. Synthesis & recommendation

### Effort tallies

Recounted row-for-row from the Section 2 table, not from memory:

**15 components total: 11 migrate, 4 stay bespoke.**

The Size column uses "S" for two different things — an actually-small
migration and a zero-cost bespoke keep — so the two must be split by reading
each row's rationale, not just the letter:

- **Keep bespoke (4, all labeled S "zero migration cost"):** `CardGrid`,
  `PaperCorner`, `Rail`, `SourcePill`. None of these move — no shadcn
  equivalent exists, or the equivalent is strictly heavier than the current
  component.
- **Migrate (11): 5 S / 6 M / 0 L.**
  - **S (5):** `Input`, `MenuItem`, `Sheet`, `Spinner`, `Tag`.
  - **M (6):** `Button`, `Card`, `Chip`, `ConfirmDialog`, `DropdownMenu`,
    `Skeleton`.
  - **L (0):** none — no row in Section 2 carries an L size.

So the honest total: **11 migrate, 4 stay bespoke; of the 11: 5S / 6M / 0L.**

### Migration order

De-risk by doing the cheapest, most-isolated swap first, then widen:

**1. Proof-of-concept: `Tag`.** This is the safest possible first probe
because it stacks every favorable property at once: 1 import site (smallest
blast radius in the whole inventory), a color-only remap (`--secondary`/
`--secondary-foreground` → `--color-surface-sunken`/`--color-text-muted`,
values that do differ across `default`/`dark`/`sepia` — so it genuinely
exercises a theme sweep, not a no-op), no radius override needed (`Badge`'s
default `rounded-full` already matches), zero new behavior to build
(`Tag` is a static, non-interactive label), and an existing test
(`primitives.test.ts`'s `getByText("ai")` assertion) that survives unchanged
as a tripwire. It proves the install works, the root CSS-var remap is picked
up by all three themes, and the copy-in file replaces the old one cleanly —
before anything harder is layered on.

**2. Rest of the S bucket, in order of what each newly proves:**
- `Input` next — introduces the first radius override decision
  (`--radius-md`) and touches 3 import sites, validating that a slightly
  wider blast radius still swaps cleanly.
- `Sheet` next — the closest thing to a 1:1 swap in the set, but with real
  stakes: `sheet.test.ts`'s Escape-key and timed-backdrop-dismiss assertions
  must survive the swap to `shadcn`'s `Sheet` (same underlying bits-ui
  `Dialog`), so this is the first row where "port as-is" is actually tested
  end-to-end rather than assumed.
- `Spinner` next — a different retheming mode entirely: shadcn's `Spinner`
  has no `--background`/`--primary` CSS var to remap at all, so this proves
  the "override the copied component's classes directly" path, not just the
  "remap a var" path used by every S/M row so far.
- `MenuItem` **is the one exception to strict size-bucket ordering.**
  Although Section 2 sizes it S ("zero migration cost — the wrapper
  disappears entirely"), its replacement isn't a standalone shadcn
  component — it's `DropdownMenu`'s own `Item` export. `MenuItem` cannot
  actually migrate until `DropdownMenu` (an M) migrates, so it should be
  sequenced together with `DropdownMenu`, not earlier with the rest of S.

**3. M bucket** (once `Tag`/`Input`/`Sheet`/`Spinner` have proven install +
color remap + radius override + non-var-override paths all work):
`DropdownMenu` (+ `MenuItem` alongside it), then `Button`, `Chip`,
`ConfirmDialog`, `Card`, `Skeleton` — each adds one new wrinkle (a harness
rewrite, a selected/trailing behavior addition, a danger-color decision, a
grain-overlay re-add, a shimmer-sweep re-add) on top of a by-then-proven base.

**4. L bucket:** empty — nothing to sequence here.

### Incremental vs. big-bang: **incremental**

shadcn-svelte is copy-in — there's no package version to bump and no
compatibility lock between "old" and "new" components, so a hand-rolled
`Card.svelte` and a shadcn-derived `Button.svelte` can sit side by side in
`apps/web/src/lib/components/ui/` indefinitely with zero conflict. That
removes the only real argument for big-bang (avoiding a long-lived
mixed state), so incremental wins outright: migrate one component at a time
behind its existing import path, run its tests, and only delete the old
`.svelte` file once the replacement passes. Each row's small blast radius
(1–5 import sites, confirmed in Section 1) means a bad swap is cheap to spot
and cheap to revert — the opposite of the coordination big-bang would force
across all 15 components' ~30 total import sites at once.

**One-time upfront cost, before `Tag` (the first component) can move at
all:**
1. Adopt Tailwind v4 in `apps/web` (shadcn-svelte hard-requires it — see
   below).
2. Install the shadcn-svelte CLI and its scaffolding: `components.json`, the
   `cn()` helper, `clsx`/`tailwind-merge`, `cva`.
3. Seed the shared shadcn CSS-var block (the `@theme inline` root block) by
   remapping it once to `tokens.css`'s `--color-*` semantic layer — this is
   the one-time step Section 2 confirmed is picked up correctly by all three
   themes (`default`/`dark`/`sepia`) with no further per-theme work.

This cost is paid exactly once, not per component — every row after `Tag`
inherits it for free.

### Open risks / unknowns

- **Candidate-choice contradiction (surfacing only, not re-deciding here).**
  This repo has **zero Tailwind** today, and shadcn-svelte **hard-requires**
  Tailwind v4 (confirmed in Section 2: no `tailwind` in
  `apps/web/package.json`, no `tailwind.config`/`components.json` anywhere).
  The design spec (`docs/superpowers/specs/2026-07-07-ui-library-refactor-design.md`)
  dinged Skeleton (the other candidate) specifically for requiring Tailwind,
  while treating shadcn-svelte as the lighter "no stack change" option. That
  differentiation doesn't hold: both top candidates require adopting
  Tailwind from scratch. This doesn't unwind the decision made here — but
  it's a real input the human should weigh before the migration plan is
  written, since the design spec's stated reason for preferring shadcn-svelte
  over Skeleton is undermined by this finding.
- **shadcn-svelte / bits-ui version compatibility.** The repo already has
  `bits-ui ^2.18.1` installed, and shadcn-svelte builds on bits-ui — but
  the exact peer-dependency range shadcn-svelte's current release expects
  wasn't verified against `^2.18.1` specifically. Confirm this before running
  the install step, not after.
- **Fredoka / IBM Plex font wiring.** shadcn ships no `--font-*` CSS vars —
  fonts are applied via Tailwind utility classes per component. How the
  existing Fredoka-display/IBM-Plex-UI split gets wired into Tailwind's own
  theme (so copied components pick it up automatically instead of needing a
  font class hand-added to every copied file) is undecided.
- **Radius-scale mismatch (restated as a system-level open question, not
  just a per-row note).** shadcn derives `--radius-sm/md/lg/xl` from a
  single `--radius` via fixed ±2px/±4px offsets (~8px total span);
  `tokens.css`'s ramp spans 6px → 40px in wider, non-linear steps. Section 2
  worked around this per-component with explicit overrides, but the
  migration plan should decide once, system-wide: keep doing per-component
  radius overrides indefinitely, or extend Tailwind's theme so
  `--radius-sm/md/lg/xl` each point independently at `tokens.css` values,
  bypassing shadcn's linked-ramp formula entirely.
- **Shadow ramp, same shape of question as radius.** `--shadow-*` isn't a
  shadcn CSS var either (applied via Tailwind utility classes); whether to
  extend Tailwind's theme to carry `tokens.css`'s `--shadow-sm..xl` ramp
  globally, or hand-edit class strings per copied component, is undecided.
