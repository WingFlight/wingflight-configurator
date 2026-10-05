<script>
  import { getContext, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { servoTravelRange, servoSignalRange } from "@/js/servoLimits.js";

  import LivePulse from "./LivePulse.svelte";
  import SurfaceBothWays from "./SurfaceBothWays.svelte";

  const wiz = getContext("setupWizard");

  // The servo being explored, its limits before exploring, and the position
  // (us from Mid) it is held at.
  let current = $state(null);
  let original = $state(null);
  let position = $state(0);
  // Per servo, which sides have been set on this visit: { min, max }.
  let sides = $state({});

  let doneSides = $derived(current === null ? {} : (sides[current] ?? {}));

  onMount(() => wiz.holdAxes({ roll: 0, pitch: 0, yaw: 0 }));

  // The range a servo can be explored over: as far as its travel and signal
  // range allow at this centre.
  //
  // With timed overrides (API 22.14+) the servo is held by a probe
  // (MSP2_WING_SET_SERVO_PROBE), which ignores Min/Max, so the stored limits
  // are never widened and each limit is sent as soon as it is set. Older
  // firmware only has the servo override, which goes through scale and the
  // Min/Max clamp (servoUpdate() in flight/servos.c), so there the limits
  // are opened to this range while exploring and the override is set in
  // scale units.
  function openRange(config) {
    const travel = servoTravelRange(false);
    const signal = servoSignalRange(false);
    return {
      min: Math.max(travel.min, signal.min - config.mid),
      max: Math.min(travel.max, signal.max - config.mid),
    };
  }

  function holdPosition() {
    if (wiz.canProbe) {
      wiz.probeServo(current, position);
      return;
    }
    const config = FC.SERVO_CONFIG[current];
    const scale = position >= 0 ? config.rpos : config.rneg;
    wiz.holdServo(current, (position / scale) * 1000);
  }

  function restore() {
    if (current === null) return;
    if (wiz.canProbe) {
      wiz.releaseProbe(current);
      current = null;
      return;
    }
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
    if (!wiz.canProbe) {
      const range = openRange(config);
      config.min = range.min;
      config.max = range.max;
      wiz.sendServo(servo);
    }
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
    const side = position > 0 ? "max" : "min";
    original[side] = position;
    sides[current] = { ...sides[current], [side]: true };
    if (wiz.canProbe) {
      FC.SERVO_CONFIG[current][side] = position;
      wiz.sendServo(current);
    }
  }

  // Where a value sits on the explored range, as a percentage for the bar.
  function percent(value) {
    const range = openRange(FC.SERVO_CONFIG[current]);
    return ((value - range.min) / (range.max - range.min)) * 100;
  }

  function finish() {
    restore();
  }
</script>

<p>{$i18n.t("setupWizardLimitsIntro")}</p>

<div class="both">
  <SurfaceBothWays />
  <span>{$i18n.t("setupWizardLimitsBothSides")}</span>
</div>

<div class="note">{$i18n.t("setupWizardLimitsHardStop")}</div>

<div class="surfaces">
  {#each wiz.surfaces as surface (surface.servo)}
    {@const config = FC.SERVO_CONFIG[surface.servo]}
    {@const exploring = current === surface.servo}
    {@const done = sides[surface.servo] ?? {}}
    <section class={["surface", exploring && "active"]}>
      <div class="head">
        <span class="name">{wiz.surfaceLabel(surface)}</span>
        {#each ["min", "max"] as side (side)}
          <span class={["chip", done[side] && "set"]}>
            {#if done[side]}
              <i class="fas fa-check" aria-hidden="true"></i>
            {/if}
            {$i18n.t(`setupWizardLimits_${side}`, {
              1: exploring ? original[side] : config[side],
            })}
          </span>
        {/each}
        <LivePulse servo={surface.servo} />
        <div class="grow"></div>
        {#if !exploring}
          <button class="btn" onclick={() => start(surface.servo)}>
            {$i18n.t("setupWizardLimitsStart")}
          </button>
        {/if}
      </div>

      {#if exploring}
        <div class="travel">
          <span class="end">{$i18n.t("setupWizardLimitsEnd_min")}</span>
          <div class="track">
            <div
              class="allowed"
              style:left="{percent(original.min)}%"
              style:right="{100 - percent(original.max)}%"
            ></div>
            <div class="centre" style:left="{percent(0)}%"></div>
            <div
              class={["limit", doneSides.min && "set"]}
              style:left="{percent(original.min)}%"
            ></div>
            <div
              class={["limit", doneSides.max && "set"]}
              style:left="{percent(original.max)}%"
            ></div>
            <div class="pos" style:left="{percent(position)}%"></div>
          </div>
          <span class="end">{$i18n.t("setupWizardLimitsEnd_max")}</span>
        </div>

        <div class={["prompt", doneSides.min && doneSides.max && "complete"]}>
          {#if !doneSides.min}
            {$i18n.t("setupWizardLimitsTodo_min")}
          {:else if !doneSides.max}
            {$i18n.t("setupWizardLimitsTodo_max")}
          {:else}
            <i class="fas fa-check" aria-hidden="true"></i>
            {$i18n.t("setupWizardLimitsBothDone")}
          {/if}
        </div>

        <div class="explore">
          <div class="moves">
            {#each [-50, -10] as delta (delta)}
              <button class="btn" onclick={() => move(delta)}>{delta}</button>
            {/each}
            <span class="position">{position >= 0 ? "+" : ""}{position} µs</span
            >
            {#each [10, 50] as delta (delta)}
              <button class="btn" onclick={() => move(delta)}>+{delta}</button>
            {/each}
          </div>
          <button class="btn" disabled={position === 0} onclick={setLimitHere}>
            {position > 0
              ? $i18n.t("setupWizardLimitsSetMax")
              : $i18n.t("setupWizardLimitsSetMin")}
          </button>
          <div class="grow"></div>
          <button
            class={["btn", doneSides.min && doneSides.max && "primary"]}
            onclick={finish}
          >
            {$i18n.t("setupWizardLimitsFinish")}
          </button>
        </div>
        <span class="muted">{$i18n.t("setupWizardLimitsHowTo")}</span>
      {/if}
    </section>
  {/each}
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
  }

  .grow {
    flex: 1;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .both {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 16px;
    border: 1px solid var(--color-accent-500);
    border-radius: var(--radius-md);
    background-color: var(--color-accent-soft);
    font-weight: 600;
  }

  .note {
    padding: 10px 14px;
    border-left: 4px solid var(--color-yellow-500);
    background-color: var(--color-surface-sunken);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .surfaces {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    transition:
      border-color var(--animation-speed),
      box-shadow var(--animation-speed);

    &.active {
      padding: 12px 16px 14px;
      border-color: var(--color-accent-500);
      box-shadow: inset 4px 0 0 var(--color-accent-500);
    }
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .name {
    min-width: 11em;
    font-weight: 600;
    white-space: nowrap;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 10px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-pill);
    background-color: var(--color-surface);
    color: var(--color-text-soft);
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;

    &.set {
      border-color: var(--color-status-good);
      color: var(--color-status-good);
    }
  }

  //// Travel bar: the explored range, the limits being set and the
  //// position the servo is held at.

  .travel {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .end {
    flex: none;
    color: var(--color-text-soft);
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
  }

  .track {
    position: relative;
    flex: 1;
    height: 10px;
    border-radius: var(--radius-pill);
    background-color: var(--color-border-soft);
  }

  .allowed {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: var(--color-accent-soft);
  }

  .centre,
  .limit,
  .pos {
    position: absolute;
    transform: translateX(-50%);
  }

  .centre {
    top: -3px;
    bottom: -3px;
    width: 1px;
    background-color: var(--color-text-muted);
  }

  .limit {
    top: -5px;
    bottom: -5px;
    width: 4px;
    border-radius: 2px;
    background-color: var(--color-text-muted);

    &.set {
      background-color: var(--color-status-good);
    }
  }

  .pos {
    top: 50%;
    width: 16px;
    height: 16px;
    margin-top: -8px;
    border: 2px solid var(--color-surface);
    border-radius: 50%;
    background-color: var(--color-accent-500);
    box-shadow: 0 0 0 1px var(--color-accent-500);
    transition: left var(--animation-speed);
  }

  .prompt {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--color-accent-500);

    &.complete {
      color: var(--color-status-good);
    }
  }

  .explore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
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
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  @media only screen and (max-width: 600px) {
    .both {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
