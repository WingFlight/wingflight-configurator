<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { LogicCondition } from "@/js/LogicCondition.js";

  import Select from "@/components/Select.svelte";
  import Switch from "@/components/Switch.svelte";
  import NumberInput from "@/components/NumberInput.svelte";

  import { transformFor, toDisplay, toRaw, numberBounds } from "./util.js";

  let {
    condition,
    index,
    active,
    channelOptions,
    modeOptions,
    sensorOptions,
    profileOptions,
    conditionOptions,
    onCommit,
    onRemove,
  } = $props();

  const VALUE = LogicCondition.OPERAND_TYPE_VALUE;
  const CHANNEL = LogicCondition.OPERAND_TYPE_RC_CHANNEL;
  const MODE = LogicCondition.OPERAND_TYPE_FLIGHT_MODE;
  const COND = LogicCondition.OPERAND_TYPE_CONDITION;
  const SENSOR = LogicCondition.OPERAND_TYPE_SENSOR;
  const PROFILE = LogicCondition.OPERAND_TYPE_PROFILE;

  // Mirrors the row's local form state -- every field change re-reads all
  // of these and writes one whole condition object, matching legacy
  // logic.js's commit().
  let enabled = $state(false);
  let operation = $state(0);
  let aType = $state(0);
  let bType = $state(0);
  let aDisplay = $state(0);
  let bDisplay = $state(0);

  let aTransform = $derived(transformFor(bType, condition.operandBValue));
  let bTransform = $derived(transformFor(aType, condition.operandAValue));
  let aBounds = $derived(numberBounds(aTransform));
  let bBounds = $derived(numberBounds(bTransform));

  // Sync purely from the `condition` prop -- must not read aType/bType/
  // aTransform/bTransform (they're derived from the very state this effect
  // writes), or a live edit to a type select gets immediately stomped back
  // to its old value before Svelte can commit the change.
  $effect(() => {
    enabled = !!condition.enabled;
    operation = condition.operation;
    aType = condition.operandAType;
    bType = condition.operandBType;
    aDisplay = toDisplay(
      condition.operandAValue,
      condition.operandAType,
      transformFor(condition.operandBType, condition.operandBValue),
    );
    bDisplay = toDisplay(
      condition.operandBValue,
      condition.operandBType,
      transformFor(condition.operandAType, condition.operandAValue),
    );
  });

  let usesA = $derived(LogicCondition.usesOperandA(operation));
  let usesB = $derived(LogicCondition.usesOperandB(operation));

  // "Set Value" on operand A copies operand B's current channel reading
  // (and vice versa) -- only makes sense when the operand itself is in use
  // and its sibling is currently a Channel.
  let canSetAFromB = $derived(usesA && bType === CHANNEL);
  let canSetBFromA = $derived(usesB && aType === CHANNEL);

  function commit() {
    onCommit({
      enabled: enabled ? 1 : 0,
      operation,
      operandAType: aType,
      operandAValue: toRaw(aDisplay, aType, aTransform),
      operandBType: bType,
      operandBValue: toRaw(bDisplay, bType, bTransform),
    });
  }

  function setAFromB() {
    const live = FC.RC.channels[bDisplay];
    if (live === undefined) return;
    aDisplay = live;
    commit();
  }

  function setBFromA() {
    const live = FC.RC.channels[aDisplay];
    if (live === undefined) return;
    bDisplay = live;
    commit();
  }
</script>

