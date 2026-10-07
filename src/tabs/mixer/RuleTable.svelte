<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";
  import { MixerCurve } from "@/js/MixerCurve.js";
  import { LogicCondition } from "@/js/LogicCondition.js";
  import {
    MIXER_ROLE_ADJUSTMENT_FUNCTIONS,
    adjustmentChannelLabel,
    getAdjustmentState,
  } from "@/tabs/adjustments/adjustmentState.js";

  import RuleRow from "./RuleRow.svelte";
  import { ruleToDisplay } from "./util.js";

  let { onOpenWizard } = $props();

  let highlightIndex = $state(-1);

  // The grid below needs ~1064px (see .header-row), which doesn't survive
  // shrinking to phone width. Below that, show a list of rules you tap into
  // one at a time, each opening a single-column form -- the same list->editor
  // pattern ServoConfigTable.svelte uses. Measured rather than a viewport
  // media query so the sidebar's width is accounted for. containerWidth is
  // 0 before the first layout pass, which shows the compact list briefly
  // rather than an overflowing grid.
  const GRID_MIN_WIDTH = 1080; // .header-row min-width plus its padding
  let containerWidth = $state(0);
  let showCompact = $derived(
    containerWidth === 0 || containerWidth < GRID_MIN_WIDTH,
  );

  // Index into FC.MIXER_RULES of the rule open in the mobile editor.
  let selectedIndex = $state(null);

  // Full mixer rule editor: every used rule plus one trailing blank slot to
  // add a new one. Rules are evaluated by the FC in array order (SET
  // overwrites an output, ADD/MUL stack onto whatever an earlier rule
  // already wrote there), so display order must match array order, and
  // add/delete/move operate on that same order. Mirrors mixer.js's
  // renderMixerRuleTable() exactly.
  let visibleIndexes = $derived.by(() => {
    const rules = FC.MIXER_RULES;
    const indexes = [];
    rules.forEach((rule, index) => {
      if (!Mixer.isNullRule(rule)) indexes.push(index);
    });
    return indexes;
  });

  let blankIndex = $derived(visibleIndexes.length);
  let freeIndex = $derived(Mixer.firstFreeRuleIndex(FC.MIXER_RULES));
  let displayIndexes = $derived(
    freeIndex !== -1 ? [...visibleIndexes, freeIndex] : visibleIndexes,
  );

  // Drops a selection whose rule went away under it (Revert, the wizard
  // rebuilding the table, ...).
  $effect(() => {
    if (selectedIndex !== null && !visibleIndexes.includes(selectedIndex)) {
      selectedIndex = null;
    }
  });

  let hints = $derived.by(() => {
    const outputsSeen = {};
    const result = {};
    displayIndexes.forEach((index, pos) => {
      if (pos === blankIndex) return;
      const rule = FC.MIXER_RULES[index];
      if (rule.dst === 0) return;
      const firstForOutput = !outputsSeen[rule.dst];
      if (firstForOutput && rule.oper !== Mixer.OP_SET) {
        result[index] = $i18n.t("mixerRuleHintFirstShouldSet");
      } else if (!firstForOutput && rule.oper === Mixer.OP_SET) {
        result[index] = $i18n.t("mixerRuleHintOverride");
      }
      outputsSeen[rule.dst] = true;
    });
    return result;
  });

  let outputOptions = $derived(
    Mixer.outputOrder().map((i) => ({
      value: i,
      label: Mixer.outputLabel(i, { getMessage: (key) => $i18n.t(key) }),
    })),
  );

  let operatorOptions = $derived(
    Mixer.operNames
      .slice(1)
      .map((key, i) => ({ value: i + 1, label: $i18n.t(key) })),
  );

  let inputOptions = $derived(
    Mixer.buildInputOptions(
      { getMessage: (key) => $i18n.t(key) },
      FC.RC_MAP,
    ).filter((option) => !Mixer.heliOnlyInputs.includes(option.value)),
  );

  let curveOptions = $derived([
    { value: 0, label: $i18n.t("mixerCurveNone") },
    ...Array.from({ length: MixerCurve.CURVE_COUNT }, (_, c) => ({
      value: c + 1,
      label: $i18n.t("mixerCurveLabel", { 1: c + 1 }),
    })),
  ]);

  let conditionOptions = $derived([
    { value: 0, label: $i18n.t("mixerConditionNone") },
    ...Array.from({ length: LogicCondition.CONDITION_COUNT }, (_, c) => ({
      value: c + 1,
      label: $i18n.t("logicConditionLabel", { 1: c + 1 }),
    })),
  ]);

  let roleOptions = $derived(
    Mixer.roleNames.map((key, i) => ({ value: i, label: $i18n.t(key) })),
  );

  // Dims any rule row whose assigned condition is currently false, so it's
  // obvious at a glance which rules are actually contributing right now
  // versus just configured but gated off.
  function isGatedOff(rule) {
    return (
      rule.condition > 0 &&
      !!FC.LOGIC_CONDITIONS_STATUS &&
      !FC.LOGIC_CONDITIONS_STATUS[rule.condition - 1]
    );
  }

  // If this rule's role has a live-adjustment function (flap compensation,
  // differential thrust yaw), returns that adjustment's current state so the
  // row can show the same ADJ/LIVE badge SimplifiedMixerForm.svelte does, and
  // disable manual editing while it's actively driving the weight.
  function ruleAdjustment(rule) {
    const adjFunction = MIXER_ROLE_ADJUSTMENT_FUNCTIONS[rule.role];
    return adjFunction ? getAdjustmentState(adjFunction) : null;
  }

  function optionLabel(options, value) {
    return options.find((option) => option.value === value)?.label ?? "";
  }

  // Second line of a mobile list row: what feeds the output and how.
  function ruleSummary(rule) {
    const parts = [
      optionLabel(operatorOptions, rule.oper),
      optionLabel(inputOptions, rule.src),
    ];
    if (rule.curve > 0) parts.push(optionLabel(curveOptions, rule.curve));
    if (rule.condition > 0) {
      parts.push(optionLabel(conditionOptions, rule.condition));
    }
    return parts.join(" · ");
  }

  function move(index, targetPos) {
    const target = displayIndexes[targetPos];
    Mixer.swapRules(FC.MIXER_RULES, index, target);
    highlightIndex = target;
    if (selectedIndex === index) selectedIndex = target;
  }

  function deleteRule(index) {
    FC.MIXER_RULES.splice(index, 1);
    FC.MIXER_RULES.push(Mixer.nullRule());
    if (selectedIndex === index) selectedIndex = null;
  }

  function addRule() {
    const index = Mixer.firstFreeRuleIndex(FC.MIXER_RULES);
    if (index === -1) return;

    // The mobile list has no blank row to type into, so go straight to the
    // new rule's editor.
    if (showCompact) selectedIndex = index;

    FC.MIXER_RULES[index] = {
      oper: Mixer.OP_SET,
      src: 0,
      dst: 0,
      curve: 0,
      weight: 1000,
      weightNeg: 1000,
      offset: 0,
      speed: 0,
      condition: 0,
      role: 0,
    };
  }
