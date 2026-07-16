<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";
  import { MixerCurve } from "@/js/MixerCurve.js";
  import { LogicCondition } from "@/js/LogicCondition.js";

  import RuleRow from "./RuleRow.svelte";

  let { onOpenWizard } = $props();

  let highlightIndex = $state(-1);

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
    Mixer.outputNames.map((_key, i) => ({
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
    Mixer.inputNames
      .map((key, i) => ({ value: i, label: $i18n.t(key) }))
      .filter((_option, i) => !Mixer.heliOnlyInputs.includes(i)),
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

  function move(index, targetPos) {
    const target = displayIndexes[targetPos];
    Mixer.swapRules(FC.MIXER_RULES, index, target);
    highlightIndex = target;
  }

  function deleteRule(index) {
    FC.MIXER_RULES.splice(index, 1);
    FC.MIXER_RULES.push(Mixer.nullRule());
  }

  function addRule() {
    const index = Mixer.firstFreeRuleIndex(FC.MIXER_RULES);
    if (index === -1) return;

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
    };
  }
</script>

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
    <span>{$i18n.t("mixerRuleActionsHeader")}</span>
    <span></span>
  </div>

  {#each displayIndexes as index, pos (index)}
    {@const isBlank = pos === blankIndex}
    <RuleRow
      rule={FC.MIXER_RULES[index]}
      {isBlank}
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
      onCommit={(newRule) => {
        FC.MIXER_RULES[index] = newRule;
      }}
      onMoveUp={() => move(index, pos - 1)}
      onMoveDown={() => move(index, pos + 1)}
      onDelete={() => deleteRule(index)}
    />
  {/each}
</div>

<div class="toolbar">
  <button class="btn" onclick={addRule}>{$i18n.t("mixerAddRule")}</button>
  <button class="btn" onclick={onOpenWizard}>
    {$i18n.t("mixerOpenWizard")}
  </button>
</div>

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
      minmax(80px, 1fr);
    column-gap: 6px;
    padding: 4px 8px;
    font-weight: 600;
    font-size: 0.75rem;
    min-width: 900px;

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
</style>
