<script lang="ts">
  import { THEME_PREFS, type ThemePref } from "$lib/theme/theme.js";
  import { Button } from "$lib/components/ui/button";
  import { Sun, Moon, Monitor } from "@lucide/svelte";

  // Pref → icon + visible label; the label is also the accessible name.
  const themeOption = {
    light: { icon: Sun, label: "Light" },
    dark: { icon: Moon, label: "Dark" },
    system: { icon: Monitor, label: "Match system" },
  } as const;

  let {
    value,
    onChange,
  }: { value: ThemePref; onChange: (t: ThemePref) => void } = $props();
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label="theme">
  {#each THEME_PREFS as t (t)}
    {@const Icon = themeOption[t].icon}
    <Button
      type="button"
      size="sm"
      variant={value === t ? "default" : "secondary"}
      aria-pressed={value === t}
      onclick={() => onChange(t)}
    >
      <Icon aria-hidden="true" />{themeOption[t].label}
    </Button>
  {/each}
</div>
