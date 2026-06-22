<script lang="ts">
  // global design system — load order: fonts, then tokens that reference them.
  import "$lib/styles/fonts.css";
  import "$lib/styles/tokens.css";

  let { children } = $props();
</script>

{@render children()}
