<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { ButtonVariant, ButtonSize } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import * as InputGroup from "$lib/components/ui/input-group";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Spinner } from "$lib/components/ui/spinner";
  import SearchIcon from "@lucide/svelte/icons/search";
  import PlusIcon from "@lucide/svelte/icons/plus";

  const variants: ButtonVariant[] = [
    "default",
    "marker",
    "secondary",
    "outline",
    "ghost",
    "destructive",
    "link",
  ];
  const sizes: ButtonSize[] = ["default", "sm", "lg", "icon", "icon-sm"];
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Buttons</h4>
    {#each variants as variant (variant)}
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground w-20 text-xs">{variant}</span>
        {#each sizes as size (size)}
          <Button {variant} {size} aria-label={`${variant} ${size}`}>
            {#if size === "icon" || size === "icon-sm"}<PlusIcon
              />{:else}{size}{/if}
          </Button>
        {/each}
      </div>
    {/each}
    <div class="flex flex-wrap items-center gap-2">
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>Disabled</Button>
      <Button class="ring-ring ring-offset-background ring-2 ring-offset-2">
        Focus-visible
      </Button>
      <Button disabled aria-busy="true"
        ><Spinner label="Saving" /> Saving</Button
      >
    </div>
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Inputs</h4>
    <Input placeholder="Empty" aria-label="Empty input" />
    <Input value="Filled value" aria-label="Filled input" />
    <Input value="not a url" aria-invalid="true" aria-label="Invalid input" />
    <Input value="Disabled" disabled aria-label="Disabled input" />
    <Textarea placeholder="Textarea" aria-label="Textarea" />
    <InputGroup.Root>
      <InputGroup.Addon><SearchIcon /></InputGroup.Addon>
      <InputGroup.Input placeholder="Search your library" aria-label="Search" />
      <InputGroup.Addon align="inline-end">
        <InputGroup.Button size="sm">Go</InputGroup.Button>
      </InputGroup.Addon>
    </InputGroup.Root>
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Badges</h4>
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="tag">tag</Badge>
      <Badge variant="chip">chip</Badge>
      <Badge variant="chip" selected>chip selected</Badge>
      <Badge variant="outline">outline</Badge>
      <Badge variant="marker">marker</Badge>
    </div>
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">
      Skeleton and spinner
    </h4>
    <Skeleton class="h-4 w-3/4" />
    <Skeleton class="h-4 w-1/2" />
    <div class="flex items-center gap-2">
      <Spinner />
      <Spinner class="size-6" />
      <Spinner class="size-8" />
    </div>
  </div>
</div>
