<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import ModelTypePicker from "@/tabs/mixer/ModelTypePicker.svelte";

  const wiz = getContext("setupWizard");

  // The picker edits FC.MIXER_CONFIG.model_type and FC.MIXER_RULES in place
  // without sending them, the same as on the Mixer tab. Compare against what
  // was loaded so Save knows whether there is anything to send.
  const initial = JSON.stringify(
    $state.snapshot({
      type: FC.MIXER_CONFIG.model_type,
      rules: FC.MIXER_RULES,
    }),
  );

  let changed = $derived(
    JSON.stringify(
      $state.snapshot({
        type: FC.MIXER_CONFIG.model_type,
        rules: FC.MIXER_RULES,
      }),
    ) !== initial,
  );

  $effect(() => {
    if (changed) wiz.markChanged();
  });

  wiz.setCommit(async () => {
    if (!changed) return;
    await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
  });
</script>

<p>{$i18n.t("setupWizardAirframeIntro")}</p>

<ModelTypePicker />

<div class="surfaces">
  <strong>{$i18n.t("setupWizardAirframeSurfaces")}</strong>
  {#if wiz.surfaces.length === 0}
    <span class="muted">{$i18n.t("setupWizardAirframeNoSurfaces")}</span>
  {:else}
    <ul>
      {#each wiz.surfaces as surface (surface.servo)}
        <li>{wiz.surfaceLabel(surface)}</li>
      {/each}
    </ul>
  {/if}
  <span class="muted">{$i18n.t("setupWizardAirframeCustomNote")}</span>
</div>

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .surfaces {
    display: flex;
    flex-direction: column;
    gap: 4px;

    ul {
      margin: 0;
      padding-left: 20px;
    }
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
