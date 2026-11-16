<script>
  import { onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    POINT_COUNTS,
    commandFromOutput,
    mixDirection,
    nearestPoint,
    nudgeCurvePoint,
    pointOffsetUs,
    pointUse,
    referenceCandidates,
    resampleCurve,
  } from "@/js/servoBalance.js";

  import BalanceGraph from "./BalanceGraph.svelte";

  // Balances up to four servos on one surface with their balance curves,
  // like the Balance channels screen on ETHOS. Each servo has a graph of its
  // curve. Pick a point to hold the whole group there (Lock), then move that
  // servo's point until the servos sit together and none of them strains.
  // Unlocked, the markers follow the sticks. Curve changes are sent live; the
  // Servos tab saves them.
  //
  // hold(servo, value) / release(servo): servo override, value -1000..1000.
  let { servos, hold, release, onChange } = $props();

  const MAX_GROUP = 4;
  // Above this share of the curve's range the servos are too far apart for
  // the curve: the linkage should be adjusted instead.
  const USE_WARN = 0.8;
  const SEND_DELAY_MS = 80;

  const SWEEP_MS = 4000;
  const SWEEP_STEP_MS = 50;
  const SWEEP_CYCLES = 2;

  let group = $state([]);
  let rootEl;
  let activeServo = $state(null);
  let selected = $state(null);
  // Where the first servo of the group is held (its mixer output), or null.
  let holdX = $state(null);
  let sweeping = $state(false);
  let sweepTimer;
  let sendTimers = {};
  let held = [];

  let count = $derived(servos.length);
  let anchor = $derived(group[0] ?? null);
  let suggestions = $derived(
    anchor === null ? [] : referenceCandidates(FC.MIXER_RULES, anchor, count),
  );
  let others = $derived(servos.filter((s) => !group.includes(s.index)));
  let ready = $derived(
    group.length > 0 && group.every((s) => FC.SERVO_CURVES?.[s]),
  );
  let unshared = $derived(
    group.filter((s) => s !== anchor && direction(s) === null),
  );

  function label(index) {
    return $i18n.t("servoBalanceServo", { 1: index + 1 });
  }

  // Which way the mix moves `servo` compared with the first servo: -1 when
  // it is mirrored in the mix, so it is held the other way and the two don't
  // fight. null when they share no mix input.
  function direction(servo) {
    if (servo === anchor) return 1;
    return mixDirection(FC.MIXER_RULES, anchor, servo);
  }

  function dir(servo) {
    return direction(servo) ?? 1;
  }

  //// Holding

  function holdAt(x) {
    holdX = x;
    held = [...group];
    for (const servo of group) {
      hold(servo, Math.round(x * dir(servo)));
    }
  }

  function letGo() {
    stopSweep();
    holdX = null;
    for (const servo of held) release(servo);
    held = [];
  }

  function selectPoint(servo, index) {
    stopSweep();
    activeServo = servo;
    selected = index;
    // The point's X is this servo's mixer output; the group is held from
    // the first servo's.
    holdAt(FC.SERVO_CURVES[servo].points[index].x * dir(servo));
  }

  function toggleLock() {
    if (holdX !== null) {
      letGo();
      return;
    }
    const servo = activeServo ?? anchor;
    const curve = FC.SERVO_CURVES[servo];
    const index = selected ?? nearestPoint(curve, markerFor(servo) ?? 0);
    selectPoint(servo, index);
  }

  // Slowly through the whole travel and back, to watch for a servo that
  // binds or strains anywhere along the way.
  function sweep() {
    stopSweep();
    const before = holdX;
    sweeping = true;
    const steps = SWEEP_MS / SWEEP_STEP_MS;
    let step = 0;
    sweepTimer = setInterval(() => {
      if (step >= steps * SWEEP_CYCLES) {
        stopSweep();
        if (before !== null) holdAt(before);
        else letGo();
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

  //// The group

  // Opens `servo` for balancing (from the balance curve indicator in the
  // servo table): a group of it and the servos mixed the same way, unless it
  // is in the group already. Scrolls the section into view.
  export function open(servo) {
    if (!group.includes(servo)) {
      letGo();
      const same = referenceCandidates(FC.MIXER_RULES, servo, count);
      group = [servo, ...same].slice(0, MAX_GROUP);
      selected = null;
    }
    activeServo = servo;
    rootEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addServo(value) {
    if (value === "") return;
    const servo = Number(value);
    if (group.includes(servo) || group.length >= MAX_GROUP) return;
    letGo();
    group = [...group, servo];
    activeServo ??= servo;
  }

  function removeServo(servo) {
    letGo();
    group = group.filter((s) => s !== servo);
    if (activeServo === servo) {
      activeServo = group[0] ?? null;
      selected = null;
    }
  }

  //// Editing

  // Sent shortly after the last change, so a drag doesn't flood the link.
  function queueSend(servo) {
    clearTimeout(sendTimers[servo]);
    sendTimers[servo] = setTimeout(() => {
      delete sendTimers[servo];
      mspHelper.sendServoCurve(servo);
    }, SEND_DELAY_MS);
    onChange?.();
  }

  function nudge(deltaUs) {
    if (activeServo === null || selected === null) return;
    const curve = FC.SERVO_CURVES[activeServo];
    const config = FC.SERVO_CONFIG[activeServo];
    if (nudgeCurvePoint(config, curve, selected, deltaUs)) {
      queueSend(activeServo);
    }
  }

  function drag(servo, index, y) {
    const point = FC.SERVO_CURVES[servo].points[index];
    if (point.y === y) return;
    point.y = y;
    queueSend(servo);
  }

  // Each servo's curve has its own points: one servo may need a bend in the
  // middle while another only needs its ends moved. The group stays held
  // where it is; only a selected point on this curve is dropped.
  function setPointCount(servo, n) {
    const curve = FC.SERVO_CURVES[servo];
    if (curve.count === n) return;
    FC.SERVO_CURVES[servo] = resampleCurve(curve, n);
    if (servo === activeServo) selected = null;
    queueSend(servo);
  }

  function resetCurve(servo) {
    FC.SERVO_CURVES[servo] = resampleCurve(null, FC.SERVO_CURVES[servo].count);
    queueSend(servo);
  }

  function onKey(servo, event) {
    activeServo = servo;
    const curve = FC.SERVO_CURVES[servo];
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(-step);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const from = selected ?? nearestPoint(curve, markerFor(servo) ?? 0);
      const to = Math.min(
        Math.max(from + (event.key === "ArrowRight" ? 1 : -1), 0),
        curve.count - 1,
      );
      selectPoint(servo, to);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleLock();
    }
  }

  //// What the graphs show

  // Where `servo` is along its curve: held there, or worked back from its
  // output pulse while the sticks move it.
  function markerFor(servo) {
    if (holdX !== null) return holdX * dir(servo);
    const us = FC.SERVO_DATA?.[servo];
    const config = FC.SERVO_CONFIG[servo];
    if (!us || !config) return null;
    return commandFromOutput(config, us, FC.SERVO_SAVED_TRIM?.[servo] ?? 0);
  }

  function percent(value, digits = 0) {
    const n = (value / 10).toFixed(digits);
    return `${value > 0 ? "+" : ""}${n}%`;
  }

  function infoFor(servo) {
    if (servo !== activeServo || selected === null) return null;
    const curve = FC.SERVO_CURVES[servo];
    const point = curve.points[selected];
    const us = pointOffsetUs(FC.SERVO_CONFIG[servo], curve, selected);
    return [
      `X: ${percent(point.x)}`,
      `Δ: ${percent(point.y, 1)} · ${us > 0 ? "+" : ""}${us} µs`,
    ];
  }

  onDestroy(() => {
    letGo();
    for (const servo of Object.keys(sendTimers)) {
      clearTimeout(sendTimers[servo]);
      mspHelper.sendServoCurve(Number(servo));
    }
  });
</script>

<p class="intro" bind:this={rootEl}>{$i18n.t("servoBalanceIntro")}</p>

<div class="row">
  <span class="muted">{$i18n.t("servoBalanceGroup")}</span>
  {#each group as servo (servo)}
    <span class="chip">
      {label(servo)}
      <button
        type="button"
        aria-label={$i18n.t("servoBalanceRemove", { 1: servo + 1 })}
        onclick={() => removeServo(servo)}>×</button
      >
    </span>
  {/each}
  {#if group.length < MAX_GROUP}
    <select value="" onchange={(e) => addServo(e.target.value)}>
      <option value="">{$i18n.t("servoBalanceAdd")}</option>
      {#each others.filter((s) => suggestions.includes(s.index)) as s (s.index)}
        <option value={s.index}>
          {$i18n.t("servoBalanceSameMix", { 1: s.index + 1 })}
        </option>
      {/each}
      {#each others.filter((s) => !suggestions.includes(s.index)) as s (s.index)}
        <option value={s.index}>{label(s.index)}</option>
      {/each}
    </select>
  {/if}
  {#if ready && group.length > 1}
    <span class="grow"></span>
    <button
      class={["btn", holdX !== null && !sweeping && "selected"]}
      type="button"
      onclick={toggleLock}
    >
      <i
        class={["fas", holdX !== null ? "fa-lock" : "fa-lock-open"]}
        aria-hidden="true"
      ></i>
      {$i18n.t(holdX !== null ? "servoBalanceLocked" : "servoBalanceLock")}
    </button>
    <button
      class={["btn", sweeping && "selected"]}
      type="button"
      onclick={() => (sweeping ? stopSweep() : sweep())}
    >
      {$i18n.t(sweeping ? "servoBalanceSweepStop" : "servoBalanceSweep")}
    </button>
  {/if}
</div>

{#if group.length === 1}
  <p class="muted pad">
    {suggestions.length > 0
      ? $i18n.t("servoBalanceAddSuggested", {
          1: suggestions.map((s) => s + 1).join(", "),
        })
      : $i18n.t("servoBalanceNoSameMix", { 1: anchor + 1 })}
  </p>
{/if}
{#if unshared.length > 0}
  <p class="warn">
    {$i18n.t("servoBalanceNoSharedInput", {
      1: unshared.map((s) => s + 1).join(", "),
      2: anchor + 1,
    })}
  </p>
{/if}

{#if ready && group.length > 1}
  <div class="graphs">
    {#each group as servo (servo)}
      {@const curve = FC.SERVO_CURVES[servo]}
      {@const marker = markerFor(servo)}
      {@const isActive = servo === activeServo}
      <BalanceGraph
        title={direction(servo) === -1
          ? $i18n.t("servoBalanceMirrored", { 1: servo + 1 })
          : label(servo)}
        {curve}
        active={isActive}
        selected={isActive ? selected : null}
        nearest={marker === null ? null : nearestPoint(curve, marker)}
        markerX={marker}
        holding={holdX !== null}
        info={infoFor(servo)}
        onFocus={() => (activeServo = servo)}
        onSelect={(i) => selectPoint(servo, i)}
        onDrag={(i, y) => drag(servo, i, y)}
        onKey={(e) => onKey(servo, e)}
      >
        {#if isActive && selected !== null}
          <span class="nudges">
            {#each [-10, -1] as delta (delta)}
              <button class="btn" type="button" onclick={() => nudge(delta)}
                >{delta}</button
              >
            {/each}
            <span class="unit">µs</span>
            {#each [1, 10] as delta (delta)}
              <button class="btn" type="button" onclick={() => nudge(delta)}
                >+{delta}</button
              >
            {/each}
          </span>
        {/if}
        {#if curve.points
          .slice(0, curve.count)
          .some((_, i) => pointUse(curve, i) >= USE_WARN)}
          <span class="warn-inline">
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
            {$i18n.t("servoBalanceNearLimit")}
          </span>
        {/if}
        <span class="points" role="group">
          <span class="muted">{$i18n.t("servoBalancePointCount")}</span>
          {#each POINT_COUNTS as n (n)}
            <button
              class={["btn", "small", curve.count === n && "selected"]}
              type="button"
              aria-pressed={curve.count === n}
              onclick={() => setPointCount(servo, n)}
            >
              {n}
            </button>
          {/each}
        </span>
        <button
          class="btn small"
          type="button"
          onclick={() => resetCurve(servo)}
        >
          {$i18n.t("servoBalanceReset")}
        </button>
      </BalanceGraph>
    {/each}
  </div>
  <p class="muted pad">{$i18n.t("servoBalanceHowTo")}</p>
{/if}

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
    }

    &.small {
      min-width: 0;
      padding: 2px 8px;
      font-size: 0.8em;
    }

    i {
      margin-right: 4px;
    }
  }

  .intro,
  .muted,
  .warn {
    margin: 0;
    max-width: 75ch;
  }

  .intro,
  .pad {
    padding: 0 8px 8px;
  }

  .intro {
    padding-top: 8px;
  }

  .muted {
    color: var(--color-text-soft);
  }

  .warn,
  .warn-inline {
    color: var(--color-status-bad, #c80);
  }

  .warn {
    padding: 0 8px 8px;
  }

  .warn-inline {
    font-size: 0.85em;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 10px;
    border: 1px solid var(--color-accent-500);
    border-radius: 999px;
    background-color: var(--color-accent-soft);
    font-weight: 500;

    button {
      border: none;
      background: none;
      color: var(--color-text-soft);
      font-size: 1.1em;
      line-height: 1;
      cursor: pointer;

      &:hover {
        color: var(--color-text);
      }
    }
  }

  .grow {
    flex-grow: 1;
  }

  .graphs {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px;
  }

  .nudges {
    display: inline-flex;
    align-items: center;
    gap: 4px;

    .btn {
      min-width: 2.4em;
      padding: 2px 6px;
    }
  }

  .points {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.9em;

    .btn.small {
      min-width: 2em;
    }
  }

  .unit {
    color: var(--color-text-soft);
    padding: 0 2px;
  }
</style>
