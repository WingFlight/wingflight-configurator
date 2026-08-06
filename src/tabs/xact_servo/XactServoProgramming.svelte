<script>
  import { i18n } from "@/js/i18n.js";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Select from "@/components/Select.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";
  import { getTabHelpURL } from "@/js/help";

  import xactState, { View } from "./state.svelte.js";

  let loading = $state(false);
  let showToolbar = $derived(
    xactState.view === View.FORM && xactState.isDirty(),
  );

  const rangeOptions = [
    { value: 0, label: "120°" },
    { value: 1, label: "90°" },
    { value: 2, label: "180°" },
  ];
  const directionOptions = [
    { value: 0, label: $i18n.t("xactServoDirectionClockwise") },
    { value: 1, label: $i18n.t("xactServoDirectionCounterClockwise") },
  ];
  const pulseTypeOptions = [
    { value: 0, label: "1500us" },
    { value: 1, label: "760us" },
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
  {:else if xactState.view === View.FORM}
    <div class="pages">
      <Section label="xactServoSectionBasic">
        <Field id="physicalId" label="xactServoPhysicalId">
          <NumberInput
            id="physicalId"
            bind:value={xactState.values.physicalId}
            min={0}
            max={255}
            step={1}
          />
        </Field>
        <Field id="appIdOffset" label="xactServoAppIdOffset">
          <NumberInput
            id="appIdOffset"
            bind:value={xactState.values.appIdOffset}
            min={0}
            max={255}
            step={1}
          />
        </Field>
        <Field id="range" label="xactServoRange">
          <Select
            id="range"
            bind:value={xactState.values.range}
            options={rangeOptions}
          />
        </Field>
        <Field id="direction" label="xactServoDirection">
          <Select
            id="direction"
            bind:value={xactState.values.direction}
            options={directionOptions}
          />
        </Field>
        <Field id="pulseType" label="xactServoPulseType">
          <Select
            id="pulseType"
            bind:value={xactState.values.pulseType}
            options={pulseTypeOptions}
          />
        </Field>
        <Field id="dataRate" label="xactServoDataRate" unit="ms">
          <NumberInput
            id="dataRate"
            bind:value={xactState.values.dataRate}
            min={0}
            max={65535}
            step={1}
          />
        </Field>
        <Field id="channel" label="xactServoChannel">
          <NumberInput
            id="channel"
            bind:value={
              () => xactState.values.channel + 1,
              (v) => (xactState.values.channel = v - 1)
            }
            min={1}
            max={256}
            step={1}
          />
        </Field>
        <Field id="center" label="xactServoCenter">
          <NumberInput
            id="center"
            bind:value={xactState.values.center}
            min={0}
            max={255}
            step={1}
          />
        </Field>
      </Section>

      <Section label="xactServoSectionAdvanced">
        <Field id="p1" label="xactServoP1">
          <NumberInput
            id="p1"
            bind:value={xactState.values.p1}
            min={0}
            max={255}
            step={1}
          />
        </Field>
        <Field id="p2" label="xactServoP2">
          <NumberInput
            id="p2"
            bind:value={xactState.values.p2}
            min={0}
            max={255}
            step={1}
          />
        </Field>
        <Field id="d1" label="xactServoD1">
          <NumberInput
            id="d1"
            bind:value={xactState.values.d1}
            min={0}
            max={255}
            step={1}
          />
        </Field>
        <Field id="tb" label="xactServoTb">
          <NumberInput
            id="tb"
            bind:value={xactState.values.tb}
            min={0}
            max={255}
            step={1}
          />
        </Field>
        <Field id="potGap" label="xactServoPotGap">
          <NumberInput
            id="potGap"
            bind:value={xactState.values.potGap}
            min={0}
            max={255}
            step={1}
          />
        </Field>
      </Section>
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
</style>
