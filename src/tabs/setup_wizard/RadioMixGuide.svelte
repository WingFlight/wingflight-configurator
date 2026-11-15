<script>
  // "On the radio first": a knob or a switch reaches the flight controller
  // only when a mix on the radio puts it on a channel. Detect and Assign
  // watch the channels, so without that mix nothing is found. Shown on the
  // Trim and gain step (kind "knob") and the Mode switches step (kind
  // "switch"), with Ethos as the worked example.
  //
  // The screenshots are from the Ethos simulator (FrSkyRC/ethos-tools,
  // X20S): a Free mix with the control as its source and a spare channel as
  // its output.
  import { i18n } from "@/js/i18n.js";

  // done: the control is already on a channel, so the steps fold away
  // behind a link and only the reminder stays.
  let { kind, done = false } = $props();

  const IMAGES = {
    knob: [
      "ethos_mixes_library.png",
      "ethos_gain_mix.png",
      "ethos_gain_mixes.png",
    ],
    switch: [
      "ethos_mixes_library.png",
      "ethos_switch_mix.png",
      "ethos_switch_mixes.png",
    ],
  };

  let images = $derived(IMAGES[kind]);
  let enlarged = $state(null);
  // The pilot can open the steps again, or close them, by hand.
  let chosen = $state(null);
  let open = $derived(chosen ?? !done);
</script>

<div class={["radio-guide", done && "done"]}>
  <div class="lead">
    <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
    <div>
      <strong>{$i18n.t(`setupWizardRadioMixTitle_${kind}`)}</strong>
      <p>{$i18n.t(`setupWizardRadioMixText_${kind}`)}</p>
      <button type="button" class="toggle" onclick={() => (chosen = !open)}>
        {open
          ? $i18n.t("setupWizardRadioMixHide")
          : $i18n.t("setupWizardRadioMixShow")}
      </button>
    </div>
  </div>

  {#if open}
    <div class="guide">
      {#each images as image, i (image)}
        {@const text = $i18n.t(`setupWizardRadioMixStep${i + 1}_${kind}`)}
        <div class="guide-step">
          <span class="step-number">{i + 1}</span>
          <div class="guide-text">
            <!-- The step text is our own string, with <b> for the radio's labels. -->
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <span>{@html text}</span>
          </div>
          <button
            type="button"
            class={["shot", enlarged === image && "enlarged"]}
            title={$i18n.t("setupWizardTrimButtonsZoom")}
            onclick={() => (enlarged = enlarged === image ? null : image)}
          >
            <img
              src="/images/setup_wizard/{image}"
              alt={$i18n.t(`setupWizardRadioMixImage${i + 1}_${kind}`)}
            />
          </button>
        </div>
      {/each}
      <div class="guide-step">
        <span class="step-number">{images.length + 1}</span>
        <div class="guide-text">
          <span>{$i18n.t(`setupWizardRadioMixStep4_${kind}`)}</span>
        </div>
      </div>
    </div>
    <p class="muted">{$i18n.t("setupWizardRadioMixOtherRadios")}</p>
  {/if}
</div>

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .radio-guide {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--color-yellow-500);
    border-left-width: 4px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);

    // Found: no longer a warning.
    &.done {
      border-color: var(--color-border-soft);

      .lead > i {
        color: var(--color-text-soft);
      }
    }
  }

  .toggle {
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-accent-500);
    font: inherit;
    font-size: 0.9em;
    text-decoration: underline;
    cursor: pointer;
  }

  .lead {
    display: flex;
    align-items: flex-start;
    gap: 10px;

    > i {
      margin-top: 2px;
      color: var(--color-yellow-500);
      font-size: 1.2em;
    }

    > div {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  }

  .guide {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .guide-step {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 14px;
  }

  // The global reset removes list markers, so the number is drawn here.
  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1.6em;
    height: 1.6em;
    border-radius: 50%;
    background-color: var(--color-accent-500);
    color: var(--color-accent-fg);
    font-size: 0.85em;
    font-weight: 700;
  }

  .guide-text {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1 1 240px;
    max-width: 60ch;
  }

  // A thumbnail by default; full size (up to the card width) when clicked.
  .shot {
    flex: 0 0 auto;
    width: 220px;
    max-width: 100%;
    padding: 0;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-sm);
    background: none;
    line-height: 0;
    cursor: zoom-in;

    &.enlarged {
      width: 560px;
      cursor: zoom-out;
    }

    img {
      width: 100%;
      height: auto;
      border-radius: var(--radius-sm);
    }
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
