# Delete Article From Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user delete their own article from the library card and the reader, guarded by a confirm dialog, cleaning up all per-user dependents.

**Architecture:** One PocketBase migration adds `cascadeDelete` to the `article_tags.article` relation so a single `articles.delete(id)` atomically removes the article plus its highlights, tag-links, and collection-items. A thin `deleteArticle` IO helper wraps the SDK call. A reusable `ConfirmDialog` primitive guards the action. The library `ArticleCard` and the reader page wire the affordance.

**Tech Stack:** SvelteKit (Svelte 5 runes), PocketBase JS migrations + SDK, Vitest + @testing-library/svelte, ephemeral-PB integration harness.

## Global Constraints

- TDD always: failing test first, then implementation. (`CLAUDE.md`)
- TypeScript strict; no `any` without a written reason.
- Tokens only in components — never hardcode a color or font name; reference a CSS var. (`CLAUDE.md` design language)
- Reusable UI primitives live in `apps/web/src/lib/components/ui/`.
- PocketBase API rules are the security boundary; the client never enforces ownership. The `articles` delete rule (`user = @request.auth.id`) already exists — do NOT add or change it.
- Migrations are tracked in git; schema changes go through migration files, never admin-UI edits.
- Never delete the shared, deduped `content` collection rows in this flow.
- Conventional Commits, one logical change per commit.

---

### Task 1: Migration — cascade-delete `article_tags` with their article

**Files:**
- Create: `pocketbase/pb_migrations/1719300000_article_tags_cascade.js`
- Test: `packages/core/src/pb/migration-article-tags-cascade.test.ts`

**Interfaces:**
- Consumes: ephemeral-PB harness `startEphemeralPb()` / `makeTestUser(pb)` from `packages/core/src/pb/test-harness.ts` (admin-authed `pb`).
- Produces: after migration, deleting an `articles` row cascades to its `article_tags`, `highlights`, and `collection_items` rows.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/pb/migration-article-tags-cascade.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

