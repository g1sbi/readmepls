<!-- "get the extension!" pitch button. Sits in the app sidebar footer (md+)
     and in Settings > Connectors (reachable on phones). SaaS-only: never shown
     on self-hosted instances (they get the extension via the docs); on SaaS it
     shows only while the extension isn't detected. -->
<script lang="ts">
  import { Puzzle } from "@lucide/svelte";
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button/index.js";
  import { showsExtensionPitch } from "$lib/stores/extension.svelte.js";
  import GetExtensionDialog from "./GetExtensionDialog.svelte";

  let { class: className = "" }: { class?: string } = $props();
  let open = $state(false);
</script>

{#if showsExtensionPitch($page.data.selfHosted === true)}
  <Button
    type="button"
    variant="marker"
    size="sm"
    class={className}
    onclick={() => (open = true)}
  >
    <Puzzle aria-hidden="true" />
    get the extension!
  </Button>
  <GetExtensionDialog bind:open />
{/if}
