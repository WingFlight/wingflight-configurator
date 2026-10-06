<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
</script>

<Section label="profilesPidSettings">
  <SubSection label="profilesItermDecayGroup">
    <Field id="iterm-decay-limit" label="profilesItermDecayLimit">
      {#snippet tooltip()}
        {$i18n.t("profilesItermDecayLimitHelp")}
      {/snippet}
      <NumberInput
        id="iterm-decay-limit"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.iterm_decay_limit}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesCrossAxisRelaxGroup">
    <Field
      id="cross-axis-relax-strength"
      label="profilesCrossAxisRelaxStrength"
    >
      {#snippet tooltip()}
        {$i18n.t("profilesCrossAxisRelaxHelp")}
      {/snippet}
      <NumberInput
        id="cross-axis-relax-strength"
        min="0"
        max="100"
        bind:value={FC.PID_PROFILE.crossAxisRelaxStrength}
      />
    </Field>
    <Field
      id="cross-axis-relax-pitch-strength"
      label="profilesCrossAxisRelaxPitchStrength"
    >
      {#snippet tooltip()}
        {$i18n.t("profilesCrossAxisRelaxPitchHelp")}
      {/snippet}
      <NumberInput
        id="cross-axis-relax-pitch-strength"
        min="0"
        max="100"
        bind:value={FC.PID_PROFILE.crossAxisRelaxPitchStrength}
      />
    </Field>
    <Field id="cross-axis-relax-level" label="profilesCrossAxisRelaxLevel">
      {#snippet tooltip()}
        {$i18n.t("profilesCrossAxisRelaxLevelHelp")}
      {/snippet}
      <NumberInput
        id="cross-axis-relax-level"
        min="10"
        max="250"
        bind:value={FC.PID_PROFILE.crossAxisRelaxLevel}
      />
    </Field>
    <Field id="cross-axis-relax-cutoff" label="profilesCrossAxisRelaxCutoff">
      {#snippet tooltip()}
        {$i18n.t("profilesCrossAxisRelaxCutoffHelp")}
      {/snippet}
      <NumberInput
        id="cross-axis-relax-cutoff"
        min="1"
        max="100"
        bind:value={FC.PID_PROFILE.crossAxisRelaxCutoff}
      />
    </Field>
  </SubSection>

  {#if FC.PID_PROFILE.hasSnapRelax}
    <SubSection label="profilesSnapRelaxGroup">
      <Field
        id="snap-relax-strength"
        label="profilesSnapRelaxStrength"
        unit="%"
      >
        {#snippet tooltip()}
          {$i18n.t("profilesSnapRelaxStrengthHelp")}
        {/snippet}
        <NumberInput
          id="snap-relax-strength"
          min="0"
          max="100"
          bind:value={FC.PID_PROFILE.snapRelaxStrength}
        />
      </Field>
      <Field
        id="snap-relax-threshold"
        label="profilesSnapRelaxThreshold"
        unit="%"
      >
        {#snippet tooltip()}
          {$i18n.t("profilesSnapRelaxThresholdHelp")}
        {/snippet}
        <NumberInput
          id="snap-relax-threshold"
          min="20"
          max="100"
          bind:value={FC.PID_PROFILE.snapRelaxThreshold}
        />
      </Field>
      <Field id="snap-relax-window" label="profilesSnapRelaxWindow" unit="ms">
        {#snippet tooltip()}
          {$i18n.t("profilesSnapRelaxWindowHelp")}
        {/snippet}
        <NumberInput
          id="snap-relax-window"
          min="0"
          max="1000"
          step="10"
          bind:value={FC.PID_PROFILE.snapRelaxWindow}
        />
      </Field>
      <Field id="snap-relax-hold" label="profilesSnapRelaxHold" unit="ms">
        {#snippet tooltip()}
          {$i18n.t("profilesSnapRelaxHoldHelp")}
        {/snippet}
        <NumberInput
          id="snap-relax-hold"
          min="0"
          max="1000"
          step="10"
          bind:value={FC.PID_PROFILE.snapRelaxHold}
        />
      </Field>
    </SubSection>
  {/if}

  {#if FC.PID_PROFILE.hasPropHang}
    <SubSection label="profilesPropHangGroup">
      <Field id="prop-hang-strength" label="profilesPropHangStrength" unit="%">
        {#snippet tooltip()}
          {$i18n.t("profilesPropHangStrengthHelp")}
        {/snippet}
        <NumberInput
          id="prop-hang-strength"
          min="0"
          max="100"
          bind:value={FC.PID_PROFILE.propHangStrength}
        />
      </Field>
      <Field id="prop-hang-angle" label="profilesPropHangAngle" unit="°">
        {#snippet tooltip()}
          {$i18n.t("profilesPropHangAngleHelp")}
        {/snippet}
        <NumberInput
          id="prop-hang-angle"
          min="5"
          max="45"
          bind:value={FC.PID_PROFILE.propHangAngle}
        />
      </Field>
      <Field id="prop-hang-fade" label="profilesPropHangFade" unit="ms">
        {#snippet tooltip()}
          {$i18n.t("profilesPropHangFadeHelp")}
        {/snippet}
        <NumberInput
          id="prop-hang-fade"
          min="0"
          max="2000"
          step="50"
          bind:value={FC.PID_PROFILE.propHangFade}
        />
      </Field>
    </SubSection>
  {/if}

  {#if FC.PID_PROFILE.hasRollYaw}
    <SubSection label="profilesRollYawGroup">
      <Field id="roll-yaw-coupling" label="profilesRollYawCoupling" unit="%">
        {#snippet tooltip()}
          {$i18n.t("profilesRollYawCouplingHelp")}
        {/snippet}
        <NumberInput
          id="roll-yaw-coupling"
          min="-100"
          max="100"
          bind:value={FC.PID_PROFILE.rollYawCoupling}
        />
      </Field>
    </SubSection>
  {/if}

  <SubSection label="profilesItermRelaxLevelGroup">
    <Field id="iterm-relax-level-roll" label="profilesItermRelaxLevelRoll">
      {#snippet tooltip()}
        {$i18n.t("profilesItermRelaxLevelHelp")}
      {/snippet}
      <NumberInput
        id="iterm-relax-level-roll"
        min="10"
        max="250"
        bind:value={FC.PID_PROFILE.itermRelaxLevelRoll}
      />
    </Field>
    <Field id="iterm-relax-level-pitch" label="profilesItermRelaxLevelPitch">
      <NumberInput
        id="iterm-relax-level-pitch"
        min="10"
        max="250"
        bind:value={FC.PID_PROFILE.itermRelaxLevelPitch}
      />
    </Field>
    <Field id="iterm-relax-level-yaw" label="profilesItermRelaxLevelYaw">
      <NumberInput
        id="iterm-relax-level-yaw"
        min="10"
        max="250"
        bind:value={FC.PID_PROFILE.itermRelaxLevelYaw}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesErrorLimit">
    <Field id="error-limit-roll" label="profilesErrorLimitRoll">
      {#snippet tooltip()}
        {$i18n.t("profilesErrorLimitHelp")}
      {/snippet}
      <NumberInput
        id="error-limit-roll"
        min="0"
        max="180"
        bind:value={FC.PID_PROFILE.errorLimitRoll}
      />
    </Field>
    <Field id="error-limit-pitch" label="profilesErrorLimitPitch">
      <NumberInput
        id="error-limit-pitch"
        min="0"
        max="180"
        bind:value={FC.PID_PROFILE.errorLimitPitch}
      />
    </Field>
    <Field id="error-limit-yaw" label="profilesErrorLimitYaw">
      <NumberInput
        id="error-limit-yaw"
        min="0"
        max="180"
        bind:value={FC.PID_PROFILE.errorLimitYaw}
      />
    </Field>
  </SubSection>
</Section>
