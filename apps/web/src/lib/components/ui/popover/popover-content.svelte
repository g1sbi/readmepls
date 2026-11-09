<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
  import PopoverPortal from "./popover-portal.svelte";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    align = "center",
    portalProps,
    ...restProps
  }: PopoverPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
  } = $props();
</script>

<PopoverPortal {...portalProps}>
  <PopoverPrimitive.Content
    bind:ref
    data-slot="popover-content"
    {sideOffset}
    {align}
    class={cn(
      "bg-popover text-popover-foreground ring-hairline data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ease-out motion-reduce:animate-none z-50 flex w-auto origin-(--bits-popover-content-transform-origin) flex-col gap-2 rounded-lg p-1 text-sm shadow-lg ring-1 duration-[var(--dur-fast)] outline-hidden",
      className,
    )}
    {...restProps}
  />
</PopoverPortal>
