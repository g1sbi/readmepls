<!-- apps/web/src/lib/components/ActiveFilters.svelte -->
<script lang="ts">
  import type { LibraryParams } from "@readmepls/types";
  import Chip from "./ui/Chip.svelte";

  type LabelLookup = { tag: Record<string, string>; collection: Record<string, string>; source: Record<string, string> };
  type Patch = Partial<LibraryParams>;
  let { params, labels, onRemove, onClear }: {
    params: LibraryParams; labels: LabelLookup;
    onRemove: (patch: Patch) => void; onClear: () => void;
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
    if (params.q) out.push({ key: "q", label: `"${params.q}"`, patch: { q: "" } });
    return out;
  });
</script>

{#if chips.length}
  <div class="active" aria-label="active filters">
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
  .clear { background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); }
  .clear:hover { color: var(--color-accent-hover); }
</style>
