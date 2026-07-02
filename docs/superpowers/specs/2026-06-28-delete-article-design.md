# Delete Article From Library — Design

**Date:** 2026-06-28
**Status:** Approved design, pre-implementation

## 1. Summary

Let a user delete an article from their library. The affordance appears both on
the library `ArticleCard` and on the reader page (`/read/[id]`). Deletion is
guarded by a confirm dialog and is irreversible (no trash/undo in this iteration).
Deleting an article removes the user's per-user pointer and all of its private
annotations (highlights, tag-links, collection-items). The shared, deduped
`content` row is never touched.

## 2. Goals / Non-Goals

### Goals
- Owner can delete their own article from the library grid and from the reader.
- A confirm dialog prevents accidental deletes ("delete this article? this can't
  be undone").
- Deleting an article atomically cleans up its dependent rows: `highlights`,
  `article_tags`, `collection_items`.
- Tenant isolation preserved — a user can only delete their own articles, and a
  delete never affects another user's data or the shared `content` row.
- New confirm UI is a reusable primitive consistent with the design language.

### Non-Goals
- Soft delete / trash / restore / undo.
- Bulk / multi-select delete.
- Deleting shared `content` rows or garbage-collecting now-unreferenced content.

## 3. Current State (findings)

- **Backend already permits delete.** The `articles` collection has
  `deleteRule: "user = @request.auth.id"` (init migration). No new rule needed.
- **Cascade is partially in place.** `highlights.article` and
  `collection_items.article` both have `cascadeDelete: true` (phase-4 migration).
  **`article_tags.article` does NOT** — deleting an article currently orphans its
  tag-link rows. This is the one data-integrity gap to fix.
- **No `private_content` collection exists** (schema has only an `is_private`
  bool), so there is no per-user content row to orphan.
- **No delete UI exists** anywhere. The library page already implements a delete
  pattern for *collections* (`deleteCollection`) to mirror for styling.
- **No dialog/modal primitive exists** in `$lib/components/ui/` (only Button,
  Card, CardGrid, Input, Spinner, Tag).

## 4. Approach

Chosen approach: reusable `ConfirmDialog` primitive + a thin `deleteArticle`
IO helper + one migration adding `cascadeDelete` to `article_tags.article`.

Rejected alternatives:
- Native `confirm()` + client-side loop deleting `article_tags` rows — not
  styleable to the paper design language, hard to test, and non-atomic cleanup.
- Soft-delete (trash + restore) — out of scope per YAGNI; no undo this iteration.

## 5. Components

### 5.1 Migration — `article_tags` cascade

New migration `pocketbase/pb_migrations/<ts>_article_tags_cascade.js`. Rebuild the
`article_tags.article` relation field with `cascadeDelete: true`, matching how
`highlights` and `collection_items` already cascade. The down-migration restores
`cascadeDelete: false`. The shared `content` collection is untouched.

After this migration, a single `articles.delete(id)` atomically removes the
article and all dependents (highlights, tag-links, collection-items) via
PocketBase relation cascade.

### 5.2 Delete helper — `$lib/article/delete.ts`

```
deleteArticle(pb: PocketBase, id: string): Promise<void>
```

Thin IO wrapper over `pb.collection("articles").delete(id)`. Single seam to
unit-test (mock pb) and to reuse from both call sites. Owner-only access is
enforced by the existing PB `deleteRule`; errors propagate to the caller.

### 5.3 Confirm primitive — `$lib/components/ui/ConfirmDialog.svelte`

Reusable UI primitive. Props:

- `open: boolean`
- `title: string`
- `message: string`
- `confirmLabel?: string` (default `"delete"`)
- `onConfirm: () => void`
- `onCancel: () => void`

Built on the native `<dialog>` element. Tokens only — no hardcoded colors or
fonts. Confirm button uses the existing `Button` with `variant="accent"` for the
destructive action. Behavior: focus moves into the dialog on open, Escape =
cancel, backdrop click = cancel.

### 5.4 Wiring

- **`ArticleCard.svelte`** — add an optional `onDelete?: (id: string) => void`
  prop and a small delete button (mirrors the collection delete-button styling).
  Clicking it opens a `ConfirmDialog`; on confirm it calls `onDelete?.(id)`.
- **Library page (`routes/library/+page.svelte`)** — pass `onDelete` to each
  card; the handler calls `deleteArticle(pb, id)`. The grid refreshes via the
  existing realtime `articles` subscription (no manual list mutation required).
- **Reader page (`routes/read/[id]/+page.svelte`)** — add a delete action in the
  header actions; on confirm it calls `deleteArticle(pb, id)` then
  `goto("/library")`.

## 6. Data Flow

```
User clicks delete (card or reader)
  → ConfirmDialog opens
  → user confirms
  → deleteArticle(pb, id)
  → pb.collection("articles").delete(id)
  → PB deleteRule checks user = auth.id
  → PB cascade removes highlights, article_tags, collection_items
  → card: realtime sub re-runs load(); reader: goto("/library")
```

## 7. Error Handling

- `deleteArticle` propagates `ClientResponseError`. Call sites surface a brief
  error message (reusing the existing inline error pattern) and leave the article
  in place; the dialog closes.
- A delete attempt on a non-owned article fails at the PB `deleteRule` (403) and
  is treated as a normal error — no special-casing.

## 8. Testing (TDD — failing test first)

- **Migration cascade test** (core/pb, mirrors `migration-content-size.test.ts`):
  after up-migration, `article_tags.article` has `cascadeDelete: true`.
- **`deleteArticle` unit test:** mock pb; asserts it calls
  `collection("articles").delete(id)` and propagates errors.
- **`ConfirmDialog` test** (in `primitives.test.ts` style): renders title/message;
  confirm fires `onConfirm`; cancel and Escape fire `onCancel`.
- **`ArticleCard` test:** delete button renders; click opens dialog; confirm fires
  `onDelete` with the article id.
- **Integration test** (ephemeral PB, if feasible): create article + tag-link +
  highlight + collection-item, delete the article, assert all dependents gone and
  the shared `content` row plus another user's data remain untouched (tenant
  isolation).

## 9. Security

- PocketBase `deleteRule` (`user = @request.auth.id`) is the security boundary;
  the client is never trusted to enforce ownership.
- Shared `content` is never deleted by this flow — only the per-user `articles`
  row and its private dependents.
