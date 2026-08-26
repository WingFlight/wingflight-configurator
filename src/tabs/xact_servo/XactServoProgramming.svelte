<script>
  import { i18n } from "@/js/i18n.js";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Select from "@/components/Select.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import { getTabHelpURL } from "@/js/help";

  import xactState, { View } from "./state.svelte.js";
  import { FBUS_SERVO_DATA_BASE } from "./protocol.js";

  let loading = $state(false);
  let showToolbar = $derived(
    xactState.view === View.FORM && xactState.isDirty(),
  );
  let showBackToList = $derived(
    xactState.view === View.FORM &&
      xactState.servos.length > 1 &&
      !xactState.isDirty(),
  );

  function hex(value, digits) {
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  // Physical ID (00-1A) and App ID (6800-680F) are Select fields labelled by their literal
  // hex bus address, matching FrSky's own "XAct" ETHOS Device Config tool exactly.
  const physicalIdOptions = Array.from({ length: 27 }, (_, i) => ({
    value: i,
    label: hex(i, 2),
  }));
  const appIdOptions = Array.from({ length: 16 }, (_, i) => ({
    value: i,
    label: hex(FBUS_SERVO_DATA_BASE + i, 4),
  }));
  const rangeOptions = [
    { value: 0, label: "120°" },
    { value: 1, label: "90°" },
    { value: 2, label: "180°" },
  ];
  const directionOptions = [
    { value: 0, label: $i18n.t("xactServoDirectionClockwise") },
    { value: 1, label: $i18n.t("xactServoDirectionAnticlockwise") },
  ];
  const pulseTypeOptions = [
    { value: 0, label: "1500us" },
    { value: 1, label: "760us" },
  ];
  const workingModeOptions = [
    { value: 0, label: $i18n.t("xactServoWorkingModeAngle") },
    { value: 1, label: $i18n.t("xactServoWorkingModeRange") },
    { value: 2, label: $i18n.t("xactServoWorkingModeRotate") },
  ];

  export function onSave() {
    return xactState.onSave();
  }

  export function onRevert() {
    xactState.onRevert();
  }

  export function isDirty() {
    return xactState.isDirty();
  }

  function onClickScan() {
    xactState.scan();
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabXactServoProgramming"), "_system");
  }

  function onClickBackToList() {
    xactState.backToList();
  }

  function onSelectServo(physicalId) {
    xactState.selectServo(physicalId);
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabXactServoProgramming")}</h1>
  <div class="grow"></div>
  <button
    class="btn"
    onclick={onClickScan}
    disabled={xactState.view === View.SCANNING}
  >
    {$i18n.t("xactServoScanButton")}
  </button>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <p class="intro">{$i18n.t("xactServoIntro")}</p>
  <WarningNote message="xactServoSingleServoNote" />

  {#if xactState.view === View.IDLE}
    <p class="status">{$i18n.t("xactServoIdle")}</p>
  {:else if xactState.view === View.SCANNING}
    <p class="status">{$i18n.t("xactServoScanning")}</p>
  {:else if xactState.view === View.NOT_FOUND}
    <p class="status error">{$i18n.t("xactServoNotFound")}</p>
  {:else if xactState.view === View.LIST}
    <p class="status">
      {$i18n.t("xactServoMultipleFound", { count: xactState.servos.length })}
    </p>
    <div class="servo-list">
      {#each xactState.servos as servo (servo.physicalId)}
        <button
          type="button"
          class="servo-list-row"
          onclick={() => onSelectServo(servo.physicalId)}
        >
          <span class="servo-row-field">
            {$i18n.t("xactServoPhysicalId")}: {hex(servo.physicalId, 2)}
          </span>
          <span class="servo-row-field">
            {$i18n.t("xactServoAppIdOffset")}: {hex(
              FBUS_SERVO_DATA_BASE + servo.appIdOffset,
              4,
            )}
          </span>
          <span class="row-grow"></span>
          {#if servo.conflict}
            <span class="servo-row-conflict"
              >{$i18n.t("xactServoConflictBadge")}</span
            >
          {/if}
          <em class="fas fa-chevron-right servo-row-chevron"></em>
        </button>
      {/each}
    </div>
  {:else if xactState.view === View.FORM}
    {#if showBackToList}
      <button type="button" class="back-btn" onclick={onClickBackToList}>
        <em class="fas fa-chevron-left"></em>
        {$i18n.t("xactServoBackToList")}
      </button>
    {/if}

    {#if xactState.values.conflict}
      <WarningNote message="xactServoConflictWarning" />
    {/if}

    <div class="pages">
      <Section label="xactServoSectionProtocol">
        <Field id="physicalId" label="xactServoPhysicalId">
          {#snippet tooltip()}
            <Tooltip help="xactServoPhysicalIdHelp" />
          {/snippet}
          <Select
            id="physicalId"
            bind:value={xactState.values.physicalId}
            options={physicalIdOptions}
          />
        </Field>
        <Field id="appIdOffset" label="xactServoAppIdOffset">
          {#snippet tooltip()}
            <Tooltip help="xactServoAppIdOffsetHelp" />
          {/snippet}
          <Select
            id="appIdOffset"
            bind:value={xactState.values.appIdOffset}
            options={appIdOptions}
          />
        </Field>
        <Field id="firmwareVersion" label="xactServoFirmwareVersion">
          {#snippet tooltip()}
            <Tooltip help="xactServoFirmwareVersionHelp" />
          {/snippet}
          <NumberInput
            id="firmwareVersion"
            value={xactState.values.firmwareVersion}
            disabled
            min={0}
            max={255}
            step={1}
          />
        </Field>
      </Section>

      <Section label="xactServoSectionServo">
        <Field id="range" label="xactServoRange">
          {#snippet tooltip()}
            <Tooltip help="xactServoRangeHelp" />
          {/snippet}
          <Select
            id="range"
            bind:value={xactState.values.range}
            options={rangeOptions}
          />
        </Field>
        <Field id="direction" label="xactServoDirection">
          {#snippet tooltip()}
            <Tooltip help="xactServoDirectionHelp" />
          {/snippet}
          <Select
            id="direction"
            bind:value={xactState.values.direction}
            options={directionOptions}
          />
        </Field>
        <Field id="pulseType" label="xactServoPulseType">
          {#snippet tooltip()}
            <Tooltip help="xactServoPulseTypeHelp" />
          {/snippet}
          <Select
            id="pulseType"
            bind:value={xactState.values.pulseType}
            options={pulseTypeOptions}
          />
        </Field>
        <Field id="dataRate" label="xactServoDataRate" unit="ms">
          {#snippet tooltip()}
            <Tooltip help="xactServoDataRateHelp" />
          {/snippet}
          <NumberInput
            id="dataRate"
            bind:value={xactState.values.dataRate}
            min={10}
            max={60000}
            step={1}
          />
        </Field>
        <Field id="channel" label="xactServoChannel">
          {#snippet tooltip()}
            <Tooltip help="xactServoChannelHelp" />
          {/snippet}
          <NumberInput
            id="channel"
            bind:value={
              () => xactState.values.channel + 1,
              (v) => (xactState.values.channel = v - 1)
            }
            min={1}
            max={24}
            step={1}
          />
        </Field>
        <Field id="center" label="xactServoCenter">
          {#snippet tooltip()}
            <Tooltip help="xactServoCenterHelp" />
          {/snippet}
          <NumberInput
            id="center"
            bind:value={xactState.values.center}
            min={-125}
            max={125}
            step={1}
          />
        </Field>
      </Section>

      <Section label="xactServoSectionAdvanced">
        <Field id="holdingStrength" label="xactServoHoldingStrength">
          {#snippet tooltip()}
            <Tooltip help="xactServoHoldingStrengthHelp" />
          {/snippet}
          <NumberInput
            id="holdingStrength"
            bind:value={xactState.values.holdingStrength}
            min={4}
            max={15}
            step={1}
          />
        </Field>
        <Field id="operationSmoothing" label="xactServoOperationSmoothing">
          {#snippet tooltip()}
            <Tooltip help="xactServoOperationSmoothingHelp" />
          {/snippet}
          <NumberInput
            id="operationSmoothing"
            bind:value={xactState.values.operationSmoothing}
            min={0}
            max={50}
            step={1}
          />
        </Field>
        <Field id="deadband" label="xactServoDeadband">
          {#snippet tooltip()}
            <Tooltip help="xactServoDeadbandHelp" />
          {/snippet}
          <NumberInput
            id="deadband"
            bind:value={xactState.values.deadband}
            min={0}
            max={90}
            step={1}
          />
        </Field>
      </Section>

      {#if xactState.values.hasExtendedParams}
        <Section label="xactServoSectionSeries65">
          <Field id="workingMode" label="xactServoWorkingMode">
            {#snippet tooltip()}
              <Tooltip help="xactServoWorkingModeHelp" />
            {/snippet}
            <Select
              id="workingMode"
              bind:value={xactState.values.workingMode}
              options={workingModeOptions}
            />
          </Field>
          <Field id="maxAngle" label="xactServoMaxAngle" unit="°">
            {#snippet tooltip()}
              <Tooltip help="xactServoMaxAngleHelp" />
            {/snippet}
            <NumberInput
              id="maxAngle"
              bind:value={xactState.values.maxAngle}
              min={0}
              max={359}
              step={1}
            />
          </Field>
        </Section>
      {/if}
    </div>
  {/if}
</Page>

<style lang="scss">
  h1 {
    margin: 0;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .back-btn {
    @extend %button;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0 8px 4px;
  }

  .intro {
    padding: 8px;
    color: var(--color-text-soft);
  }

  .status {
    padding: 8px;
    font-weight: 600;
  }

  .status.error {
    color: var(--color-red-900);
  }

  .pages {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  .servo-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 2px;
  }

  .servo-list-row {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font: inherit;
    text-align: left;
    cursor: pointer;

    color: var(--color-text);
    background-color: var(--color-surface);

    @media (hover: hover) {
      &:hover {
        background-color: var(--color-surface-float, var(--color-surface));
      }
    }
  }

  .servo-row-field {
    flex-shrink: 0;
    font-size: 0.85rem;
  }

  .row-grow {
    flex: 1;
  }

  .servo-row-conflict {
    flex-shrink: 0;
    font-size: 0.75rem;
    font-weight: 700;

    color: var(--color-red-900);
  }

  .servo-row-chevron {
    flex-shrink: 0;
    font-size: 0.8rem;

    color: var(--color-text-soft);
  }
</style>
