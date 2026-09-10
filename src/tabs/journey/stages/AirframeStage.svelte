<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { Mixer } from "@/js/Mixer.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import Section from "@/components/Section.svelte";
  import AirframeCanvas from "@/components/AirframeCanvas.svelte";
  import ModelTypePicker from "@/tabs/mixer/ModelTypePicker.svelte";

  import StageNote from "../StageNote.svelte";
  import { openTab } from "../journey_state.svelte.js";

  // Stage 2 · Airframe. Embeds the model type picker from the Mixer tab and
  // shows the airframe canvas driven by the derived profile.
  let { onChanged } = $props();

  let profile = $derived(getProfile());
  let saving = $state(false);
  let initial = $state(null);

  $effect(() => {
    if (initial === null && FC.MIXER_RULES.length > 0) {
      initial = JSON.stringify(
        $state.snapshot({ t: FC.MIXER_CONFIG.model_type, r: FC.MIXER_RULES }),
      );
    }
  });

  let dirty = $derived(
    initial !== null &&
      initial !==
        JSON.stringify(
          $state.snapshot({ t: FC.MIXER_CONFIG.model_type, r: FC.MIXER_RULES }),
        ),
  );

  async function save() {
    saving = true;
    while (FC.MIXER_RULES.length < Mixer.RULE_COUNT)
      FC.MIXER_RULES.push(Mixer.nullRule());
    await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    initial = null;
    saving = false;
    onChanged?.();
  }

  const AXES = ["roll", "pitch", "yaw", "throttle"];
</script>

<Section label="journeyAirframe.typeTitle">
  <div class="pad">
    <ModelTypePicker />
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyAirframe.typeHelp")}
    </StageNote>
    <div class="actions">
      <button class="btn primary" disabled={!dirty || saving} onclick={save}
        >{$i18n.t("buttonSave")}</button
      >
      <button class="btn" onclick={() => openTab("mixer")}
        >{$i18n.t("journeyAirframe.openMixer")}</button
      >
    </div>
  </div>
</Section>

<Section label="journeyAirframe.canvasTitle">
  <div class="pad">
    <AirframeCanvas {profile} live={true} />
  </div>
</Section>

<Section label="journeyAirframe.axesTitle">
  <table class="axes">
    <thead>
      <tr>
        <th>{$i18n.t("journeyAirframe.axis")}</th>
        <th>{$i18n.t("journeyAirframe.outputs")}</th>
      </tr>
    </thead>
    <tbody>
      {#each AXES as axis (axis)}
        {@const outs = profile.outputs.filter((o) => o.axes.includes(axis))}
        <tr class:missing={outs.length === 0}>
          <td>{$i18n.t(`journeyAxis.${axis}`)}</td>
          <td>
            {#if outs.length === 0}
              <span class="muted">{$i18n.t("journeyAirframe.noOutput")}</span>
            {:else}
              {outs
                .map((o) => `${o.label}${o.signs[axis] < 0 ? " (−)" : ""}`)
                .join(", ")}
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</Section>

<style lang="scss">
  .pad {
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }

  .axes {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;

    th,
    td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px dotted var(--color-border);
    }

    th {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
    }
  }

  .missing td {
    color: var(--color-status-bad);
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
