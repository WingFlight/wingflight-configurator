<script>
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { GainCurve } from "@/js/GainCurve.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";

  let gainCurveOptions = $derived([
    { value: 0, label: $i18n.t("mixerCurveNone") },
    ...Array.from({ length: GainCurve.CURVE_COUNT }, (_, i) => ({
      value: i + 1,
      label: $i18n.t("mixerCurveLabel", { 1: i + 1 }),
    })),
  ]);

  // itermRelaxType is 0 when disabled; remember the last non-zero type
  // locally so re-enabling the switch restores the previous RP/RPY choice
  // instead of always resetting to RP.
  let itermRelaxType = $state(
    FC.PID_PROFILE.itermRelaxType > 0 ? FC.PID_PROFILE.itermRelaxType : 1,
  );
  let itermRelaxEnabled = $derived(FC.PID_PROFILE.itermRelaxType > 0);

  function toggleItermRelax(enabled) {
    FC.PID_PROFILE.itermRelaxType = enabled ? itermRelaxType : 0;
  }

  function changeItermRelaxType(value) {
    itermRelaxType = value;
    if (itermRelaxEnabled) {
      FC.PID_PROFILE.itermRelaxType = value;
    }
  }
</script>

<Section label="profilesPidSettings">
  {#if CONFIGURATOR.expertMode}
    <SubSection>
      <Field id="iterm-decay-time" label="profilesItermDecayTime">
        {#snippet tooltip()}
          {$i18n.t("profilesItermDecayTimeHelp")}
        {/snippet}
        <NumberInput
          id="iterm-decay-time"
          min="0"
          max="25"
          step="0.1"
          bind:value={
            () => FC.PID_PROFILE.iterm_decay_time / 10,
            (v) => (FC.PID_PROFILE.iterm_decay_time = Math.round(v * 10))
          }
        />
      </Field>
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

    <SubSection>
      <Field id="fw-tpa-gain" label="profilesFwTpaGainLabel">
        {#snippet tooltip()}
          {$i18n.t("profilesFwTpaGainHelp")}
        {/snippet}
        <NumberInput
          id="fw-tpa-gain"
          min="25"
          max="200"
          bind:value={FC.PID_PROFILE.fwTpaGain}
        />
      </Field>
      <Field id="fw-tpa-curve" label="profilesFwTpaCurveLabel">
        {#snippet tooltip()}
          {$i18n.t("profilesFwTpaCurveHelp")}
        {/snippet}
        <Select
          id="fw-tpa-curve"
          options={gainCurveOptions}
          bind:value={FC.PID_PROFILE.fwTpaCurve}
        />
      </Field>
    </SubSection>
  {/if}

  <SubSection>
    <Field id="master-gain-roll" label="profilesMasterGainRoll">
      {#snippet tooltip()}
        {$i18n.t("profilesMasterGainHelp")}
      {/snippet}
      <NumberInput
        id="master-gain-roll"
        min="25"
        max="200"
        bind:value={FC.PID_PROFILE.masterGainRoll}
      />
    </Field>
    {#if CONFIGURATOR.expertMode}
      <Field id="gain-curve-roll" label="profilesGainCurveLabel">
        {#snippet tooltip()}
          {$i18n.t("profilesGainCurveHelp")}
        {/snippet}
        <Select
          id="gain-curve-roll"
          options={gainCurveOptions}
          bind:value={FC.PID_PROFILE.gainCurveRoll}
        />
      </Field>
    {/if}

    <Field id="master-gain-pitch" label="profilesMasterGainPitch">
      <NumberInput
        id="master-gain-pitch"
        min="25"
        max="200"
        bind:value={FC.PID_PROFILE.masterGainPitch}
      />
    </Field>
    {#if CONFIGURATOR.expertMode}
      <Field id="gain-curve-pitch" label="profilesGainCurveLabel">
        <Select
          id="gain-curve-pitch"
          options={gainCurveOptions}
          bind:value={FC.PID_PROFILE.gainCurvePitch}
        />
      </Field>
    {/if}

    <Field id="master-gain-yaw" label="profilesMasterGainYaw">
      <NumberInput
        id="master-gain-yaw"
        min="25"
        max="200"
        bind:value={FC.PID_PROFILE.masterGainYaw}
      />
    </Field>
    {#if CONFIGURATOR.expertMode}
      <Field id="gain-curve-yaw" label="profilesGainCurveLabel">
        <Select
          id="gain-curve-yaw"
          options={gainCurveOptions}
          bind:value={FC.PID_PROFILE.gainCurveYaw}
        />
      </Field>
    {/if}
  </SubSection>

  {#if CONFIGURATOR.expertMode}
    <SubSection>
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

    <SubSection>
      <Field id="iterm-relax" label="profilesItermRelax">
        {#snippet tooltip()}
          {$i18n.t("profilesItermRelaxHelp")}
        {/snippet}
        <Switch
          id="iterm-relax"
          bind:checked={() => itermRelaxEnabled, toggleItermRelax}
        />
      </Field>
      {#if itermRelaxEnabled}
        <SubSection>
          <Field id="iterm-relax-type" label="profilesItermRelaxType">
            {#snippet tooltip()}
              {$i18n.t("profilesItermRelaxTypeHelp")}
            {/snippet}
            <Select
              id="iterm-relax-type"
              options={[
                { value: 1, label: $i18n.t("profilesItermRelaxTypeOptionRP") },
                { value: 2, label: $i18n.t("profilesItermRelaxTypeOptionRPY") },
              ]}
              bind:value={() => itermRelaxType, changeItermRelaxType}
            />
          </Field>
          <Field
            id="iterm-relax-cutoff-roll"
            label="profilesItermRelaxCutoffRoll"
          >
            {#snippet tooltip()}
              {$i18n.t("profilesItermRelaxCutoffHelp")}
            {/snippet}
            <NumberInput
              id="iterm-relax-cutoff-roll"
              min="1"
              max="100"
              bind:value={FC.PID_PROFILE.itermRelaxCutoffRoll}
            />
          </Field>
          <Field
            id="iterm-relax-cutoff-pitch"
            label="profilesItermRelaxCutoffPitch"
          >
            <NumberInput
              id="iterm-relax-cutoff-pitch"
              min="1"
              max="100"
              bind:value={FC.PID_PROFILE.itermRelaxCutoffPitch}
            />
          </Field>
          {#if itermRelaxType > 1}
            <Field
              id="iterm-relax-cutoff-yaw"
              label="profilesItermRelaxCutoffYaw"
            >
              <NumberInput
                id="iterm-relax-cutoff-yaw"
                min="1"
                max="100"
                bind:value={FC.PID_PROFILE.itermRelaxCutoffYaw}
              />
            </Field>
          {/if}
        </SubSection>
      {/if}
    </SubSection>

    <SubSection>
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
  {/if}
</Section>
