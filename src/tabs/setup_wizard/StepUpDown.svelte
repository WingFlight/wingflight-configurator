<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import SetupModeStatus from "./SetupModeStatus.svelte";
  import {
    primaryAxis,
    outputForAxis,
    servoSide,
    maxScale,
    SCALE_MIN,
    SERVO_FLAG_REVERSE,
  } from "./surfaces.js";

  // Like the Throws step, done with the radio in SETUP mode: hold full stick
  // one way, watch the surface, and nudge the scale of the servo side that
  // direction drives. Signs as in the Direction step.
  const wiz = getContext("setupWizard");

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

  // Which scale field this stick direction uses on this servo, and the most
  // it may be before full stick passes the side's binding limit.
  function sideOf(surface, direction) {
    const axis = primaryAxis(surface);
    const config = FC.SERVO_CONFIG[surface.servo];
    const output = outputForAxis(surface, axis, direction.stick, wiz.axisGains);
    const reversed = (config.flags & SERVO_FLAG_REVERSE) !== 0;
    const pos = servoSide(output, reversed) === "pos";
    return {
      field: pos ? "rpos" : "rneg",
      max: maxScale(output, pos ? config.max : -config.min),
    };
  }

  function nudge(surface, direction, delta) {
    const config = FC.SERVO_CONFIG[surface.servo];
    const side = sideOf(surface, direction);
    config[side.field] = Math.min(
      side.max,
      Math.max(SCALE_MIN, config[side.field] + delta),
    );
    wiz.sendServo(surface.servo);
  }
</script>

<p>{$i18n.t("setupWizardUpDownIntro")}</p>

<SetupModeStatus />

{#each wiz.surfaces as surface (surface.servo)}
  {@const axis = primaryAxis(surface)}
  {@const config = FC.SERVO_CONFIG[surface.servo]}
  <section class="surface">
    <div class="head">
      <strong>{wiz.surfaceLabel(surface)}</strong>
      <LivePulse servo={surface.servo} />
    </div>
    {#if Object.keys(surface.axes).length > 1}
      <span class="muted">{$i18n.t("setupWizardUpDownMixedNote")}</span>
    {/if}
    {#each DIRECTIONS[axis] as direction (direction.key)}
      {@const side = sideOf(surface, direction)}
      <div class="row">
        <span class="label"
          >{$i18n.t(`setupWizardUpDown_${direction.key}`)}</span
        >
        {#each [-25, -5] as delta (delta)}
          <button class="btn" onclick={() => nudge(surface, direction, delta)}>
            {delta}
          </button>
        {/each}
        <span class="amount">{config[side.field]} µs</span>
        {#each [5, 25] as delta (delta)}
          <button class="btn" onclick={() => nudge(surface, direction, delta)}>
            +{delta}
          </button>
        {/each}
        {#if config[side.field] >= side.max}
          <span class="warn">{$i18n.t("setupWizardUpDownAtLimit")}</span>
        {/if}
      </div>
    {/each}
  </section>
{/each}

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    max-width: 720px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .label {
    min-width: 10em;
  }

  .amount {
    min-width: 5em;
    text-align: center;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .warn {
    margin-left: 8px;
    color: var(--color-yellow-500);
    font-size: 0.9em;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
