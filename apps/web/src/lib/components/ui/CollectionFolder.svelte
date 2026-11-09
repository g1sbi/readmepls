<script lang="ts">
  import { Button } from "./button/index.js";
  import { Badge } from "./badge/index.js";
  import { FolderOpen } from "@lucide/svelte";

  let { name, slug, count }: { name: string; slug: string; count: number } =
    $props();
</script>

<Button
  href={`/collections/${slug}`}
  variant="outline"
  class="max-w-full min-w-0 min-h-11 justify-start gap-2 px-3"
>
  <FolderOpen class="icon-sm" aria-hidden="true" />
  <span class="min-w-0 truncate">{name}</span>
  <Badge variant="secondary" class="shrink-0" aria-label={`${count} articles`}
    >{count}</Badge
  >
</Button>
