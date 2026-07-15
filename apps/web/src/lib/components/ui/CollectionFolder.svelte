<script lang="ts">
  import { Button } from "./button/index.js";
  import { Badge } from "./badge/index.js";
  import { FolderOpen } from "@lucide/svelte";

  let { name, slug, count }: { name: string; slug: string; count: number } = $props();
</script>

<Button
  href={`/collections/${slug}`}
  variant="outline"
  class="min-h-11 justify-start gap-2 px-3"
>
  <FolderOpen class="icon-sm" aria-hidden="true" />
  <span class="truncate">{name}</span>
  <Badge variant="secondary">{count}</Badge>
</Button>
