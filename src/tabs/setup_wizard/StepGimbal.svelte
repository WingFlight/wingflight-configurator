<script>
  import { getContext, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import {
    THROTTLE_MODE_BIDIRECTIONAL,
    COUPLED_AXIS_PITCH,
    COUPLED_AXIS_YAW,
  } from "@/js/ReverseFlight.js";

  import NumberInput from "@/components/NumberInput.svelte";
  import Switch from "@/components/Switch.svelte";

  import { SERVO_FLAG_REVERSE } from "./surfaces.js";

  // Thrust vector gimbal: the servos that tilt the motor (thrust vector
  // mixer inputs), and for bidirectional (4D) throttle the surfaces linked
  // to the gimbal. The surface steps before this one don't see these servos.
  const wiz = getContext("setupWizard");

  // Held input per check, in the stabilized signs (surfaces.js): pitch + is
  // stick forward, yaw + is yaw left, roll + is right roll. The motor is ahead
  // of the centre of gravity, so stick back tilts the thrust up and right
  // rudder tilts it right.
  const CHECK = {
    pitch: { sign: -1, key: "pitch" },
    yaw: { sign: -1, key: "yaw" },
    roll: { sign: 1, key: "roll" },
  };
  const CHECK_DEFLECTION = 0.5;
  const CENTRE_STEP_US = 5;

  let reverseFlight = $derived(FC.REVERSE_FLIGHT_CONFIG);
  let bidirectional = $derived(
    reverseFlight?.throttle_mode === THROTTLE_MODE_BIDIRECTIONAL,
  );

  let holding = $state(null); // "<servo>:<what>"
  let answers = $state({});
  let linkedChanged = $state(false);
  let wiggleTimer;

  function hold(servo, what, values) {
    holding = `${servo}:${what}`;
    wiz.releaseAxes();
    // Every gimbal axis at 0 except the one being checked.
    wiz.holdVector({ roll: 0, pitch: 0, yaw: 0, ...values });
  }

  function release() {
    holding = null;
    wiz.releaseAxes();
  }

  function moveCentre(servo, delta) {
    const config = FC.SERVO_CONFIG[servo];
    config.mid += delta;
    wiz.sendServo(servo);
  }

  function sendLimits(servo) {
    wiz.sendServo(servo);
  }

  // A servo that is also a control surface (its surface rule plus a thrust
  // vector rule) already has its direction from the Direction step, so only
  // the gimbal's rule is turned round there.
  function isSurface(servo) {
    return wiz.surfaces.some((s) => s.servo === servo);
  }

  async function answer(gimbal, correct) {
    answers[gimbal.servo] = correct ? "ok" : "fixed";
    if (correct) return;
    if (isSurface(gimbal.servo)) {
      FC.MIXER_RULES = FC.MIXER_RULES.map((r) =>
        r.oper !== 0 && r.src === gimbal.input && r.dst === gimbal.servo + 1
          ? { ...r, weight: -r.weight, weightNeg: -r.weightNeg }
          : r,
      );
      await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
      wiz.markChanged();
      return;
    }
    const config = FC.SERVO_CONFIG[gimbal.servo];
    config.flags ^= SERVO_FLAG_REVERSE;
    wiz.sendServo(gimbal.servo);
  }

  // Moves one servo back and forth so the pilot can see which one it is.
  function identify(servo) {
    clearInterval(wiggleTimer);
    let count = 0;
    wiggleTimer = setInterval(() => {
      if (count >= 6) {
        clearInterval(wiggleTimer);
        wiz.releaseServo(servo);
        return;
      }
      wiz.holdServo(servo, count % 2 === 0 ? 200 : -200);
      count++;
    }, 250);
  }

  //// Surfaces linked to the gimbal (reverse_coupled_axes): one servo moves
  //// the surface and tilts the motor. It stays on the surface's stabilized
  //// rule; a thrust vector rule for the same axis would drive the gimbal
  //// twice, from two loops.

  const LINKS = [
    { key: "yaw", bit: COUPLED_AXIS_YAW, input: 29 },
    { key: "pitch", bit: COUPLED_AXIS_PITCH, input: 28 },
  ];

  function linked(link) {
    return ((reverseFlight?.reverse_coupled_axes ?? 0) & link.bit) !== 0;
  }

  function setLinked(link, on) {
    reverseFlight.reverse_coupled_axes = on
      ? reverseFlight.reverse_coupled_axes | link.bit
      : reverseFlight.reverse_coupled_axes & ~link.bit;
    linkedChanged = true;
    wiz.markChanged();
  }

  function hasVectorRule(link) {
    return FC.MIXER_RULES.some(
      (r) => r.oper !== 0 && r.src === link.input && (r.weight || r.weightNeg),
    );
  }

  async function removeVectorRules(link) {
    FC.MIXER_RULES = FC.MIXER_RULES.map((r) =>
      r.oper !== 0 && r.src === link.input ? Mixer.nullRule() : r,
    );
    await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
    wiz.markChanged();
  }

  wiz.setCommit(async () => {
    if (!linkedChanged || !FC.REVERSE_FLIGHT_CONFIG) return;
    await MSP.promise(
      MSPCodes.MSP2_WING_SET_REVERSE_FLIGHT_CONFIG,
      mspHelper.crunch(MSPCodes.MSP2_WING_SET_REVERSE_FLIGHT_CONFIG),
    );
  });

  onDestroy(() => {
    clearInterval(wiggleTimer);
    wiz.releaseAxes();
  });

  function axisLabel(axis) {
    return $i18n.t(`setupWizardGimbalAxis_${axis}`);
  }
</script>

<p>{$i18n.t("setupWizardGimbalIntro")}</p>

{#if bidirectional}
  <section class="card">
    <strong>{$i18n.t("setupWizardGimbalLinkedTitle")}</strong>
    <p class="muted">{$i18n.t("setupWizardGimbalLinkedHelp")}</p>
    {#each LINKS as link (link.key)}
      <div class="row">
        <Switch
          id="gimbal-linked-{link.key}"
          checked={linked(link)}
          onchange={(e) => setLinked(link, e.target.checked)}
        />
        <label for="gimbal-linked-{link.key}">
          {$i18n.t(`setupWizardGimbalLinked_${link.key}`)}
        </label>
      </div>
      {#if linked(link) && hasVectorRule(link)}
        <div class="note warn">
          <span>{$i18n.t(`setupWizardGimbalLinkedRule_${link.key}`)}</span>
          <button class="btn" onclick={() => removeVectorRules(link)}>
            {$i18n.t("setupWizardGimbalRemoveRule")}
          </button>
        </div>
      {/if}
    {/each}
  </section>
{/if}

{#if wiz.gimbals.length === 0}
  <div class="note">
    <i class="fas fa-info-circle" aria-hidden="true"></i>
    <span>{$i18n.t("setupWizardGimbalNone")}</span>
  </div>
{:else}
  <p class="muted">{$i18n.t("setupWizardGimbalModeHint")}</p>
  {#each wiz.gimbals as gimbal (gimbal.servo)}
    {@const config = FC.SERVO_CONFIG[gimbal.servo]}
    {@const check = CHECK[gimbal.axis]}
    {@const key = gimbal.servo}
    <section class="card">
      <div class="head">
        <strong>
          {$i18n.t("setupWizardGimbalServo", {
            1: gimbal.servo + 1,
            2: axisLabel(gimbal.axis),
          })}
        </strong>
        <button class="btn" onclick={() => identify(gimbal.servo)}>
          {$i18n.t("setupWizardGimbalIdentify")}
        </button>
      </div>

      <div class="block">
        <span class="label">{$i18n.t("setupWizardGimbalCentre")}</span>
        <div class="row">
          <button
            class="btn"
            aria-label="−{CENTRE_STEP_US} µs"
            onclick={() => moveCentre(gimbal.servo, -CENTRE_STEP_US)}>−</button
          >
          <span class="value">{config.mid} µs</span>
          <button
            class="btn"
            aria-label="+{CENTRE_STEP_US} µs"
            onclick={() => moveCentre(gimbal.servo, CENTRE_STEP_US)}>+</button
          >
          <button
            class={["btn", holding === `${key}:centre` && "primary"]}
            onclick={() =>
              holding === `${key}:centre`
                ? release()
                : hold(key, "centre", { [gimbal.axis]: 0 })}
          >
            {$i18n.t("setupWizardGimbalHoldCentre")}
          </button>
        </div>
        <span class="muted">{$i18n.t("setupWizardGimbalCentreHelp")}</span>
      </div>

      <div class="block">
        <span class="label">{$i18n.t("setupWizardGimbalDirection")}</span>
        <div class="row">
          <button
            class={["btn", holding === `${key}:dir` && "primary"]}
            onclick={() =>
              holding === `${key}:dir`
                ? release()
                : hold(key, "dir", {
                    [gimbal.axis]: check.sign * CHECK_DEFLECTION,
                  })}
          >
            {$i18n.t(`setupWizardGimbalHold_${gimbal.axis}`)}
          </button>
          <span>{$i18n.t(`setupWizardGimbalQuestion_${gimbal.axis}`)}</span>
          <button class="btn" onclick={() => answer(gimbal, true)}>
            {$i18n.t("setupWizardGimbalYes")}
          </button>
          <button class="btn" onclick={() => answer(gimbal, false)}>
            {$i18n.t("setupWizardGimbalNo")}
          </button>
          {#if answers[key] === "ok"}
            <span class="good">{$i18n.t("setupWizardGimbalOk")}</span>
          {:else if answers[key] === "fixed"}
            <span class="good">{$i18n.t("setupWizardGimbalReversed")}</span>
          {/if}
        </div>
      </div>

      <div class="block">
        <span class="label">{$i18n.t("setupWizardGimbalLimits")}</span>
        <div class="row">
          <button
            class={["btn", holding === `${key}:neg` && "primary"]}
            onclick={() =>
              holding === `${key}:neg`
                ? release()
                : hold(key, "neg", { [gimbal.axis]: -1 })}
          >
            {$i18n.t("setupWizardGimbalFullTilt", { 1: "−" })}
          </button>
          <button
            class={["btn", holding === `${key}:pos` && "primary"]}
            onclick={() =>
              holding === `${key}:pos`
                ? release()
                : hold(key, "pos", { [gimbal.axis]: 1 })}
          >
            {$i18n.t("setupWizardGimbalFullTilt", { 1: "+" })}
          </button>
        </div>
        <div class="row">
          <label for="gimbal-min-{key}">{$i18n.t("setupWizardGimbalMin")}</label
          >
          <NumberInput
            id="gimbal-min-{key}"
            min="-1000"
            max="0"
            bind:value={FC.SERVO_CONFIG[gimbal.servo].min}
            onchange={() => sendLimits(gimbal.servo)}
          />
          <label for="gimbal-max-{key}">{$i18n.t("setupWizardGimbalMax")}</label
          >
          <NumberInput
            id="gimbal-max-{key}"
            min="0"
            max="1000"
            bind:value={FC.SERVO_CONFIG[gimbal.servo].max}
            onchange={() => sendLimits(gimbal.servo)}
          />
        </div>
        <span class="muted">{$i18n.t("setupWizardGimbalLimitsHelp")}</span>
      </div>
    </section>
  {/each}
{/if}

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

  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .value {
    min-width: 5em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .good {
    color: var(--color-status-good);
    font-weight: 600;
  }

  .note {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-soft);
  }

  .note.warn {
    border-color: var(--color-yellow-500, var(--color-border-accent));
  }
</style>
