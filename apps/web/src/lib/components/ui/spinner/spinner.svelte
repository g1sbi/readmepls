<script lang="ts">
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { cn } from "$lib/utils.js";
  import type { SVGAttributes } from "svelte/elements";

  let {
    class: className,
    role = "status",
    // The accessible name; announced because the spinner is role="status".
    label = "Loading",
    ...restProps
  }: Omit<SVGAttributes<SVGSVGElement>, "color"> & {
    label?: string;
  } = $props();
</script>

<LoaderCircleIcon
  {role}
  aria-label={label}
  class={cn("size-4 animate-spin motion-reduce:animate-none", className)}
  {...restProps}
/>
