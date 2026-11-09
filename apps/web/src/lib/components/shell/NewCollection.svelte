<script lang="ts">
  import { tick } from "svelte";
  import { Plus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { createCollection } from "$lib/collections/actions.js";
  import { createErrorCopy } from "$lib/collections/copy.js";
  import { browserPb } from "$lib/pb.js";

  // The "Collections" heading, its + button and the inline create field.
  // Shared by the desktop sidebar and the phone More sheet.
  // The heading id is generated here (unique per instance) and bound out so
  // the caller's list can point aria-labelledby at it.
  let {
    headingId = $bindable(""),
    onCreated,
  }: { headingId?: string; onCreated: () => void } = $props();

  const uid = $props.id();
  headingId = `${uid}-heading`;
  const errorId = `${uid}-error`;

  let creating = $state(false);
  let draft = $state("");
  let error = $state("");
  let busy = $state(false);

  let plusButton = $state<HTMLButtonElement | null>(null);
  let nameInput = $state<HTMLInputElement | null>(null);

  function openCreate() {
    creating = true;
    // Already open: the input exists, so refocus it directly.
    nameInput?.focus();
  }

  function cancel() {
    creating = false;
    draft = "";
    error = "";
    // The field unmounts with focus on it; hand focus back to its trigger.
    void tick().then(() => plusButton?.focus());
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
        error = createErrorCopy[res.error];
      }
    } catch {
      error = createErrorCopy.failed;
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
      // Escape belongs to the field here: don't let the enclosing sheet's
      // document-level escape layer close it too.
      e.stopPropagation();
      cancel();
    }
  }

  // Focus the field as it appears, without an autofocus attribute.
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }
</script>

<div class="mt-6 mb-1 flex items-center justify-between pr-1 pl-4">
  <h2
    id={headingId}
    class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
  >
    Collections
  </h2>
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label="New collection"
    bind:ref={plusButton}
    onclick={openCreate}
  >
    <Plus />
  </Button>
</div>

{#if creating}
  <div class="mb-2 px-1">
    <Input
      bind:ref={nameInput}
      bind:value={draft}
      aria-label="New collection name"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      placeholder="Name it, press enter"
      autocomplete="off"
      onkeydown={onKeydown}
      oninput={() => (error = "")}
      {@attach focusOnMount}
    />
    {#if error}
      <p id={errorId} role="alert" class="mt-1.5 px-4 text-xs text-destructive">
        {error}
      </p>
    {/if}
  </div>
{/if}
