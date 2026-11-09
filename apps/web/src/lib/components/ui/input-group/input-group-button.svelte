<script lang="ts" module>
  import type { ButtonSize } from "$lib/components/ui/button/index.js";

  /** The Button sizes that fit inside an InputGroup. sm / icon-sm carry
   *  Button's ::after hit area (44px tap target); icon is a full 44px. */
  export type InputGroupButtonSize = Extract<
    ButtonSize,
    "sm" | "icon-sm" | "icon"
  >;
</script>

<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { ComponentProps } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    type = "button",
    variant = "ghost",
    size = "sm",
    ...restProps
  }: Omit<ComponentProps<typeof Button>, "href" | "size"> & {
    size?: InputGroupButtonSize;
  } = $props();
</script>

<!-- Sizing is Button's own size variant; only layout tweaks are added here. -->
<Button
  bind:ref
  {type}
  {size}
  data-size={size}
  {variant}
  class={cn("flex items-center gap-2 text-sm shadow-none", className)}
  {...restProps}
>
  {@render children?.()}
</Button>
