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
  <h1>readmepls</h1>
  <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <Input bind:value={email} type="email" placeholder="email" />
    <Input bind:value={password} type="password" placeholder="password" />
    <Button type="submit">{mode === "signin" ? "Sign in" : "Sign up"}</Button>
    {#if err}<p role="alert">{err}</p>{/if}
  </form>
  <Button onclick={() => (mode = mode === "signin" ? "signup" : "signin")}>
    {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
  </Button>
</main>
