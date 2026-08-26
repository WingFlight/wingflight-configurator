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

  const GOVERNOR_MODE_OFF = 0;
  const GOVERNOR_MODE_RPM = 1;
  const GOVERNOR_MODE_THROTTLE = 2;
  const GOVERNOR_MODE_RPM_RANGE = 3;

  let rpmMode = $derived(
    FC.GOVERNOR_CONFIG.governor_mode === GOVERNOR_MODE_RPM,
  );
  let throttleMode = $derived(
    FC.GOVERNOR_CONFIG.governor_mode === GOVERNOR_MODE_THROTTLE,
  );
  let rpmRangeMode = $derived(
    FC.GOVERNOR_CONFIG.governor_mode === GOVERNOR_MODE_RPM_RANGE,
  );
  let rpmControlMode = $derived(rpmMode || rpmRangeMode);

  let modeOptions = $derived(
    [
      {
        value: GOVERNOR_MODE_OFF,
        label: $i18n.t("motorsGovernorModeOff"),
      },
      rpmAvailable && {
        value: GOVERNOR_MODE_RPM,
        label: $i18n.t("motorsGovernorModeRpm"),
      },
      {
        value: GOVERNOR_MODE_THROTTLE,
        label: $i18n.t("motorsGovernorModeThrottle"),
      },
      rpmAvailable && {
        value: GOVERNOR_MODE_RPM_RANGE,
        label: $i18n.t("motorsGovernorModeRpmRange"),
      },
    ].filter(Boolean),
  );
</script>

<Section label="motorsSectionLabelGovernor">
  <div class="info-container">
    <WarningNote message="motorsGovernorModeNote" />
  </div>
  <SubSection>
    <Field id="governor-mode" label="motorsGovernorMode">
      {#snippet tooltip()}
        <Tooltip help="motorsGovernorModeHelp" />
      {/snippet}
      <Select
        id="governor-mode"
        bind:value={FC.GOVERNOR_CONFIG.governor_mode}
        options={modeOptions}
      />
    </Field>

    {#if rpmMode}
      <Field id="governor-rpm" label="motorsGovernorRpm" unit="RPM">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorRpmHelp" />
        {/snippet}
        <NumberInput
          id="governor-rpm"
          min="0"
          max="50000"
          bind:value={FC.GOVERNOR_CONFIG.governor_rpm}
        />
      </Field>

      <Field id="governor-rpm-max" label="motorsGovernorRpmMaxLimit" unit="RPM">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorRpmMaxLimitHelp" />
        {/snippet}
        <NumberInput
          id="governor-rpm-max"
          min="0"
          max="50000"
          bind:value={FC.GOVERNOR_CONFIG.governor_rpm_max}
        />
      </Field>
    {/if}

    {#if rpmRangeMode}
      <Field id="governor-rpm-min" label="motorsGovernorRpmMin" unit="RPM">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorRpmMinHelp" />
        {/snippet}
        <NumberInput
          id="governor-rpm-min"
          min="0"
          max="50000"
          bind:value={FC.GOVERNOR_CONFIG.governor_rpm_min}
        />
      </Field>

      <Field id="governor-rpm-max" label="motorsGovernorRpmMax" unit="RPM">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorRpmMaxHelp" />
        {/snippet}
        <NumberInput
          id="governor-rpm-max"
          min="0"
          max="50000"
          bind:value={FC.GOVERNOR_CONFIG.governor_rpm_max}
        />
      </Field>
    {/if}

    {#if rpmControlMode}
      <Field id="governor-gain" label="motorsGovernorGain">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorGainHelp" />
        {/snippet}
        <NumberInput
          id="governor-gain"
          min="0"
          max="20000"
          bind:value={FC.GOVERNOR_CONFIG.governor_gain}
        />
      </Field>

      <Field id="governor-i-gain" label="motorsGovernorIGain">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorIGainHelp" />
        {/snippet}
        <NumberInput
          id="governor-i-gain"
          min="0"
          max="200"
          bind:value={FC.GOVERNOR_CONFIG.governor_i_gain}
        />
      </Field>
    {/if}

    {#if rpmMode || throttleMode}
      <Field id="governor-throttle" label="motorsGovernorThrottle" unit="%">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorThrottleHelp" />
        {/snippet}
        <NumberInput
          id="governor-throttle"
          min="0"
          max="100"
          bind:value={FC.GOVERNOR_CONFIG.governor_throttle}
        />
      </Field>
    {/if}

    {#if rpmMode || throttleMode}
      <Field id="governor-handover" label="motorsGovernorHandover" unit="%">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorHandoverHelp" />
        {/snippet}
        <NumberInput
          id="governor-handover"
          min="0"
          max="100"
          bind:value={FC.GOVERNOR_CONFIG.governor_handover}
        />
      </Field>
    {/if}

    {#if FC.GOVERNOR_CONFIG.governor_mode !== GOVERNOR_MODE_OFF}
      <Field id="governor-ceiling" label="motorsGovernorCeiling" unit="%">
        {#snippet tooltip()}
          <Tooltip help="motorsGovernorCeilingHelp" />
        {/snippet}
        <NumberInput
          id="governor-ceiling"
          min="0"
          max="100"
          bind:value={FC.GOVERNOR_CONFIG.governor_ceiling}
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