<div class="row" class:disabled={!enabled}>
  <span class="col-index">{index + 1}</span>

  <span class="col-enable">
    <Switch bind:checked={enabled} onchange={commit} />
  </span>

  <span class="col-operator">
    <Select
      bind:value={operation}
      options={LogicCondition.operationNames.map((key, i) => ({
        value: i,
        label: $i18n.t(key),
      }))}
      onchange={commit}
    />
  </span>

  <div class="col-operand">
    <Select
      bind:value={aType}
      options={LogicCondition.operandTypeNames.map((key, i) => ({
        value: i,
        label: $i18n.t(key),
      }))}
      disabled={!usesA}
      onchange={commit}
    />

    {#if aType === VALUE}
      <div class="value-group">
        <NumberInput
          min={aBounds.min}
          max={aBounds.max}
          step={aBounds.step}
          disabled={!usesA}
          bind:value={aDisplay}
          onchange={commit}
        />
        <button class="btn" disabled={!canSetAFromB} onclick={setAFromB}>
          {$i18n.t("logicSetValue")}
        </button>
      </div>
    {:else if aType === CHANNEL}
      <div class="value-group">
        <Select
          bind:value={aDisplay}
          options={channelOptions}
          disabled={!usesA}
          onchange={commit}
        />
        <span class="live-value">{FC.RC.channels[aDisplay] ?? ""}</span>
      </div>
    {:else if aType === MODE}
      <Select
        bind:value={aDisplay}
        options={modeOptions}
        disabled={!usesA}
        onchange={commit}
      />
    {:else if aType === COND}
      <Select
        bind:value={aDisplay}
        options={conditionOptions}
        disabled={!usesA}
        onchange={commit}
      />
    {:else if aType === SENSOR}
      <Select
        bind:value={aDisplay}
        options={sensorOptions}
        disabled={!usesA}
        onchange={commit}
      />
    {:else if aType === PROFILE}
      <Select
        bind:value={aDisplay}
        options={profileOptions}
        disabled={!usesA}
        onchange={commit}
      />
    {/if}
  </div>

  <div class="col-operand">
    <Select
      bind:value={bType}
      options={LogicCondition.operandTypeNames.map((key, i) => ({
        value: i,
        label: $i18n.t(key),
      }))}
      disabled={!usesB}
      onchange={commit}
    />

    {#if bType === VALUE}
      <div class="value-group">
        <NumberInput
          min={bBounds.min}
          max={bBounds.max}
          step={bBounds.step}
          disabled={!usesB}
          bind:value={bDisplay}
          onchange={commit}
        />
        <button class="btn" disabled={!canSetBFromA} onclick={setBFromA}>
          {$i18n.t("logicSetValue")}
        </button>
      </div>
    {:else if bType === CHANNEL}
      <div class="value-group">
        <Select
          bind:value={bDisplay}
          options={channelOptions}
          disabled={!usesB}
          onchange={commit}
        />
        <span class="live-value">{FC.RC.channels[bDisplay] ?? ""}</span>
      </div>
    {:else if bType === MODE}
      <Select
        bind:value={bDisplay}
        options={modeOptions}
        disabled={!usesB}
        onchange={commit}
      />
    {:else if bType === COND}
      <Select
        bind:value={bDisplay}
        options={conditionOptions}
        disabled={!usesB}
        onchange={commit}
      />
    {:else if bType === SENSOR}
      <Select
        bind:value={bDisplay}
        options={sensorOptions}
        disabled={!usesB}
        onchange={commit}
      />
    {:else if bType === PROFILE}
      <Select
        bind:value={bDisplay}
        options={profileOptions}
        disabled={!usesB}
        onchange={commit}
      />
    {/if}
  </div>

  <span class="col-status" class:active class:inactive={!active}>
    {active ? "TRUE" : "FALSE"}
  </span>

  <span class="col-remove">
    <button
      type="button"
      class="remove-btn"
      aria-label={$i18n.t("logicRemoveButton")}
      onclick={onRemove}
    >
      <em class="fas fa-trash"></em>
    </button>
  </span>
</div>

<style lang="scss">
  .row {
    display: grid;
    grid-template-columns: 32px 44px 130px 1fr 1fr 70px 32px;
    align-items: start;
    column-gap: 10px;
    padding: 10px 8px;
    border-bottom: 1px solid var(--color-border);

    &.disabled {
      opacity: 0.6;
    }
  }

  .col-index {
    padding-top: 4px;
    text-align: center;
    color: var(--color-text-soft);
    font-size: 0.75rem;
  }

  .col-enable {
    padding-top: 2px;
  }

  .col-operand {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .value-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .live-value {
    font-size: 0.75rem;
    color: var(--color-text-soft);
    min-width: 40px;
  }

  .btn {
    @extend %button;
    font-size: 0.7rem;
    height: 22px;
    line-height: 22px;
    white-space: nowrap;
  }

  .col-status {
    margin-top: 2px;
    padding: 2px 8px;
    text-align: center;
    border-radius: 2px;
    font-size: 0.7rem;
    font-weight: 600;

    &.active {
      background-color: var(--color-status-good);
      color: white;
    }

    &.inactive {
      background-color: var(--color-status-bad);
      color: white;
    }
  }

  .col-remove {
    display: flex;
    justify-content: center;
    padding-top: 2px;
  }

  .remove-btn {
    background: none;
    border: none;
    padding: 4px 6px;
    cursor: pointer;
    color: var(--color-text-soft);

    &:hover {
      color: var(--color-danger, var(--accent));
    }
  }
</style>
