<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { GainCurve } from "@/js/GainCurve.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";

  // Expert Mode panel assigning a gain curve (from the shared pool on the
  // Curves tab) to each axis's Flight Feel Gain. Kept out of the Flight Feel
  // table because curves are an advanced shaping tool; Flight Feel shows a
  // CURVE badge on any Gain a curve is shaping. `profile` is FC.PID_PROFILE
  // or FC.TV_PID_PROFILE; `throttle` adds the Throttle row (main loop only),
  // and the GPS Speed curve and range, on one line, when the GPS feature is on.
  let { profile, throttle = false, idPrefix = "" } = $props();

  let showSpeed = $derived(
    throttle && profile.hasFwSpa && FC.FEATURE_CONFIG.features.isEnabled("GPS"),
  );

  const AXES = [
    { key: "gainCurveRoll", label: "axisROLL" },
    { key: "gainCurvePitch", label: "axisPITCH" },
    { key: "gainCurveYaw", label: "axisYAW" },
  ];

  let rows = $derived([
    ...AXES,
    ...(throttle
      ? [{ key: "fwTpaCurve", label: "controlAxisThrottle", uppercase: true }]
      : []),
  ]);

  let options = $derived([
    { value: 0, label: $i18n.t("mixerCurveNone") },
    ...Array.from({ length: GainCurve.CURVE_COUNT }, (_, i) => ({
      value: i + 1,
      label: $i18n.t("mixerCurveLabel", { 1: i + 1 }),
    })),
  ]);
</script>

<Section label="profilesGainCurvesGroup" summary="profilesGainCurveHelp">
  {#each rows as row (row.key)}
    <!-- Throttle in capitals, like Roll, Pitch and Yaw -->
    {#snippet upperLabel()}
      {$i18n.t(row.label).toUpperCase()}
    {/snippet}
    <Field
      id="{idPrefix}gain-curve-{row.key}"
      label={row.uppercase ? upperLabel : row.label}
    >
      <Select
        id="{idPrefix}gain-curve-{row.key}"
        {options}
        bind:value={profile[row.key]}
      />
    </Field>
  {/each}
  <!-- GPS Speed on one line: the curve's range (km/h at its right edge),
       then the curve, so the selects stay lined up with the rows above. -->
  {#if showSpeed}
    {#snippet speedLabel()}
      {$i18n.t("controlAxisSpeed").toUpperCase()}
    {/snippet}
    <Field id="{idPrefix}gain-curve-speed" label={speedLabel}>
      {#snippet tooltip()}
        {$i18n.t("profilesFwSpaCurveTooltip")}
      {/snippet}
      <div class="speed-controls">
        <NumberInput
          id="{idPrefix}gain-curve-speed-max"
          min="10"
          max="600"
          bind:value={profile.fwSpaSpeedMax}
        />
        <span class="unit">km/h</span>
        <Select
          id="{idPrefix}gain-curve-speed"
          {options}
          bind:value={profile.fwSpaCurve}
        />
      </div>
    </Field>
  {/if}
</Section>

<style lang="scss">
  .speed-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .unit {
    color: var(--color-text-soft);
    font-size: 0.8rem;
  }
</style>
