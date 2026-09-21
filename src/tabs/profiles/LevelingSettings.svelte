<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
</script>

<Section label="profilesLevelingSettings">
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
    <Field id="auto-hover-roll-deadband" label="profilesAutoHoverRollDeadband">
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverRollDeadbandHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-roll-deadband"
        min="0"
        max="100"
        bind:value={FC.PID_PROFILE.autoHoverRollDeadband}
      />
    </Field>
    <Field
      id="auto-hover-throttle-assist-gain"
      label="profilesAutoHoverThrottleAssistGain"
    >
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverThrottleAssistGainHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-throttle-assist-gain"
        min="0"
        max="100"
        bind:value={FC.PID_PROFILE.autoHoverThrottleAssistGain}
      />
    </Field>
    <Field
      id="auto-hover-throttle-assist-max"
      label="profilesAutoHoverThrottleAssistMax"
    >
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverThrottleAssistMaxHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-throttle-assist-max"
        min="0"
        max="50"
        bind:value={FC.PID_PROFILE.autoHoverThrottleAssistMax}
      />
    </Field>
    <Field
      id="auto-hover-throttle-assist-trigger-ms"
      label="profilesAutoHoverThrottleAssistTriggerMs"
    >
      {#snippet tooltip()}
        {$i18n.t("profilesAutoHoverThrottleAssistTriggerMsHelp")}
      {/snippet}
      <NumberInput
        id="auto-hover-throttle-assist-trigger-ms"
        min="0"
        max="2000"
        bind:value={FC.PID_PROFILE.autoHoverThrottleAssistTriggerMs}
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
