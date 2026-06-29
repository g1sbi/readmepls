<script lang="ts">
  import { Dialog } from "bits-ui";
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

  // Controlled: the parent owns `open`. Any Bits-initiated close (Escape,
  // overlay click) requests `open=false` via onOpenChange — route it to onCancel
  // so the parent flips its state, exactly as the old hand-rolled handlers did.
  function onOpenChange(next: boolean) {
    if (!next) onCancel();
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="confirm-dialog__overlay" />
    <Dialog.Content class="confirm-dialog__panel">
      <Dialog.Title class="confirm-dialog__title">{title}</Dialog.Title>
      <Dialog.Description class="confirm-dialog__message">{message}</Dialog.Description>
      <div class="confirm-dialog__actions">
        <Button onclick={onCancel}>cancel</Button>
        <Button variant="accent" onclick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Bits UI applies these classes to its portaled parts; styling is unchanged
     from the previous native-<dialog> version. */
  :global(.confirm-dialog__overlay) {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.4);
    z-index: var(--z-modal, 100);
  }
  :global(.confirm-dialog__panel) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    max-width: 22rem;
    padding: 1.5rem;
    border: none;
    border-radius: var(--radius-xl);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-lg, var(--shadow-sm));
    z-index: var(--z-modal, 100);
  }
  :global(.confirm-dialog__title) {
    font-family: var(--font-display);
    font-size: var(--text-lg, 1.1rem);
    margin: 0 0 0.5rem;
  }
  :global(.confirm-dialog__message) {
    color: var(--color-text-muted);
    margin: 0 0 1.25rem;
  }
  :global(.confirm-dialog__actions) {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
