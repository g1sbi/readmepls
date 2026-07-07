<script lang="ts">
  import type { Snippet } from "svelte";
  import { Badge } from "./badge";
  let { children }: { children?: Snippet } = $props();
</script>

{#if children}
  <Badge variant="secondary">
    {@render children()}
  </Badge>
{/if}
