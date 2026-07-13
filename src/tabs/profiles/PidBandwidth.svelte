<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
</script>

<Section label="profilesPidBandwidth">
  <SubSection>
    <Field id="gyro-cutoff-roll" label="profilesGyroCutoffRoll" unit="Hz">
      {#snippet tooltip()}
        {$i18n.t("profilesGyroCutoffHelp")}
      {/snippet}
      <NumberInput
        id="gyro-cutoff-roll"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.gyroCutoffRoll}
      />
    </Field>
    <Field id="gyro-cutoff-pitch" label="profilesGyroCutoffPitch" unit="Hz">
      <NumberInput
        id="gyro-cutoff-pitch"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.gyroCutoffPitch}
      />
    </Field>
    <Field id="gyro-cutoff-yaw" label="profilesGyroCutoffYaw" unit="Hz">
      <NumberInput
        id="gyro-cutoff-yaw"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.gyroCutoffYaw}
      />
    </Field>
  </SubSection>

  <SubSection>
    <Field id="dterm-cutoff-roll" label="profilesDtermCutoffRoll" unit="Hz">
      {#snippet tooltip()}
        {$i18n.t("profilesDtermCutoffHelp")}
      {/snippet}
      <NumberInput
        id="dterm-cutoff-roll"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.dtermCutoffRoll}
      />
    </Field>
    <Field id="dterm-cutoff-pitch" label="profilesDtermCutoffPitch" unit="Hz">
      <NumberInput
        id="dterm-cutoff-pitch"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.dtermCutoffPitch}
      />
    </Field>
    <Field id="dterm-cutoff-yaw" label="profilesDtermCutoffYaw" unit="Hz">
      <NumberInput
        id="dterm-cutoff-yaw"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.dtermCutoffYaw}
      />
    </Field>
  </SubSection>

  <SubSection>
    <Field id="bterm-cutoff-roll" label="profilesBtermCutoffRoll" unit="Hz">
      {#snippet tooltip()}
        {$i18n.t("profilesBtermCutoffHelp")}
      {/snippet}
      <NumberInput
        id="bterm-cutoff-roll"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.btermCutoffRoll}
      />
    </Field>
    <Field id="bterm-cutoff-pitch" label="profilesBtermCutoffPitch" unit="Hz">
      <NumberInput
        id="bterm-cutoff-pitch"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.btermCutoffPitch}
      />
    </Field>
    <Field id="bterm-cutoff-yaw" label="profilesBtermCutoffYaw" unit="Hz">
      <NumberInput
        id="bterm-cutoff-yaw"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.btermCutoffYaw}
      />
    </Field>
  </SubSection>
</Section>
