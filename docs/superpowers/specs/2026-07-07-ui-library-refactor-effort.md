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
- **# import sites** counts distinct feature files (outside `components/ui/`) that import the component, via `grep -rl "ui/<Component>\.svelte" apps/web/src --include=*.svelte --include=*.ts | grep -v "/components/ui/"`. This is a variant of the brief's example command: the literal example (`grep -rl "components/ui/Button"`) only matches `$lib`-style absolute imports and misses relative imports (e.g. `ArticleCard.svelte` imports `Card` via `"./ui/Card.svelte"`), which would have undercounted Card's blast radius as 0. Matching on `ui/<Component>\.svelte` catches both import styles; each count was cross-checked by listing the actual matching files (see task report for the full per-component file lists).
