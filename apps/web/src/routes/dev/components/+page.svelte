<script lang="ts">
  import type { Component } from "svelte";
  import Frame from "./Frame.svelte";
  import Controls from "./sections/Controls.svelte";
  import Overlays from "./sections/Overlays.svelte";
  import CardsLists from "./sections/CardsLists.svelte";
  import { Button } from "$lib/components/ui/button";

  // Local-only: sets the attribute for this page, never persists to the account.
  const root = document.documentElement;
  const previous = root.dataset.theme;
  let theme = $state<"light" | "dark">(
    previous === "dark" || previous === "light"
      ? previous
      : globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
  );
  $effect(() => {
    root.dataset.theme = theme;
  });
  $effect(() => () => {
    if (previous === undefined) delete root.dataset.theme;
    else root.dataset.theme = previous;
  });

  const sections: { title: string; Body: Component }[] = [
    { title: "Controls", Body: Controls },
    { title: "Overlays", Body: Overlays },
    { title: "Cards & lists", Body: CardsLists },
  ];
  const frames = [
    { mode: "light", width: "phone" },
    { mode: "dark", width: "phone" },
    { mode: "light", width: "desktop" },
    { mode: "dark", width: "desktop" },
  ] as const;
</script>

<svelte:head><title>Components · dev</title></svelte:head>

<div class="bg-background text-foreground mx-auto max-w-[1800px] p-4">
  <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold">Components</h1>
      <p class="text-muted-foreground text-sm">
        Every primitive in light and dark, phone and desktop. Dev only.
      </p>
    </div>
    <Button
      variant="outline"
      onclick={() => (theme = theme === "light" ? "dark" : "light")}
    >
      Overlays: {theme}
    </Button>
  </header>

  {#each sections as { title, Body } (title)}
    <section class="mb-12">
      <h2 class="mb-4 text-xl font-semibold">{title}</h2>
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {#each frames as f (f.mode + f.width)}
          <Frame mode={f.mode} width={f.width}><Body /></Frame>
        {/each}
      </div>
    </section>
  {/each}
</div>
