<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import motorState from "@/tabs/motors/state.svelte.js";

  import { AXES } from "./surfaces.js";
  import { matchingStyle } from "./styles.js";
  import {
    THROTTLE_MODE_BIDIRECTIONAL,
    COUPLED_AXIS_PITCH,
    COUPLED_AXIS_YAW,
  } from "@/js/ReverseFlight.js";

  const wiz = getContext("setupWizard");

  let finished = $state(false);

  let modelType = $derived(
    $i18n.t(Mixer.modelTypeInfo(FC.MIXER_CONFIG.model_type).labelKey),
  );

  // The Motor step's wording for its own choices; anything else by name.
  const ESC_LABELS = {
    PWM: "setupWizardMotor_pwm",
    DSHOT300: "setupWizardMotor_dshot300",
    DSHOT150: "setupWizardMotor_dshot150",
    DISABLED: "setupWizardMotor_none",
  };

  let escProtocol = $derived.by(() => {
    const name =
      motorState.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol];
    return ESC_LABELS[name] ? $i18n.t(ESC_LABELS[name]) : name;
  });

  let escTelemetry = $derived(
    motorState.telemEnabled
      ? motorState.isCastleLink
        ? "Castle Link"
        : motorState.telemetryProtocols[FC.ESC_SENSOR_CONFIG.protocol]
      : $i18n.t("setupWizardFinishEscTelemetryOff"),
  );

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

  let reverseFlight = $derived(FC.REVERSE_FLIGHT_CONFIG);
  let bidirectional = $derived(
    reverseFlight?.throttle_mode === THROTTLE_MODE_BIDIRECTIONAL,
  );
  let gimbalModeAssigned = $derived(
    FC.MODE_RANGES.some((r) => r.id === 63 && r.range.start < r.range.end),
  );
  let gimbalText = $derived(
    wiz.gimbals
      .map((g) =>
        $i18n.t("setupWizardGimbalServo", {
          1: g.servo + 1,
          2: $i18n.t(`setupWizardGimbalAxis_${g.axis}`),
        }),
      )
      .join(", "),
  );
  let linkedText = $derived(
    [
      ((reverseFlight?.reverse_coupled_axes ?? 0) & COUPLED_AXIS_YAW) !== 0 &&
        $i18n.t("setupWizardGimbalLinked_yaw"),
      ((reverseFlight?.reverse_coupled_axes ?? 0) & COUPLED_AXIS_PITCH) !== 0 &&
        $i18n.t("setupWizardGimbalLinked_pitch"),
    ]
      .filter(Boolean)
      .join(", "),
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

  <dt>{$i18n.t("setupWizardFinishEscTelemetry")}</dt>
  <dd>{escTelemetry}</dd>

  <dt>{$i18n.t("setupWizardFinishThrows")}</dt>
  <dd>{throws || "–"}</dd>

  <dt>{$i18n.t("setupWizardFinishStyle")}</dt>
  <dd>
    {style
      ? $i18n.t(`setupWizardStyle_${style.key}`)
      : $i18n.t("setupWizardFinishStyleCustom")}
  </dd>

  {#if reverseFlight}
    <dt>{$i18n.t("setupWizardMotorThrottleTitle")}</dt>
    <dd>
      {bidirectional
        ? $i18n.t("setupWizardMotorThrottle_bidirectional")
        : $i18n.t("setupWizardMotorThrottle_normal")}
    </dd>
  {/if}

  {#if wiz.gimbals.length > 0}
    <dt>{$i18n.t("setupWizardStep_gimbal")}</dt>
    <dd>{gimbalText}</dd>

    <dt>{$i18n.t("setupWizardModes_thrustVector")}</dt>
    <dd class={gimbalModeAssigned ? "good" : "bad"}>
      {gimbalModeAssigned
        ? $i18n.t("setupWizardModesAssigned")
        : $i18n.t("setupWizardModesNotAssigned")}
    </dd>
  {/if}

  {#if bidirectional && linkedText}
    <dt>{$i18n.t("setupWizardGimbalLinkedTitle")}</dt>
    <dd>{linkedText}</dd>
  {/if}

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
