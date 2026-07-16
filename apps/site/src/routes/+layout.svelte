<script lang="ts">
  import "@fontsource-variable/fredoka";
  import "../app.css";
  import Nav from "$lib/components/Nav.svelte";

  let { children } = $props();
</script>

<Nav />
{@render children()}
