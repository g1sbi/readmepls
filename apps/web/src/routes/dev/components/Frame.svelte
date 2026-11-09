<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";

  let {
    mode,
    width,
    children,
  }: {
    mode: "light" | "dark";
    width: "phone" | "desktop";
    children: Snippet;
  } = $props();
</script>

<!-- data-theme scopes every token and shadcn alias to this subtree. -->
<div class="min-w-0">
  <p class="text-muted-foreground mb-2 text-xs">{mode} · {width}</p>
  <div
    data-theme={mode}
    class={cn(
      "bg-background text-foreground ring-hairline w-full rounded-lg p-4 ring-1",
      width === "phone" && "max-w-[360px]",
    )}
  >
    {@render children()}
  </div>
</div>
