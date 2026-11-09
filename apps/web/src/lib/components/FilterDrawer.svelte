<!-- apps/web/src/lib/components/FilterDrawer.svelte -->
<script lang="ts">
  import type {
    LibraryParams,
    ReadState,
    TimeBucket,
    DatePreset,
    HasFlag,
    Attention,
  } from "@readmepls/types";
  import {
    READ_STATES,
    TIME_BUCKETS,
    DATE_PRESETS,
    HAS_FLAGS,
    ATTENTION,
  } from "@readmepls/types";
  import type { FacetOptions, SourceFacet } from "@readmepls/core";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Badge } from "$lib/components/ui/badge";
  import { chipButton } from "$lib/components/ui/button";
  import SourceFilter from "./SourceFilter.svelte";
  import CollectionsPanel from "./CollectionsPanel.svelte";

  type Patch = Partial<LibraryParams>;
  let {
    open,
    onClose,
    params,
    options,
    tags,
    collections,
    onChange,
    onToggleFavorite,
    collectionError = "",
    onCreateCollection,
    onRenameCollection,
    onDeleteCollection,
  }: {
    open: boolean;
    onClose: () => void;
    params: LibraryParams;
    options: FacetOptions;
    tags: { id: string; name: string }[];
    collections: { id: string; name: string; slug: string }[];
    onChange: (patch: Patch) => void;
    onToggleFavorite: (f: SourceFacet) => void;
    collectionError?: string;
    onCreateCollection: (name: string) => void;
    onRenameCollection: (id: string, name: string) => void;
    onDeleteCollection: (id: string) => void;
  } = $props();

  const TIME_LABELS: Record<TimeBucket, string> = {
    quick: "quick (<5m)",
    medium: "medium (5–15m)",
    long: "long (>15m)",
  };
  const DATE_LABELS: Record<DatePreset, string> = {
    today: "today",
    week: "this week",
    month: "this month",
    year: "this year",
    older: "older",
  };

  type ListField =
    | "read"
    | "time"
    | "tag"
    | "collection"
    | "source"
    | "lang"
    | "author"
    | "has"
    | "attention";

  // Multi-select toggle over an array-valued group.
  function toggleList<T extends string>(field: ListField, val: T) {
    const cur = params[field] as T[];
    const next = cur.includes(val)
      ? cur.filter((v) => v !== val)
      : [...cur, val];
    onChange({ [field]: next } as Patch);
  }
  // Single-select date preset (click active value to clear).
  function pickPreset(field: "saved" | "published", val: DatePreset) {
    onChange({ [field]: params[field] === val ? null : val } as Patch);
  }
</script>

<Sheet.Root {open} onOpenChange={(next) => !next && onClose()}>
  <Sheet.Content side="right">
    <Sheet.Header>
      <Sheet.Title>filters</Sheet.Title>
    </Sheet.Header>
    <div class="px-4 pb-4">
      <fieldset>
        <legend>read</legend>
        {#each READ_STATES as v (v)}
          <button
            class={chipButton}
            aria-label={`read: ${v}`}
            aria-pressed={params.read.includes(v as ReadState)}
            onclick={() => toggleList<ReadState>("read", v)}
          >
            <Badge
              variant="chip"
              selected={params.read.includes(v as ReadState)}>{v}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>reading time</legend>
        {#each TIME_BUCKETS as v (v)}
          <button
            class={chipButton}
            aria-label={`reading time: ${TIME_LABELS[v as TimeBucket]}`}
            aria-pressed={params.time.includes(v as TimeBucket)}
            onclick={() => toggleList<TimeBucket>("time", v)}
          >
            <Badge
              variant="chip"
              selected={params.time.includes(v as TimeBucket)}
              >{TIME_LABELS[v as TimeBucket]}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>tags</legend>
        {#each tags as t (t.id)}
          <button
            class={chipButton}
            aria-label={t.name}
            aria-pressed={params.tag.includes(t.id)}
            onclick={() => toggleList("tag", t.id)}
          >
            <Badge variant="chip" selected={params.tag.includes(t.id)}
              >{t.name}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>collections</legend>
        {#each collections as c (c.id)}
          <button
            class={chipButton}
            aria-label={c.name}
            aria-pressed={params.collection.includes(c.id)}
            onclick={() => toggleList("collection", c.id)}
          >
            <Badge variant="chip" selected={params.collection.includes(c.id)}
              >{c.name}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <CollectionsPanel
        {collections}
        error={collectionError}
        oncreate={onCreateCollection}
        onrename={onRenameCollection}
        ondelete={onDeleteCollection}
      />

      <fieldset>
        <legend>source</legend>
        <button
          class={chipButton}
          aria-label="favorite sources only"
          aria-pressed={params.favsrc}
          onclick={() => onChange({ favsrc: !params.favsrc })}
        >
          <Badge variant="chip" selected={params.favsrc}>favorites only</Badge>
        </button>
        <SourceFilter
          facets={options.sources}
          selected={new Set(params.source)}
          onToggle={(id) =>
            id === "__all__"
              ? onChange({ source: [] })
              : toggleList("source", id)}
          {onToggleFavorite}
        />
      </fieldset>

      <fieldset>
        <legend>saved</legend>
        {#each DATE_PRESETS as v (v)}
          <button
            class={chipButton}
            aria-label={`saved ${DATE_LABELS[v as DatePreset]}`}
            aria-pressed={params.saved === v}
            onclick={() => pickPreset("saved", v as DatePreset)}
          >
            <Badge variant="chip" selected={params.saved === v}
              >{DATE_LABELS[v as DatePreset]}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>published</legend>
        {#each DATE_PRESETS as v (v)}
          <button
            class={chipButton}
            aria-label={`published ${DATE_LABELS[v as DatePreset]}`}
            aria-pressed={params.published === v}
            onclick={() => pickPreset("published", v as DatePreset)}
          >
            <Badge variant="chip" selected={params.published === v}
              >{DATE_LABELS[v as DatePreset]}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>language</legend>
        {#each options.languages as l (l)}
          <button
            class={chipButton}
            aria-label={`language: ${l}`}
            aria-pressed={params.lang.includes(l)}
            onclick={() => toggleList("lang", l)}
          >
            <Badge variant="chip" selected={params.lang.includes(l)}>{l}</Badge>
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>author</legend>
        {#each options.authors as a (a)}
          <button
            class={chipButton}
            aria-label={`author: ${a}`}
            aria-pressed={params.author.includes(a)}
            onclick={() => toggleList("author", a)}
          >
            <Badge variant="chip" selected={params.author.includes(a)}
              >{a}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>has</legend>
        {#each HAS_FLAGS as v (v)}
          <button
            class={chipButton}
            aria-label={`has: ${v}`}
            aria-pressed={params.has.includes(v as HasFlag)}
            onclick={() => toggleList<HasFlag>("has", v)}
          >
            <Badge variant="chip" selected={params.has.includes(v as HasFlag)}
              >{v}</Badge
            >
          </button>
        {/each}
      </fieldset>

      <fieldset>
        <legend>needs attention</legend>
        {#each ATTENTION as v (v)}
          <button
            class={chipButton}
            aria-label={`needs attention: ${v}`}
            aria-pressed={params.attention.includes(v as Attention)}
            onclick={() => toggleList<Attention>("attention", v)}
          >
            <Badge
              variant="chip"
              selected={params.attention.includes(v as Attention)}>{v}</Badge
            >
          </button>
        {/each}
      </fieldset>
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  fieldset {
    border: none;
    padding: 0;
    margin: 0 0 var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  legend {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    margin-bottom: 0.35rem;
  }
  button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
</style>
