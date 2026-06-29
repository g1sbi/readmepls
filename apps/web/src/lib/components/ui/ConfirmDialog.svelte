<script lang="ts">
  import Button from "./Button.svelte";

  let {
    open,
    title,
    message,
    confirmLabel = "delete",
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  // Drive native modal state from `open`. jsdom doesn't implement showModal/close,
  // so guard the calls — the {#if open} block below is what tests assert against.
  $effect(() => {
    if (!dialog) return;
    try {
      if (open && !dialog.open) dialog.showModal();
      else if (!open && dialog.open) dialog.close();
    } catch {
      // jsdom fallback: showModal/close aren't implemented. Set the attribute
      // directly so ARIA exposes dialog children to role queries in tests.
      // Real browsers take the try path, so showModal() (and its ::backdrop,
      // Escape→cancel, focus trap) is preserved.
      if (open) dialog.setAttribute("open", "");
      else dialog.removeAttribute("open");
    }
  });

  function onBackdrop(e: MouseEvent) {
    if (e.target === dialog) onCancel();
  }
</script>

<dialog
  bind:this={dialog}
  aria-label={title}
  oncancel={(e) => { e.preventDefault(); onCancel(); }}
  onclick={onBackdrop}
>
  {#if open}
    <div class="panel">
      <h2>{title}</h2>
      <p>{message}</p>
      <div class="actions">
        <Button onclick={onCancel}>cancel</Button>
        <Button variant="accent" onclick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    border: none;
    border-radius: var(--radius-xl);
    padding: 0;
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-lg, var(--shadow-sm));
    max-width: 22rem;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  .panel { padding: 1.5rem; }
  h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg, 1.1rem);
    margin: 0 0 0.5rem;
  }
  p {
    color: var(--color-text-muted);
    margin: 0 0 1.25rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
