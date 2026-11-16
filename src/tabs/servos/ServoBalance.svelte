<script>
  import { onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    BALANCE_CURVE_X,
    BALANCE_POINTS,
    balanceCurve,
    balanceCurveUse,
    balanceSetting,
    copyPrimaryTravel,
    isBalanceCurve,
    nudgeBalance,
  } from "@/js/servoGroups.js";

  // Balances the followers of one primary servo against it: the primary is
  // held at a few points of its travel (the FC moves the followers with it),
  // and each follower is moved until it sits where the primary does. Every
  // change is sent live; the page that hosts this saves it.
  //
  // hold(servo, value) / release(servo) hold a servo with a servo override
  // (value -1000..1000 of full travel), so this works on the Servos tab and in
  // the setup wizard alike. onChange runs after every change sent.
  let { primary, followers, hold, release, onChange, servoLabel } = $props();

  // Above this share of the balance curve's range the follower is too far
  // out to balance there: the linkage should be adjusted instead.
  const CURVE_WARN = 0.8;

  const SWEEP_MS = 4000;
  const SWEEP_STEP_MS = 50;
  const SWEEP_CYCLES = 2;

  let active = $state(null);
  let sweeping = $state(false);
  let sweepTimer;

  function label(servo) {
    return servoLabel ? servoLabel(servo) : `S${servo + 1}`;
  }

  function select(point) {
    stopSweep();
    active = point.key;
    hold(primary, point.command);
  }

  function stop() {
    stopSweep();
    active = null;
    release(primary);
  }

  // Slowly through the whole travel and back, to watch for a servo that
  // binds or strains somewhere along the way.
  function sweep() {
    stopSweep();
    sweeping = true;
    const steps = SWEEP_MS / SWEEP_STEP_MS;
    let step = 0;
    sweepTimer = setInterval(() => {
      if (step >= steps * SWEEP_CYCLES) {
        stopSweep();
        const point = BALANCE_POINTS.find((p) => p.key === active);
        if (point) {
          hold(primary, point.command);
        } else {
          release(primary);
        }
        return;
      }
      // Triangle wave from 0 up, down to -1000 and back to 0
      const phase = (step % steps) / steps;
      const command = Math.round(
        1000 *
          (phase < 0.25
            ? phase * 4
            : phase < 0.75
              ? 2 - phase * 4
              : phase * 4 - 4),
      );
      hold(primary, command);
      step++;
    }, SWEEP_STEP_MS);
  }

  function stopSweep() {
    clearInterval(sweepTimer);
    sweepTimer = null;
    sweeping = false;
  }

  function sendConfig(servo) {
    return new Promise((resolve) => mspHelper.sendServoConfig(servo, resolve));
  }

  function sendCurve(servo) {
    return new Promise((resolve) => mspHelper.sendServoCurve(servo, resolve));
  }

  async function copyTravel() {
    for (const follower of followers) {
      copyPrimaryTravel(FC.SERVO_CONFIG[primary], FC.SERVO_CONFIG[follower]);
      await sendConfig(follower);
    }
    onChange?.();
  }

  async function nudge(follower, deltaUs) {
    const point = BALANCE_POINTS.find((p) => p.key === active);
    if (!point) return;
    const config = FC.SERVO_CONFIG[follower];
    // Put the curve in the tool's shape first, so a nudge always has its
    // point to move.
    if (!isBalanceCurve(FC.SERVO_CURVES[follower])) {
      FC.SERVO_CURVES[follower] = balanceCurve(FC.SERVO_CURVES[follower]);
    }
    const curve = FC.SERVO_CURVES[follower];
    const changed = nudgeBalance(point, config, curve, deltaUs);
    if (!changed) return;
    if (changed === "curve") {
      await sendCurve(follower);
    } else {
      await sendConfig(follower);
    }
    onChange?.();
  }

  // Puts the follower's balance curve back to flat, keeping Center and Scale.
  async function resetCurve(follower) {
    FC.SERVO_CURVES[follower] = balanceCurve(null);
    await sendCurve(follower);
    onChange?.();
  }

  function settingText(follower, point) {
    const config = FC.SERVO_CONFIG[follower];
    const setting = balanceSetting(point, config);
    if (setting === "mid") {
      return $i18n.t("servoBalanceSettingCenter", { 1: config.mid });
    }
    if (setting === "rpos" || setting === "rneg") {
      return $i18n.t(
        setting === "rpos"
          ? "servoBalanceSettingScalePos"
          : "servoBalanceSettingScaleNeg",
        { 1: config[setting] },
      );
    }
    const curve = FC.SERVO_CURVES[follower];
    const index = BALANCE_CURVE_X.indexOf(point.command);
    const y = isBalanceCurve(curve) ? curve.points[index].y : 0;
    return $i18n.t("servoBalanceSettingCurve", {
      1: `${y > 0 ? "+" : ""}${(y / 10).toFixed(1)}`,
    });
  }

  onDestroy(() => {
    stopSweep();
    if (active) release(primary);
  });

  let activePoint = $derived(BALANCE_POINTS.find((p) => p.key === active));
