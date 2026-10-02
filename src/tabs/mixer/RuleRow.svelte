<script>
  import { Mixer } from "@/js/Mixer.js";

  import Select from "@/components/Select.svelte";
  import Switch from "@/components/Switch.svelte";

  import {
    adjustmentChannelLabel,
    adjustmentTitle,
  } from "@/tabs/adjustments/adjustmentState.js";

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
    roleOptions,
    adjustment,
    onCommit,
    onMoveUp,
    onMoveDown,
    onDelete,
  } = $props();

  // Mirrors the legacy row's local form state -- every field change re-reads
  // all of these and writes one whole rule object, matching mixer.js's
  // commit(), including its "any touched field defaults the displayed
  // operator to Set" behaviour for a still-blank row.
  let dst = $state();
  let oper = $state();
  let src = $state();
  let curve = $state();
  let offset = $state();
  let speed = $state();
  let condition = $state();
  let role = $state();
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
    role = rule.role || 0;

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
      role: role || 0,
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
      disabled={adjustment?.active}
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
      disabled={adjustment?.active}
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

  <span class="col-role">
    <Select bind:value={role} options={roleOptions} onchange={commit} />
  </span>

  <span class="col-adjustment">
    {#if adjustment}
      <span
        class="adjustment-badge"
        class:runtime-active={adjustment.active}
        title={adjustmentTitle(adjustment)}
      >
        {adjustment.active
          ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
          : "ADJ"}
      </span>
    {/if}
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
      110px 54px minmax(80px, 1fr);
    align-items: center;
    column-gap: 6px;
    padding: 4px 8px;
    min-width: 1064px;
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

  // Grid items default to a content-based minimum width, so without this a
  // <select> happily forces itself (and the column) wider than its track to
  // fit its longest option ("Stabilized Roll" etc.) - overflowing into the
  // next column instead of respecting the space the grid actually gave it.
  .col-output,
  .col-oper,
  .col-input,
  .col-curve,
  .col-condition,
  .col-role {
    min-width: 0;

    :global(select) {
      width: 100%;
      min-width: 0;
    }
  }

  .col-weight,
  .col-differential,
  .col-offset,
  .col-speed {
    input {
      width: 100%;
    }
  }

  // Weight/Differential are disabled while a role-adjustment is active,
  // since applyRoleWeight() (flight/mixer.c) overwrites both to the same
  // live-driven magnitude on every tick regardless of what's typed here.
  // Reverse stays editable even while active -- the adjustment only ever
  // scales magnitude, never sign, so flipping Reverse (and saving) takes
  // effect immediately and durably. The badge itself lives in its own slim
  // column at the end of the row rather than inside col-weight -- there's
  // no room there to show it without forcing the row onto two lines.
  .col-adjustment {
    display: flex;
    justify-content: center;
  }

  // Matches SimplifiedMixerForm.svelte/ServoConfigTable.svelte's own
  // adjustment-badge treatment (just smaller, to fit this column), so a rule
  // under live RC-adjustment control reads the same way everywhere in the
  // app.
  .adjustment-badge {
    max-width: 100%;
    padding: 1px 3px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: var(--radius-xs);
    background-color: transparent;
    color: var(--color-text-soft);
    font-size: 0.55rem;
    font-weight: 700;
    line-height: 0.9rem;
    text-align: center;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .adjustment-badge.runtime-active {
    background-color: var(--color-accent, var(--accent));
    color: var(--color-text-inverse, #fff);
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
