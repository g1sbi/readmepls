<script lang="ts">
  import type {
    HTMLInputAttributes,
    HTMLInputTypeAttribute,
  } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  type InputType = Exclude<HTMLInputTypeAttribute, "file">;

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type"> &
      (
        | { type: "file"; files?: FileList }
        | { type?: InputType; files?: undefined }
      )
  >;

  let {
    ref = $bindable(null),
    value = $bindable(),
    type,
    files = $bindable(),
    class: className,
    "data-slot": dataSlot = "input",
    ...restProps
  }: Props = $props();

  // Marker pill: ink-on-card with a hairline ring that thickens on focus.
  const inputClass =
    "h-11 w-full min-w-0 rounded-full bg-card px-4 text-base text-foreground ring-1 ring-hairline transition-shadow outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-destructive disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground";
</script>

{#if type === "file"}
  <input
    bind:this={ref}
    data-slot={dataSlot}
    class={cn(inputClass, className)}
    type="file"
    bind:files
    bind:value
    {...restProps}
  />
{:else}
  <input
    bind:this={ref}
    data-slot={dataSlot}
    class={cn(inputClass, className)}
    {type}
    bind:value
    {...restProps}
  />
{/if}
