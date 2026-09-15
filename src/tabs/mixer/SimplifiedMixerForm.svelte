<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import NumberInput from "@/components/NumberInput.svelte";

  import { FLAP_COMPENSATION_MIN, FLAP_COMPENSATION_MAX } from "./util.js";

  import ModelSetupDialog from "./ModelSetupDialog.svelte";

  let modelType = $derived(Mixer.modelTypeInfo(FC.MIXER_CONFIG.model_type));

  let dialogRef;

  // MIXER_IN_STABILIZED_PITCH / MIXER_IN_RC_CHANNEL_AUX1 (pg/mixer.h) --
  // same indices buildWizardRules() uses to generate these rules in the
  // first place. Identified structurally (Add, flap input, onto whatever
  // output(s) Pitch feeds) rather than tied to any single wizard run, so
  // this keeps working after Save/reload and regardless of layout (single
  // elevator, both V-tail halves, or both elevons).
  const PITCH = 2, RC_AUX1 = 13;

  let flapCompensationRules = $derived.by(() => {
    const pitchOutputs = new Set(
      FC.MIXER_RULES.filter(
        (rule) => !Mixer.isNullRule(rule) && rule.src === PITCH,
      ).map((rule) => rule.dst),
    );

    return FC.MIXER_RULES.filter(
      (rule) =>
        !Mixer.isNullRule(rule) &&
        rule.oper === Mixer.OP_ADD &&
        rule.src === RC_AUX1 &&
        pitchOutputs.has(rule.dst),
    );
  });

  function flapCompensationPercent() {
    return flapCompensationRules.length
      ? Math.round(flapCompensationRules[0].weight / 10)
      : 0;
  }

  function setFlapCompensationPercent(percent) {
    const raw = percent * 10;
    flapCompensationRules.forEach((rule) => {
      rule.weight = raw;
      rule.weightNeg = raw;
    });
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

{#if flapCompensationRules.length > 0}
  <div class="compensationRow">
    <span class="label">
      {$i18n.t("mixerWizardFlapsCompensationLabel")}
    </span>
    <NumberInput
      min={FLAP_COMPENSATION_MIN}
      max={FLAP_COMPENSATION_MAX}
      step="5"
      bind:value={
        () => flapCompensationPercent(), (v) => setFlapCompensationPercent(v)
      }
    />
    <span class="unit">%</span>
  </div>
  <div class="compensationHint">
    {$i18n.t("mixerWizardFlapsCompensationHint")}
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

  .channelTable {
    display: flex;
    flex-direction: column;
  }

  .header-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) 2fr;
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
    grid-template-columns: minmax(120px, 1fr) 2fr;
    column-gap: 12px;
    padding: 6px 8px;
    font-size: 0.85rem;
    border-bottom: 1px solid var(--color-border);

    &:last-child {
      border-bottom: none;
    }
  }

  .output {
    font-weight: 500;
  }

  .compensationRow {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
    padding: 0 8px;
  }

  .compensationRow .label {
    font-size: 0.85rem;
  }

  .compensationRow .unit {
    color: var(--color-text-soft);
  }

  .compensationHint {
    padding: 4px 8px 0;
    color: var(--color-text-soft);
    font-size: 0.7rem;
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
