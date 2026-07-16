<script>
  import { Mixer } from "@/js/Mixer.js";

  import Select from "@/components/Select.svelte";
  import Switch from "@/components/Switch.svelte";

  import {
    ruleToDisplay,
    displayToRule,
    clampInt,
    DIFFERENTIAL_MIN,
    DIFFERENTIAL_MAX,
  } from "./util.js";

  let {
    rule,
    isBlank,
    label,
    hint,
    highlighted,
    gatedOff,
    canMoveUp,
    canMoveDown,
    outputOptions,
    operatorOptions,
    inputOptions,
    curveOptions,
    conditionOptions,
    onCommit,
    onMoveUp,
    onMoveDown,
    onDelete,
  } = $props();

  // Mirrors the legacy row's local form state -- every field change re-reads
  // all of these and writes one whole rule object, matching mixer.js's
  // commit(), including its "any touched field defaults the displayed
  // operator to Set" behaviour for a still-blank row.
  let dst = $state(rule.dst);
  let oper = $state(rule.oper || Mixer.OP_SET);
  let src = $state(rule.src);
  let curve = $state(rule.curve);
  let offset = $state(rule.offset);
  let speed = $state(rule.speed);
  let condition = $state(rule.condition);
  let weight = $state(0);
  let differential = $state(0);
  let reverse = $state(false);

  $effect(() => {
    dst = rule.dst;
    oper = rule.oper || Mixer.OP_SET;
    src = rule.src;
    curve = rule.curve;
    offset = rule.offset;
    speed = rule.speed;
    condition = rule.condition;

    const display = ruleToDisplay(rule);
    weight = display.weight;
    differential = display.differential;
    reverse = display.reverse;
  });

  function commit() {
    const { weight: w, weightNeg } = displayToRule(
      clampInt(weight, Mixer.WEIGHT_MIN, Mixer.WEIGHT_MAX),
      clampInt(differential, DIFFERENTIAL_MIN, DIFFERENTIAL_MAX),
      reverse,
      Mixer.WEIGHT_MIN,
      Mixer.WEIGHT_MAX,
    );

    onCommit({
      oper,
      src,
      dst,
      curve: curve || 0,
      weight: w,
      weightNeg,
      offset: clampInt(offset, Mixer.OFFSET_MIN, Mixer.OFFSET_MAX),
      speed: clampInt(speed, Mixer.SPEED_MIN, Mixer.SPEED_MAX),
      condition: condition || 0,
    });
  }
</script>

<div class="row" class:blank={isBlank} class:highlighted class:gated={gatedOff}>
  <span class="col-index">{label}</span>

  <span class="col-output">
    <Select bind:value={dst} options={outputOptions} onchange={commit} />
  </span>

  <span class="col-oper">
    <Select bind:value={oper} options={operatorOptions} onchange={commit} />
  </span>

  <span class="col-input">
    <Select bind:value={src} options={inputOptions} onchange={commit} />
  </span>

  <span class="col-curve">
    <Select bind:value={curve} options={curveOptions} onchange={commit} />
  </span>

  <span class="col-weight">
    <input
      type="number"
      min={Mixer.WEIGHT_MIN}
      max={Mixer.WEIGHT_MAX}
      step="10"
      bind:value={weight}
      onchange={commit}
    />
  </span>

  <span class="col-differential">
    <input
      type="number"
      min={DIFFERENTIAL_MIN}
      max={DIFFERENTIAL_MAX}
      step="1"
      bind:value={differential}
      onchange={commit}
    />
  </span>

  <span class="col-offset">
    <input
      type="number"
      min={Mixer.OFFSET_MIN}
      max={Mixer.OFFSET_MAX}
      step="10"
      bind:value={offset}
      onchange={commit}
    />
  </span>

  <span class="col-speed">
    <input
      type="number"
      min={Mixer.SPEED_MIN}
      max={Mixer.SPEED_MAX}
      step="100"
      bind:value={speed}
      onchange={commit}
    />
  </span>

  <span class="col-reverse">
    <Switch bind:checked={reverse} onchange={commit} />
  </span>

  <span class="col-condition">
    <Select
      bind:value={condition}
      options={conditionOptions}
      onchange={commit}
    />
  </span>

  <span class="col-actions">
    {#if !isBlank}
      <button
        class="icon fas fa-chevron-up"
        disabled={!canMoveUp}
        onclick={onMoveUp}
        aria-label="Move up"
      ></button>
      <button
        class="icon fas fa-chevron-down"
        disabled={!canMoveDown}
        onclick={onMoveDown}
        aria-label="Move down"
      ></button>
      <button class="icon fas fa-times" onclick={onDelete} aria-label="Delete"
      ></button>
    {/if}
  </span>

  <span class="col-hint" title={hint ?? ""}>{hint ?? ""}</span>
</div>

<style lang="scss">
  .row {
    display: grid;
    grid-template-columns:
      24px minmax(110px, 1.3fr) 70px minmax(110px, 1.3fr) 90px minmax(
        64px,
        90px
      )
      minmax(64px, 90px) minmax(64px, 90px) minmax(64px, 90px) 44px 90px 70px
      minmax(80px, 1fr);
    align-items: center;
    column-gap: 6px;
    padding: 4px 8px;
    min-width: 900px;
    border-bottom: 1px solid var(--color-border);

    &.highlighted {
      animation: rowFlash 1.2s ease-out;
    }

    &.gated {
      opacity: 0.45;
    }
  }

  .col-index {
    text-align: center;
    color: var(--color-text-soft);
    font-size: 0.75rem;
  }

  .col-weight,
  .col-differential,
  .col-offset,
  .col-speed {
    input {
      width: 100%;
    }
  }

  .col-reverse {
    display: flex;
    justify-content: center;
  }

  .col-actions {
    display: flex;
    justify-content: center;
    gap: 2px;
  }

  .icon {
    background: none;
    border: none;
    padding: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--color-text-soft);

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    @media (hover: hover) {
      &:hover:not(:disabled) {
        color: var(--color-text);
      }
    }
  }

  .col-hint {
    font-size: 0.7rem;
    color: var(--color-yellow-900, #b8860b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes rowFlash {
    from {
      background-color: var(--color-yellow-100);
    }
    to {
      background-color: transparent;
    }
  }
</style>
