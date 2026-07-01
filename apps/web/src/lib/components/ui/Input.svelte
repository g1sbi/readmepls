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

<style>
  input {
    font-family: var(--font-ui);
    font-size: 1rem;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 0.55rem 0.8rem;
    width: 100%;
  }
  input::placeholder { color: var(--color-text-subtle); }
  input:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; border-color: var(--color-border-strong); }
</style>