</script>

<div class="balance">
  <div class="head">
    <span class="title">
      {$i18n.t("servoBalanceGroup", {
        1: label(primary),
        2: followers.map(label).join(", "),
      })}
    </span>
    <span class="actions">
      <button class="btn" type="button" onclick={copyTravel}>
        {$i18n.t("servoBalanceCopyTravel", { 1: label(primary) })}
      </button>
      <button
        class={["btn", sweeping && "selected"]}
        type="button"
        onclick={() => (sweeping ? stopSweep() : sweep())}
      >
        {$i18n.t(sweeping ? "servoBalanceSweepStop" : "servoBalanceSweep")}
      </button>
    </span>
  </div>

  <div class="points" role="group" aria-label={$i18n.t("servoBalancePoints")}>
    {#each BALANCE_POINTS as point (point.key)}
      <button
        class={["btn", "point", active === point.key && "selected"]}
        type="button"
        aria-pressed={active === point.key}
        onclick={() => select(point)}
      >
        {$i18n.t(`servoBalancePoint_${point.key}`)}
      </button>
    {/each}
    {#if active}
      <button class="btn" type="button" onclick={stop}>
        {$i18n.t("servoBalanceRelease")}
      </button>
    {/if}
  </div>

  {#if activePoint}
    <p class="hint">{$i18n.t(`servoBalanceHint_${activePoint.key}`)}</p>
    <div class="followers">
      {#each followers as follower (follower)}
        {@const use = balanceCurveUse(activePoint, FC.SERVO_CURVES[follower])}
        <div class="follower">
          <span class="name">{label(follower)}</span>
          <span class="nudges">
            {#each [-10, -1] as delta (delta)}
              <button class="btn" onclick={() => nudge(follower, delta)}
                >{delta}</button
              >
            {/each}
            <span class="setting">{settingText(follower, activePoint)}</span>
            {#each [1, 10] as delta (delta)}
              <button class="btn" onclick={() => nudge(follower, delta)}
                >+{delta}</button
              >
            {/each}
            <span class="unit">µs</span>
          </span>
          {#if balanceSetting(activePoint, FC.SERVO_CONFIG[follower]) === "curve"}
            <button
              class="btn link"
              type="button"
              onclick={() => resetCurve(follower)}
            >
              {$i18n.t("servoBalanceResetCurve")}
            </button>
          {/if}
          {#if use >= CURVE_WARN}
            <span class="warn">
              <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
              {$i18n.t("servoBalanceCurveLimit")}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="hint">{$i18n.t("servoBalanceIntro")}</p>
  {/if}
</div>

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
    }

    &.link {
      min-width: 0;
    }
  }

  .balance {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-border-soft, var(--color-border));
    border-radius: var(--radius-md, var(--radius-sm));
    background-color: var(--color-surface-sunken, transparent);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .title {
    font-weight: 600;
  }

  .actions,
  .points {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hint {
    margin: 0;
    max-width: 70ch;
    color: var(--color-text-soft);
  }

  .followers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .follower {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }

  .name {
    min-width: 9em;
    font-weight: 500;
  }

  .nudges {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .setting {
    min-width: 10em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .unit {
    color: var(--color-text-soft);
  }

  .warn {
    color: var(--color-warning, #c80);
  }
</style>
