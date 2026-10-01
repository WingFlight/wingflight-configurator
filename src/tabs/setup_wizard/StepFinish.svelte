<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import motorState from "@/tabs/motors/state.svelte.js";

  import { AXES } from "./surfaces.js";
  import { matchingStyle } from "./styles.js";

  const wiz = getContext("setupWizard");

  let finished = $state(false);

  let modelType = $derived(
    $i18n.t(Mixer.modelTypeInfo(FC.MIXER_CONFIG.model_type).labelKey),
  );

  // The Motor step's wording for its own choices; anything else by name.
  const ESC_LABELS = {
    PWM: "setupWizardMotor_pwm",
    DSHOT300: "setupWizardMotor_dshot300",
    DSHOT600: "setupWizardMotor_dshot600",
    DISABLED: "setupWizardMotor_none",
  };

  let escProtocol = $derived.by(() => {
    const name =
      motorState.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol];
    return ESC_LABELS[name] ? $i18n.t(ESC_LABELS[name]) : name;
  });

  let throws = $derived(
    AXES.filter((a) => wiz.surfaces.some((s) => s.axes[a.key]))
      .map(
        (a) =>
          `${$i18n.t(`setupWizardAxis_${a.key}`)} ${wiz.axisGainPercent(a.key)}%`,
      )
      .join(", "),
  );

  let style = $derived(matchingStyle(FC.RC_TUNING, FC.PID_PROFILE));

  let armAssigned = $derived(
    FC.MODE_RANGES.some((r) => r.id === 0 && r.range.start < r.range.end),
  );

  async function finish() {
    if (wiz.pending) {
      await wiz.save();
    }
    finished = true;
  }
</script>

<p>{$i18n.t("setupWizardFinishIntro")}</p>

<dl class="summary">
  <dt>{$i18n.t("setupWizardFinishModel")}</dt>
  <dd>{modelType}</dd>

  <dt>{$i18n.t("setupWizardFinishSurfaces")}</dt>
  <dd>{wiz.surfaces.map((s) => wiz.surfaceLabel(s)).join(", ") || "–"}</dd>

  <dt>{$i18n.t("setupWizardFinishEsc")}</dt>
  <dd>{escProtocol}</dd>

  <dt>{$i18n.t("setupWizardFinishThrows")}</dt>
  <dd>{throws || "–"}</dd>

  <dt>{$i18n.t("setupWizardFinishStyle")}</dt>
  <dd>
    {style
      ? $i18n.t(`setupWizardStyle_${style.key}`)
      : $i18n.t("setupWizardFinishStyleCustom")}
  </dd>

  <dt>{$i18n.t("setupWizardModes_arm")}</dt>
  <dd class={armAssigned ? "good" : "bad"}>
    {armAssigned
      ? $i18n.t("setupWizardModesAssigned")
      : $i18n.t("setupWizardModesNotAssigned")}
  </dd>
</dl>

<div class="note">{$i18n.t("setupWizardFinishThrowsTune")}</div>

<div class="before">
  <strong>{$i18n.t("setupWizardFinishBeforeTitle")}</strong>
  <ul>
    {#each [1, 2, 3] as n (n)}
      <li>{$i18n.t(`setupWizardFinishBefore_${n}`)}</li>
    {/each}
  </ul>
</div>

<div class="finish">
  {#if finished && !wiz.pending}
    <span class="good">{$i18n.t("setupWizardFinishDone")}</span>
  {:else}
    <button class="btn primary" disabled={wiz.saving} onclick={finish}>
      {$i18n.t("setupWizardFinishButton")}
    </button>
  {/if}
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .summary {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 4px 16px;
    margin: 0;
    max-width: 720px;

    dt {
      color: var(--color-text-soft);
    }

    dd {
      margin: 0;
      font-weight: 600;
    }
  }

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-yellow-500);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .before {
    max-width: 70ch;

    ul {
      margin: 4px 0 0;
      padding-left: 20px;
    }

    li {
      list-style: disc;
      margin-bottom: 2px;
    }
  }

  .finish {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .good {
    color: var(--color-status-good);
    font-weight: 600;
  }

  .bad {
    color: var(--color-status-bad);
  }
</style>
