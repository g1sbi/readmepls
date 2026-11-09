<script lang="ts">
  import { cn, type WithElementRef } from "$lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    size = "default",
    interactive = false,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    size?: "default" | "sm";
    /** Lift on hover; fine pointers only, off under reduced motion. */
    interactive?: boolean;
  } = $props();
</script>

<div
  bind:this={ref}
  data-slot="card"
  data-size={size}
  class={cn(
    "group/card bg-card text-card-foreground ring-hairline relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg p-4 text-sm ring-1",
    interactive &&
      "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md transition-[transform,box-shadow] duration-[var(--dur-base)] ease-out motion-reduce:transform-none",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
