<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { LogicCondition } from "@/js/LogicCondition.js";
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import {
    UNUSED_MODES,
    EXPERT_MODES,
    getModeDisplayName,
  } from "@/js/FlightMode.js";

  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";

  import ConditionRow from "./ConditionRow.svelte";
  import { PRIMARY_CHANNEL_COUNT } from "./util.js";

  let loading = $state(true);
  let initialState = $state();
  let rcPollerInterval;
  let statusPollerInterval;

  function snapshotState() {
    return $state.snapshot({ LOGIC_CONDITIONS: FC.LOGIC_CONDITIONS });
  }

  let changes = $derived.by(() => {
    if (!initialState) return [];
    return diff(initialState, snapshotState());
  });
  let dirty = $derived(changes.length > 0);
  let showToolbar = $derived(!loading && dirty);

  let channelOptions = $derived([
    { value: 0, label: $i18n.t("logicChannelRoll") },
    { value: 1, label: $i18n.t("logicChannelPitch") },
    { value: 2, label: $i18n.t("logicChannelYaw") },
    { value: 3, label: $i18n.t("logicChannelThrottle") },
    ...Array.from(
      {
        length: Math.max(
          0,
          (FC.RC.active_channels || 0) - PRIMARY_CHANNEL_COUNT,
        ),
      },
      (_, i) => ({
        value: PRIMARY_CHANNEL_COUNT + i,
        label: `AUX${i + 1}`,
      }),
    ),
  ]);

  // Same source, heli-only filter, and display names as the Modes tab.
  let modeOptions = $derived.by(() => {
    const options = [];
    for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
      const modeName = FC.AUX_CONFIG[i];
      if (UNUSED_MODES.includes(modeName)) continue;
      if (EXPERT_MODES.includes(modeName) && !CONFIGURATOR.expertMode) continue;
      options.push({
        value: FC.AUX_CONFIG_IDS[i],
        label: getModeDisplayName(modeName),
      });
    }
    return options;
  });

  let sensorOptions = $derived(
    LogicCondition.sensorNames.map((key, i) => ({
      value: i,
      label: $i18n.t(key),
    })),
  );

  let profileOptions = $derived(
    LogicCondition.profileNames.map((key, i) => ({
      value: i,
      label: $i18n.t(key),
    })),
  );

  let conditionOptions = $derived(
    Array.from({ length: LogicCondition.CONDITION_COUNT }, (_, c) => ({
      value: c,
      label: $i18n.t("logicConditionLabel", { 1: c + 1 }),
    })),
  );

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_RC);
    await MSP.promise(MSPCodes.MSP_BOXIDS);
    await MSP.promise(MSPCodes.MSP_BOXNAMES);
    await MSP.promise(MSPCodes.MSP_LOGIC_CONDITIONS);

    while (FC.LOGIC_CONDITIONS.length < LogicCondition.CONDITION_COUNT) {
      FC.LOGIC_CONDITIONS.push(LogicCondition.nullCondition());
    }

    initialState = snapshotState();
    loading = false;

    rcPollerInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_RC);
    }, 150);

    statusPollerInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_LOGIC_CONDITIONS_STATUS);
    }, 200);
  });

  onDestroy(() => {
    clearInterval(rcPollerInterval);
    clearInterval(statusPollerInterval);
  });

  export async function onSave() {
    await new Promise((resolve) => mspHelper.sendLogicConditions(resolve));
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    initialState = snapshotState();
  }

  export async function onRevert() {
    Object.assign(FC.LOGIC_CONDITIONS, initialState.LOGIC_CONDITIONS);
  }

  export function isDirty() {
    return dirty;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabLogic")}</h1>
  <div class="grow"></div>
  <HelpIcon>{$i18n.t("logicNote")}</HelpIcon>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <Section label="logicConditionsTitle">
    <div class="header-row">
      <span></span>
      <span>{$i18n.t("logicEnable")}</span>
      <span>{$i18n.t("logicOperator")}</span>
      <span>{$i18n.t("logicOperandA")}</span>
      <span>{$i18n.t("logicOperandB")}</span>
      <span>{$i18n.t("logicStatus")}</span>
    </div>

    {#each FC.LOGIC_CONDITIONS as condition, index (index)}
      <ConditionRow
        {condition}
        {index}
        active={!!FC.LOGIC_CONDITIONS_STATUS?.[index]}
        {channelOptions}
        {modeOptions}
        {sensorOptions}
        {profileOptions}
        {conditionOptions}
        onCommit={(newCondition) => {
          FC.LOGIC_CONDITIONS[index] = newCondition;
        }}
      />
    {/each}
  </Section>
</Page>

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .header-row {
    display: grid;
    grid-template-columns: 32px 44px 130px 1fr 1fr 70px;
    column-gap: 10px;
    padding: 4px 8px;
    font-weight: 600;
    font-size: 0.75rem;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
    border-bottom: 1px solid var(--color-border);
  }
</style>
