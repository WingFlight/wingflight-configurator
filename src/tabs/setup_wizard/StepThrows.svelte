<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import PassthroughStatus from "./PassthroughStatus.svelte";
  import RadioIcon from "./RadioIcon.svelte";
  import MeasureThrow from "./MeasureThrow.svelte";
  import AxisIcon from "./AxisIcon.svelte";
  import StickIcon from "./StickIcon.svelte";
  import DifferentialIcon from "./DifferentialIcon.svelte";
  import {
    AXES,
    AXIS_GAIN_MIN,
    AXIS_GAIN_MAX,
    SCALE_MIN,
    SERVO_FLAG_REVERSE,
    maxScale,
    outputForAxis,
    primaryAxis,
    servoSide,
    travelReach,
  } from "./surfaces.js";

  // Throws are set with the radio in PASSTHROUGH mode, so full stick is exactly
  // what the pilot's sticks and endpoints give, with no gyro. No overrides
  // here: in PASSTHROUGH mode the FC replaces the stabilized inputs with the stick
  // (flight/mixer.c), and Axis Throw and servo scale still apply.
  //
  // Two controls per axis, both used the same way (hold the stick, watch the
  // surface, press - or +): Throw is the axis's Axis Throw, shared by every
  // surface and both directions; Fine-tune is one servo's scale on one side,
  // for differential or a surface that comes out different from its pair.
  const wiz = getContext("setupWizard");

  // Full stick each way. Signs as in the Direction step: roll + is right,
  // pitch - is stick back, yaw - is right.
  const DIRECTIONS = {
    roll: [
      { stick: 1, key: "rollRight", x: 1, y: 0 },
      { stick: -1, key: "rollLeft", x: -1, y: 0 },
    ],
    pitch: [
      { stick: -1, key: "pitchBack", x: 0, y: 1 },
      { stick: 1, key: "pitchForward", x: 0, y: -1 },
    ],
    yaw: [
      { stick: -1, key: "yawRight", x: 1, y: 0 },
      { stick: 1, key: "yawLeft", x: -1, y: 0 },
    ],
  };

  let axes = $derived(
    AXES.map((a) => a.key).filter((axis) =>
      wiz.surfaces.some((s) => s.axes[axis]),
    ),
  );

  function surfacesOn(axis) {
    return wiz.surfaces.filter((s) => s.axes[axis]);
  }

  // A surface that works two axes has one scale per side for both, so it is
  // fine-tuned on its main axis's card only.
  function fineTuned(axis) {
    return surfacesOn(axis).filter((s) => primaryAxis(s) === axis);
  }

  // Servo scale is shown as a percentage of the firmware default
  // (DEFAULT_SERVO_SCALE in flight/servos.h), so 1% is 5 scale units.
  const DEFAULT_SCALE = 500;
  const SCALE_STEP = DEFAULT_SCALE / 100;

  // Open Fine-tune straight away if a surface on this axis already has a
  // side that isn't the default.
  let firstFineAxis = $derived(axes.find((a) => fineTuned(a).length > 0));

  function anyTuned(axis) {
    return fineTuned(axis).some((s) => {
      const config = FC.SERVO_CONFIG[s.servo];
      return config.rpos !== DEFAULT_SCALE || config.rneg !== DEFAULT_SCALE;
    });
  }

  function nudgeThrow(axis, delta) {
    const next = Math.min(
      AXIS_GAIN_MAX,
      Math.max(AXIS_GAIN_MIN, wiz.axisGainPercent(axis) + delta),
    );
    wiz.setAxisGainPercent(axis, next);
  }

  // Which scale field this stick direction uses on this servo, and the most
  // it may be before full stick passes that side's binding limit.
  function sideOf(surface, axis, direction) {
    const config = FC.SERVO_CONFIG[surface.servo];
    const output = outputForAxis(surface, axis, direction.stick, wiz.axisGains);
    const reversed = (config.flags & SERVO_FLAG_REVERSE) !== 0;
    const pos = servoSide(output, reversed) === "pos";
    return {
      field: pos ? "rpos" : "rneg",
      max: maxScale(output, pos ? config.max : -config.min),
    };
  }

  function nudgeSide(surface, axis, direction, delta) {
    const config = FC.SERVO_CONFIG[surface.servo];
    const side = sideOf(surface, axis, direction);
    config[side.field] = Math.min(
      side.max,
      Math.max(SCALE_MIN, config[side.field] + delta),
    );
    wiz.sendServo(surface.servo);
  }

  // Surfaces on this axis that hit a limit with this axis alone at full
  // stick, so the pilot sees it while setting the throw rather than later.
  function limited(axis) {
    return surfacesOn(axis).filter((surface) => {
      const alone = {
        ...surface,
        axes: { [axis]: surface.axes[axis] },
        flap: null,
      };
      const reach = travelReach(
        alone,
        FC.SERVO_CONFIG[surface.servo],
        wiz.axisGains,
      );
      return reach.pos.fraction > 1 || reach.neg.fraction > 1;
    });
  }
