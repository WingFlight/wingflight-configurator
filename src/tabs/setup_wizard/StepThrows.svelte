<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import SetupModeStatus from "./SetupModeStatus.svelte";
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

  // Throws are set with the radio in SETUP mode, so full stick is exactly
  // what the pilot's sticks and endpoints give, with no gyro. No overrides
  // here: in SETUP mode the FC replaces the stabilized inputs with the stick
  // (flight/mixer.c), and Axis Gain and servo scale still apply.
  //
  // Two controls per axis, both used the same way (hold the stick, watch the
  // surface, press - or +): Throw is the axis's Axis Gain, shared by every
  // surface and both directions; Fine-tune is one servo's scale on one side,
  // for differential or a surface that comes out different from its pair.
  const wiz = getContext("setupWizard");

  // Full stick each way. Signs as in the Direction step: roll + is right,
  // pitch - is stick back, yaw - is right.
  const DIRECTIONS = {
    roll: [
      { stick: 1, key: "rollRight" },
      { stick: -1, key: "rollLeft" },
    ],
    pitch: [
      { stick: -1, key: "pitchBack" },
      { stick: 1, key: "pitchForward" },
    ],
    yaw: [
      { stick: -1, key: "yawRight" },
      { stick: 1, key: "yawLeft" },
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
      const alone = { ...surface, axes: { [axis]: surface.axes[axis] } };
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

<SetupModeStatus />

<div class="how">
  <strong>{$i18n.t("setupWizardThrowsHowTitle")}</strong>
  <ol>
    {#each [1, 2, 3, 4] as n (n)}
      <li>
        <span class="n">{n}.</span>
        <span>{$i18n.t(`setupWizardThrowsHow_${n}`)}</span>
      </li>
    {/each}
  </ol>
</div>

{#each axes as axis (axis)}
  {@const atLimit = limited(axis)}
  <section class="axis">
    <strong>{$i18n.t(`setupWizardAxis_${axis}`)}</strong>

    <div class="row">
      <span class="label">{$i18n.t("setupWizardThrowsThrow")}</span>
      {#each [-5, -1] as delta (delta)}
        <button class="btn" onclick={() => nudgeThrow(axis, delta)}
          >{delta}</button
        >
      {/each}
      <span class="amount">{wiz.axisGainPercent(axis)}%</span>
      {#each [1, 5] as delta (delta)}
        <button class="btn" onclick={() => nudgeThrow(axis, delta)}
          >+{delta}</button
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

    <div class="fine">
      <span class="fine-title">{$i18n.t("setupWizardThrowsFineTitle")}</span>
      {#each fineTuned(axis) as surface (surface.servo)}
        {@const config = FC.SERVO_CONFIG[surface.servo]}
        <div class="surface">
          <div class="surface-head">
            <span class="name">{wiz.surfaceLabel(surface)}</span>
            <LivePulse servo={surface.servo} />
          </div>
          {#if Object.keys(surface.axes).length > 1}
            <span class="muted">{$i18n.t("setupWizardThrowsMixedNote")}</span>
          {/if}
          {#each DIRECTIONS[axis] as direction (direction.key)}
            {@const side = sideOf(surface, axis, direction)}
            <div class="row">
              <span class="direction"
                >{$i18n.t(`setupWizardThrowsDir_${direction.key}`)}</span
              >
              {#each [-25, -5] as delta (delta)}
                <button
                  class="btn small"
                  onclick={() => nudgeSide(surface, axis, direction, delta)}
                  >{delta}</button
                >
              {/each}
              <span class="amount">{config[side.field]} µs</span>
              {#each [5, 25] as delta (delta)}
                <button
                  class="btn small"
                  onclick={() => nudgeSide(surface, axis, direction, delta)}
                  >+{delta}</button
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
    </div>
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
    max-width: 70ch;

    ol {
      list-style: none;
      margin: 4px 0 0;
      padding-left: 4px;
    }

    li {
      display: flex;
      gap: 6px;
      margin-bottom: 2px;
    }

    .n {
      flex: 0 0 1.2em;
      font-weight: 600;
    }
  }

  .axis {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    max-width: 760px;
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

  .fine {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px dotted var(--color-border);
  }

  .fine-title {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .surface-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
  }

  .name {
    font-weight: 600;
  }

  .direction {
    min-width: 10em;
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
