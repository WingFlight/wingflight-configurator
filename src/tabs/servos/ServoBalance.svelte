<script>
  import { onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    POINT_COUNTS,
    holdCommands,
    mixDirection,
    nudgeCurvePoint,
    pointOffsetUs,
    pointUse,
    referenceCandidates,
    resampleCurve,
  } from "@/js/servoBalance.js";

  // Balances one servo against another on the same surface with the
  // balanced servo's balance curve. Both servos are held at each point of the
  // curve (servo overrides, in the direction their mix moves them), and the
  // balanced servo's offset there is nudged until it sits exactly with the
  // other one. Curve changes are sent live; the Servos tab saves them.
  //
  // hold(servo, value) / release(servo): servo override, value -1000..1000.
  let { servos, hold, release, onChange } = $props();

  // Above this share of the curve's range the servos are too far apart for
  // the curve: the linkage should be adjusted instead.
  const USE_WARN = 0.8;

  const SWEEP_MS = 4000;
  const SWEEP_STEP_MS = 50;
  const SWEEP_CYCLES = 2;

  let servo = $state(null);
  let reference = $state(null);
  let active = $state(null);
  let sweeping = $state(false);
  let sweepTimer;
  let held = $state([]);

  let count = $derived(servos.length);
  let candidates = $derived(
    servo === null ? [] : referenceCandidates(FC.MIXER_RULES, servo, count),
  );
  let direction = $derived(
    servo === null || reference === null
      ? null
      : mixDirection(FC.MIXER_RULES, servo, reference),
  );
  let curve = $derived(servo === null ? null : FC.SERVO_CURVES?.[servo]);
  let config = $derived(servo === null ? null : FC.SERVO_CONFIG[servo]);
  let ready = $derived(
    servo !== null && reference !== null && !!curve && !!config,
  );

  function label(index) {
    return $i18n.t("servoBalanceServo", { 1: index + 1 });
  }

  function letGo() {
    stopSweep();
    active = null;
    for (const index of held) release(index);
    held = [];
  }

  function holdAt(x) {
    const commands = holdCommands(x, direction);
    hold(servo, commands.servo);
    hold(reference, commands.reference);
    held = [servo, reference];
  }

  function pickServo(value) {
    letGo();
    servo = value === "" ? null : Number(value);
    reference = servo === null ? null : (candidates[0] ?? null);
  }

  function pickReference(value) {
    letGo();
    reference = value === "" ? null : Number(value);
  }

  function selectPoint(index) {
    stopSweep();
    active = index;
    holdAt(curve.points[index].x);
  }

  // Slowly through the whole travel and back, to watch for a servo that
  // binds or strains anywhere along the way.
  function sweep() {
    stopSweep();
    sweeping = true;
    const steps = SWEEP_MS / SWEEP_STEP_MS;
    let step = 0;
    sweepTimer = setInterval(() => {
      if (step >= steps * SWEEP_CYCLES) {
        stopSweep();
        if (active !== null) {
          holdAt(curve.points[active].x);
        } else {
          letGo();
        }
        return;
      }
      // Triangle wave from 0 up to 1000, down to -1000 and back to 0
      const phase = (step % steps) / steps;
      const x =
        phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4;
      holdAt(Math.round(1000 * x));
      step++;
    }, SWEEP_STEP_MS);
  }

  function stopSweep() {
    clearInterval(sweepTimer);
    sweepTimer = null;
    sweeping = false;
  }

  function sendCurve() {
    return new Promise((resolve) => mspHelper.sendServoCurve(servo, resolve));
  }

  async function nudge(deltaUs) {
    if (active === null) return;
    if (!nudgeCurvePoint(config, curve, active, deltaUs)) return;
    await sendCurve();
    onChange?.();
  }

  async function setPointCount(n) {
    if (curve.count === n) return;
    letGo();
    FC.SERVO_CURVES[servo] = resampleCurve(curve, n);
    await sendCurve();
    onChange?.();
  }

  async function resetCurve() {
    FC.SERVO_CURVES[servo] = resampleCurve(null, curve.count);
    await sendCurve();
    onChange?.();
    if (active !== null) holdAt(FC.SERVO_CURVES[servo].points[active].x);
  }

  function percent(x) {
    const value = Math.round(x / 10);
    return `${value > 0 ? "+" : ""}${value}%`;
  }

  function signed(n) {
    return `${n > 0 ? "+" : ""}${n}`;
  }

  onDestroy(letGo);
</script>

<p class="intro">{$i18n.t("servoBalanceIntro")}</p>