</script>

<p>{$i18n.t("setupWizardThrowsIntro")}</p>

<PassthroughStatus />

<div class="how">
  <div class="art">
    <RadioIcon use />
    <MeasureThrow />
  </div>
  <div class="how-text">
    <span class="how-title">{$i18n.t("setupWizardThrowsHowTitle")}</span>
    <ol>
      {#each [1, 2, 3, 4] as n (n)}
        <li>
          <span class="n">{n}</span>
          <span>{$i18n.t(`setupWizardThrowsHow_${n}`)}</span>
        </li>
      {/each}
    </ol>
  </div>
</div>

{#each axes as axis (axis)}
  {@const atLimit = limited(axis)}
  <section class="axis">
    <div class="axis-head">
      <AxisIcon {axis} />
      <span class="axis-name">{$i18n.t(`setupWizardAxis_${axis}`)}</span>
    </div>

    <div class="row">
      <span class="label">{$i18n.t("setupWizardThrowsThrow")}</span>
      {#each [-5, -1] as delta (delta)}
        <button class="btn" onclick={() => nudgeThrow(axis, delta)}
          >{delta}%</button
        >
      {/each}
      <span class="amount">{wiz.axisGainPercent(axis)}%</span>
      {#each [1, 5] as delta (delta)}
        <button class="btn" onclick={() => nudgeThrow(axis, delta)}
          >+{delta}%</button
        >
      {/each}
      <span class="muted">{$i18n.t("setupWizardThrowsThrowHelp")}</span>
    </div>

    {#if atLimit.length > 0}
      <span class="warn">
        {$i18n.t("setupWizardThrowsAtLimit", {
          1: atLimit.map((s) => wiz.surfaceLabel(s)).join(", "),
        })}
      </span>
    {/if}

    {#if fineTuned(axis).length > 0}
      <details class="fine" open={anyTuned(axis)}>
        <summary>
          <i class="fas fa-chevron-right chevron" aria-hidden="true"></i>
          <span class="fine-title">{$i18n.t("setupWizardThrowsFineTitle")}</span
          >
          <span class="fine-hint">{$i18n.t("setupWizardThrowsFineHint")}</span>
        </summary>

        <!-- The why and its picture once, on the first axis; the how on each. -->
        <div class="fine-why">
          {#if axis === firstFineAxis}
            <DifferentialIcon />
          {/if}
          <div class="fine-why-text">
            {#if axis === firstFineAxis}
              <span>{$i18n.t("setupWizardThrowsFineWhy")}</span>
            {/if}
            <span>{$i18n.t("setupWizardThrowsFineHow")}</span>
          </div>
        </div>

        {#each fineTuned(axis) as surface (surface.servo)}
          {@const config = FC.SERVO_CONFIG[surface.servo]}
          <div class="surface">
            <div class="surface-head">
              <span class="name">{wiz.surfaceLabel(surface)}</span>
              <span class="now">{$i18n.t("setupWizardThrowsNow")}</span>
              <LivePulse servo={surface.servo} />
            </div>
            {#if Object.keys(surface.axes).length > 1}
              <span class="mixed">
                <i class="fas fa-info-circle" aria-hidden="true"></i>
                {$i18n.t("setupWizardThrowsMixedNote")}
              </span>
            {/if}
            {#each DIRECTIONS[axis] as direction (direction.key)}
              {@const side = sideOf(surface, axis, direction)}
              {@const percent = Math.round(
                (config[side.field] / DEFAULT_SCALE) * 100,
              )}
              <div class="row">
                <span class="direction">
                  <StickIcon x={direction.x} y={direction.y} />
                  {$i18n.t(`setupWizardThrowsDir_${direction.key}`)}
                </span>
                {#each [-5, -1] as delta (delta)}
                  <button
                    class="btn"
                    onclick={() =>
                      nudgeSide(surface, axis, direction, delta * SCALE_STEP)}
                    >{delta}%</button
                  >
                {/each}
                <span class={["amount", percent !== 100 && "changed"]}
                  >{percent}%</span
                >
                {#each [1, 5] as delta (delta)}
                  <button
                    class="btn"
                    onclick={() =>
                      nudgeSide(surface, axis, direction, delta * SCALE_STEP)}
                    >+{delta}%</button
                  >
                {/each}
                {#if config[side.field] >= side.max}
                  <span class="warn"
                    >{$i18n.t("setupWizardThrowsSideAtLimit")}</span
                  >
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </details>
    {/if}
  </section>
{/each}

<p class="footnote">{$i18n.t("setupWizardThrowsRepeat")}</p>

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .how {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 28px;
    padding: 14px 18px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);

    ol {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .n {
      flex: 0 0 22px;
      height: 22px;
      margin-top: 1px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      background-color: var(--color-accent-500);
      color: var(--color-accent-fg);
      font-size: 0.8em;
      font-weight: 700;
    }
  }

  .art {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .how-text {
    flex: 1 1 360px;
    max-width: 70ch;
  }

  .how-title {
    font-weight: 600;
  }

  .axis {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
  }

  .axis-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .axis-name {
    font-size: 1.1em;
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .label {
    min-width: 6em;
    font-weight: 600;
  }

  .amount {
    min-width: 4.5em;
    text-align: center;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  //// Fine-tune: optional, folded away unless already in use.

  .fine {
    border-top: 1px solid var(--color-border-soft);
    padding-top: 10px;

    &[open] {
      display: flex;
      flex-direction: column;
      gap: 12px;

      .chevron {
        transform: rotate(90deg);
      }
    }

    summary {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
      cursor: pointer;
      list-style: none;

      &::-webkit-details-marker {
        display: none;
      }
    }
  }

  .chevron {
    width: 1em;
    font-size: 0.8em;
    color: var(--color-text-soft);
    transition: transform var(--animation-speed);
  }

  .fine-title {
    font-weight: 600;
  }

  .fine-hint {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .fine-why {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
  }

  .fine-why-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 320px;
    max-width: 70ch;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
  }

  .surface-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }

  .now {
    margin-left: 12px;
    color: var(--color-text-soft);
    font-size: 0.85em;
  }

  .mixed {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--color-text-soft);
    font-size: 0.9em;
    max-width: 75ch;

    i {
      color: var(--color-accent-500);
    }
  }

  .amount.changed {
    color: var(--color-accent-500);
  }

  .name {
    font-weight: 600;
  }

  .direction {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 12em;
    padding-left: 12px;
  }

  .warn {
    margin-left: 8px;
    color: var(--color-yellow-500);
    font-size: 0.9em;
  }

  .footnote {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .muted {
    margin-left: 8px;
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
