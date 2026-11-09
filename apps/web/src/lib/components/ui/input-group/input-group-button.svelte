<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  const inputGroupButtonVariants = tv({
    base: "gap-2 text-sm flex items-center shadow-none",
    variants: {
      size: {
        // Sizing comes from Button (sm / icon-sm); no extra classes needed.
        sm: "",
        "icon-sm": "",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  });

  export type InputGroupButtonSize = VariantProps<
    typeof inputGroupButtonVariants
  >["size"];
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

<Button
  bind:ref
  {type}
  data-size={size}
  {variant}
  class={cn(inputGroupButtonVariants({ size }), className)}
  {...restProps}
>
  {@render children?.()}
</Button>