</script>

{#snippet ruleRow(index, pos, stacked)}
  {@const isBlank = pos === blankIndex}
  <RuleRow
    rule={FC.MIXER_RULES[index]}
    {isBlank}
    {stacked}
    label={isBlank ? "" : String(pos + 1)}
    hint={hints[index]}
    highlighted={index === highlightIndex}
    gatedOff={!isBlank && isGatedOff(FC.MIXER_RULES[index])}
    canMoveUp={pos > 0}
    canMoveDown={pos < blankIndex - 1}
    {outputOptions}
    {operatorOptions}
    {inputOptions}
    {curveOptions}
    {conditionOptions}
    {roleOptions}
    adjustment={!isBlank ? ruleAdjustment(FC.MIXER_RULES[index]) : null}
    onCommit={(newRule) => {
      FC.MIXER_RULES[index] = newRule;
    }}
    onMoveUp={() => move(index, pos - 1)}
    onMoveDown={() => move(index, pos + 1)}
    onDelete={() => deleteRule(index)}
  />
{/snippet}

<div class="responsive-table" bind:clientWidth={containerWidth}>
  {#if !showCompact}
    <div class="table">
      <div class="header-row">
        <span></span>
        <span>{$i18n.t("mixerRuleOutput")}</span>
        <span>{$i18n.t("mixerRuleOperator")}</span>
        <span>{$i18n.t("mixerRuleInput")}</span>
        <span>{$i18n.t("mixerRuleCurve")}</span>
        <span>{$i18n.t("mixerRuleWeight")}</span>
        <span>{$i18n.t("mixerRuleDifferential")}</span>
        <span>{$i18n.t("mixerRuleOffset")}</span>
        <span>{$i18n.t("mixerRuleSpeed")}</span>
        <span>{$i18n.t("mixerRuleReverse")}</span>
        <span>{$i18n.t("mixerRuleCondition")}</span>
        <span>{$i18n.t("mixerRuleRole")}</span>
        <span></span>
        <span>{$i18n.t("mixerRuleActionsHeader")}</span>
        <span></span>
      </div>

      {#each displayIndexes as index, pos (index)}
        {@render ruleRow(index, pos, false)}
      {/each}
    </div>
  {:else if selectedIndex !== null}
    {@const index = selectedIndex}
    {@const pos = visibleIndexes.indexOf(index)}
    <div class="mobile-detail">
      <button
        type="button"
        class="mobile-back"
        onclick={() => (selectedIndex = null)}
      >
        <em class="fas fa-chevron-left"></em>
        {$i18n.t("mixerRuleListBack")}
      </button>

      <div class="mobile-detail-title">
        {$i18n.t("mixerRuleNumber", { 1: pos + 1 })}
      </div>

      {#if hints[index]}
        <div class="mobile-hint">
          <em class="fas fa-exclamation-triangle"></em>
          {hints[index]}
        </div>
      {/if}

      {@render ruleRow(index, pos, true)}

      <div class="mobile-actions">
        <button
          type="button"
          class="btn"
          disabled={pos <= 0}
          onclick={() => move(index, pos - 1)}
        >
          <em class="fas fa-chevron-up"></em>
          {$i18n.t("mixerRuleMoveUp")}
        </button>
        <button
          type="button"
          class="btn"
          disabled={pos >= blankIndex - 1}
          onclick={() => move(index, pos + 1)}
        >
          <em class="fas fa-chevron-down"></em>
          {$i18n.t("mixerRuleMoveDown")}
        </button>
        <div class="grow"></div>
        <button type="button" class="btn" onclick={() => deleteRule(index)}>
          <em class="fas fa-times"></em>
          {$i18n.t("mixerRuleDelete")}
        </button>
      </div>
    </div>
  {:else}
    <div class="mobile-list">
      {#each visibleIndexes as index, pos (index)}
        {@const rule = FC.MIXER_RULES[index]}
        {@const display = ruleToDisplay(rule)}
        {@const adjustment = ruleAdjustment(rule)}
        <button
          type="button"
          class="mobile-list-row"
          class:highlighted={index === highlightIndex}
          class:gated={isGatedOff(rule)}
          onclick={() => (selectedIndex = index)}
        >
          <span class="mobile-row-index">{pos + 1}</span>
          <span class="mobile-row-main">
            <span class="mobile-row-output">
              {optionLabel(outputOptions, rule.dst)}
            </span>
            <span class="mobile-row-summary">{ruleSummary(rule)}</span>
          </span>
          {#if hints[index]}
            <em
              class="fas fa-exclamation-triangle mobile-row-hint"
              title={hints[index]}
            ></em>
          {/if}
          {#if adjustment}
            <span
              class="mobile-row-tag adjustment"
              class:runtime-active={adjustment.active}
            >
              {adjustment.active
                ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
                : "ADJ"}
            </span>
          {/if}
          {#if display.reverse}
            <span class="mobile-row-tag">{$i18n.t("mixerRuleReverse")}</span>
          {/if}
          <span class="mobile-row-weight">{display.weight}</span>
          <em class="fas fa-chevron-right mobile-row-chevron"></em>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if !showCompact || selectedIndex === null}
  <div class="toolbar">
    <button class="btn" onclick={addRule} disabled={freeIndex === -1}>
      {$i18n.t("mixerAddRule")}
    </button>
    <button class="btn" onclick={onOpenWizard}>
      {$i18n.t("mixerOpenWizard")}
    </button>
  </div>
{/if}

<style lang="scss">
  .table {
    overflow-x: auto;
  }

  .header-row {
    display: grid;
    grid-template-columns:
      24px minmax(110px, 1.3fr) 70px minmax(110px, 1.3fr) 90px minmax(
        64px,
        90px
      )
      minmax(64px, 90px) minmax(64px, 90px) minmax(64px, 90px) 44px 90px 70px
      110px 54px minmax(80px, 1fr);
    column-gap: 6px;
    padding: 4px 8px;
    font-weight: 600;
    font-size: 0.75rem;
    min-width: 1064px;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
    border-bottom: 1px solid var(--color-border);
  }

  .toolbar {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .btn {
    @extend %button;
  }

  .grow {
    flex-grow: 1;
  }

  .responsive-table {
    width: 100%;
  }

  .mobile-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 2px;
  }

  .mobile-list-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font: inherit;
    text-align: left;
    cursor: pointer;

    color: var(--color-text);
    background-color: var(--color-surface);

    &.gated {
      opacity: 0.45;
    }

    &.highlighted {
      animation: rowFlash 1.2s ease-out;
    }

    @media (hover: hover) {
      &:hover {
        background-color: var(--color-surface-float, var(--color-surface));
      }
    }
  }

  .mobile-row-index {
    flex-shrink: 0;
    min-width: 1.4rem;
    font-weight: 700;
    text-align: center;

    color: var(--color-text-soft);
  }

  .mobile-row-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .mobile-row-output,
  .mobile-row-summary {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .mobile-row-output {
    font-weight: 600;
  }

  .mobile-row-summary {
    font-size: 0.75rem;

    color: var(--color-text-soft);
  }

  .mobile-row-hint {
    flex-shrink: 0;
    font-size: 0.8rem;

    color: var(--color-yellow-900, #b8860b);
  }

  // Same look as RuleRow's adjustment badge and ServoConfigTable's REV tag.
  .mobile-row-tag {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    font-size: 0.65rem;
    font-weight: 700;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));

    &.adjustment {
      border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
      background-color: transparent;
    }

    &.runtime-active {
      color: var(--color-text-inverse, #fff);
      background-color: var(--color-accent, var(--accent));
    }
  }

  .mobile-row-weight {
    flex-shrink: 0;
    min-width: 2.8rem;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .mobile-row-chevron {
    flex-shrink: 0;
    font-size: 0.8rem;

    color: var(--color-text-soft);
  }

  .mobile-detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 2px;
  }

  .mobile-back {
    @extend %button;

    align-self: flex-start;
    gap: 6px;
    padding: 0 10px;
  }

  .mobile-detail-title {
    margin: 6px 0 4px;
    font-weight: 700;
    font-size: 0.95rem;
    text-align: center;
  }

  .mobile-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    font-size: 0.8rem;

    color: var(--color-yellow-900, #b8860b);
  }

  .mobile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;

    .btn {
      gap: 6px;
    }
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
