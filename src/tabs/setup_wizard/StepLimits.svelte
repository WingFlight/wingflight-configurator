<script>
  import { getContext, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { servoTravelRange, servoSignalRange } from "@/js/servoLimits.js";

  import LivePulse from "./LivePulse.svelte";

  const wiz = getContext("setupWizard");

  // The servo being explored, its limits before exploring, and the position
  // (us from Mid) it is held at.
  let current = $state(null);
  let original = $state(null);
  let position = $state(0);

  onMount(() => wiz.holdAxes({ roll: 0, pitch: 0, yaw: 0 }));

  // Servo override goes through scale and the Min/Max clamp (servoUpdate()
  // in flight/servos.c), so while exploring, the limits are opened to the
  // full range this centre allows and the override is set in scale units.
  function openRange(config) {
    const travel = servoTravelRange(false);
    const signal = servoSignalRange(false);
    return {
      min: Math.max(travel.min, signal.min - config.mid),
      max: Math.min(travel.max, signal.max - config.mid),
    };
  }

  function holdPosition() {
    const config = FC.SERVO_CONFIG[current];
    const scale = position >= 0 ? config.rpos : config.rneg;
    wiz.holdServo(current, (position / scale) * 1000);
  }

  function restore() {
    if (current === null) return;
    const config = FC.SERVO_CONFIG[current];
    config.min = original.min;
    config.max = original.max;
    wiz.sendServo(current);
    wiz.releaseServo(current);
    current = null;
  }

  wiz.setLeave(restore);

  function start(servo) {
    restore();
    const config = FC.SERVO_CONFIG[servo];
    original = { min: config.min, max: config.max };
    const range = openRange(config);
    config.min = range.min;
    config.max = range.max;
    wiz.sendServo(servo);
    current = servo;
    position = 0;
    holdPosition();
  }

  function move(delta) {
    const range = openRange(FC.SERVO_CONFIG[current]);
    position = Math.max(range.min, Math.min(range.max, position + delta));
    holdPosition();
  }

  function setLimitHere() {
    if (position > 0) original.max = position;
    if (position < 0) original.min = position;
  }

  function finish() {
    restore();
  }
</script>

<p>{$i18n.t("setupWizardLimitsIntro")}</p>
<div class="note">{$i18n.t("setupWizardLimitsHardStop")}</div>

<table class="rows">
  <tbody>
    {#each wiz.surfaces as surface (surface.servo)}
      {@const config = FC.SERVO_CONFIG[surface.servo]}
      {@const exploring = current === surface.servo}
      <tr class={exploring && "active"}>
        <td class="name">{wiz.surfaceLabel(surface)}</td>
        <td class="limits">
          {$i18n.t("setupWizardLimitsValues", {
            1: exploring ? original.min : config.min,
            2: exploring ? original.max : config.max,
          })}
        </td>
        <td><LivePulse servo={surface.servo} /></td>
        <td>
          {#if !exploring}
            <button class="btn" onclick={() => start(surface.servo)}>
              {$i18n.t("setupWizardLimitsStart")}
            </button>
          {/if}
        </td>
      </tr>
      {#if exploring}
        <tr class="active">
          <td colspan="4">
            <div class="explore">
              <div class="moves">
                {#each [-50, -10] as delta (delta)}
                  <button class="btn" onclick={() => move(delta)}
                    >{delta}</button
                  >
                {/each}
                <span class="position"
                  >{position >= 0 ? "+" : ""}{position} µs</span
                >
                {#each [10, 50] as delta (delta)}
                  <button class="btn" onclick={() => move(delta)}
                    >+{delta}</button
                  >
                {/each}
              </div>
              <button
                class="btn"
                disabled={position === 0}
                onclick={setLimitHere}
              >
                {$i18n.t("setupWizardLimitsSetHere")}
              </button>
              <button class="btn primary" onclick={finish}>
                {$i18n.t("setupWizardLimitsFinish")}
              </button>
            </div>
            <span class="muted">{$i18n.t("setupWizardLimitsHowTo")}</span>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>

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

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-yellow-500);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .rows {
    border-collapse: collapse;

    td {
      padding: 6px 12px 6px 0;
      vertical-align: middle;
    }

    tr.active td {
      background-color: var(--color-surface);
    }
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
    padding-left: 8px;
  }

  .limits {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .explore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 4px 8px;
  }

  .moves {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .position {
    min-width: 8ch;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    display: block;
    padding: 0 8px 4px;
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
