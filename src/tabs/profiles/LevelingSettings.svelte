<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
</script>

<Section label="profilesLevelingSettings">
  <SubSection label="profilesAcroTrainerGroup">
    <Field id="acro-trainer-gain" label="profilesAcroTrainerGain">
      {#snippet tooltip()}
        {$i18n.t("profilesAcroTrainerGainHelp")}
      {/snippet}
      <NumberInput
        id="acro-trainer-gain"
        min="25"
        max="255"
        bind:value={FC.PID_PROFILE.acroTrainerGain}
      />
    </Field>
    <Field id="acro-trainer-limit" label="profilesAcroTrainerLimit">
      {#snippet tooltip()}
        {$i18n.t("profilesAcroTrainerLimitHelp")}
      {/snippet}
      <NumberInput
        id="acro-trainer-limit"
        min="10"
        max="80"
        bind:value={FC.PID_PROFILE.acroTrainerLimit}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesAngleHorizonGroup">
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
    <Field id="horizon-mode-gain" label="profilesHorizonModeGain">
      {#snippet tooltip()}
        {$i18n.t("profilesHorizonModeGainHelp")}
      {/snippet}
      <NumberInput
        id="horizon-mode-gain"
        min="0"
        max="200"
        bind:value={FC.PID_PROFILE.horizonLevelStrength}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesAutoHoverGroup">
    <Field id="auto-hover-gain" label="profilesAutoHoverGain">
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverGainHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-gain"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.autoHoverGain}
      />
    </Field>
    <Field id="auto-hover-max-angle" label="profilesAutoHoverMaxAngle">
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverMaxAngleHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-max-angle"
        min="0"
        max="90"
        bind:value={FC.PID_PROFILE.autoHoverMaxAngle}
      />
    </Field>
    <Field id="auto-hover-max-rate" label="profilesAutoHoverMaxRate">
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverMaxRateHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-max-rate"
        min="0"
        max="1800"
        bind:value={FC.PID_PROFILE.autoHoverMaxRate}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesAttHoldGroup">
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
