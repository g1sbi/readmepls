# Phase 6 — Connector Seam + Markdown Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a runtime-agnostic `ConnectorPlugin` seam with one working Markdown export (single article / collection / filter / whole library) plus Notion/Obsidian stubs, and thread a `published_at` date through the extraction pipeline.

**Architecture:** A pure connector layer in `@readmepls/core` (interface + registry + Markdown render) is consumed by a synchronous SvelteKit server route (`/api/export`) that resolves an article set server-side, loads DTOs from PocketBase, renders Markdown, and streams a `.md` (one article) or `.zip` (many). The worker is untouched except for writing the new `published_at` field.

**Tech Stack:** TypeScript (strict), SvelteKit, PocketBase, Vitest, Zod, Turndown + turndown-plugin-gfm (HTML→MD), JSZip (packaging).

## Global Constraints

- **TDD always** — failing test first, then implementation. No production code without a test that drove it.
- **TypeScript strict** — no `any` without a written reason.
- **Validate at boundaries with Zod** — data read back from PocketBase is parsed before use.
- **Pure core, thin IO shell** — the connector layer is pure (HTML/meta in → Markdown out, no IO); PocketBase reads, zipping, and streaming live only in the web route.
- **Workspace packages ship TS source** — `@readmepls/core` has `main: src/index.ts`, no build step. New deps go in `packages/core/package.json`.
- **Tokens, not hardcoded colors/fonts** in Svelte (`apps/web/src/lib/styles/tokens.css`).
- **Conventional Commits**, one logical change per commit.
- **Tests are offline** — connector/render tests use inline fixtures; no live network.
- Run the whole suite with `pnpm test` (vitest) and types with `pnpm typecheck` from the repo root.
- New migration filename: `pocketbase/pb_migrations/1719200000_phase6_published_at.js` (next after `1719100000_phase4.js`).

---

## File Structure

**Pipeline (`published_at`)**
- `packages/types/src/extract.ts` — add `publishedAt` to `ExtractResult`.
- `packages/types/src/content.ts` — add `published_at` to `Content`.
- `packages/core/src/source/extract-result.ts` — `failedResult` sets `publishedAt: null`.
- `packages/core/src/source/x/syndication.ts` — set `publishedAt: null`.
- `packages/core/src/source/youtube/transcript.ts` — set `publishedAt: null` in both returns.
- `apps/worker/src/extract/parse-article.ts` — read a publish date from metadata.
- `apps/worker/src/worker.ts` — write `published_at` to the content row.
- `pocketbase/pb_migrations/1719200000_phase6_published_at.js` — add the column.

**Connector core** (all new, under `packages/core/src/connector/`)
- `plugin.ts` — `ConnectorPlugin`, `ArticleExport`, `ExportFile`, `ExportResult`, `NotImplementedError`.
- `markdown/html-to-md.ts` — Turndown + GFM wrapper.
- `markdown/turndown-plugin-gfm.d.ts` — module typings (the plugin ships none).
- `markdown/frontmatter.ts` — safe YAML frontmatter.
- `markdown/highlights.ts` — inline `==mark==` + fallback section.
- `markdown/filename.ts` — deterministic slug filename.
- `markdown/render.ts` — compose an `ArticleExport` into an `ExportFile`.
- `markdown/connector.ts` — `MarkdownConnector`.
- `notion.ts`, `obsidian.ts` — stubs.
- `registry.ts` — register / get / list.
- `packages/core/src/index.ts` — export the connector surface.

**Export route (web)**
- `apps/web/src/lib/server/export.ts` — scope resolver + DTO loader (the IO shell).
- `apps/web/src/routes/api/export/+server.ts` — GET handler: scope dispatch + packaging.

**Settings UI (web)**
- `apps/web/src/routes/settings/connectors/+page.svelte` — connector list.

---

## Task 1: `published_at` in shared types + extractor defaults

**Files:**
- Modify: `packages/types/src/extract.ts`
- Modify: `packages/types/src/content.ts`
- Modify: `packages/core/src/source/extract-result.ts`
- Modify: `packages/core/src/source/x/syndication.ts`
- Modify: `packages/core/src/source/youtube/transcript.ts`
- Test: `packages/core/src/source/extract-result.test.ts` (create)

**Interfaces:**
- Produces: `ExtractResult.publishedAt: string | null`; `Content.published_at: string | null`. Every extractor result now carries `publishedAt`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/source/extract-result.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { failedResult } from "./extract-result.js";
import { ExtractResult } from "@readmepls/types";

