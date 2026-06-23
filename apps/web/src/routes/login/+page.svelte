<script lang="ts">
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { validateCredentials } from "$lib/auth/validate.js";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  const pb = browserPb();
  let email = $state("");
  let password = $state("");
  let mode = $state<"signin" | "signup">("signin");
  let err = $state("");

  async function submit() {
    err = validateCredentials(email, password) ?? "";
    if (err) return;
    try {
      if (mode === "signup") {
        await pb.collection("users").create({
          email, password, passwordConfirm: password, tier: "free", monthly_quota_used: 0,
        });
      }
      await pb.collection("users").authWithPassword(email, password);
      await goto("/");
    } catch {
      err = mode === "signup" ? "Could not create account." : "Invalid email or password.";
    }
  }
</script>

<main>
  <div class="card">
    <h1>readme<span>pls</span></h1>
    <p class="tag">save any link. actually read it. pls.</p>
    <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <Input bind:value={email} type="email" placeholder="email" />
      <Input bind:value={password} type="password" placeholder="password" />
      <Button type="submit" variant="accent">{mode === "signin" ? "sign in" : "sign up"}</Button>
      {#if err}<p role="alert" class="err">{err}</p>{/if}
    </form>
    <button class="toggle" type="button" onclick={() => (mode = mode === "signin" ? "signup" : "signin")}>
      {mode === "signin" ? "need an account? sign up" : "have an account? sign in"}
    </button>
  </div>
</main>

<style>
  main { min-height: 100dvh; display: grid; place-items: center; background: var(--color-bg-gradient); padding: 1.5rem; }
  .card {
    position: relative; width: 100%; max-width: 380px; padding: 2rem 1.75rem;
    background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  }
  .card::after {
    content: ""; position: absolute; top: 0; right: 0; width: 40px; height: 40px;
    background: var(--color-fold); clip-path: polygon(100% 0, 0 0, 100% 100%);
    border-top-right-radius: var(--radius-xl);
  }
  h1 { font-family: var(--font-display); font-size: 1.8rem; margin: 0; color: var(--color-text); }
  h1 span { color: var(--color-accent); }
  .tag { font-family: var(--font-display); color: var(--color-text-muted); margin: 0.25rem 0 1.5rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  .err { color: var(--color-danger); font-family: var(--font-display); font-size: 0.9rem; margin: 0; }
  .toggle { margin-top: 1rem; background: none; border: none; color: var(--color-accent); font-family: var(--font-display); cursor: pointer; padding: 0; }
  .toggle:hover { color: var(--color-accent-hover); }
  .toggle:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
</style>
