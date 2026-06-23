<script lang="ts">
  let {
    value = $bindable(""),
    placeholder = "",
    type = "text",
    oninput,
  }: {
    value?: string;
    placeholder?: string;
    type?: string;
    oninput?: (e: Event) => void;
  } = $props();
</script>

<input {type} {placeholder} bind:value {oninput} />
