<script lang="ts">
  import Input from "./input.svelte";
  let { value = $bindable("") }: { value?: string } = $props();
</script>

<Input bind:value aria-label="field" />
<output data-testid="out">{value}</output>
