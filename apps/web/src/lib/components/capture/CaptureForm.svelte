<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { BookmarkPlus, ArrowUp } from "@lucide/svelte";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { createTypewriter } from "$lib/typewriter.svelte.js";
  import { submitCapture, CAPTURE_MESSAGES } from "$lib/capture/submit.js";

  const DEFAULT_PLACEHOLDERS = [
    "en.wikipedia.org/wiki/…",
    "a youtube video",
    "that newsletter you never open",
    "any blog post, really",
  ];

  let {
    variant,
    autofocus = false,
    onSaved,
    placeholders = DEFAULT_PLACEHOLDERS,
  }: {
    variant: "inline" | "sheet";
    autofocus?: boolean;
    onSaved?: () => void;
    placeholders?: string[];
  } = $props();

  let url = $state("");
  let busy = $state(false);
  let err = $state("");
  let focused = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Pause the animation whenever the user is engaged, so it never types over
  // them. placeholders is a one-time initializer, not reactively swapped.
  // svelte-ignore state_referenced_locally
  const tw = createTypewriter(placeholders, {
    paused: () => focused || url.trim() !== "",
  });
  onMount(() => {
    if (variant === "inline") tw.start();
    if (autofocus) inputEl?.focus();
  });
  onDestroy(() => tw.stop());

  async function submit() {
    if (busy) return;
    busy = true;
    err = "";
    try {
      const result = await submitCapture(fetch, url);
      if (result.ok) {
        // Refresh the page's data first so the new article is listed by the
        // time the sheet closes.
        await invalidateAll();
        url = "";
        onSaved?.();
      } else if (result.reason === "empty") {
        inputEl?.focus();
      } else {
        err = CAPTURE_MESSAGES[result.reason];
      }
    } finally {
      busy = false;
    }
  }

  const urlAttrs = {
    type: "url",
    inputmode: "url",
    autocomplete: "off",
  } as const;
</script>

<form
  novalidate
  class="w-full"
  onsubmit={(e) => {
    e.preventDefault();
    submit();
  }}
>
  {#if variant === "inline"}
    <InputGroup.Root
      class="mx-auto h-14 max-w-xl rounded-full pr-1.5 pl-2 shadow-sm"
    >
      <InputGroup.Addon>
        <BookmarkPlus aria-hidden="true" />
      </InputGroup.Addon>
      <InputGroup.Input
        {...urlAttrs}
        bind:ref={inputEl}
        bind:value={url}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        placeholder={focused ? "Paste a link" : tw.text}
        aria-label="Save a link"
        class="text-base md:text-base"
      />
      <!-- 56px bar, 44px button: the root's 6px (pr-1.5) is the only right
           inset, matching the 6px above and below, so the button sits concentric. -->
      <InputGroup.Addon align="inline-end" class="pr-0 has-[>button]:mr-0">
        <InputGroup.Button
          type="submit"
          variant="default"
          size="icon"
          aria-label="Save"
          aria-busy={busy}
          disabled={busy}
        >
          {#if busy}<Spinner label="Saving" />{:else}<ArrowUp
              aria-hidden="true"
            />{/if}
        </InputGroup.Button>
      </InputGroup.Addon>
    </InputGroup.Root>
  {:else}
    <div class="flex flex-col gap-3 md:flex-row">
      <Input
        {...urlAttrs}
        bind:ref={inputEl}
        bind:value={url}
        placeholder="Paste a link"
        aria-label="Save a link"
        class="h-11 text-base md:flex-1"
      />
      <Button
        type="submit"
        class="w-full md:w-auto"
        aria-label="Save"
        aria-busy={busy}
        disabled={busy}
      >
        {#if busy}<Spinner label="Saving" />{/if}
        Save
      </Button>
    </div>
  {/if}
  {#if err}
    <p
      role="alert"
      class="text-destructive mt-3 text-sm {variant === 'inline'
        ? 'text-center'
        : ''}"
    >
      {err}
    </p>
  {/if}
</form>
