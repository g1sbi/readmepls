<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import Button from "$lib/components/ui/Button.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const pb = browserPb();
  // idle -> initial "check your email"; confirming/verified/error drive the token path.
  let status = $state<"idle" | "confirming" | "verified" | "sent" | "error">("idle");
  let msg = $state("");

  onMount(async () => {
    if (!data.token) return;
    status = "confirming";
    try {
      await pb.collection("users").confirmVerification(data.token);
      status = "verified";
      if (pb.authStore.isValid) {
        try {
          await pb.collection("users").authRefresh();
        } catch {
          // stale session is harmless; fall through to home, guard re-checks.
        }
        await goto("/");
      }
    } catch {
      status = "error";
      msg = "that link is invalid or has expired.";
    }
  });

  async function resend() {
    // PocketBase's AuthModel is untyped ({ [key: string]: any } | null); `email` is
    // a known field on the users auth record, so the cast is safe here.
    const email = pb.authStore.model?.email as string | undefined;
    if (!email) {
      await goto("/login");
      return;
    }
    try {
      await pb.collection("users").requestVerification(email);
      status = "sent";
      msg = "";
    } catch {
      status = "error";
      msg = "couldn't send right now. try again in a moment.";
    }
  }

  function logout() {
    pb.authStore.clear();
    goto("/login");
  }
</script>

<main>
  <div class="card">
    <h1>readme<span>pls</span></h1>

    {#if status === "confirming"}
      <p class="tag">verifying your email…</p>
    {:else if status === "verified"}
      <p class="tag">email verified.</p>
      <a class="link" href="/login">sign in to continue</a>
    {:else}
      <p class="tag">check your email</p>
      <p class="body">
        we sent a verification link to your inbox. click it to start reading.
      </p>
      {#if status === "sent"}<p class="ok" role="status">sent — check again.</p>{/if}
      {#if status === "error"}<p class="err" role="alert">{msg}</p>{/if}
      <div class="actions">
        <Button variant="accent" onclick={resend}>resend email</Button>
        <button class="link" type="button" onclick={logout}>log out</button>
      </div>
    {/if}
  </div>
</main>

<style>
  main { min-height: 100dvh; display: grid; place-items: center; background: var(--color-bg-gradient); padding: 1.5rem; }
  .card {
    position: relative; width: 100%; max-width: 380px; padding: 2rem 1.75rem;
    background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  }
  h1 { font-family: var(--font-ui); font-size: 1.8rem; margin: 0; color: var(--color-text); }
  h1 span { color: var(--color-accent); }
  .tag { font-family: var(--font-ui); color: var(--color-text-muted); margin: 0.25rem 0 1rem; }
  .body { font-family: var(--font-ui); color: var(--color-text); margin: 0 0 1.25rem; }
  .ok { color: var(--color-text-muted); font-family: var(--font-ui); font-size: 0.9rem; margin: 0 0 0.75rem; }
  .err { color: var(--color-danger); font-family: var(--font-ui); font-size: 0.9rem; margin: 0 0 0.75rem; }
  .actions { display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start; }
  .link {
    background: none; border: none; color: var(--color-accent); font-family: var(--font-ui);
    cursor: pointer; text-decoration: none;
    min-height: 44px; display: inline-flex; align-items: center;
  }
  .link:hover { color: var(--color-accent-hover); }
  .link:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
</style>
