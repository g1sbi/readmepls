<!-- apps/web/src/lib/components/ActiveFilters.svelte -->
<script lang="ts">
  import type { LibraryParams } from "@readmepls/types";
  import Chip from "./ui/Chip.svelte";

  type LabelLookup = { tag: Record<string, string>; collection: Record<string, string>; source: Record<string, string> };
  type Patch = Partial<LibraryParams>;
  let { params, labels, onRemove, onClear, onEditQuery }: {
    params: LibraryParams; labels: LabelLookup;
    onRemove: (patch: Patch) => void; onClear: () => void; onEditQuery?: () => void;
  } = $props();

  interface ActiveChip { key: string; label: string; patch: Patch; }

  // Build one descriptor per active value; patch removes exactly that value.
  const chips = $derived.by<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    const listGroup = (field: "read" | "time" | "tag" | "collection" | "source" | "lang" | "author" | "has" | "attention",
                       label: (v: string) => string) => {
      const vals = params[field] as string[];
      for (const v of vals) {
        out.push({ key: `${field}:${v}`, label: label(v), patch: { [field]: vals.filter((x) => x !== v) } as Patch });
      }
    };
    listGroup("read", (v) => v);
    listGroup("time", (v) => v);
    listGroup("tag", (v) => labels.tag[v] ?? v);
    listGroup("collection", (v) => labels.collection[v] ?? v);
    listGroup("source", (v) => labels.source[v] ?? v);
    listGroup("lang", (v) => v);
    listGroup("author", (v) => v);
    listGroup("has", (v) => v);
    listGroup("attention", (v) => v);
    if (params.saved) out.push({ key: "saved", label: `saved: ${params.saved}`, patch: { saved: null } });
    if (params.published) out.push({ key: "published", label: `published: ${params.published}`, patch: { published: null } });
    if (params.favsrc) out.push({ key: "favsrc", label: "favorite sources", patch: { favsrc: false } });
    return out;
  });
</script>

{#if chips.length || params.q}
  <div class="active" aria-label="active filters">
    {#if params.q}
      <span class="q-chip">
        <button
          type="button"
          class="q-edit"
          aria-label={`edit search “${params.q}”`}
          onclick={() => onEditQuery?.()}
        >
          <Chip selected>{`“${params.q}”`}</Chip>
        </button>
        <button
          type="button"
          class="q-remove"
          aria-label={`remove search “${params.q}”`}
          onclick={() => onRemove({ q: "" })}
        >✕</button>
      </span>
    {/if}
    {#each chips as c (c.key)}
      <button data-testid="active-chip" class="chip-btn" aria-label={`remove ${c.label}`} onclick={() => onRemove(c.patch)}>
        <Chip selected>{c.label} ✕</Chip>
      </button>
    {/each}
    <button class="clear" onclick={onClear}>clear all</button>
  </div>
{/if}

<style>
  .active { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 0 0 var(--space-4); }
  .chip-btn { background: none; border: none; padding: 0; cursor: pointer; }
  .q-chip { display: inline-flex; align-items: center; gap: 0.15rem; }
  .q-edit, .q-remove { background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: var(--color-accent); }
  .q-remove { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
  .clear { background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); }
  .clear:hover { color: var(--color-accent-hover); }
</style>
