# Design Foundation, Plan 3 of 5: App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the top bar and bottom nav with the Marker shell:

- a Notion-style sidebar on tablet and desktop;
- Home/Library/More tabs with a More sheet on phones;
- a shared page header with search and a capture button that opens a
  capture dialog or sheet;
- a `/settings` hub;
- a focused reader with its own header and a navigation overlay.

**Architecture:**

- **One nav model:** a pure module (`lib/shell/nav.ts`) decides which
  sections exist, which is active, and where the shell shows. The sidebar,
  tab bar, More sheet, and reader overlay all render from it.
- **Collections:** the root layout server load provides the user's
  collections, so the sidebar and the More sheet can list them.
- **Capture:** the logic moves out of `CaptureBar` into a small function
  and one `CaptureForm`. The home page keeps it as a prominent inline
  field, and the header's **+** opens it in a `CaptureSheet` (a Dialog from
  `md` up, a BottomSheet below).
- **Old components:** `TopBar` and `BottomNav` are deleted. Their jobs
  (theme switch, sign out, search) move to `/settings` and the page header.

**Tech Stack:** SvelteKit 2 / Svelte 5 (`svelte/reactivity` `MediaQuery`),
the Plan 2 shadcn primitives (Button, Sheet, BottomSheet, Dialog, Input), the
Marker tokens and the marker motif, Vitest with @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-11-09-design-foundation-design.md`
(#10), sections "App shell and navigation", "Reader", and "Settled after the
builder check" (capture, settings). Plans 1–2 are done on this branch. The
approved phone mockup is
`docs/superpowers/mockups/2026-11-09-design-foundation/mobile-nav.html`
(option C).

## Global Constraints

- Tokens only. Use shadcn primitives from `$lib/components/ui/`. No direct
  `bits-ui` imports outside `ui/`, which the `no-hand-rolled` guard
  enforces.
- Mobile-first: usable at 360px, no horizontal overflow, tap targets ≥ 44px.
  The tab bar and sheets respect `env(safe-area-inset-bottom)`.
- No hover-only affordances.
- **Breakpoint (my call):**
  - Sidebar from Tailwind `md` (48rem = 768px) up. That covers tablet and
    desktop, per the spec's "Desktop / tablet".
  - Phone tabs below `md`.
  - In script, use `new MediaQuery("(min-width: 48rem)")` from
    `svelte/reactivity`. In markup and CSS, use `md:`.
- **Sections that don't exist yet are absent:** no Websites (#13), no Goals
  (#15), and no placeholders. Tabs are Home, Library, More.
- **Active states:**
  - The active sidebar item is an ink pill (`bg-inverse text-inverse-foreground`).
  - The active tab label carries the static marker underline (`.marker`
    from `lib/styles/marker.css`).
- **Copy:** sentence case for all new shell copy ("Home", "Library",
  "More", "Settings", "Save a link", "Collections", "New collection").
  Existing page copy is plan 5's job.
- **Reader:**
  - It shows no app sidebar and no tab bar.
  - Its header has back (to where the user came from, else `/library`),
    search, and a menu that opens the nav overlay.
  - On phones the header and control bar hide on scroll down and reappear
    on scroll up (existing behavior, kept).
- Tests:
  - subset: `pnpm exec vitest run <pattern>`;
  - all: `pnpm test`;
  - also `pnpm typecheck` and `pnpm lint`;
  - svelte-check must stay ≤ **43** errors.
- Conventional Commits. End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Arriving in the reader from a collection or from search, then pressing
   Back, should return there, not always to `/library`. A deep link opened
   fresh (no history) should go to `/library`. Task 7 pins both.
2. Saving a link while on the library page should make the new item appear
   without a manual reload. Task 5 asserts the capture success path calls
   `invalidateAll` and closes the sheet.
3. Capture errors (quota 402, bad URL, network failure) should keep the
   sheet open with the message and the typed URL intact. Task 5 tests each.
4. Signed-out pages (`/login`, `/verify`) and the reader show no app shell,
   and nothing about the shell flashes before navigation. Task 1 pins
   `shellFor(pathname)`. Task 6 asserts the layout renders no
   sidebar or tab bar on those routes.
5. A user with many collections (30+) must still reach Settings in the
   sidebar and the More sheet. The collections list scrolls; Settings stays
   pinned. Task 3 and Task 4 each render 30 collections and assert the
   Settings link is visible and outside the scroll region.

---

### Task 1: Nav model, shell visibility, and collections in the root load

**Files:**

- Create: `apps/web/src/lib/shell/nav.ts`, `apps/web/src/lib/shell/nav.test.ts`
- Modify: `apps/web/src/routes/+layout.server.ts` (add `collections`)
- Test: `apps/web/src/routes/layout.server.test.ts` (create or extend)

**Interfaces:**

- Produces, in `nav.ts`:
  - `type NavKey = "home" | "library"`
  - `interface NavItem { key: NavKey; label: string; href: "/" | "/library" }`
  - `const NAV_ITEMS: readonly NavItem[]`, which is exactly
    `[{key:"home",label:"Home",href:"/"},{key:"library",label:"Library",href:"/library"}]`.
  - `function activeKey(pathname: string): NavKey | "collections" | "settings" | null`:
    - `/` → `"home"`;
    - `/library` and `/read/*` → `"library"`;
    - `/collections` and `/collections/*` → `"collections"`;
    - `/settings` and `/settings/*` → `"settings"`;
    - anything else → `null`.
  - `type ShellKind = "app" | "reader" | "none"`
  - `function shellFor(pathname: string): ShellKind`:
    - `/login` and `/verify` (and their subpaths) → `"none"`;
    - `/read/*` → `"reader"`;
    - everything else → `"app"`.
- Produces, in the root layout data: `collections: { id: string; name: string; slug: string; count: number }[]`
  (from `fetchCollections(locals.pb)`). Signed out, it is `[]`.

- [x] **Step 1: Write the failing tests.** In `nav.test.ts`:
  - each `activeKey` mapping above, including `"/collections/physics"`
    → `"collections"` and `"/read/abc"` → `"library"`;
  - `shellFor("/login")`, `"/verify?token=x"` (pathname only) and
    `"/read/x"`;
  - `"/dev/components"` → `"app"`;
  - `NAV_ITEMS` labels equal `["Home","Library"]`.

  In `layout.server.test.ts`:
  - `it("returns the user's collections")`, with a mocked
    `fetchCollections`;
  - `it("returns no collections when signed out")`.

- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run shell/nav layout.server`. Expected: FAIL.
- [x] **Step 3: Implement it.**
- [x] **Step 4: Run them and confirm they pass.** Same command; expected:
      PASS.
- [x] **Step 5: Commit**
      `feat(web): shell nav model and collections in the root load`.

---

### Task 2: `/settings` hub (Appearance, Connectors, Account); `/profile` → `/settings`

**Files:**

- Create: `apps/web/src/lib/components/ThemeControl.svelte`. This is the
  Light / Dark / Match system segmented control, moved out of `TopBar.svelte`
  with the same accessible names and `aria-pressed`. It uses Button
  `variant="secondary"`/`"default"` for unpressed/pressed.
- Create: `apps/web/src/lib/auth/sign-out.ts`, exporting
  `async function signOut(pb: PocketBase, go: (path: string) => Promise<void>): Promise<void>`.
  It clears the authStore, then calls `go("/login")`.
- Create: `apps/web/src/routes/settings/+page.svelte`
- Modify: `apps/web/src/routes/profile/+page.server.ts` (redirect 307 →
  `/settings`), and its test
- Modify: `apps/web/src/routes/settings/connectors/+page.svelte`. Add a
  Back link to `/settings`, a ghost Button with an `ArrowLeft` icon and the
  label "Settings".
- Test: `apps/web/src/lib/components/ThemeControl.test.ts`,
  `apps/web/src/routes/settings/page.test.ts`,
  `apps/web/src/lib/auth/sign-out.test.ts`

**Interfaces:**

- Consumes: the layout's theme context (`getContext("theme")` with
  `current`, `mode`, `set`).
- Produces:
  - **`ThemeControl`:** props `value: ThemePref` and
    `onChange: (t: ThemePref) => void`.
  - **The `/settings` page:** three sections with headings "Appearance",
    "Connectors", and "Account".
    - Appearance holds `ThemeControl` bound to the theme context.
    - Connectors is a row linking to `/settings/connectors`, reading
      "Export and connections".
    - Account shows the signed-in email (`pb.authStore.model?.email`) and
      a "Sign out" Button `variant="outline"` that calls `signOut`.
  - The page header comes in Task 6. For now, render `<h1>Settings</h1>`.

- [x] **Step 1: Write the failing tests.**
  - `ThemeControl`: renders the three options, `aria-pressed` follows
    `value`, and clicking emits the pref.
  - `/settings`: the three section headings exist; choosing "Dark" calls
    the context `set("dark")`; "Sign out" calls `signOut`; the connectors
    link has `href` `/settings/connectors`.
  - `/profile` server load: it throws a redirect to `/settings`.
  - `signOut`: it clears the store, then navigates to `/login`.
- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run ThemeControl routes/settings routes/profile sign-out`.
      Expected: FAIL.
- [x] **Step 3: Implement it.** `TopBar` still exists until Task 6; make it
      import `ThemeControl` so there is no duplicate markup.
- [x] **Step 4: Run them and confirm they pass.** Same command; expected:
      PASS.
- [x] **Step 5: Commit**
      `feat(web): settings hub with appearance, connectors and account`.

---

### Task 3: AppSidebar (tablet and desktop)

**Files:**

- Create: `apps/web/src/lib/collections/actions.ts`, exporting
  `async function createCollection(pb: PocketBase, name: string): Promise<{ ok: true } | { ok: false; error: "duplicate" | "empty" }>`.
  - This is the logic moved verbatim from `routes/library/+page.svelte`'s
    `createCollection` (slugify, a 400 means duplicate), plus trim and the
    empty check.
  - The library page now calls this helper and still shows its existing
    error copy.
- Create: `apps/web/src/lib/components/shell/AppSidebar.svelte`,
  `apps/web/src/lib/components/shell/SidebarCollections.svelte`
- Test: `apps/web/src/lib/components/shell/AppSidebar.test.ts`,
  `apps/web/src/lib/collections/actions.test.ts`

**Interfaces:**

- Consumes: `NAV_ITEMS` and `activeKey` (Task 1), layout `collections`
  (Task 1), `createCollection` (this task).
- Produces:
  - **`AppSidebar`:** props
    `pathname: string, collections: CollectionSummary[], onCreated: () => void`,
    where `CollectionSummary` is the Task 1 element type.
  - **Layout:** a `nav` landmark labelled "Main". Full viewport height,
    `w-60`, flush on the page (`bg-background`, right edge
    `ring-1 ring-hairline` or a hairline border), with three regions.
    - **Top:** the wordmark `readme<span class="marker">pls</span>`
      linking to `/`.
    - **Middle (scrolls):**
      - the `NAV_ITEMS` links;
      - then a "Collections" heading row with a ghost `icon-sm` "+"
        Button (`aria-label="New collection"`). It opens an inline Input
        (Enter creates, Escape cancels) and shows the duplicate or empty
        error inline.
      - then `SidebarCollections`: links to `/collections/[slug]`, each
        with its count right-aligned (tabular numerals).
    - **Bottom (pinned):** a "Settings" link to `/settings`.
  - Every link is a ≥44px-tall row with `rounded-full`.
  - The active row (from `activeKey`, or for collections the matching
    slug) has `bg-inverse text-inverse-foreground` and
    `aria-current="page"`.
  - Hover on fine pointers uses `bg-accent` and a nudge of
    `translate-x-0.5` with `ease-out`, and `motion-reduce:transform-none`.

- [x] **Step 1: Write the failing tests.**
  - `actions.test.ts`:
    - creating `"Long reads"` posts the slug `long-reads`;
    - a 400 → `{ok:false,error:"duplicate"}`;
    - `"   "` → `{ok:false,error:"empty"}` with no request.
  - `AppSidebar.test.ts`:
    - it renders Home and Library, and no "Websites" or "Goals";
    - `pathname="/library"` marks Library `aria-current="page"`;
    - `pathname="/collections/physics"` marks the Physics collection link
      current;
    - with 30 collections, the "Settings" link exists outside the element
      with `data-sidebar-scroll` (Review Focus 5);
    - "New collection" → typing a name → Enter calls `createCollection`,
      then `onCreated`;
    - the duplicate error text renders.
- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run AppSidebar collections/actions`. Expected: FAIL.
- [x] **Step 3: Implement it.** Move the library page onto
      `createCollection` and keep its tests green.
- [x] **Step 4: Run them and confirm they pass.**
      `pnpm exec vitest run AppSidebar collections/actions routes/library`.
      Expected: PASS.
- [x] **Step 5: Commit**
      `feat(web): Marker sidebar with collections`.

---

### Task 4: Phone TabBar and More sheet

**Files:**

- Create: `apps/web/src/lib/components/shell/TabBar.svelte`,
  `apps/web/src/lib/components/shell/MoreSheet.svelte`
- Test: `apps/web/src/lib/components/shell/TabBar.test.ts`,
  `apps/web/src/lib/components/shell/MoreSheet.test.ts`

**Interfaces:**

- Consumes: `NAV_ITEMS` and `activeKey` (Task 1); `SidebarCollections` and
  `createCollection` (Task 3); `BottomSheet` (`ui/BottomSheet.svelte`); the
  existing `nextNavVisible` (`lib/components/bottom-nav-scroll.ts`); keep
  that file.
- Produces:
  - **`TabBar`:** props `pathname: string, onMore: () => void, moreOpen: boolean`.
    - It is fixed at the bottom with `md:hidden`, floats
      (`rounded-t-xl`, `bg-card ring-1 ring-hairline`), and has
      `pb-[env(safe-area-inset-bottom)]`.
    - It holds three tabs (Home, Library, More), each ≥44px with an icon
      above the label.
    - The active tab (from `activeKey`; Collections and Settings count as
      More) has `aria-current="page"` and its label wrapped in `.marker`.
      More is a button with `aria-expanded={moreOpen}`.
    - It hides on scroll down via `nextNavVisible`
      (`translate-y-full`, `ease-out`, `motion-reduce:transition-none`).
  - **`MoreSheet`:** props `open: boolean, onClose: () => void,
pathname: string, collections: CollectionSummary[], onCreated: () => void`. - It is a BottomSheet titled "More". - Top: a "Settings" row (a pinned row and not inside the scroll area,
    per Review Focus 5). - Then "Collections" with "+ New collection" and `SidebarCollections`
    in a scroll region (`data-more-scroll`, `max-h-[50dvh] overflow-y-auto`). - Tapping any link closes the sheet.

- [x] **Step 1: Write the failing tests.**
  - `TabBar`:
    - it has exactly three tabs labelled Home, Library, More;
    - Library is current on `/read/x`;
    - More is current on `/collections` and on `/settings`;
    - the More button calls `onMore`;
    - the root has `md:hidden` and the safe-area padding class.
  - `MoreSheet`:
    - the Settings link exists outside `[data-more-scroll]` when there are
      30 collections;
    - clicking a collection link calls `onClose`;
    - "New collection" creates.
- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run TabBar MoreSheet`. Expected: FAIL.
- [x] **Step 3: Implement it.**
- [x] **Step 4: Run them and confirm they pass.** Same command; expected:
      PASS.
- [x] **Step 5: Commit**
      `feat(web): phone tab bar and More sheet`.

---

### Task 5: One CaptureForm for the home field and the header's capture sheet; PageHeader

Owner decision (2026-11-09): the home page **keeps** a prominent "Save a
link" field, and the header's **+** opens the same form in a sheet on every
page. One component drives both, so there is no duplicated logic.

**Files:**

- Create: `apps/web/src/lib/capture/submit.ts`, exporting
  `async function submitCapture(fetchFn: typeof fetch, url: string): Promise<{ ok: true } | { ok: false; reason: "empty" | "quota" | "rejected" | "network" }>`.
  - It is the request logic moved out of `CaptureBar.svelte`.
  - 402 → `"quota"`; any other non-ok response → `"rejected"`; a thrown
    error → `"network"`.
  - Export `CAPTURE_MESSAGES: Record<"quota" | "rejected" | "network", string>`
    with the exact copy below.
- Create: `apps/web/src/lib/components/capture/CaptureForm.svelte`,
  `apps/web/src/lib/components/shell/CaptureSheet.svelte`,
  `apps/web/src/lib/components/shell/PageHeader.svelte`
- Replace: `apps/web/src/lib/components/CaptureBar.svelte` is deleted.
  `routes/+page.svelte` renders `CaptureForm` with `variant="inline"` in its
  place, under the header and above the greeting. Keep `CyclingGreeting`;
  the home modules are #14.
- Test: `apps/web/src/lib/capture/submit.test.ts`,
  `apps/web/src/lib/components/capture/CaptureForm.test.ts`,
  `apps/web/src/lib/components/shell/CaptureSheet.test.ts`,
  `apps/web/src/lib/components/shell/PageHeader.test.ts`

**Interfaces:**

- Produces:
  - **`CaptureForm`:** props `variant: "inline" | "sheet", autofocus?: boolean, onSaved?: () => void, placeholders?: string[]`.
    - Shared behavior:
      - a URL Input (`type="url"`, `inputmode="url"`, `autocomplete="off"`);
      - a "Save" Button with a busy state (Spinner, `disabled`);
      - error text under the field (`role="alert"`).
    - On success it calls `invalidateAll()`, clears the field, then
      `onSaved?.()`.
    - On failure it keeps the URL and shows:
      - quota: "You've reached this month's limit — upgrade to save more."
      - rejected: "That link couldn't be saved. Check the address and try again."
      - network: "You're offline or the server didn't answer. Try again."
      - empty: no request; it focuses the input.
    - `variant="inline"` (home): a single `InputGroup` pill, `h-14`, with a
      leading `BookmarkPlus` addon and a trailing `size="icon"` default
      Button (`aria-label="Save"`, `ArrowUp` icon). It keeps the existing
      typewriter placeholder (`createTypewriter`, paused while focused or
      non-empty) using `placeholders`, defaulting to CaptureBar's current
      list.
    - `variant="sheet"`: a plain Input with the static placeholder
      "Paste a link" and a full-width "Save" Button below it on phones
      (inline on `md`).
  - **`CaptureSheet`:** props `open: boolean, onClose: () => void`.
    - It uses `new MediaQuery("(min-width: 48rem)")`. When true it renders
      a Dialog titled "Save a link"; otherwise a BottomSheet with the same
      title.
    - Its body is `CaptureForm` with `variant="sheet"`, `autofocus`, and
      `onSaved={onClose}`.
  - **`PageHeader`:** props `title: string, actions?: Snippet`.
    - It renders `<header>` with an `h1` (`text-2xl md:text-3xl font-medium tracking-tight`).
    - On the right: optional `actions`; then the search button
      (`variant="outline" size="icon"`, `aria-label="Search"`, opening
      `searchPalette.open()`); then the capture button
      (`variant="default" size="icon"`, `aria-label="Save a link"`,
      `Plus` icon), which owns a `CaptureSheet`.
    - It wraps at 360px without overflow: the title truncates with an
      ellipsis and the buttons never shrink.

- [x] **Step 1: Write the failing tests.**
  - `submit.test.ts`: the four outcomes, plus `"  "` → `"empty"` with no
    fetch call.
  - `CaptureForm.test.ts`:
    - success → `invalidateAll` called, field cleared, `onSaved` called
      (Review Focus 2);
    - quota, rejected, and network → URL kept and the exact
      `CAPTURE_MESSAGES` text shown in `role="alert"` (Review Focus 3);
    - `variant="inline"` renders the pill with the trailing Save button and
      no sheet chrome;
    - `variant="sheet"` renders the static placeholder "Paste a link".
  - `CaptureSheet.test.ts` (with a stubbed `MediaQuery` both ways):
    - it renders as a Dialog when wide and a BottomSheet when narrow (by
      `data-slot`);
    - a successful save closes it (`onClose` called).
  - `PageHeader.test.ts`:
    - the title is the `h1`;
    - Search calls `searchPalette.open`;
    - "Save a link" opens the CaptureSheet;
    - both buttons are size-11.
  - Home page test: the inline capture field is present (labelled "Save
    a link"), and the header's capture button is also present.
- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run capture CaptureSheet PageHeader routes/page`.
      Expected: FAIL.
- [x] **Step 3: Implement it.** Delete `CaptureBar` (its tests move to
      `CaptureForm`) and update the home page.
- [x] **Step 4: Run the tests and confirm they pass.** Same command;
      expected: PASS.
- [x] **Step 5: Commit**
      `feat(web): shared capture form — home field and header sheet`.

---

### Task 6: Layout swap — shell in, TopBar and BottomNav out; pages adopt PageHeader

**Files:**

- Modify: `apps/web/src/routes/+layout.svelte`
- Delete: `apps/web/src/lib/components/TopBar.svelte`,
  `apps/web/src/lib/components/BottomNav.svelte`, their tests, and
  `apps/web/src/lib/actions/track-topbar-height.ts` and its test (the sticky
  columns use `--topbar-h: 0px` by default)
- Modify (adopt `PageHeader` in place of each page's own `h1`):
  - `routes/+page.svelte` (title "Home"; the CyclingGreeting stays under
    the header);
  - `routes/library/+page.svelte` ("Library");
  - `routes/collections/+page.svelte` ("Collections");
  - `routes/collections/[slug]/+page.svelte` (the collection's name);
  - `routes/settings/+page.svelte` ("Settings");
  - `routes/settings/connectors/+page.svelte` ("Connectors")
- Test: `apps/web/src/routes/layout.test.ts` (create or extend), plus the
  updated page tests

**Interfaces:**

- Consumes: `shellFor` (Task 1), `AppSidebar` (3), `TabBar` and
  `MoreSheet` (4), `PageHeader` (5).
- Produces the layout structure.
  - `shellFor === "app"`:
    - a CSS grid with `md:grid-cols-[15rem_1fr]`;
    - `AppSidebar` hidden below `md` (`hidden md:flex`), sticky and full
      height;
    - `<main>` with the page;
    - `TabBar` and `MoreSheet` (phone).
    - Main gets bottom padding below `md` so content clears the tab bar:
      `pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0`.
  - `"reader"`: only the page plus the reading-progress strip; no
    sidebar or tabs.
  - `"none"`: only the page.
  - `SearchPalette` and the ⌘K handler stay for `"app"` and `"reader"`.
  - `onCreated` (sidebar and More) calls `invalidateAll()`.
  - The theme context and reading-progress context are unchanged.

- [x] **Step 1: Write the failing tests** in `layout.test.ts`. Render the
      layout with a mocked `$page` for:
  - `/library`: a `nav[aria-label="Main"]` and the tab bar exist; no
    `TopBar` remains.
  - `/read/x`: no `nav[aria-label="Main"]` and no tab bar.
  - `/login`: neither (Review Focus 4).
  - A guard that `TopBar.svelte` and `BottomNav.svelte` no longer exist.

  Each migrated page test asserts its heading via
  `getByRole("heading", { level: 1, name })`.

- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run routes/layout routes/page routes/library routes/collections routes/settings`.
      Expected: FAIL.
- [x] **Step 3: Implement it.** Remove each page's own top-of-page title
      styles that `PageHeader` replaces. Leave the rest of each page's CSS for
      plan 5.
- [x] **Step 4: Run the full verification.**
      `pnpm test && pnpm typecheck && pnpm lint`, plus svelte-check ≤ 43.
      Expected: green.
- [x] **Step 5: Commit** `feat(web): Marker app shell replaces the top bar`.

---

### Task 7: Focused reader chrome — back to origin, search, and the nav overlay

**Files:**

- Create: `apps/web/src/lib/shell/back-target.ts`, exporting
  `function readerBackTarget(fromPathname: string | null): string`.
  - It returns `fromPathname` when it is an internal app path that isn't
    `/read/*`, `/login`, or `/verify`.
  - Otherwise it returns `"/library"`.
- Create: `apps/web/src/lib/components/shell/ReaderHeader.svelte`,
  `apps/web/src/lib/components/shell/NavOverlay.svelte`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`. Replace its existing
  back link with `ReaderHeader`, and keep the existing scroll-hide state
  (`controlsVisible` / `nextNavVisible`) driving the header too.
- Test: `apps/web/src/lib/shell/back-target.test.ts`,
  `apps/web/src/lib/components/shell/ReaderHeader.test.ts`,
  `apps/web/src/lib/components/shell/NavOverlay.test.ts`, and the updated
  reader page test

**Interfaces:**

- Consumes: `afterNavigate` (to capture `from?.url.pathname` once on
  entry), `AppSidebar` (3), `MoreSheet` (4), `searchPalette`.
- Produces:
  - **`ReaderHeader`:** props `backHref: string, hidden: boolean, onMenu: () => void`.
    - Left: a "Back" ghost Button with `ArrowLeft`, `href={backHref}` and
      an accessible name of "Back".
    - Right: Search (outline icon) and Menu (ghost icon,
      `aria-label="Open navigation"`).
    - It is sticky at top with `bg-background/90 backdrop-blur`.
    - When `hidden` is set it gets `-translate-y-full` with `ease-out` and
      `motion-reduce:transition-none`. It hides only below `md`; on
      desktop it always shows.
  - **`NavOverlay`:** props `open: boolean, onClose: () => void, pathname: string, collections: CollectionSummary[]`.
    - It uses `MediaQuery` md.
    - Wide: a Sheet on `side="left"` containing `AppSidebar`, so
      everything is reachable from the reader.
    - Narrow: `MoreSheet` plus Home and Library rows at its top.
    - Navigating closes it.

- [x] **Step 1: Write the failing tests.**
  - `back-target.test.ts`:
    - `"/collections/physics"` → itself;
    - `"/"` → `"/"`;
    - `null` → `"/library"`;
    - `"/read/other"` → `"/library"`;
    - `"/login"` → `"/library"`;
    - `"https://evil.example/x"` (not a path) → `"/library"`.

    These pin Review Focus 1.

  - `ReaderHeader.test.ts`: Back's `href` equals the prop; Search opens
    the palette; Menu calls `onMenu`; `hidden` toggles the translate class.
  - `NavOverlay.test.ts`: wide renders the sidebar inside a sheet; narrow
    renders the More sheet with Home and Library rows.
  - Reader page test: no app `nav[aria-label="Main"]` is rendered, and the
    header Back link defaults to `/library`.

- [x] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run back-target ReaderHeader NavOverlay routes/read`.
      Expected: FAIL.
- [x] **Step 3: Implement it.**
- [x] **Step 4: Run them and confirm they pass.** Same command, then
      `pnpm test`. Expected: PASS.
- [x] **Step 5: Commit**
      `feat(web): focused reader header with back-to-origin and nav overlay`.

---

### Task 8: Gate 3 — owner review of the shell in the real app (controller-run)

- [x] **Step 1: Set up and capture.**
  - Start the dev server against the throwaway PocketBase (test user and
    sample article).
  - Screenshot `/`, `/library`, `/collections`, `/settings`, and
    `/read/<id>` at 390px and 1280px, in light and dark.
  - Also capture the More sheet, the capture sheet (phone) and dialog
    (desktop), the reader nav overlay, and the tab bar hidden after scroll.
  - Check for no horizontal overflow at 390px.
- [x] **Step 2: Get the owner's review.**
  - Present the screenshots to the owner on the companion page and record
    the approval or the change list on #10.
  - Changes become fix dispatches against the owning task before plan 4.
