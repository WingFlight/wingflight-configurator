<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
</script>

<Section label="profilesAcroTrainerGroup">
  <SubSection>
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
    {#if FC.PID_PROFILE.hasAxisLimits}
      <Field id="trainer-roll-limit" label="profilesRollAngleLimit">
        <NumberInput
          id="trainer-roll-limit"
          min="10"
          max="90"
          bind:value={FC.PID_PROFILE.trainerRollLimit}
        />
      </Field>
      <Field id="trainer-pitch-limit" label="profilesPitchAngleLimit">
        <NumberInput
          id="trainer-pitch-limit"
          min="10"
          max="75"
          bind:value={FC.PID_PROFILE.trainerPitchLimit}
        />
      </Field>
    {:else}
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
    {/if}
  </SubSection>
</Section>
