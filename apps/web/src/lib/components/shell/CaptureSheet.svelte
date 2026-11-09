<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import CaptureForm from "$lib/components/capture/CaptureForm.svelte";

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  // Same breakpoint as the shell: a centered dialog from md up, a bottom sheet
  // on phones where the thumb can reach it.
  const wide = new MediaQuery("(min-width: 48rem)");
</script>

{#if wide.current}
  <Dialog.Root {open} onOpenChange={(next) => !next && onClose()}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>Save a link</Dialog.Title>
      </Dialog.Header>
      <CaptureForm variant="sheet" autofocus onSaved={onClose} />
    </Dialog.Content>
  </Dialog.Root>
{:else}
  <BottomSheet {open} {onClose} title="Save a link">
    <CaptureForm variant="sheet" autofocus onSaved={onClose} />
  </BottomSheet>
{/if}
