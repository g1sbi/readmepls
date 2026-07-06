<!-- apps/web/src/lib/components/FilterDrawer.svelte -->
<script lang="ts">
  import type { LibraryParams, ReadState, TimeBucket, DatePreset, HasFlag, Attention } from "@readmepls/types";
  import { READ_STATES, TIME_BUCKETS, DATE_PRESETS, HAS_FLAGS, ATTENTION } from "@readmepls/types";
  import type { FacetOptions, SourceFacet } from "@readmepls/core";
  import Sheet from "./ui/Sheet.svelte";
  import Chip from "./ui/Chip.svelte";
  import SourceFilter from "./SourceFilter.svelte";

  type Patch = Partial<LibraryParams>;
  let { open, onClose, params, options, tags, collections, onChange, onToggleFavorite }: {
    open: boolean; onClose: () => void; params: LibraryParams; options: FacetOptions;
    tags: { id: string; name: string }[]; collections: { id: string; name: string; slug: string }[];
    onChange: (patch: Patch) => void; onToggleFavorite: (f: SourceFacet) => void;
  } = $props();

  const TIME_LABELS: Record<TimeBucket, string> = { quick: "quick (<5m)", medium: "medium (5–15m)", long: "long (>15m)" };
  const DATE_LABELS: Record<DatePreset, string> = { today: "today", week: "this week", month: "this month", year: "this year", older: "older" };

  type ListField = "read" | "time" | "tag" | "collection" | "source" | "lang" | "author" | "has" | "attention";

  // Multi-select toggle over an array-valued group.
  function toggleList<T extends string>(field: ListField, val: T) {
    const cur = params[field] as T[];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    onChange({ [field]: next } as Patch);
  }
  // Single-select date preset (click active value to clear).
  function pickPreset(field: "saved" | "published", val: DatePreset) {
    onChange({ [field]: params[field] === val ? null : val } as Patch);
  }
</script>

<Sheet {open} {onClose} title="filters">
  <fieldset><legend>read</legend>
    {#each READ_STATES as v (v)}
      <button aria-label={v} aria-pressed={params.read.includes(v as ReadState)} onclick={() => toggleList<ReadState>("read", v)}>
        <Chip selected={params.read.includes(v as ReadState)}>{v}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>reading time</legend>
    {#each TIME_BUCKETS as v (v)}
      <button aria-label={v} aria-pressed={params.time.includes(v as TimeBucket)} onclick={() => toggleList<TimeBucket>("time", v)}>
        <Chip selected={params.time.includes(v as TimeBucket)}>{TIME_LABELS[v as TimeBucket]}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>tags</legend>
    {#each tags as t (t.id)}
      <button aria-label={t.name} aria-pressed={params.tag.includes(t.id)} onclick={() => toggleList("tag", t.id)}>
        <Chip selected={params.tag.includes(t.id)}>{t.name}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>collections</legend>
    {#each collections as c (c.id)}
      <button aria-label={c.name} aria-pressed={params.collection.includes(c.id)} onclick={() => toggleList("collection", c.id)}>
        <Chip selected={params.collection.includes(c.id)}>{c.name}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>source</legend>
    <button aria-label="favorite sources only" aria-pressed={params.favsrc} onclick={() => onChange({ favsrc: !params.favsrc })}>
      <Chip selected={params.favsrc}>favorites only</Chip>
    </button>
    <SourceFilter
      facets={options.sources}
      selected={new Set(params.source)}
      onToggle={(id) => (id === "__all__" ? onChange({ source: [] }) : toggleList("source", id))}
      {onToggleFavorite}
    />
  </fieldset>

  <fieldset><legend>saved</legend>
    {#each DATE_PRESETS as v (v)}
      <button aria-label={`saved ${DATE_LABELS[v as DatePreset]}`} aria-pressed={params.saved === v} onclick={() => pickPreset("saved", v as DatePreset)}>
        <Chip selected={params.saved === v}>{DATE_LABELS[v as DatePreset]}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>published</legend>
    {#each DATE_PRESETS as v (v)}
      <button aria-label={`published ${DATE_LABELS[v as DatePreset]}`} aria-pressed={params.published === v} onclick={() => pickPreset("published", v as DatePreset)}>
        <Chip selected={params.published === v}>{DATE_LABELS[v as DatePreset]}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>language</legend>
    {#each options.languages as l (l)}
      <button aria-label={l} aria-pressed={params.lang.includes(l)} onclick={() => toggleList("lang", l)}>
        <Chip selected={params.lang.includes(l)}>{l}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>author</legend>
    {#each options.authors as a (a)}
      <button aria-label={a} aria-pressed={params.author.includes(a)} onclick={() => toggleList("author", a)}>
        <Chip selected={params.author.includes(a)}>{a}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>has</legend>
    {#each HAS_FLAGS as v (v)}
      <button aria-label={v} aria-pressed={params.has.includes(v as HasFlag)} onclick={() => toggleList<HasFlag>("has", v)}>
        <Chip selected={params.has.includes(v as HasFlag)}>{v}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>needs attention</legend>
    {#each ATTENTION as v (v)}
      <button aria-label={v} aria-pressed={params.attention.includes(v as Attention)} onclick={() => toggleList<Attention>("attention", v)}>
        <Chip selected={params.attention.includes(v as Attention)}>{v}</Chip>
      </button>
    {/each}
  </fieldset>
</Sheet>

<style>
  fieldset { border: none; padding: 0; margin: 0 0 var(--space-4); display: flex; flex-wrap: wrap; gap: 0.4rem; }
  legend { width: 100%; font-family: var(--font-ui); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text-muted); margin-bottom: 0.35rem; }
  button { background: none; border: none; padding: 0; cursor: pointer; }
</style>
