<script>
  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";

  let { rpmAvailable = false } = $props();

  const IDLE_GOVERNOR_MODE_OFF = 0;
  const IDLE_GOVERNOR_MODE_RPM = 1;
  const IDLE_GOVERNOR_MODE_THROTTLE = 2;

  let modeOptions = $derived(
    [
      {
        value: IDLE_GOVERNOR_MODE_OFF,
        label: $i18n.t("motorsIdleGovernorModeOff"),
      },
      rpmAvailable && {
        value: IDLE_GOVERNOR_MODE_RPM,
        label: $i18n.t("motorsIdleGovernorModeRpm"),
      },
      {
        value: IDLE_GOVERNOR_MODE_THROTTLE,
        label: $i18n.t("motorsIdleGovernorModeThrottle"),
      },
    ].filter(Boolean),
  );
</script>

<Section label="motorsSectionLabelIdleGovernor">
  <div class="info-container">
    <WarningNote message="motorsIdleGovernorModeNote" />
  </div>
  <SubSection>
    <Field id="idle-governor-mode" label="motorsIdleGovernorMode">
      {#snippet tooltip()}
        <Tooltip help="motorsIdleGovernorModeHelp" />
      {/snippet}
      <Select
        id="idle-governor-mode"
        bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_mode}
        options={modeOptions}
      />
    </Field>

    {#if FC.IDLE_GOVERNOR_CONFIG.idle_governor_mode === IDLE_GOVERNOR_MODE_RPM}
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
          max="20000"
          bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_gain}
        />
      </Field>

      <Field id="idle-governor-i-gain" label="motorsIdleGovernorIGain">
        {#snippet tooltip()}
          <Tooltip help="motorsIdleGovernorIGainHelp" />
        {/snippet}
        <NumberInput
          id="idle-governor-i-gain"
          min="0"
          max="200"
          bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_i_gain}
        />
      </Field>
    {/if}

    {#if FC.IDLE_GOVERNOR_CONFIG.idle_governor_mode === IDLE_GOVERNOR_MODE_THROTTLE}
      <Field
        id="idle-governor-throttle"
        label="motorsIdleGovernorThrottle"
        unit="%"
      >
        {#snippet tooltip()}
          <Tooltip help="motorsIdleGovernorThrottleHelp" />
        {/snippet}
        <NumberInput
          id="idle-governor-throttle"
          min="0"
          max="100"
          bind:value={FC.IDLE_GOVERNOR_CONFIG.idle_governor_throttle}
        />
      </Field>
    {/if}

    {#if FC.IDLE_GOVERNOR_CONFIG.idle_governor_mode !== IDLE_GOVERNOR_MODE_OFF}
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
    {/if}
  </SubSection>
</Section>

<style lang="scss">
  .info-container {
    margin-bottom: 8px;
  }
</style>
