<script>
  import { getContext, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import RadioIcon from "./RadioIcon.svelte";
  import { primaryAxis, SERVO_FLAG_REVERSE } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  // Signs follow the stabilized inputs: roll + is right roll, pitch + is
  // stick forward (nose down), and yaw + is yaw left, since RC yaw is negated
  // once in the firmware's setpoint.c. The flap check moves the flap
  // channel instead, positive being flaps down (FLAP_INPUT in surfaces.js).
  // It comes first: flaps that follow the ailerons get their roll direction
  // from their flap direction.
  const CHECKS = [
    { axis: "flap", sign: 1, key: "flap" },
    { axis: "pitch", sign: -1, key: "pitch" },
    { axis: "roll", sign: 1, key: "roll" },
    { axis: "yaw", sign: -1, key: "yaw" },
  ];

  const DEFLECTION_OPTIONS = [
    { value: 0.15, label: "setupWizardDirectionDeflectionSmall" },
    { value: 0.25, label: "setupWizardDirectionDeflectionMedium" },
    { value: 0.35, label: "setupWizardDirectionDeflectionLarge" },
    { value: 0.5, label: "setupWizardDirectionDeflectionHalf" },
  ];

  let active = $state(null);
  let holding = $state(false);
  let deflection = $state(0.15);
  let answers = $state({});
  let wiggleTimer;

  // Whether this check moves the surface. The flap check leaves out pitch
  // surfaces carrying a Flap Compensation rule: that mix is tuned, not
  // checked here.
  function movedBy(surface, check) {
    if (check.axis === "flap") {
      return surface.kind === "flap" || surface.kind === "flaperon";
    }
    return !!surface.axes[check.axis];
  }

  let checks = $derived(
    CHECKS.filter((c) => wiz.surfaces.some((s) => movedBy(s, c))),
  );

  function hold(check) {
    active = check.key;
    holding = true;
    wiz.holdAxes({
      roll: 0,
      pitch: 0,
      yaw: 0,
      // Flaps up for the other checks, so a flap mix doesn't hide them.
      flap: 0,
      [check.axis]: check.sign * deflection,
    });
  }

  function setDeflection(value) {
    deflection = value;
    if (!holding || !active) return;
    const check = checks.find((c) => c.key === active);
    if (check) hold(check);
  }

  // Lets the surfaces go but keeps the check open for answering.
  function stop() {
    holding = false;
    wiz.releaseAxes();
  }

  function answer(check, surface, correct) {
    answers[`${check.key}:${surface.servo}`] = correct ? "ok" : "fixed";
    if (correct) return;
    const config = FC.SERVO_CONFIG[surface.servo];
    config.flags ^= SERVO_FLAG_REVERSE;
    wiz.sendServo(surface.servo);
  }

  function invertAxis(check) {
    wiz.invertAxis(check.axis);
    for (const surface of wiz.surfaces) {
      if (movedBy(surface, check)) {
        answers[`${check.key}:${surface.servo}`] = "fixed";
      }
    }
  }

  // Moves one servo back and forth a few times so the pilot can see which
  // surface the row is about.
  function identify(servo) {
    clearInterval(wiggleTimer);
    let count = 0;
    wiggleTimer = setInterval(() => {
      if (count >= 6) {
        clearInterval(wiggleTimer);
        wiz.releaseServo(servo);
        return;
      }
      wiz.holdServo(servo, count % 2 === 0 ? 300 : -300);
      count++;
    }, 250);
  }

  onDestroy(() => clearInterval(wiggleTimer));
</script>

<div class="no-radio">
  <RadioIcon />
  <span>{$i18n.t("setupWizardDirectionNoRadio")}</span>
</div>

<p>{$i18n.t("setupWizardDirectionIntro")}</p>

<div
  class="deflection"
  role="group"
  aria-label={$i18n.t("setupWizardDirectionDeflection")}
>
  <span>{$i18n.t("setupWizardDirectionDeflection")}</span>
  {#each DEFLECTION_OPTIONS as option (option.value)}
    <button
      class={["btn", "step", deflection === option.value && "selected"]}
      type="button"
      aria-pressed={deflection === option.value}
      onclick={() => setDeflection(option.value)}
    >
      {$i18n.t(option.label)}
    </button>
  {/each}
</div>

{#if wiz.bypassMode}
  <div class="passthrough-on">
    {$i18n.t("setupWizardBypassTurnOff", { 1: wiz.bypassMode })}
  </div>
{/if}

{#each checks as check, n (check.key)}
  {@const live = active === check.key && holding}
  <section class={["check", active === check.key && "active"]}>
    <div class="check-head">
      <span class="index">{n + 1}</span>
      <span class="expect"
        >{$i18n.t(`setupWizardDirectionExpect_${check.key}`)}</span
      >
      {#if live}
        <span class="holding">
          <span class="dot"></span>
          {$i18n.t("setupWizardDirectionHolding")}
        </span>
        <button class="btn" onclick={stop}>
          <i class="fas fa-stop" aria-hidden="true"></i>
          {$i18n.t("setupWizardDirectionStop")}
        </button>
      {:else}
        <button class="btn primary" onclick={() => hold(check)}>
          <i class="fas fa-play" aria-hidden="true"></i>
          {$i18n.t(`setupWizardDirectionMove_${check.key}`)}
        </button>
      {/if}
    </div>

    {#if active === check.key}
      <table class="rows">
        <tbody>
          {#each wiz.surfaces.filter( (s) => movedBy(s, check), ) as surface (surface.servo)}
            {@const state = answers[`${check.key}:${surface.servo}`]}
            {@const ownAxis = primaryAxis(surface) === check.axis}
            <tr>
              <td class="name">{wiz.surfaceLabel(surface)}</td>
              <td><LivePulse servo={surface.servo} /></td>
              <td class="buttons">
                <button class="btn" onclick={() => identify(surface.servo)}>
                  {$i18n.t("setupWizardIdentify")}
                </button>
                <button
                  class="btn"
                  onclick={() => answer(check, surface, true)}
                >
                  {$i18n.t("setupWizardDirectionCorrect")}
                </button>
                {#if ownAxis}
                  <button
                    class="btn"
                    onclick={() => answer(check, surface, false)}
                  >
                    {$i18n.t("setupWizardDirectionWrong")}
                  </button>
                {/if}
              </td>
              <td class="state">
                {#if state === "ok"}
                  <span class="good">{$i18n.t("setupWizardDone")}</span>
                {:else if state === "fixed"}
                  <span class="good"
                    >{$i18n.t("setupWizardDirectionReversed")}</span
                  >
                {:else if !ownAxis}
                  <span class="muted"
                    >{$i18n.t(
                      surface.kind === "flap"
                        ? "setupWizardDirectionFlapFollowHint"
                        : "setupWizardDirectionMixedHint",
                    )}</span
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if check.axis === "flap"}
        <span class="muted">{$i18n.t("setupWizardDirectionFlapRadio")}</span>
      {:else}
        <div class="invert">
          <span class="muted">{$i18n.t("setupWizardDirectionAllWrong")}</span>
          <button class="btn" onclick={() => invertAxis(check)}>
            {$i18n.t(`setupWizardDirectionInvert_${check.key}`)}
          </button>
        </div>
      {/if}
    {/if}
  </section>
{/each}

<style lang="scss">
  .passthrough-on {
    padding: 8px 12px;
    border-left: 3px solid var(--color-status-bad);
    border-radius: var(--radius-xs);
    background-color: var(--color-surface);
    max-width: 70ch;
    font-weight: 600;
  }

  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
  }

  .check-head .btn {
    height: 2rem;
    padding: 0 16px;
  }

  .deflection {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--color-text-soft);
    font-weight: 600;

    .step {
      height: 2rem;
      padding: 0 12px;

      &.selected {
        border-color: var(--color-accent-500);
        background-color: var(--color-accent-soft);
        color: var(--color-text);
      }
    }
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .no-radio {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid var(--color-accent-500);
    border-radius: var(--radius-md);
    background-color: var(--color-accent-soft);
    font-weight: 600;
  }

  .check {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    transition:
      border-color var(--animation-speed),
      box-shadow var(--animation-speed);

    &.active {
      border-color: var(--color-accent-500);
      box-shadow: inset 4px 0 0 var(--color-accent-500);
    }
  }

  .check-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }

  .index {
    flex: 0 0 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    font-size: 0.85em;
    font-weight: 600;

    .active & {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-500);
      color: var(--color-accent-fg);
    }
  }

  .expect {
    flex: 1 1 280px;
    max-width: 60ch;
  }

  .holding {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-accent-500);
    font-size: 0.9em;
    font-weight: 600;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-accent-500);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }

  .rows {
    border-collapse: collapse;

    td {
      padding: 6px 12px 6px 0;
      vertical-align: middle;
    }

    tr + tr td {
      border-top: 1px solid var(--color-border-soft);
    }
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
  }

  .buttons {
    display: flex;
    gap: 4px;
  }

  .invert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .good {
    color: var(--color-status-good);
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