describe("failedResult", () => {
  it("is a schema-valid result with publishedAt defaulted to null", () => {
    const r = failedResult("article", "boom");
    expect(() => ExtractResult.parse(r)).not.toThrow();
    expect(r.publishedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- extract-result`
Expected: FAIL — `publishedAt` missing from `ExtractResult` schema / `failedResult` return.

- [ ] **Step 3: Add the fields and defaults**

In `packages/types/src/extract.ts`, add to the `ExtractResult` object (after `heroImage`):

```ts
  publishedAt: z.string().nullable(),
```

In `packages/types/src/content.ts`, add to the `Content` object (after `hero_image`):

```ts
  published_at: z.string().nullable(),
```

In `packages/core/src/source/extract-result.ts`, add to the returned object in `failedResult` (after `heroImage: null,`):

```ts
    publishedAt: null,
```

In `packages/core/src/source/x/syndication.ts`, add `publishedAt: null,` to the success `return` object (after `heroImage: t.photos?.[0]?.url ?? null,`).

In `packages/core/src/source/youtube/transcript.ts`, add `publishedAt: null,` to **both** `return` objects (the `partial`/no-captions branch and the `ok` branch).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- extract-result x/ youtube`
Expected: PASS. Then `pnpm test` — existing X/YouTube/extractor tests still green (they assert `ExtractResult.parse(...)` which now requires the field).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/extract.ts packages/types/src/content.ts packages/core/src/source
git commit -m "feat(types): thread publishedAt through ExtractResult and Content"
```

---

## Task 2: Article extractor reads a publish date

**Files:**
- Modify: `apps/worker/src/extract/parse-article.ts`
- Test: `apps/worker/src/extract/parse-article.test.ts` (existing — add cases)

**Interfaces:**
- Consumes: `ExtractResult.publishedAt` (Task 1).
- Produces: `parseArticleHtml` populates `publishedAt` from `<meta property="article:published_time">`, `<meta name="date">`, or `<time datetime>`, else `null`.

- [ ] **Step 1: Write the failing test**

Add to `apps/worker/src/extract/parse-article.test.ts` inside the `describe("parseArticleHtml", …)` block:

```ts
  it("extracts a publish date from article:published_time", () => {
    const withDate =
      '<html><head><title>T</title>' +
      '<meta property="article:published_time" content="2026-01-02T00:00:00Z"></head>' +
      '<body><article><p>' + "Body text here. ".repeat(60) + '</p></article></body></html>';
    const res = parseArticleHtml("https://example.com/post", withDate);
    expect(res.publishedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("returns null publishedAt when no date metadata is present", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(res.publishedAt).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- parse-article`
Expected: FAIL — `publishedAt` is `undefined` (not read yet).

- [ ] **Step 3: Implement date reading**

In `packages/core/src/source/extract-result.ts` is unrelated; edit `apps/worker/src/extract/parse-article.ts`. After the `const hero = …` line, add:

```ts
  const publishedAt =
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
    doc.querySelector('meta[name="date"]')?.getAttribute("content") ??
    doc.querySelector("time[datetime]")?.getAttribute("datetime") ??
    null;
```

Add `publishedAt,` to **both** return objects in this file (the `failed`/no-readable-content branch and the `ok` branch), alongside `heroImage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- parse-article`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/extract/parse-article.ts apps/worker/src/extract/parse-article.test.ts
git commit -m "feat(worker): extract article publish date into publishedAt"
```

---

## Task 3: Persist `published_at` (worker write + migration)

**Files:**
- Modify: `apps/worker/src/worker.ts`
- Create: `pocketbase/pb_migrations/1719200000_phase6_published_at.js`

**Interfaces:**
- Consumes: `ExtractResult.publishedAt` (Task 1), `Content.published_at` (Task 1).
- Produces: a `published_at` column on the `content` collection, populated on extraction.

- [ ] **Step 1: Write the migration**

Create `pocketbase/pb_migrations/1719200000_phase6_published_at.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.add(new Field({ name: "published_at", type: "text" }));
    app.save(content);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    const f = content.fields.getByName("published_at");
    if (f) content.fields.removeById(f.id);
    app.save(content);
  }
);
```

- [ ] **Step 2: Write the worker content-write**

In `apps/worker/src/worker.ts`, add to the `pb.collection("content").create({ … })` object (after `hero_image: result.heroImage,`):

```ts
      published_at: result.publishedAt,
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — the content-create object now matches `Content` (publishedAt is a string|null and the column exists in the migration). No type error about a missing/extra field.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/worker.ts pocketbase/pb_migrations/1719200000_phase6_published_at.js
git commit -m "feat(worker): persist published_at on content + migration"
```

---

## Task 4: Connector interface, DTO, and error type

**Files:**
- Create: `packages/core/src/connector/plugin.ts`
- Test: `packages/core/src/connector/plugin.test.ts`

**Interfaces:**
- Produces:
  - `interface ArticleExport { id, title, url, author|null, siteName|null, lang|null, publishedAt|null, fetchedAt, capturedAt, status, tags: string[], aiTags: string[], summary, contentHtml, highlights: Highlight[] }`
  - `interface ExportFile { filename: string; contents: string }`
  - `interface ExportFailure { title: string; url: string; reason: string }`
  - `interface ExportResult { files: ExportFile[]; failures: ExportFailure[] }`
  - `type ConnectorConfig = Record<string, unknown>`
  - `interface ConnectorPlugin { readonly type: string; readonly stub: boolean; export(articles: ArticleExport[], config?: ConnectorConfig): Promise<ExportResult> }`
  - `class NotImplementedError extends Error`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connector/plugin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NotImplementedError } from "./plugin.js";

describe("NotImplementedError", () => {
  it("names the connector and is an Error", () => {
    const e = new NotImplementedError("notion");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("NotImplementedError");
    expect(e.message).toContain("notion");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- connector/plugin`
Expected: FAIL — module `./plugin.js` not found.

- [ ] **Step 3: Implement the module**

Create `packages/core/src/connector/plugin.ts`:

```ts
import type { ArticleStatus, Highlight } from "@readmepls/types";

/** Pure, runtime-agnostic input to a connector. The web route maps PocketBase
 *  records into this so core never imports PocketBase. */
export interface ArticleExport {
  id: string;
  title: string;
  url: string;
  author: string | null;
  siteName: string | null;
  lang: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  capturedAt: string;
  status: ArticleStatus;
  tags: string[];
  aiTags: string[];
  summary: string;
  contentHtml: string;
  highlights: Highlight[];
}

export interface ExportFile {
  filename: string;
  contents: string;
}

export interface ExportFailure {
  title: string;
  url: string;
  reason: string;
}

export interface ExportResult {
  files: ExportFile[];
  failures: ExportFailure[];
}

export type ConnectorConfig = Record<string, unknown>;

export interface ConnectorPlugin {
  readonly type: string;
  /** true when the connector is a not-yet-implemented placeholder. */
  readonly stub: boolean;
  export(articles: ArticleExport[], config?: ConnectorConfig): Promise<ExportResult>;
}

export class NotImplementedError extends Error {
  constructor(type: string) {
    super(`connector "${type}" is not implemented`);
    this.name = "NotImplementedError";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- connector/plugin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/connector/plugin.ts packages/core/src/connector/plugin.test.ts
git commit -m "feat(core): connector plugin interface + ArticleExport DTO"
```

---

## Task 5: HTML→Markdown (Turndown + GFM)

**Files:**
- Modify: `packages/core/package.json` (add deps)
- Create: `packages/core/src/connector/markdown/html-to-md.ts`
- Create: `packages/core/src/connector/markdown/turndown-plugin-gfm.d.ts`
- Test: `packages/core/src/connector/markdown/html-to-md.test.ts`

**Interfaces:**
- Produces: `htmlToMarkdown(html: string): string` — trimmed GFM Markdown.

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm --filter @readmepls/core add turndown turndown-plugin-gfm
pnpm --filter @readmepls/core add -D @types/turndown
```

- [ ] **Step 2: Declare the untyped plugin module**

Create `packages/core/src/connector/markdown/turndown-plugin-gfm.d.ts`:

```ts
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/core/src/connector/markdown/html-to-md.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "./html-to-md.js";

describe("htmlToMarkdown", () => {
  it("converts headings, links, and code to markdown", () => {
    const md = htmlToMarkdown(
      '<h2>Title</h2><p>See <a href="https://x.test">link</a>.</p><pre><code>x = 1</code></pre>'
    );
    expect(md).toContain("## Title");
    expect(md).toContain("[link](https://x.test)");
    expect(md).toContain("```");
    expect(md).toContain("x = 1");
  });

  it("converts GFM tables", () => {
    const md = htmlToMarkdown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test -- html-to-md`
Expected: FAIL — `./html-to-md.js` not found.

- [ ] **Step 5: Implement the wrapper**

Create `packages/core/src/connector/markdown/html-to-md.ts`:

```ts
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Turndown bundles its own DOM (domino), so this runs in plain Node without jsdom.
const service = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
service.use(gfm);

/** Pure: convert sanitized article HTML into GitHub-flavored Markdown. */
export function htmlToMarkdown(html: string): string {
  return service.turndown(html).trim();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- html-to-md`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/src/connector/markdown/html-to-md.ts packages/core/src/connector/markdown/html-to-md.test.ts packages/core/src/connector/markdown/turndown-plugin-gfm.d.ts
git commit -m "feat(core): HTML to GFM markdown via turndown"
```

---

## Task 6: YAML frontmatter renderer

**Files:**
- Create: `packages/core/src/connector/markdown/frontmatter.ts`
- Test: `packages/core/src/connector/markdown/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `interface Frontmatter { title; url; author: string|null; site_name: string|null; published: string|null; fetched; captured; status; tags: string[]; ai_tags: string[]; summary }`
  - `renderFrontmatter(fm: Frontmatter): string` — a `---` delimited YAML block; null/empty fields omitted; **no `progress` key**.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connector/markdown/frontmatter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderFrontmatter } from "./frontmatter.js";

const base = {
  title: "Hello", url: "https://x.test/p", author: "Jane", site_name: "Site",
  published: "2026-01-02", fetched: "2026-06-26", captured: "2026-06-26",
  status: "reading", tags: ["notes"], ai_tags: ["ai"], summary: "A summary",
};

describe("renderFrontmatter", () => {
  it("emits snake_case keys, split tags, and no progress key", () => {
    const fm = renderFrontmatter(base);
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm.trimEnd().endsWith("---")).toBe(true);
    expect(fm).toContain('site_name: "Site"');
    expect(fm).toContain('tags: ["notes"]');
    expect(fm).toContain('ai_tags: ["ai"]');
    expect(fm).not.toContain("progress");
  });

  it("escapes quotes/colons/newlines and omits null/empty fields", () => {
    const fm = renderFrontmatter({
      ...base, author: null, site_name: null, published: null,
      tags: [], ai_tags: [], summary: "", title: 'A "quoted: thing"\nline',
    });
    expect(fm).toContain('title: "A \\"quoted: thing\\"\\nline"');
    expect(fm).not.toContain("author:");
    expect(fm).not.toContain("published:");
    expect(fm).not.toContain("tags:");
    expect(fm).not.toContain("summary:");
  });

  it("is deterministic for the same input", () => {
    expect(renderFrontmatter(base)).toBe(renderFrontmatter(base));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- frontmatter`
Expected: FAIL — `./frontmatter.js` not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/connector/markdown/frontmatter.ts`:

```ts
export interface Frontmatter {
  title: string;
  url: string;
  author: string | null;
  site_name: string | null;
  published: string | null;
  fetched: string;
  captured: string;
  status: string;
  tags: string[];
  ai_tags: string[];
  summary: string;
}

function yamlString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

function yamlList(items: string[]): string {
  return "[" + items.map(yamlString).join(", ") + "]";
}

/** Render a deterministic YAML frontmatter block. Null/empty fields are omitted.
 *  Reader `progress` is intentionally absent so re-export is byte-stable. */
export function renderFrontmatter(fm: Frontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${yamlString(fm.title)}`);
  lines.push(`url: ${yamlString(fm.url)}`);
  if (fm.author) lines.push(`author: ${yamlString(fm.author)}`);
  if (fm.site_name) lines.push(`site_name: ${yamlString(fm.site_name)}`);
  if (fm.published) lines.push(`published: ${yamlString(fm.published)}`);
  lines.push(`fetched: ${yamlString(fm.fetched)}`);
  lines.push(`captured: ${yamlString(fm.captured)}`);
  lines.push(`status: ${yamlString(fm.status)}`);
  if (fm.tags.length) lines.push(`tags: ${yamlList(fm.tags)}`);
  if (fm.ai_tags.length) lines.push(`ai_tags: ${yamlList(fm.ai_tags)}`);
  if (fm.summary) lines.push(`summary: ${yamlString(fm.summary)}`);
  lines.push("---");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- frontmatter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/connector/markdown/frontmatter.ts packages/core/src/connector/markdown/frontmatter.test.ts
git commit -m "feat(core): deterministic yaml frontmatter renderer"
```

---

## Task 7: Highlight marking (inline + fallback)

**Files:**
- Create: `packages/core/src/connector/markdown/highlights.ts`
- Test: `packages/core/src/connector/markdown/highlights.test.ts`

**Interfaces:**
- Produces:
  - `interface HighlightResult { body: string; unanchored: Highlight[] }`
  - `markHighlights(body: string, highlights: Highlight[]): HighlightResult` — wraps located highlight text in `==…==`; unlocatable ones returned in `unanchored`.
  - `highlightsSection(highlights: Highlight[]): string` — a `## Highlights` block (empty string when none).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connector/markdown/highlights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { markHighlights, highlightsSection } from "./highlights.js";
import type { Highlight } from "@readmepls/types";

function hl(p: Partial<Highlight>): Highlight {
  return {
    id: "h1", user: "u1", article: "a1", text: "", prefix: "", suffix: "",
    startOffset: 0, endOffset: 0, color: "terracotta", note: "", created: "2026",
    ...p,
  };
}

describe("markHighlights", () => {
  it("wraps a locatable highlight inline and leaves nothing unanchored", () => {
    const res = markHighlights("the quick brown fox jumps", [hl({ text: "brown fox" })]);
    expect(res.body).toBe("the quick ==brown fox== jumps");
    expect(res.unanchored).toHaveLength(0);
  });

  it("disambiguates duplicate text by prefix/suffix", () => {
    const res = markHighlights("cat dog cat bird", [hl({ text: "cat", prefix: "dog ", suffix: " bird" })]);
    expect(res.body).toBe("cat dog ==cat== bird");
  });

  it("returns unlocatable highlights for the fallback section", () => {
    const res = markHighlights("body text", [hl({ text: "not present" })]);
    expect(res.body).toBe("body text");
    expect(res.unanchored).toHaveLength(1);
  });
});

describe("highlightsSection", () => {
  it("is empty when there are no highlights", () => {
    expect(highlightsSection([])).toBe("");
  });
  it("renders blockquotes with notes", () => {
    const s = highlightsSection([hl({ text: "quote me", note: "my note" })]);
    expect(s).toContain("## Highlights");
    expect(s).toContain("> quote me");
    expect(s).toContain("my note");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- connector/markdown/highlights`
Expected: FAIL — `./highlights.js` not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/connector/markdown/highlights.ts`:

```ts
import type { Highlight } from "@readmepls/types";

export interface HighlightResult {
  body: string;
  unanchored: Highlight[];
}

/** Best-effort inline `==mark==` of each highlight's text in the markdown body.
 *  Offsets do not survive HTML→MD conversion, so this matches on text, using
 *  prefix/suffix to disambiguate repeats. Highlights whose text can't be found
 *  are returned as `unanchored` for the fallback section — never dropped. */
export function markHighlights(body: string, highlights: Highlight[]): HighlightResult {
  let out = body;
  const unanchored: Highlight[] = [];
  for (const h of highlights) {
    const idx = locate(out, h.text, h.prefix, h.suffix);
    if (idx < 0) {
      unanchored.push(h);
      continue;
    }
    out = out.slice(0, idx) + "==" + h.text + "==" + out.slice(idx + h.text.length);
  }
  return { body: out, unanchored };
}

function locate(body: string, text: string, prefix: string, suffix: string): number {
  if (!text) return -1;
  const matches: number[] = [];
  let from = 0;
  for (;;) {
    const i = body.indexOf(text, from);
    if (i < 0) break;
    matches.push(i);
    from = i + text.length;
  }
  if (matches.length === 0) return -1;
  if (matches.length === 1) return matches[0]!;
  for (const i of matches) {
    const before = body.slice(Math.max(0, i - prefix.length), i);
    const after = body.slice(i + text.length, i + text.length + suffix.length);
    if ((!prefix || before.endsWith(prefix)) && (!suffix || after.startsWith(suffix))) return i;
  }
  return matches[0]!;
}

/** A trailing `## Highlights` section for highlights that couldn't be anchored
 *  inline. Empty string when the list is empty. */
export function highlightsSection(highlights: Highlight[]): string {
  if (highlights.length === 0) return "";
  const blocks = highlights.map((h) => (h.note ? `> ${h.text}\n>\n> — ${h.note}` : `> ${h.text}`));
  return "## Highlights\n\n" + blocks.join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- connector/markdown/highlights`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/connector/markdown/highlights.ts packages/core/src/connector/markdown/highlights.test.ts
git commit -m "feat(core): inline highlight marking with non-lossy fallback"
```

---

## Task 8: Deterministic filename

**Files:**
- Create: `packages/core/src/connector/markdown/filename.ts`
- Test: `packages/core/src/connector/markdown/filename.test.ts`

**Interfaces:**
- Consumes: `slugify` from `../../slug.js`.
- Produces: `exportFilename(title: string, idSuffix: string, used: Set<string>): string` — `<slug>.md`, collision → `<slug>-<idSuffix>.md`; mutates `used`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connector/markdown/filename.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { exportFilename } from "./filename.js";

describe("exportFilename", () => {
  it("slugifies the title", () => {
    expect(exportFilename("Hello World!", "abc123", new Set())).toBe("hello-world.md");
  });

  it("appends the id suffix on collision", () => {
    const used = new Set<string>();
    expect(exportFilename("Same Title", "aaaaaa", used)).toBe("same-title.md");
    expect(exportFilename("Same Title", "bbbbbb", used)).toBe("same-title-bbbbbb.md");
  });

  it("falls back to untitled for empty slugs", () => {
    expect(exportFilename("!!!", "abc123", new Set())).toBe("untitled.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- connector/markdown/filename`
Expected: FAIL — `./filename.js` not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/connector/markdown/filename.ts`:

```ts
import { slugify } from "../../slug.js";

/** Deterministic `<slug>.md`. On collision within a batch, append a short stable
 *  id suffix so re-export of the same set produces the same name. */
export function exportFilename(title: string, idSuffix: string, used: Set<string>): string {
  const base = slugify(title) || "untitled";
  let name = `${base}.md`;
  if (used.has(name)) name = `${base}-${idSuffix}.md`;
  used.add(name);
  return name;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- connector/markdown/filename`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/connector/markdown/filename.ts packages/core/src/connector/markdown/filename.test.ts
git commit -m "feat(core): deterministic export filename"
```

---

## Task 9: Render an `ArticleExport` into an `ExportFile`

**Files:**
- Create: `packages/core/src/connector/markdown/render.ts`
- Test: `packages/core/src/connector/markdown/render.test.ts`

**Interfaces:**
- Consumes: `ArticleExport`, `ExportFile` (Task 4); `htmlToMarkdown` (5); `renderFrontmatter` (6); `markHighlights`, `highlightsSection` (7); `exportFilename` (8).
- Produces: `renderArticle(a: ArticleExport, used: Set<string>): ExportFile`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connector/markdown/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderArticle } from "./render.js";
import type { ArticleExport } from "../plugin.js";

function article(p: Partial<ArticleExport> = {}): ArticleExport {
  return {
    id: "abc123def", title: "My Article", url: "https://x.test/p", author: "Jane",
    siteName: "Site", lang: "en", publishedAt: "2026-01-02", fetchedAt: "2026-06-26",
    capturedAt: "2026-06-26", status: "reading", tags: ["notes"], aiTags: ["ai"],
    summary: "Sum", contentHtml: "<p>The body has a quote here.</p>", highlights: [],
    ...p,
  };
}

describe("renderArticle", () => {
  it("produces frontmatter, an H1 title, and the converted body", () => {
    const f = renderArticle(article(), new Set());
    expect(f.filename).toBe("my-article.md");
    expect(f.contents).toContain('title: "My Article"');
    expect(f.contents).toContain("# My Article");
    expect(f.contents).toContain("The body has a quote here.");
  });

  it("marks a highlight inline", () => {
    const f = renderArticle(
      article({
        highlights: [{
          id: "h", user: "u", article: "a", text: "quote here", prefix: "", suffix: "",
          startOffset: 0, endOffset: 0, color: "amber", note: "", created: "2026",
        }],
      }),
      new Set()
    );
    expect(f.contents).toContain("==quote here==");
  });

  it("notes an unavailable body without throwing", () => {
    const f = renderArticle(article({ contentHtml: "" }), new Set());
    expect(f.contents).toContain("_body unavailable_");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- connector/markdown/render`
Expected: FAIL — `./render.js` not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/connector/markdown/render.ts`:

```ts
import type { ArticleExport, ExportFile } from "../plugin.js";
import { htmlToMarkdown } from "./html-to-md.js";
import { renderFrontmatter } from "./frontmatter.js";
import { markHighlights, highlightsSection } from "./highlights.js";
import { exportFilename } from "./filename.js";

/** Pure: render one article into a single Markdown file. */
export function renderArticle(a: ArticleExport, used: Set<string>): ExportFile {
  const frontmatter = renderFrontmatter({
    title: a.title,
    url: a.url,
    author: a.author,
    site_name: a.siteName,
    published: a.publishedAt,
    fetched: a.fetchedAt,
    captured: a.capturedAt,
    status: a.status,
    tags: a.tags,
    ai_tags: a.aiTags,
    summary: a.summary,
  });

  const bodyMd = a.contentHtml ? htmlToMarkdown(a.contentHtml) : "_body unavailable_";
  const { body, unanchored } = markHighlights(bodyMd, a.highlights);
  const section = highlightsSection(unanchored);

  const parts = [frontmatter, `# ${a.title}`, body];
  if (section) parts.push(section);
  const contents = parts.join("\n\n") + "\n";

  const filename = exportFilename(a.title, a.id.slice(0, 6), used);
  return { filename, contents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- connector/markdown/render`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/connector/markdown/render.ts packages/core/src/connector/markdown/render.test.ts
git commit -m "feat(core): compose article export into a markdown file"
```

---

## Task 10: Markdown connector, stubs, registry, and exports

**Files:**
- Create: `packages/core/src/connector/markdown/connector.ts`
- Create: `packages/core/src/connector/notion.ts`
- Create: `packages/core/src/connector/obsidian.ts`
- Create: `packages/core/src/connector/registry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/connector/registry.test.ts`

**Interfaces:**
- Consumes: `ConnectorPlugin`, `ExportResult`, `NotImplementedError`, `ArticleExport` (Task 4); `renderArticle` (9).
- Produces:
  - `class MarkdownConnector implements ConnectorPlugin` (`type="markdown"`, `stub=false`), per-article failure isolation into `ExportResult.failures`.
  - `class NotionConnector` / `class ObsidianConnector` (`stub=true`, `export` throws `NotImplementedError`).
  - `registerConnector(c)`, `getConnector(type): ConnectorPlugin | undefined`, `listConnectors(): ConnectorPlugin[]`. The three connectors are registered on import.
  - Re-exported from `@readmepls/core`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/connector/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getConnector, listConnectors } from "./registry.js";
import { NotImplementedError, type ArticleExport } from "./plugin.js";

function article(p: Partial<ArticleExport> = {}): ArticleExport {
  return {
    id: "id1", title: "T", url: "https://x.test/p", author: null, siteName: null,
    lang: null, publishedAt: null, fetchedAt: "2026", capturedAt: "2026",
    status: "unread", tags: [], aiTags: [], summary: "", contentHtml: "<p>hi</p>",
    highlights: [], ...p,
  };
}

describe("connector registry", () => {
  it("lists markdown (active) and notion/obsidian (stubs)", () => {
    const types = listConnectors().map((c) => `${c.type}:${c.stub}`);
    expect(types).toContain("markdown:false");
    expect(types).toContain("notion:true");
    expect(types).toContain("obsidian:true");
  });

  it("markdown exports one file per article", async () => {
    const r = await getConnector("markdown")!.export([article(), article({ id: "id2", title: "Two" })]);
    expect(r.files).toHaveLength(2);
    expect(r.failures).toHaveLength(0);
  });

  it("markdown isolates a per-article render failure", async () => {
    // A title that slugifies fine but contentHtml that turndown handles; force a
    // failure by passing a non-string contentHtml shape via an unsafe cast.
    const bad = article({ contentHtml: 123 as unknown as string });
    const r = await getConnector("markdown")!.export([article(), bad]);
    expect(r.files).toHaveLength(1);
    expect(r.failures).toHaveLength(1);
  });

  it("stub connectors throw NotImplementedError", async () => {
    await expect(getConnector("notion")!.export([])).rejects.toBeInstanceOf(NotImplementedError);
    await expect(getConnector("obsidian")!.export([])).rejects.toBeInstanceOf(NotImplementedError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- connector/registry`
Expected: FAIL — `./registry.js` not found.

- [ ] **Step 3: Implement the connector and stubs**

Create `packages/core/src/connector/markdown/connector.ts`:

```ts
import type { ArticleExport, ConnectorPlugin, ExportResult, ExportFile, ExportFailure } from "../plugin.js";
import { renderArticle } from "./render.js";

export class MarkdownConnector implements ConnectorPlugin {
  readonly type = "markdown";
  readonly stub = false;

  async export(articles: ArticleExport[]): Promise<ExportResult> {
    const used = new Set<string>();
    const files: ExportFile[] = [];
    const failures: ExportFailure[] = [];
    for (const a of articles) {
      try {
        files.push(renderArticle(a, used));
      } catch (err) {
        failures.push({
          title: a.title,
          url: a.url,
          reason: err instanceof Error ? err.message : "render failed",
        });
      }
    }
    return { files, failures };
  }
}
```

Create `packages/core/src/connector/notion.ts`:

```ts
import type { ConnectorPlugin, ExportResult } from "./plugin.js";
import { NotImplementedError } from "./plugin.js";

export class NotionConnector implements ConnectorPlugin {
  readonly type = "notion";
  readonly stub = true;
  async export(): Promise<ExportResult> {
    throw new NotImplementedError(this.type);
  }
}
```

Create `packages/core/src/connector/obsidian.ts`:

```ts
import type { ConnectorPlugin, ExportResult } from "./plugin.js";
import { NotImplementedError } from "./plugin.js";

export class ObsidianConnector implements ConnectorPlugin {
  readonly type = "obsidian";
  readonly stub = true;
  async export(): Promise<ExportResult> {
    throw new NotImplementedError(this.type);
  }
}
```

Create `packages/core/src/connector/registry.ts`:

```ts
import type { ConnectorPlugin } from "./plugin.js";
import { MarkdownConnector } from "./markdown/connector.js";
import { NotionConnector } from "./notion.js";
import { ObsidianConnector } from "./obsidian.js";

const registry = new Map<string, ConnectorPlugin>();

export function registerConnector(c: ConnectorPlugin): void {
  registry.set(c.type, c);
}

export function getConnector(type: string): ConnectorPlugin | undefined {
  return registry.get(type);
}

export function listConnectors(): ConnectorPlugin[] {
  return [...registry.values()];
}

registerConnector(new MarkdownConnector());
registerConnector(new NotionConnector());
registerConnector(new ObsidianConnector());
```

- [ ] **Step 4: Export from the package index**

In `packages/core/src/index.ts`, add at the end:

```ts
export * from "./connector/plugin.js";
export * from "./connector/registry.js";
```

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `pnpm test -- connector/registry && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/connector packages/core/src/index.ts
git commit -m "feat(core): markdown connector, notion/obsidian stubs, registry"
```

---

## Task 11: Export DTO loader + scope resolver (web IO shell)

**Files:**
- Create: `apps/web/src/lib/server/export.ts`
- Test: `apps/web/src/lib/server/export.test.ts`

**Interfaces:**
- Consumes: `ArticleExport` (Task 4), `Highlight` (types), an authenticated `PocketBase` client.
- Produces:
  - `type Scope = { kind: "single"; id: string } | { kind: "collection"; id: string } | { kind: "library" } | { kind: "filter"; tag: string | null; q: string | null }`
  - `resolveArticleIds(pb, scope, pbUrl, token, fetchFn?): Promise<string[]>`
  - `loadArticleExports(pb, ids): Promise<ArticleExport[]>` — missing/foreign ids are silently skipped (API rules + `getOne` 404 → isolation).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/server/export.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveArticleIds, loadArticleExports } from "./export.js";

// Minimal fake PB: each collection returns canned data; pb.filter is identity.
function fakePb(data: Record<string, unknown[]>, byId: Record<string, unknown> = {}) {
  return {
    filter: (s: string) => s,
    authStore: { token: "tok" },
    collection: (name: string) => ({
      getFullList: async () => data[name] ?? [],
      getOne: async (id: string) => {
        const rec = byId[id];
        if (!rec) throw new Error("404");
        return rec;
      },
    }),
  } as never;
}

describe("resolveArticleIds", () => {
  it("collection scope maps collection_items to article ids", async () => {
    const pb = fakePb({ collection_items: [{ article: "a1" }, { article: "a2" }] });
    const ids = await resolveArticleIds(pb, { kind: "collection", id: "c1" }, "http://pb", "tok");
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("library scope lists all article ids", async () => {
    const pb = fakePb({ articles: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] });
    const ids = await resolveArticleIds(pb, { kind: "library" }, "http://pb", "tok");
    expect(ids).toEqual(["a1", "a2", "a3"]);
  });

  it("filter scope intersects tag links with the search endpoint", async () => {
    const pb = fakePb({ article_tags: [{ article: "a1" }, { article: "a2" }] });
    const fetchFn = async () =>
      ({ json: async () => ({ results: [{ articleId: "a2" }, { articleId: "a9" }] }) }) as never;
    const ids = await resolveArticleIds(pb, { kind: "filter", tag: "t1", q: "hello" }, "http://pb", "tok", fetchFn);
    expect(ids).toEqual(["a2"]);
  });
});

describe("loadArticleExports", () => {
  it("skips ids the user does not own", async () => {
    const pb = fakePb(
      { highlights: [], article_tags: [] },
      { a1: { id: "a1", url: "https://x.test/p", status: "unread", created: "2026", expand: { content: { title: "T", ai_tags_json: [], content_html: "<p>x</p>", excerpt: "", fetched_at: "2026" } } } }
    );
    const out = await loadArticleExports(pb, ["a1", "missing"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a1");
    expect(out[0]!.title).toBe("T");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- server/export`
Expected: FAIL — `./export.js` not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/server/export.ts`:

```ts
import type PocketBase from "pocketbase";
import type { ArticleExport } from "@readmepls/core";
import { Highlight } from "@readmepls/types";

export type Scope =
  | { kind: "single"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "library" }
  | { kind: "filter"; tag: string | null; q: string | null };

type FetchFn = typeof fetch;

/** Resolve a scope to a list of article ids using only the caller's authed pb
 *  client (whose API rules scope every query to the user). For the `q` filter we
 *  reuse the existing `/api/search` PocketBase route, which is also user-scoped. */
export async function resolveArticleIds(
  pb: PocketBase,
  scope: Scope,
  pbUrl: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<string[]> {
  switch (scope.kind) {
    case "single":
      return [scope.id];
    case "collection": {
      const items = await pb
        .collection("collection_items")
        .getFullList({ filter: pb.filter("collection = {:id}", { id: scope.id }) });
      return items.map((i) => i.article as string);
    }
    case "library": {
      const arts = await pb.collection("articles").getFullList({ fields: "id" });
      return arts.map((a) => a.id);
    }
    case "filter": {
      let ids: string[] | null = null;
      if (scope.tag) {
        const links = await pb
          .collection("article_tags")
          .getFullList({ filter: pb.filter("tag = {:t}", { t: scope.tag }) });
        ids = links.map((l) => l.article as string);
      }
      if (scope.q) {
        const res = await fetchFn(`${pbUrl}/api/search?q=${encodeURIComponent(scope.q)}`, {
          headers: { Authorization: token },
        });
        const body = (await res.json()) as { results: { articleId: string }[] };
        const qIds = body.results.map((r) => r.articleId);
        ids = ids === null ? qIds : ids.filter((id) => qIds.includes(id));
      }
      return ids ?? [];
    }
  }
}

/** Load each article (with expanded content), its highlights, and its manual
 *  tags, mapping to the pure ArticleExport DTO. Ids the caller cannot read
 *  (getOne 404 under API rules) are silently skipped — tenant isolation. */
export async function loadArticleExports(pb: PocketBase, ids: string[]): Promise<ArticleExport[]> {
  const out: ArticleExport[] = [];
  for (const id of ids) {
    const a = await pb.collection("articles").getOne(id, { expand: "content" }).catch(() => null);
    if (!a) continue;
    const c = (a.expand as { content?: Record<string, unknown> } | undefined)?.content;

    const hls = await pb
      .collection("highlights")
      .getFullList({ filter: pb.filter("article = {:id}", { id }), sort: "created" });
    const highlights = hls.map((r) =>
      Highlight.parse({
        id: r.id, user: r.user, article: r.article, text: r.text,
        prefix: r.prefix ?? "", suffix: r.suffix ?? "",
        startOffset: r.start_offset ?? 0, endOffset: r.end_offset ?? 0,
        color: r.color, note: r.note ?? "", created: r.created,
      }),
    );

    const tagLinks = await pb.collection("article_tags").getFullList({
      filter: pb.filter("article = {:id} && source = {:s}", { id, s: "manual" }),
      expand: "tag",
    });
    const tags = tagLinks
      .map((l) => (l.expand as { tag?: { name?: string } } | undefined)?.tag?.name)
      .filter((n): n is string => !!n);

    out.push({
      id: a.id,
      title: (c?.title as string) ?? (a.url as string),
      url: a.url as string,
      author: (c?.author as string | null) ?? null,
      siteName: (c?.site_name as string | null) ?? null,
      lang: (c?.lang as string | null) ?? null,
      publishedAt: (c?.published_at as string | null) ?? null,
      fetchedAt: (c?.fetched_at as string) ?? "",
      capturedAt: a.created as string,
      status: ((a.status as ArticleExport["status"]) ?? "unread"),
      tags,
      aiTags: Array.isArray(c?.ai_tags_json) ? (c!.ai_tags_json as string[]) : [],
      summary: (c?.excerpt as string) ?? "",
      contentHtml: (c?.content_html as string) ?? "",
      highlights,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- server/export`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/export.ts apps/web/src/lib/server/export.test.ts
git commit -m "feat(web): export scope resolver + article DTO loader"
```

---

## Task 12: Export route (packaging, scope dispatch, manifest)

**Files:**
- Modify: `apps/web/package.json` (add `jszip`)
- Create: `apps/web/src/routes/api/export/+server.ts`
- Test: `apps/web/src/routes/api/export/server.test.ts`

**Interfaces:**
- Consumes: `getConnector` (Task 10); `resolveArticleIds`, `loadArticleExports`, `Scope` (11).
- Produces: `GET /api/export?scope=…` returning `text/markdown` (single, ok) or `application/zip` (many; with `_export-report.md` when any article failed). Single-article render failure → 422. Empty scope → 404.

- [ ] **Step 1: Add the dependency**

Run:

```bash
pnpm --filter @readmepls/web add jszip
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/routes/api/export/server.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/server/export.js", () => ({
  resolveArticleIds: vi.fn(),
  loadArticleExports: vi.fn(),
}));

import { GET } from "./+server.js";
import { resolveArticleIds, loadArticleExports } from "$lib/server/export.js";
import type { ArticleExport } from "@readmepls/core";

function article(p: Partial<ArticleExport> = {}): ArticleExport {
  return {
    id: "id1", title: "One", url: "https://x.test/p", author: null, siteName: null,
    lang: null, publishedAt: null, fetchedAt: "2026", capturedAt: "2026",
    status: "unread", tags: [], aiTags: [], summary: "", contentHtml: "<p>hi</p>",
    highlights: [], ...p,
  };
}

function call(scope: string) {
  const url = new URL(`http://localhost/api/export?${scope}`);
  const locals = { userId: "u1", pb: { authStore: { token: "tok" } } } as never;
  return GET({ url, locals } as never);
}

describe("GET /api/export", () => {
  it("returns a single markdown file for scope=single", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue(["id1"]);
    (loadArticleExports as ReturnType<typeof vi.fn>).mockResolvedValue([article()]);
    const res = await call("scope=single&id=id1");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("one.md");
    expect(await res.text()).toContain("# One");
  });

  it("returns a zip for a multi-article scope", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue(["id1", "id2"]);
    (loadArticleExports as ReturnType<typeof vi.fn>).mockResolvedValue([article(), article({ id: "id2", title: "Two" })]);
    const res = await call("scope=library");
    expect(res.headers.get("content-type")).toContain("application/zip");
  });

  it("404s an empty scope", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await expect(call("scope=library")).rejects.toMatchObject({ status: 404 });
  });

  it("401s when unauthenticated", async () => {
    const url = new URL("http://localhost/api/export?scope=library");
    const locals = { userId: null, pb: { authStore: { token: "" } } } as never;
    await expect(GET({ url, locals } as never)).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- api/export`
Expected: FAIL — `./+server.js` not found.

- [ ] **Step 4: Implement the route**

Create `apps/web/src/routes/api/export/+server.ts`:

```ts
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import JSZip from "jszip";
import { getConnector } from "@readmepls/core";
import { resolveArticleIds, loadArticleExports, type Scope } from "$lib/server/export.js";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

function must(url: URL, key: string): string {
  const v = url.searchParams.get(key);
  if (!v) throw error(400, `missing ${key}`);
  return v;
}

function parseScope(url: URL): Scope {
  const kind = url.searchParams.get("scope") ?? "library";
  if (kind === "single") return { kind: "single", id: must(url, "id") };
  if (kind === "collection") return { kind: "collection", id: must(url, "id") };
  if (kind === "filter")
    return { kind: "filter", tag: url.searchParams.get("tag"), q: url.searchParams.get("q") };
  return { kind: "library" };
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const scope = parseScope(url);

  const ids = await resolveArticleIds(locals.pb, scope, PB_URL, locals.pb.authStore.token);
  if (ids.length === 0) throw error(404, "nothing to export");

  const articles = await loadArticleExports(locals.pb, ids);
  if (articles.length === 0) throw error(404, "nothing to export");

  const connector = getConnector("markdown");
  if (!connector) throw error(500, "markdown connector unavailable");
  const result = await connector.export(articles);

  if (scope.kind === "single") {
    if (result.files.length === 0 || result.failures.length > 0) {
      throw error(422, result.failures[0]?.reason ?? "export failed");
    }
    const f = result.files[0]!;
    return new Response(f.contents, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${f.filename}"`,
      },
    });
  }

  const zip = new JSZip();
  for (const f of result.files) zip.file(f.filename, f.contents);
  if (result.failures.length > 0) {
    const report =
      ["# Export report", "", "These articles could not be exported:", ""]
        .concat(result.failures.map((x) => `- ${x.title} (${x.url}) — ${x.reason}`))
        .join("\n") + "\n";
    zip.file("_export-report.md", report);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Response(bytes, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="readmepls-export.zip"`,
    },
  });
};
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `pnpm test -- api/export && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/routes/api/export
git commit -m "feat(web): synchronous markdown export route (md/zip + manifest)"
```

---

## Task 13: Settings → Connectors page

**Files:**
- Create: `apps/web/src/routes/settings/connectors/+page.svelte`
- Test: `apps/web/src/routes/settings/connectors/page.test.ts`

**Interfaces:**
- Consumes: `listConnectors` (Task 10), `/api/export?scope=library` (12).
- Produces: a page listing connectors — `markdown` active with an "export library" link to `/api/export?scope=library`; `notion`/`obsidian` shown disabled with "coming soon".

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/settings/connectors/page.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import "@testing-library/jest-dom/vitest";
import Page from "./+page.svelte";

describe("connectors settings page", () => {
  it("lists markdown as active with an export link", () => {
    const { getByText, getByRole } = render(Page);
    expect(getByText(/markdown/i)).toBeInTheDocument();
    const link = getByRole("link", { name: /export library/i });
    expect(link).toHaveAttribute("href", "/api/export?scope=library");
  });

  it("shows notion and obsidian as coming soon", () => {
    const { getAllByText } = render(Page);
    expect(getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- settings/connectors`
Expected: FAIL — `./+page.svelte` not found.

- [ ] **Step 3: Implement the page**

Create `apps/web/src/routes/settings/connectors/+page.svelte`:

```svelte
<script lang="ts">
  import { listConnectors } from "@readmepls/core";

  const connectors = listConnectors().map((c) => ({ type: c.type, stub: c.stub }));
</script>

<svelte:head><title>connectors · settings</title></svelte:head>

<section class="connectors">
  <h1>connectors</h1>
  <p class="lede">send your clean articles where they belong.</p>

  <ul class="list">
    {#each connectors as c (c.type)}
      <li class="connector" class:disabled={c.stub}>
        <span class="name">{c.type}</span>
        {#if c.stub}
          <span class="badge">coming soon</span>
        {:else}
          <a class="action" href={`/api/export?scope=library`}>export library</a>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .connectors {
    max-width: 48rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }
  h1 {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    color: var(--color-text);
  }
  .lede {
    color: var(--color-text-muted);
    margin-bottom: var(--space-5);
  }
  .list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .connector {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .connector.disabled {
    opacity: 0.55;
  }
  .name {
    font-family: var(--font-display);
    color: var(--color-text);
    text-transform: lowercase;
  }
  .badge {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .action {
    color: var(--color-accent);
    text-decoration: none;
    font-weight: 600;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- settings/connectors`
Expected: PASS.

> If a referenced token (e.g. `--color-accent`) is absent from `apps/web/src/lib/styles/tokens.css`, use the nearest existing token (check the file) rather than hardcoding a value.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/settings/connectors
git commit -m "feat(web): settings connectors page (markdown active, stubs greyed)"
```

---

## Task 14: Full suite + typecheck gate

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: PASS — all new and existing tests green.

- [ ] **Step 2: Typecheck the monorepo**

Run: `pnpm typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (or auto-fix formatting with `pnpm exec prettier --write .` then re-run, and commit any formatting).

- [ ] **Step 4: Final commit if formatting changed**

```bash
git add -A
git commit -m "chore(phase-6): formatting"
```

---

## Self-Review Notes (coverage map)

- Spec §3 connector core (`plugin`, `registry`, markdown render units, stubs) → Tasks 4–10.
- Spec §4 `ArticleExport` DTO → Task 4; mapped from PB in Task 11.
- Spec §5 frontmatter (snake_case, split tags, no progress, escaping, stable) → Task 6; body HTML→MD → Task 5; inline highlights + fallback → Task 7; filename → Task 8; full file → Task 9.
- Spec §6 scopes (single/collection/filter[tag,q]/library) + server-side resolution + isolation → Task 11; packaging (md/zip) → Task 12.
- Spec §7 Settings connectors page → Task 13.
- Spec §8 `published_at` pipeline (types, parse-article, X/YT defaults, worker write, migration) → Tasks 1–3.
- Spec §9 error handling (empty→404, single→422 loud, multi→continue+`_export-report.md`, content-less→`_body unavailable_`) → Tasks 9, 12.
- Spec §10 testing (pure render, registry, route isolation/scope/packaging/failure, pipeline) → Tasks 1–13.
