<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  const wiz = getContext("setupWizard");

  // Rates and bands as on the Servos tab. A narrow-band servo (760 us
  // centre) needs its own centre, limits and scale, so those are reset only
  // when the band changes; within a band only the rate changes.
  const TYPES = [
    { key: "analog", rate: 50, band: "wide" },
    { key: "digital", rate: 333, band: "wide" },
    { key: "narrow", rate: 560, band: "narrow" },
  ];
  const BANDS = {
    wide: { mid: 1500, min: -700, max: 700, scale: 500 },
    narrow: { mid: 760, min: -350, max: 350, scale: 250 },
  };

  function bandOf(config) {
    return config.mid > 860 ? "wide" : "narrow";
  }

  function currentType() {
    const first = wiz.surfaces[0];
    if (!first) return null;
    const config = FC.SERVO_CONFIG[first.servo];
    return (
      TYPES.find((t) => t.rate === config.rate && t.band === bandOf(config))
        ?.key ?? null
    );
  }

  let selected = $state(currentType());
  let applied = $state(false);

  function apply() {
    const type = TYPES.find((t) => t.key === selected);
    if (!type) return;
    for (const surface of wiz.surfaces) {
      const config = FC.SERVO_CONFIG[surface.servo];
      config.rate = type.rate;
      if (bandOf(config) !== type.band) {
        const band = BANDS[type.band];
        config.mid = band.mid;
        config.min = band.min;
        config.max = band.max;
        config.rneg = band.scale;
        config.rpos = band.scale;
      }
      wiz.sendServo(surface.servo);
    }
    applied = true;
  }
</script>

<p>{$i18n.t("setupWizardServoTypeIntro")}</p>

<fieldset class="types">
  {#each TYPES as type (type.key)}
    <label>
      <input
        type="radio"
        name="servo-type"
        value={type.key}
        bind:group={selected}
      />
      <span>
        <strong>{$i18n.t(`setupWizardServoType_${type.key}`)}</strong>
        <span class="muted"
          >{$i18n.t(`setupWizardServoTypeHelp_${type.key}`)}</span
        >
      </span>
    </label>
  {/each}
</fieldset>

<p class="muted">{$i18n.t("setupWizardServoTypeAllSurfaces")}</p>

<div class="actions">
  <button
    class="btn"
    disabled={!selected || wiz.surfaces.length === 0}
    onclick={apply}
  >
    {$i18n.t("setupWizardApply")}
  </button>
  {#if applied}
    <span>{$i18n.t("setupWizardRebootNeeded")}</span>
    <button class="btn primary" onclick={wiz.saveAndReboot}>
      {$i18n.t("buttonSaveReboot")}
    </button>
  {/if}
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .types {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: none;
    margin: 0;
    padding: 0;

    label {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    label > span {
      display: flex;
      flex-direction: column;
    }
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
</style>
