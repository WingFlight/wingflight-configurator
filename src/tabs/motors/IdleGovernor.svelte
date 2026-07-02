<script>
  import { FC } from "@/js/fc.svelte.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";
</script>

<Section label="motorsSectionLabelIdleGovernor">
  <div class="info-container">
    <WarningNote message="motorsIdleGovernorModeNote" />
  </div>
  <SubSection>
    <Field id="idle-governor-rpm" label="motorsIdleGovernorRpm" unit="RPM">
      {#snippet tooltip()}
        <Tooltip help="motorsIdleGovernorRpmHelp" />
      {/snippet}
      <NumberInput
        id="idle-governor-rpm"
        min="0"
        max="50000"
        bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_rpm}
      />
    </Field>

    <Field id="idle-governor-gain" label="motorsIdleGovernorGain">
      {#snippet tooltip()}
        <Tooltip help="motorsIdleGovernorGainHelp" />
      {/snippet}
      <NumberInput
        id="idle-governor-gain"
        min="0"
        max="1000"
        bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_gain}
      />
    </Field>

    <Field
      id="idle-governor-handover"
      label="motorsIdleGovernorHandover"
      unit="%"
    >
      {#snippet tooltip()}
        <Tooltip help="motorsIdleGovernorHandoverHelp" />
      {/snippet}
      <NumberInput
        id="idle-governor-handover"
        min="0"
        max="100"
        bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_handover}
      />
    </Field>

    <Field
      id="idle-governor-ceiling"
      label="motorsIdleGovernorCeiling"
      unit="%"
    >
      {#snippet tooltip()}
        <Tooltip help="motorsIdleGovernorCeilingHelp" />
      {/snippet}
      <NumberInput
        id="idle-governor-ceiling"
        min="0"
        max="100"
        bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_ceiling}
      />
    </Field>
  </SubSection>
</Section>

<style lang="scss">
  .info-container {
    margin-bottom: 8px;
  }
</style>
