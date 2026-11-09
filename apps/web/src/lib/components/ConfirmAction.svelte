<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";

  let {
    open,
    title,
    message,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  // Controlled: the parent owns `open`. Escape and overlay click request
  // open=false; route that to onCancel so it never reads as a confirm.
  function onOpenChange(next: boolean) {
    if (!next) onCancel();
  }
</script>

<AlertDialog.Root {open} {onOpenChange}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description>{message}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{cancelLabel}</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={onConfirm}
        >{confirmLabel}</AlertDialog.Action
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
