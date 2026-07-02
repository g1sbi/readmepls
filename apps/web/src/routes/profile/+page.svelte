<script lang="ts">
  import { page } from "$app/stores";
  import { invalidateAll } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import Button from "$lib/components/ui/Button.svelte";

  const pb = browserPb();

  const tier = $derived(($page.data.tier ?? "standard") as "standard" | "pro");
  const selfHosted = $derived(Boolean($page.data.selfHosted));

  async function setTier(next: "standard" | "pro") {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    await pb.collection("users").update(uid, { tier: next });
    // Refresh the root layout's data so every $page.data.tier consumer
    // (e.g. ArticleCard's AI tag gate) picks up the change immediately.
    await invalidateAll();
  }
</script>

<svelte:head><title>profile</title></svelte:head>

<section class="profile">
  <h1>profile</h1>

  <div class="tier-row">
    <span class="label">plan</span>
    <span class="badge" data-tier={tier}>{tier}</span>
  </div>

  {#if selfHosted}
    <p class="note">this instance's plan is set by this instance's operator, not by you.</p>
  {:else if tier === "standard"}
    <Button variant="accent" onclick={() => setTier("pro")}>go pro</Button>
  {:else}
    <Button onclick={() => setTier("standard")}>back to standard</Button>
  {/if}
</section>

<style>
  .profile {
    max-width: var(--width-narrow);
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }
  h1 {
    font-family: var(--font-ui);
    font-size: var(--text-xl);
    color: var(--color-text);
    margin: 0 0 var(--space-5);
  }
  .tier-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .label {
    font-family: var(--font-ui);
    color: var(--color-text-muted);
  }
  .badge {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 0.2rem 0.7rem;
    border-radius: var(--radius-pill);
    background: var(--color-accent-wash);
    color: var(--color-text);
    text-transform: capitalize;
  }
  .note {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
