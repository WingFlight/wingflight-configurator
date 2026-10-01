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

<Section label="profilesPidBandwidth">
  <SubSection label="profilesGyroCutoffGroup">
    <Field
      expert
      changed={FC.PID_PROFILE.gyroCutoffRoll !== DEFAULTS.gyroCutoffRoll}
      id="gyro-cutoff-roll"
      label="profilesGyroCutoffRoll"
      unit="Hz"
    >
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
    <Field
      expert
      changed={FC.PID_PROFILE.gyroCutoffPitch !== DEFAULTS.gyroCutoffPitch}
      id="gyro-cutoff-pitch"
      label="profilesGyroCutoffPitch"
      unit="Hz"
    >
      <NumberInput
        id="gyro-cutoff-pitch"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.gyroCutoffPitch}
      />
    </Field>
    <Field
      expert
      changed={FC.PID_PROFILE.gyroCutoffYaw !== DEFAULTS.gyroCutoffYaw}
      id="gyro-cutoff-yaw"
      label="profilesGyroCutoffYaw"
      unit="Hz"
    >
      <NumberInput
        id="gyro-cutoff-yaw"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.gyroCutoffYaw}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesDtermCutoffGroup">
    <Field
      expert
      changed={FC.PID_PROFILE.dtermCutoffRoll !== DEFAULTS.dtermCutoffRoll}
      id="dterm-cutoff-roll"
      label="profilesDtermCutoffRoll"
      unit="Hz"
    >
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
    <Field
      expert
      changed={FC.PID_PROFILE.dtermCutoffPitch !== DEFAULTS.dtermCutoffPitch}
      id="dterm-cutoff-pitch"
      label="profilesDtermCutoffPitch"
      unit="Hz"
    >
      <NumberInput
        id="dterm-cutoff-pitch"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.dtermCutoffPitch}
      />
    </Field>
    <Field
      expert
      changed={FC.PID_PROFILE.dtermCutoffYaw !== DEFAULTS.dtermCutoffYaw}
      id="dterm-cutoff-yaw"
      label="profilesDtermCutoffYaw"
      unit="Hz"
    >
      <NumberInput
        id="dterm-cutoff-yaw"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.dtermCutoffYaw}
      />
    </Field>
  </SubSection>

  <SubSection label="profilesBtermCutoffGroup">
    <Field
      expert
      changed={FC.PID_PROFILE.btermCutoffRoll !== DEFAULTS.btermCutoffRoll}
      id="bterm-cutoff-roll"
      label="profilesBtermCutoffRoll"
      unit="Hz"
    >
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
    <Field
      expert
      changed={FC.PID_PROFILE.btermCutoffPitch !== DEFAULTS.btermCutoffPitch}
      id="bterm-cutoff-pitch"
      label="profilesBtermCutoffPitch"
      unit="Hz"
    >
      <NumberInput
        id="bterm-cutoff-pitch"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.btermCutoffPitch}
      />
    </Field>
    <Field
      expert
      changed={FC.PID_PROFILE.btermCutoffYaw !== DEFAULTS.btermCutoffYaw}
      id="bterm-cutoff-yaw"
      label="profilesBtermCutoffYaw"
      unit="Hz"
    >
      <NumberInput
        id="bterm-cutoff-yaw"
        min="0"
        max="250"
        bind:value={FC.PID_PROFILE.btermCutoffYaw}
      />
    </Field>
  </SubSection>
</Section>