describe("deleting an article cascades to its per-user dependents", () => {
  it("removes article_tags and highlights but leaves shared content", async () => {
    const uid = await makeTestUser(h.pb);

    const content = await h.pb.collection("content").create({
      canonical_url: `https://example.com/${Date.now()}`,
      content_hash: `hash${Date.now()}`,
      source_type: "article",
      extract_status: "ok",
    });

    const article = await h.pb.collection("articles").create({
      user: uid, content: content.id, url: "https://example.com/x",
      status: "unread", progress: 0, is_private: false,
    });

    const tag = await h.pb.collection("tags").create({
      user: uid, name: "ai", slug: "ai",
    });
    const link = await h.pb.collection("article_tags").create({
      article: article.id, tag: tag.id, source: "ai", confidence: 0.9,
    });
    const highlight = await h.pb.collection("highlights").create({
      user: uid, article: article.id, text: "hi", color: "yellow",
    });

    await h.pb.collection("articles").delete(article.id);

    await expect(h.pb.collection("article_tags").getOne(link.id)).rejects.toThrow();
    await expect(h.pb.collection("highlights").getOne(highlight.id)).rejects.toThrow();
    // shared content survives
    const stillThere = await h.pb.collection("content").getOne(content.id);
    expect(stillThere.id).toBe(content.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run migration-article-tags-cascade`
Expected: FAIL — the `article_tags` row still resolves via `getOne` (no cascade), so the first `rejects.toThrow()` assertion fails.

- [ ] **Step 3: Write the migration**

Create `pocketbase/pb_migrations/1719300000_article_tags_cascade.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// article_tags.article was created without cascadeDelete, so deleting an article
// orphaned its tag-links. Align it with highlights/collection_items which already
// cascade, so a single articles.delete() cleans up all per-user dependents.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("article_tags");
    const field = col.fields.getByName("article");
    field.cascadeDelete = true;
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("article_tags");
    const field = col.fields.getByName("article");
    field.cascadeDelete = false;
    app.save(col);
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run migration-article-tags-cascade`
Expected: PASS — both dependents are gone after delete; shared content remains.

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/1719300000_article_tags_cascade.js packages/core/src/pb/migration-article-tags-cascade.test.ts
git commit -m "fix(pb): cascade-delete article_tags when an article is deleted"
```

---

### Task 2: `deleteArticle` IO helper

**Files:**
- Create: `apps/web/src/lib/article/delete.ts`
- Test: `apps/web/src/lib/article/delete.test.ts`

**Interfaces:**
- Consumes: a PocketBase-like client exposing `collection(name).delete(id)`.
- Produces: `deleteArticle(pb: PocketBase, id: string): Promise<void>` — used by the library page (Task 5) and reader page (Task 6).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/article/delete.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type PocketBase from "pocketbase";
import { deleteArticle } from "./delete.js";

function fakePb(deleteImpl: (id: string) => Promise<void>) {
  const del = vi.fn(deleteImpl);
  const collection = vi.fn(() => ({ delete: del }));
  return { pb: { collection } as unknown as PocketBase, collection, del };
}

describe("deleteArticle", () => {
  it("deletes the article by id via the articles collection", async () => {
    const { pb, collection, del } = fakePb(async () => {});
    await deleteArticle(pb, "a1");
    expect(collection).toHaveBeenCalledWith("articles");
    expect(del).toHaveBeenCalledWith("a1");
  });

  it("propagates errors from PocketBase", async () => {
    const { pb } = fakePb(async () => { throw new Error("403"); });
    await expect(deleteArticle(pb, "a1")).rejects.toThrow("403");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/article/delete`
Expected: FAIL — `Cannot find module './delete.js'` / `deleteArticle is not a function`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/article/delete.ts`:

```ts
import type PocketBase from "pocketbase";

/**
 * Delete the current user's article. Ownership is enforced by the PocketBase
 * `articles` delete rule (`user = @request.auth.id`); dependents (highlights,
 * article_tags, collection_items) are removed by relation cascade. The shared
 * `content` row is never touched.
 */
export async function deleteArticle(pb: PocketBase, id: string): Promise<void> {
  await pb.collection("articles").delete(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/article/delete`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/article/delete.ts apps/web/src/lib/article/delete.test.ts
git commit -m "feat(web): add deleteArticle helper"
```

---

### Task 3: `ConfirmDialog` reusable primitive

**Files:**
- Create: `apps/web/src/lib/components/ui/ConfirmDialog.svelte`
- Test: `apps/web/src/lib/components/ui/confirm-dialog.test.ts`

**Interfaces:**
- Produces: `ConfirmDialog` with props `{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }`. Renders its panel only while `open`; confirm uses `Button variant="accent"`. Used by Task 4 (card) and Task 6 (reader).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/ui/confirm-dialog.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ConfirmDialog from "./ConfirmDialog.svelte";

const base = {
  title: "delete this article?",
  message: "this can't be undone.",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("renders title and message when open", () => {
    render(ConfirmDialog, { ...base, open: true });
    expect(screen.getByText("delete this article?")).toBeInTheDocument();
    expect(screen.getByText("this can't be undone.")).toBeInTheDocument();
  });

  it("does not render its panel when closed", () => {
    render(ConfirmDialog, { ...base, open: false });
    expect(screen.queryByText("this can't be undone.")).not.toBeInTheDocument();
  });

  it("fires onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(ConfirmDialog, { ...base, open: true, onConfirm });
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("fires onCancel when the cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(ConfirmDialog, { ...base, open: true, onCancel });
    await fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses a custom confirm label when provided", () => {
    render(ConfirmDialog, { ...base, open: true, confirmLabel: "remove" });
    expect(screen.getByRole("button", { name: "remove" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/components/ui/confirm-dialog`
Expected: FAIL — `Failed to resolve import "./ConfirmDialog.svelte"`.

- [ ] **Step 3: Write the component**

Create `apps/web/src/lib/components/ui/ConfirmDialog.svelte`:

```svelte
<script lang="ts">
  import Button from "./Button.svelte";

  let {
    open,
    title,
    message,
    confirmLabel = "delete",
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  // Drive native modal state from `open`. jsdom doesn't implement showModal/close,
  // so guard the calls — the {#if open} block below is what tests assert against.
  $effect(() => {
    if (!dialog) return;
    try {
      if (open && !dialog.open) dialog.showModal();
      else if (!open && dialog.open) dialog.close();
    } catch {
      /* no-op: unsupported in test env */
    }
  });

  function onBackdrop(e: MouseEvent) {
    if (e.target === dialog) onCancel();
  }
</script>

<dialog
  bind:this={dialog}
  aria-label={title}
  oncancel={(e) => { e.preventDefault(); onCancel(); }}
  onclick={onBackdrop}
>
  {#if open}
    <div class="panel">
      <h2>{title}</h2>
      <p>{message}</p>
      <div class="actions">
        <Button onclick={onCancel}>cancel</Button>
        <Button variant="accent" onclick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    border: none;
    border-radius: var(--radius-xl);
    padding: 0;
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-lg, var(--shadow-sm));
    max-width: 22rem;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  .panel { padding: 1.5rem; }
  h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg, 1.1rem);
    margin: 0 0 0.5rem;
  }
  p {
    color: var(--color-text-muted);
    margin: 0 0 1.25rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/components/ui/confirm-dialog`
Expected: PASS — all five cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/ConfirmDialog.svelte apps/web/src/lib/components/ui/confirm-dialog.test.ts
git commit -m "feat(web): add ConfirmDialog ui primitive"
```

---

### Task 4: Delete affordance on `ArticleCard`

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 3).
- Produces: `ArticleCard` gains an optional `onDelete?: (id: string) => void` prop. A delete button (accessible name "delete article") appears only when `onDelete` is provided; confirming calls `onDelete(article.id)`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/components/ArticleCard.test.ts` (after the existing cases, inside the `describe`):

```ts
  it("does not render a delete button without an onDelete handler", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
    });
    expect(screen.queryByRole("button", { name: "delete article" })).not.toBeInTheDocument();
  });

  it("opens a confirm dialog and fires onDelete when confirmed", async () => {
    const onDelete = vi.fn();
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
      onDelete,
    });
    await fireEvent.click(screen.getByRole("button", { name: "delete article" }));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onDelete).toHaveBeenCalledWith("a1");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/components/ArticleCard`
Expected: FAIL — no button named "delete article" exists.

- [ ] **Step 3: Update the component**

Edit `apps/web/src/lib/components/ArticleCard.svelte`. Add to the imports:

```svelte
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
```

Extend the props block to add `onDelete` and a local state line below it:

```svelte
  let {
    article,
    onRetry,
    onOpen,
    onDelete,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onOpen?: (id: string) => void;
    onDelete?: (id: string) => void;
  } = $props();

  let confirming = $state(false);
```

Add the delete affordance just before the closing `</Card>` tag:

```svelte
  {#if onDelete}
    <button class="delete-btn" onclick={() => (confirming = true)} aria-label="delete article">delete</button>
    <ConfirmDialog
      open={confirming}
      title="delete this article?"
      message="this can't be undone."
      onConfirm={() => { confirming = false; onDelete?.(article.id); }}
      onCancel={() => (confirming = false)}
    />
  {/if}
```

Add a `<style>` block at the end of the file (the component has none today):

```svelte
<style>
  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: 0.1rem 0.4rem;
    align-self: flex-end;
  }
  .delete-btn:hover { color: var(--color-accent); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/components/ArticleCard`
Expected: PASS — existing three cases plus the two new ones green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "feat(web): add delete affordance to ArticleCard"
```

---

### Task 5: Wire delete into the library page

**Files:**
- Modify: `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/routes/library/page.test.ts`

**Interfaces:**
- Consumes: `deleteArticle` (Task 2), `ArticleCard` `onDelete` prop (Task 4).
- Produces: library cards call `pb.collection("articles").delete(id)` on confirm; the existing realtime subscription refreshes the grid.

- [ ] **Step 1: Write the failing test**

Replace the contents of `apps/web/src/routes/library/page.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const del = vi.fn().mockResolvedValue(undefined);
const article = {
  id: "a1", url: "https://example.com/p", status: "unread", progress: 0,
  expand: { content: { extract_status: "ok", title: "Hello", ai_tags_json: [] } },
};

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" } },
    filter: (s: string) => s,
    collection: (name: string) => ({
      getList: vi.fn().mockResolvedValue({ items: name === "articles" ? [article] : [] }),
      getFullList: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(() => {}),
      delete: del,
    }),
  }),
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

import Library from "./+page.svelte";

describe("library page", () => {
  it("deletes an article via PocketBase when confirmed", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "delete article" }));
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("a1"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/routes/library/page`
Expected: FAIL — cards have no `onDelete`, so no "delete article" button renders.

- [ ] **Step 3: Wire the page**

Edit `apps/web/src/routes/library/+page.svelte`. Add the import near the other `$lib` imports:

```svelte
  import { deleteArticle } from "$lib/article/delete.js";
```

Add a handler alongside the other `async function`s (e.g. after `load()`):

```svelte
  async function handleDelete(id: string) {
    await deleteArticle(pb, id);
    // grid refreshes via the existing articles realtime subscription
  }
```

Pass it to the card — change the `ArticleCard` usage:

```svelte
      <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} onDelete={handleDelete} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/routes/library/page`
Expected: PASS — `del` called with `"a1"`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library/+page.svelte apps/web/src/routes/library/page.test.ts
git commit -m "feat(web): delete articles from the library grid"
```

---

### Task 6: Wire delete into the reader page

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`

**Interfaces:**
- Consumes: `deleteArticle` (Task 2), `ConfirmDialog` (Task 3), `goto` from `$app/navigation`.
- Produces: reader header has a delete action; on confirm it deletes the article and navigates to `/library`.

> This task is glue over already-tested units (`deleteArticle`, `ConfirmDialog`). It is verified manually because the reader page's `onMount` pipeline (highlights, anchoring, prefs) is impractical to drive in jsdom; the deletion logic itself carries no new untested branches.

- [ ] **Step 1: Add imports**

Edit `apps/web/src/routes/read/[id]/+page.svelte`. Add to the imports:

```svelte
  import { goto } from "$app/navigation";
  import { deleteArticle } from "$lib/article/delete.js";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
```

- [ ] **Step 2: Add state + handler**

Add near the other `$state` declarations:

```svelte
  let confirmingDelete = $state(false);
```

Add a handler alongside the other reader functions:

```svelte
  async function confirmDelete() {
    if (!article) return;
    confirmingDelete = false;
    await deleteArticle(pb, article.id);
    await goto("/library");
  }
```

- [ ] **Step 3: Add the UI**

In the reader header actions area (where `ReaderControls` / tag / collection actions live), add a delete trigger and the dialog. Place the trigger button among the existing action buttons:

```svelte
  <button class="reader-delete" onclick={() => (confirmingDelete = true)} aria-label="delete article">delete</button>
```

And mount the dialog once (e.g. near the end of the markup):

```svelte
  <ConfirmDialog
    open={confirmingDelete}
    title="delete this article?"
    message="this can't be undone."
    onConfirm={confirmDelete}
    onCancel={() => (confirmingDelete = false)}
  />
```

Add a style for the trigger in the page's `<style>` block, matching the muted/accent pattern:

```svelte
  .reader-delete {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: 0.1rem 0.4rem;
  }
  .reader-delete:hover { color: var(--color-accent); }
```

- [ ] **Step 4: Verify the whole suite still passes**

Run: `pnpm vitest run`
Expected: PASS — no regressions; the reader page compiles with the new imports/markup.

- [ ] **Step 5: Manual verification**

Run the app, open an article in the reader, click delete, confirm. Expected: the article is removed and the browser navigates to `/library`, where the article no longer appears.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/read/[id]/+page.svelte
git commit -m "feat(web): delete the current article from the reader"
```

---

## Final verification

- [ ] Run the full web suite: `pnpm vitest run`
- [ ] Run the core suite (includes the cascade integration test): `pnpm vitest run` (root config runs core too)
- [ ] Confirm no `content`-collection deletion paths were introduced (grep: `collection("content").delete` should have no new hits).

## Self-Review notes

- **Spec coverage:** migration (Task 1) ↔ spec §5.1; helper (Task 2) ↔ §5.2; ConfirmDialog (Task 3) ↔ §5.3; card + library + reader wiring (Tasks 4–6) ↔ §5.4; tenant isolation + content-untouched asserted in Task 1 ↔ §8/§9.
- **Type consistency:** `deleteArticle(pb, id)` signature identical across Tasks 2/5/6; `onDelete: (id: string) => void` identical across Tasks 4/5; `ConfirmDialog` prop set identical across Tasks 3/4/6.
- **Known env caveat:** jsdom lacks `<dialog>.showModal`; ConfirmDialog guards it and gates visible content on `{#if open}` so tests assert on DOM presence, not modal state.
