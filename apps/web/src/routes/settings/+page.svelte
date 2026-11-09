<script lang="ts">
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { browserPb } from "$lib/pb.js";
  import { signOut } from "$lib/auth/sign-out.js";
  import type { ThemePref } from "$lib/theme/theme.js";
  import { page } from "$app/stores";
  import ThemeControl from "$lib/components/ThemeControl.svelte";
  import GetExtensionButton from "$lib/components/GetExtensionButton.svelte";
  import { showsExtensionPitch } from "$lib/stores/extension.svelte.js";
  import { Button } from "$lib/components/ui/button";
  import { ChevronRight } from "@lucide/svelte";

  const theme = getContext<{ current: ThemePref; set: (t: ThemePref) => void }>(
    "theme",
  );
  const pb = browserPb();
  const email: string = pb.authStore.model?.email ?? "";
</script>

<svelte:head><title>Settings</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-8">
  <PageHeader title="Settings" />

  <section class="flex flex-col gap-3" aria-labelledby="settings-appearance">
    <h2 id="settings-appearance" class="text-lg font-semibold">Appearance</h2>
    <ThemeControl value={theme.current} onChange={(t) => theme.set(t)} />
  </section>

  <section class="flex flex-col gap-3" aria-labelledby="settings-connectors">
    <h2 id="settings-connectors" class="text-lg font-semibold">Connectors</h2>
    <a
      href={resolve("/settings/connectors")}
      class="flex min-h-11 items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-hairline no-underline"
    >
      Export and connections
      <ChevronRight class="size-4" aria-hidden="true" />
    </a>
    {#if showsExtensionPitch($page.data.selfHosted === true)}
      <div
        class="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-hairline"
      >
        Browser extension
        <GetExtensionButton />
      </div>
    {/if}
  </section>

  <section class="flex flex-col gap-3" aria-labelledby="settings-account">
    <h2 id="settings-account" class="text-lg font-semibold">Account</h2>
    {#if email}
      <p class="text-muted-foreground">{email}</p>
    {/if}
    <div>
      <Button
        type="button"
        variant="outline"
        onclick={() => signOut(pb, () => goto(resolve("/login")))}
        >Sign out</Button
      >
    </div>
  </section>
</div>
