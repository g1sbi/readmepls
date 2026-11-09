<script lang="ts">
  import { resolve } from "$app/paths";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import { sidebarRow } from "./sidebar-row.js";

  let {
    collections,
    activeSlug = null,
    labelledby,
  }: {
    collections: CollectionSummary[];
    activeSlug?: string | null;
    labelledby?: string;
  } = $props();
</script>

<ul class="flex flex-col gap-0.5" aria-labelledby={labelledby}>
  {#each collections as c (c.id)}
    {@const active = c.slug === activeSlug}
    <li>
      <a
        href={resolve("/collections/[slug]", { slug: c.slug })}
        aria-current={active ? "page" : undefined}
        class={sidebarRow(active)}
      >
        <span class="min-w-0 flex-1 truncate">{c.name}</span>
        <span
          class="text-xs tabular-nums {active
            ? 'text-inverse-foreground/70'
            : 'text-muted-foreground'}">{c.count}</span
        >
      </a>
    </li>
  {/each}
</ul>
