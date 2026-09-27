<script>
  import { i18n } from "@/js/i18n.js";
  import { GainCurve } from "@/js/GainCurve.js";

  import Field from "@/components/Field.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";

  // Expert Mode panel assigning a gain curve (from the shared pool on the
  // Curves tab) to each axis's Flight Feel Gain. Kept out of the Flight Feel
  // table because curves are an advanced shaping tool; Flight Feel shows a
  // CURVE badge on any Gain a curve is shaping. `profile` is FC.PID_PROFILE
  // or FC.TV_PID_PROFILE; `throttle` adds the Throttle row (main loop only).
  let { profile, throttle = false, idPrefix = "" } = $props();

  const AXES = [
    { key: "gainCurveRoll", label: "axisROLL" },
    { key: "gainCurvePitch", label: "axisPITCH" },
    { key: "gainCurveYaw", label: "axisYAW" },
  ];

  let rows = $derived(
    throttle
      ? [...AXES, { key: "fwTpaCurve", label: "controlAxisThrottle" }]
      : AXES,
  );

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
    <Field id="{idPrefix}gain-curve-{row.key}" label={row.label}>
      <Select
        id="{idPrefix}gain-curve-{row.key}"
        {options}
        bind:value={profile[row.key]}
      />
    </Field>
  {/each}
</Section>
