<script lang="ts">
  import * as Sheet from "./index.js";
  let {
    side = "right",
    onClose = () => {},
  }: { side?: "top" | "right" | "bottom" | "left"; onClose?: () => void } =
    $props();
</script>

<Sheet.Root open onOpenChange={(next) => !next && onClose()}>
  <Sheet.Content {side}>
    <Sheet.Header>
      <Sheet.Title>Filters</Sheet.Title>
    </Sheet.Header>
  </Sheet.Content>
</Sheet.Root>
