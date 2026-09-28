<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  let { configuredModes } = $props();
</script>

{#snippet angleLimits()}
  {#if FC.PID_PROFILE.hasAxisLimits}
    <Field id="angle-roll-limit" label="profilesRollAngleLimit">
      <NumberInput
        id="angle-roll-limit"
        min="10"
        max="90"
        bind:value={FC.PID_PROFILE.angleRollLimit}
      />
    </Field>
    <Field id="angle-pitch-limit" label="profilesPitchAngleLimit">
      <NumberInput
        id="angle-pitch-limit"
        min="10"
        max="75"
        bind:value={FC.PID_PROFILE.anglePitchLimit}
      />
    </Field>
  {:else}
    <Field id="angle-mode-limit" label="profilesAngleModeLimit">
      {#snippet tooltip()}
        {$i18n.t("profilesAngleModeLimitHelp")}
      {/snippet}
      <NumberInput
        id="angle-mode-limit"
        min="10"
        max="90"
        bind:value={FC.PID_PROFILE.levelAngleLimit}
      />
    </Field>
  {/if}
{/snippet}

<Section label="profilesAngleGroup">
  <SubSection>
    <Field id="angle-mode-gain" label="profilesAngleModeGain">
      {#snippet tooltip()}
        {$i18n.t("profilesAngleModeGainHelp")}
      {/snippet}
      <NumberInput
        id="angle-mode-gain"
        min="0"
        max="200"
        bind:value={FC.PID_PROFILE.levelAngleStrength}
      />
    </Field>
    {@render angleLimits()}
  </SubSection>
</Section>

{#if configuredModes.has("ATT HOLD")}
  <Section label="profilesAttHoldGroup">
    <SubSection>
      <Field id="att-hold-gain" label="profilesAttHoldGain">
        {#snippet tooltip()}
          {$i18n.t("profilesAttHoldGainHelp")}
        {/snippet}
        <NumberInput
          id="att-hold-gain"
          min="0"
          max="250"
          bind:value={FC.PID_PROFILE.attHoldGain}
        />
      </Field>
      <Field id="att-hold-deadband" label="profilesAttHoldDeadband">
        {#snippet tooltip()}
          {$i18n.t("profilesAttHoldDeadbandHelp")}
        {/snippet}
        <NumberInput
          id="att-hold-deadband"
          min="0"
          max="100"
          bind:value={FC.PID_PROFILE.attHoldDeadband}
        />
      </Field>
      <Field id="att-hold-max-rate" label="profilesAttHoldMaxRate">
        {#snippet tooltip()}
          {$i18n.t("profilesAttHoldMaxRateHelp")}
        {/snippet}
        <NumberInput
          id="att-hold-max-rate"
          min="0"
          max="1800"
          bind:value={FC.PID_PROFILE.attHoldMaxRate}
        />
      </Field>
    </SubSection>
  </Section>
{/if}