<div class="pick">
  <label>
    <span>{$i18n.t("servoBalanceServoLabel")}</span>
    <select value={servo ?? ""} onchange={(e) => pickServo(e.target.value)}>
      <option value="">{$i18n.t("servoBalanceChoose")}</option>
      {#each servos as s (s.index)}
        <option value={s.index}>{label(s.index)}</option>
      {/each}
    </select>
  </label>
  {#if servo !== null}
    <label>
      <span>{$i18n.t("servoBalanceReferenceLabel")}</span>
      <select
        value={reference ?? ""}
        onchange={(e) => pickReference(e.target.value)}
      >
        <option value="">{$i18n.t("servoBalanceChoose")}</option>
        {#each candidates as index (index)}
          <option value={index}>
            {$i18n.t("servoBalanceSameMix", { 1: index + 1 })}
          </option>
        {/each}
        {#each servos.filter((s) => s.index !== servo && !candidates.includes(s.index)) as s (s.index)}
          <option value={s.index}>{label(s.index)}</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

{#if servo !== null && candidates.length === 0}
  <p class="warn">{$i18n.t("servoBalanceNoSameMix", { 1: servo + 1 })}</p>
{/if}
{#if ready && direction === null}
  <p class="warn">{$i18n.t("servoBalanceNoSharedInput")}</p>
{/if}

{#if ready}
  <div class="row">
    <span class="muted">{$i18n.t("servoBalancePointCount")}</span>
    {#each POINT_COUNTS as n (n)}
      <button
        class={["btn", curve.count === n && "selected"]}
        type="button"
        aria-pressed={curve.count === n}
        onclick={() => setPointCount(n)}
      >
        {n}
      </button>
    {/each}
    <span class="grow"></span>
    <button
      class={["btn", sweeping && "selected"]}
      type="button"
      onclick={() => (sweeping ? stopSweep() : sweep())}
    >
      {$i18n.t(sweeping ? "servoBalanceSweepStop" : "servoBalanceSweep")}
    </button>
    <button class="btn" type="button" onclick={resetCurve}>
      {$i18n.t("servoBalanceReset")}
    </button>
    {#if held.length > 0 || active !== null}
      <button class="btn" type="button" onclick={letGo}>
        {$i18n.t("servoBalanceRelease")}
      </button>
    {/if}
  </div>

  <div class="points" role="group" aria-label={$i18n.t("servoBalancePoints")}>
    {#each curve.points.slice(0, curve.count) as point, i (i)}
      {@const offset = pointOffsetUs(config, curve, i)}
      <button
        class={[
          "point",
          active === i && "selected",
          pointUse(curve, i) >= USE_WARN && "near-limit",
        ]}
        type="button"
        aria-pressed={active === i}
        onclick={() => selectPoint(i)}
      >
        <span class="x">{percent(point.x)}</span>
        <span class="offset">{signed(offset)} µs</span>
      </button>
    {/each}
  </div>

  {#if active !== null}
    <div class="nudge">
      <span class="muted">
        {$i18n.t("servoBalanceHolding", {
          1: servo + 1,
          2: reference + 1,
          3: percent(curve.points[active].x),
        })}
      </span>
      <span class="nudges">
        {#each [-10, -1] as delta (delta)}
          <button class="btn" type="button" onclick={() => nudge(delta)}
            >{delta}</button
          >
        {/each}
        <span class="value"
          >{signed(pointOffsetUs(config, curve, active))} µs</span
        >
        {#each [1, 10] as delta (delta)}
          <button class="btn" type="button" onclick={() => nudge(delta)}
            >+{delta}</button
          >
        {/each}
      </span>
      {#if pointUse(curve, active) >= USE_WARN}
        <span class="warn">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          {$i18n.t("servoBalanceNearLimit")}
        </span>
      {/if}
    </div>
  {:else}
    <p class="muted">{$i18n.t("servoBalancePickPoint")}</p>
  {/if}
{/if}

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
    }
  }

  .intro,
  .muted,
  .warn {
    margin: 0;
    max-width: 75ch;
  }

  .intro {
    padding: 8px;
  }

  .muted {
    color: var(--color-text-soft);
  }

  .warn {
    padding: 0 8px;
    color: var(--color-status-bad, #c80);
  }

  .pick,
  .row,
  .nudge {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px;
  }

  .pick label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .grow {
    flex-grow: 1;
  }

  // One button per curve point: where it holds the servos, and the offset
  // the curve adds there. Laid out left to right like the travel.
  .points {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 6px;
    padding: 8px;
  }

  .point {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    cursor: pointer;

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
    }

    &.near-limit .offset {
      color: var(--color-status-bad, #c80);
    }
  }

  .x {
    font-weight: 600;
  }

  .offset,
  .value {
    font-variant-numeric: tabular-nums;
    font-size: 0.85em;
  }

  .nudges {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .value {
    min-width: 5em;
    text-align: center;
    font-size: 1em;
  }
</style>
