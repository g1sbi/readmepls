<script lang="ts">
  import { resolve } from "$app/paths";
  import { Plus, House, Library, Settings } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { NAV_ITEMS, activeKey } from "$lib/shell/nav.js";
  import { createCollection } from "$lib/collections/actions.js";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import { browserPb } from "$lib/pb.js";
  import SidebarCollections from "./SidebarCollections.svelte";
  import { sidebarRow } from "./sidebar-row.js";

  let {
    pathname,
    collections,
    onCreated,
  }: {
    pathname: string;
    collections: CollectionSummary[];
    onCreated: () => void;
  } = $props();

  const active = $derived(activeKey(pathname));
  const activeSlug = $derived(
    active === "collections"
      ? (pathname.split(/[?#]/)[0]?.split("/")[2] ?? null)
      : null,
  );

  const icons = { home: House, library: Library } as const;

  let creating = $state(false);
  let draft = $state("");
  let error = $state("");
  let busy = $state(false);

  const errorCopy = {
    duplicate: "A collection with that name already exists",
    empty: "Give it a name first",
  } as const;

  function cancel() {
    creating = false;
    draft = "";
    error = "";
  }

  async function submit() {
    if (busy) return;
    busy = true;
    try {
      const res = await createCollection(browserPb(), draft);
      if (res.ok) {
        cancel();
        onCreated();
      } else {
        error = errorCopy[res.error];
      }
    } finally {
      busy = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  // Focus the field as it appears, without an autofocus attribute.
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }
</script>

<nav
  aria-label="Main"
  class="flex h-dvh w-60 shrink-0 flex-col bg-background ring-1 ring-hairline"
>
  <div class="px-5 pt-6 pb-4">
    <a
      href={resolve("/")}
      class="font-display text-xl font-semibold tracking-tight text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >readme<span class="marker">pls</span></a
    >
  </div>

  <div data-sidebar-scroll class="flex-1 overflow-y-auto px-3 pb-4">
    <ul class="flex flex-col gap-0.5">
      {#each NAV_ITEMS as item (item.key)}
        {@const Icon = icons[item.key]}
        {@const isActive = active === item.key}
        <li>
          <a
            href={resolve(item.href)}
            aria-current={isActive ? "page" : undefined}
            class={sidebarRow(isActive)}
          >
            <Icon class="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </a>
        </li>
      {/each}
    </ul>

    <div class="mt-6 mb-1 flex items-center justify-between pr-1 pl-4">
      <h2
        class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Collections
      </h2>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="New collection"
        onclick={() => (creating = true)}
      >
        <Plus />
      </Button>
    </div>

    {#if creating}
      <div class="mb-2 px-1">
        <Input
          bind:value={draft}
          aria-label="New collection name"
          aria-invalid={error ? true : undefined}
          placeholder="Name it, press enter"
          autocomplete="off"
          onkeydown={onKeydown}
          oninput={() => (error = "")}
          {@attach focusOnMount}
        />
        {#if error}
          <p role="alert" class="mt-1.5 px-4 text-xs text-destructive">
            {error}
          </p>
        {/if}
      </div>
    {/if}

    <SidebarCollections {collections} {activeSlug} />
  </div>

  <div class="border-t border-hairline px-3 py-3">
    <a
      href={resolve("/settings")}
      aria-current={active === "settings" ? "page" : undefined}
      class={sidebarRow(active === "settings")}
    >
      <Settings class="size-4 shrink-0" aria-hidden="true" />
      Settings
    </a>
  </div>
</nav>
