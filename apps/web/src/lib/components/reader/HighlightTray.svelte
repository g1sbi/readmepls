<script lang="ts">
  import type { HighlightColor } from "@readmepls/types";
  import HighlightPicker from "./HighlightPicker.svelte";

  let {
    onpick,
    oncancel,
  }: {
    onpick: (color: HighlightColor, note: string) => void;
    oncancel: () => void;
  } = $props();
</script>

<!-- Takes the control bar's place at the bottom while a selection stands. -->
<div class="tray" role="dialog" aria-label="Add highlight">
  <HighlightPicker label="Highlight" size="tray" {onpick} onclose={oncancel} />
</div>

<style>
  .tray {
    position: fixed;
    left: var(--space-3);
    right: var(--space-3);
    bottom: calc(env(safe-area-inset-bottom) + var(--space-4));
    z-index: 40;
    background: var(--color-surface-raised);
    border-radius: 24px;
    padding: var(--space-2);
    box-shadow:
      0 0 0 1px var(--color-hairline),
      var(--shadow-xl);
    animation: tray-up var(--dur-slow) var(--ease-out) both;
  }
  @keyframes tray-up {
    from {
      transform: translateY(120%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tray {
      animation: none;
    }
  }
</style>
