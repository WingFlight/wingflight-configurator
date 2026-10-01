<script>
  import { FC } from "@/js/fc.svelte.js";
  import { defaultPidSlot } from "@/js/virtual_fc.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";

  // Firmware defaults (pg/pid.c), so a changed value stays visible in basic
  // mode. The Virtual FC seeds its profiles from the same values.
  const DEFAULTS = defaultPidSlot().profile;
</script>

<Section label="profilesPidSettings">
  <SubSection label="profilesItermDecayGroup">
    <Field
      expert
      changed={FC.PID_PROFILE.iterm_decay_limit !== DEFAULTS.iterm_decay_limit}
      id="iterm-decay-limit"
      label="profilesItermDecayLimit"
    >
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
      expert
      changed={FC.PID_PROFILE.crossAxisRelaxStrength !==
        DEFAULTS.crossAxisRelaxStrength}
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
      expert
      changed={FC.PID_PROFILE.crossAxisRelaxPitchStrength !==
        DEFAULTS.crossAxisRelaxPitchStrength}
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
    <Field
      expert
      changed={FC.PID_PROFILE.crossAxisRelaxLevel !==
        DEFAULTS.crossAxisRelaxLevel}
      id="cross-axis-relax-level"
      label="profilesCrossAxisRelaxLevel"
    >
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
    <Field
      expert
      changed={FC.PID_PROFILE.crossAxisRelaxCutoff !==
        DEFAULTS.crossAxisRelaxCutoff}
      id="cross-axis-relax-cutoff"
      label="profilesCrossAxisRelaxCutoff"
    >
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

  <SubSection label="profilesItermRelaxLevelGroup">
    <Field
      expert
      changed={FC.PID_PROFILE.itermRelaxLevelRoll !==
        DEFAULTS.itermRelaxLevelRoll}
      id="iterm-relax-level-roll"
      label="profilesItermRelaxLevelRoll"
    >
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
    <Field
      expert
      changed={FC.PID_PROFILE.itermRelaxLevelPitch !==
        DEFAULTS.itermRelaxLevelPitch}
      id="iterm-relax-level-pitch"
      label="profilesItermRelaxLevelPitch"
    >
      <NumberInput
        id="iterm-relax-level-pitch"
        min="10"
        max="250"
        bind:value={FC.PID_PROFILE.itermRelaxLevelPitch}
      />
    </Field>
    <Field
      expert
      changed={FC.PID_PROFILE.itermRelaxLevelYaw !==
        DEFAULTS.itermRelaxLevelYaw}
      id="iterm-relax-level-yaw"
      label="profilesItermRelaxLevelYaw"
    >
      <NumberInput
        id="iterm-relax-level-yaw"
        min="10"
        max="250"
        bind:value={FC.PID_PROFILE.itermRelaxLevelYaw}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesErrorLimit">
    <Field
      expert
      changed={FC.PID_PROFILE.errorLimitRoll !== DEFAULTS.errorLimitRoll}
      id="error-limit-roll"
      label="profilesErrorLimitRoll"
    >
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
    <Field
      expert
      changed={FC.PID_PROFILE.errorLimitPitch !== DEFAULTS.errorLimitPitch}
      id="error-limit-pitch"
      label="profilesErrorLimitPitch"
    >
      <NumberInput
        id="error-limit-pitch"
        min="0"
        max="180"
        bind:value={FC.PID_PROFILE.errorLimitPitch}
      />
    </Field>
    <Field
      expert
      changed={FC.PID_PROFILE.errorLimitYaw !== DEFAULTS.errorLimitYaw}
      id="error-limit-yaw"
      label="profilesErrorLimitYaw"
    >
      <NumberInput
        id="error-limit-yaw"
        min="0"
        max="180"
        bind:value={FC.PID_PROFILE.errorLimitYaw}
      />
    </Field>
  </SubSection>
</Section>
