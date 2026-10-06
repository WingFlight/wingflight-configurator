<script>
  import { i18n } from "@/js/i18n.js";

  // The board's servo outputs against what a model setup needs, one box per
  // output: used, free, or needed but missing on this board. `shortfall` is
  // Mixer.missingServoOutputs(); the setup numbers servos from 1, so the
  // used ones are always 1..needed.
  let { shortfall } = $props();

  let boxes = $derived(
    Array.from(
      { length: Math.max(shortfall.needed, shortfall.available) },
      (_, i) => {
        const output = i + 1;
        if (output > shortfall.available) return { output, state: "missing" };
        return { output, state: output <= shortfall.needed ? "used" : "free" };
      },
    ),
  );

  let over = $derived(shortfall.missing.length > 0);
</script>

<div class={["meter", over && "over"]}>
  <span class="title">{$i18n.t("mixerWizardServoOutputs")}</span>
  <span class="boxes">
    {#each boxes as box (box.output)}
      <span class={["box", box.state]}>{box.output}</span>
    {/each}
  </span>
  <span class="count">
    {$i18n.t(
      over ? "mixerWizardServoOutputsShort" : "mixerWizardServoOutputsUsed",
      { 1: shortfall.needed, 2: shortfall.available },
    )}
  </span>
</div>

<style lang="scss">
  .meter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-status-good);
    border-radius: var(--radius-sm);
    background: var(--color-surface-float, var(--color-surface));

    &.over {
      border-left-color: var(--color-status-bad);
    }
  }

  .title {
    font-weight: 600;
  }

  .boxes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .box {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--color-border);
    font-size: 0.8em;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-soft);

    &.used {
      border-color: var(--color-status-good);
      background-color: var(--color-status-good);
      color: #fff;
    }

    &.missing {
      border: 1px dashed var(--color-status-bad);
      color: var(--color-status-bad);
    }
  }

  .count {
    margin-left: auto;
    font-weight: 600;

    .over & {
      color: var(--color-status-bad);
    }
  }
</style>
