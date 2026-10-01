<script>
  import { getContext, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import { primaryAxis, SERVO_FLAG_REVERSE } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  // Half deflection in the stick direction each check describes. Signs follow
  // the stabilized inputs: roll + is right roll, pitch + is stick forward
  // (nose down), and yaw + is yaw left, since RC yaw is negated once in the
  // firmware's setpoint.c.
  const CHECKS = [
    { axis: "pitch", value: -0.5, key: "pitch" },
    { axis: "roll", value: 0.5, key: "roll" },
    { axis: "yaw", value: -0.5, key: "yaw" },
  ];

  let active = $state(null);
  let answers = $state({});
  let wiggleTimer;

  let checks = $derived(
    CHECKS.filter((c) => wiz.surfaces.some((s) => s.axes[c.axis])),
  );

  function hold(check) {
    active = check.key;
    wiz.holdAxes({ roll: 0, pitch: 0, yaw: 0, [check.axis]: check.value });
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
      if (surface.axes[check.axis]) {
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

<p>{$i18n.t("setupWizardDirectionIntro")}</p>

{#each checks as check (check.key)}
  <section class={["check", active === check.key && "active"]}>
    <div class="check-head">
      <button class="btn" onclick={() => hold(check)}>
        {$i18n.t(`setupWizardDirectionMove_${check.key}`)}
      </button>
      <span class="expect"
        >{$i18n.t(`setupWizardDirectionExpect_${check.key}`)}</span
      >
    </div>

    {#if active === check.key}
      <table class="rows">
        <tbody>
          {#each wiz.surfaces.filter((s) => s.axes[check.axis]) as surface (surface.servo)}
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
                    >{$i18n.t("setupWizardDirectionMixedHint")}</span
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="invert">
        <span class="muted">{$i18n.t("setupWizardDirectionAllWrong")}</span>
        <button class="btn" onclick={() => invertAxis(check)}>
          {$i18n.t(`setupWizardDirectionInvert_${check.key}`)}
        </button>
      </div>
    {/if}
  </section>
{/each}

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .check {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);

    &.active {
      border-color: var(--color-accent-500);
    }
  }

  .check-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .expect {
    max-width: 60ch;
  }

  .rows {
    border-collapse: collapse;

    td {
      padding: 4px 12px 4px 0;
      vertical-align: middle;
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
