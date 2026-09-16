<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import ModelSetupDialog from "./ModelSetupDialog.svelte";
  import { clampInt } from "./util.js";

  let modelType = $derived(Mixer.modelTypeInfo(FC.MIXER_CONFIG.model_type));

  let dialogRef;

  // Purpose-tagged rules (e.g. the wizard's Flap Compensation rule) have no
  // other way to be tuned outside the raw rule table, which only exists in
  // Custom mode (Mixer.svelte gates RuleTable on model_type) -- surface just
  // their weight here so a named model type never needs a detour through
  // Custom mode to dial one in. Signed and shown directly (no Reverse/
  // Differential decomposition like RuleRow's -- a compensation rule is a
  // single symmetric ADD, there's nothing to decompose).
  const COMPENSATION_WEIGHT_MIN = -Mixer.WEIGHT_MAX;
  const COMPENSATION_WEIGHT_MAX = Mixer.WEIGHT_MAX;

  let compensationRules = $derived.by(() => {
    const i18nShim = { getMessage: (key) => $i18n.t(key) };
    return FC.MIXER_RULES.map((rule, idx) => ({ rule, idx }))
      .filter(({ rule }) => !Mixer.isNullRule(rule) && rule.purpose)
      .map(({ rule, idx }) => ({
        idx,
        rule,
        purposeLabel: $i18n.t(Mixer.purposeNames[rule.purpose]),
        outputLabel: Mixer.outputLabel(rule.dst, i18nShim),
      }));
  });

  function setCompensationWeight(idx, rule, rawValue) {
    const weight = clampInt(
      rawValue,
      COMPENSATION_WEIGHT_MIN,
      COMPENSATION_WEIGHT_MAX,
    );
    FC.MIXER_RULES[idx] = { ...rule, weight, weightNeg: weight };
  }

  // Read-only summary of what's actually in FC.MIXER_RULES right now -- not
  // the wizard options that produced it, so it stays accurate even if rules
  // were hand-edited (e.g. left over from a prior Custom session) rather
  // than generated. One row per output, listing every input contributing to
  // it in rule order.
  let channelRows = $derived.by(() => {
    const i18nShim = { getMessage: (key) => $i18n.t(key) };
    const byOutput = {};

    FC.MIXER_RULES.forEach((rule) => {
      if (Mixer.isNullRule(rule)) return;
      (byOutput[rule.dst] ??= []).push(rule);
    });

    return Object.keys(byOutput)
      .map(Number)
      .sort((a, b) => a - b)
      .map((dst) => ({
        dst,
        outputLabel: Mixer.outputLabel(dst, i18nShim),
        inputsText: byOutput[dst]
          .map((rule) => {
            const label = $i18n.t(Mixer.inputNames[rule.src]);
            return rule.weight < 0
              ? `${label} (${$i18n.t("mixerRuleReverse")})`
              : label;
          })
          .join(", "),
      }));
  });
</script>

{#if channelRows.length === 0}
  <div class="empty">{$i18n.t("mixerChannelSummaryEmpty")}</div>
{:else}
  <div class="channelTable">
    <div class="header-row">
      <span>{$i18n.t("mixerChannelSummaryOutput")}</span>
      <span>{$i18n.t("mixerChannelSummaryInput")}</span>
    </div>
    {#each channelRows as row (row.dst)}
      <div class="row">
        <span class="output">{row.outputLabel}</span>
        <span class="input">{row.inputsText}</span>
      </div>
    {/each}
  </div>
{/if}

{#if compensationRules.length > 0}
  <div class="compensationTable">
    <div class="header-row">
      <span>{$i18n.t("mixerCompensationPurpose")}</span>
      <span>{$i18n.t("mixerChannelSummaryOutput")}</span>
      <span>{$i18n.t("mixerRuleWeight")}</span>
    </div>
    {#each compensationRules as { idx, rule, purposeLabel, outputLabel } (idx)}
      <div class="row">
        <span class="purpose">{purposeLabel}</span>
        <span class="output">{outputLabel}</span>
        <span class="weight">
          <input
            type="number"
            min={COMPENSATION_WEIGHT_MIN}
            max={COMPENSATION_WEIGHT_MAX}
            step="10"
            value={rule.weight}
            onchange={(e) => setCompensationWeight(idx, rule, e.target.value)}
          />
        </span>
      </div>
    {/each}
  </div>
{/if}

<div class="editRow">
  <button class="editBtn" onclick={() => dialogRef.open(modelType)}>
    {$i18n.t("mixerEditConfiguration")}
  </button>
</div>

<ModelSetupDialog bind:this={dialogRef} />

<style lang="scss">
  .empty {
    padding: 16px 8px;
    color: var(--color-text-soft);
    font-size: 0.85rem;
  }

  .channelTable,
  .compensationTable {
    display: flex;
    flex-direction: column;
  }

  .compensationTable {
    margin-top: var(--section-gap, 16px);
  }

  .header-row {
    display: grid;
    column-gap: 12px;
    padding: 4px 8px;
    font-weight: 600;
    font-size: 0.75rem;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
    border-bottom: 1px solid var(--color-border);
  }

  .row {
    display: grid;
    column-gap: 12px;
    padding: 6px 8px;
    font-size: 0.85rem;
    border-bottom: 1px solid var(--color-border);

    &:last-child {
      border-bottom: none;
    }
  }

  .channelTable .header-row,
  .channelTable .row {
    grid-template-columns: minmax(120px, 1fr) 2fr;
  }

  .compensationTable .header-row,
  .compensationTable .row {
    grid-template-columns: minmax(120px, 1fr) minmax(100px, 1fr) 100px;
    align-items: center;
  }

  .output,
  .purpose {
    font-weight: 500;
  }

  .weight input {
    width: 100%;
  }

  .editRow {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }

  // Deliberately understated -- this used to be an always-visible
  // generate-rules form; now it's one deliberate click away so the mix
  // can't be regenerated by an accidental interaction with the page.
  .editBtn {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    padding: 4px 10px;
    font-size: 0.75rem;
    color: var(--color-text-soft);
    cursor: pointer;

    &:hover {
      color: var(--color-text);
      border-color: var(--color-text-soft);
    }
  }
</style>
