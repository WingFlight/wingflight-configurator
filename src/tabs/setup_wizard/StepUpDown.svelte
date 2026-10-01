<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import {
    primaryAxis,
    outputForAxis,
    servoSide,
    scaleForThrow,
    SERVO_FLAG_REVERSE,
  } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  // Each surface is checked on its own axis, full stick both ways. Signs as
  // in the Direction step.
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

  // The surface list doesn't change while this step is open (it comes from
  // the mixer rules), so every entry can be created up front.
  let entries = $state(
    Object.fromEntries(
      wiz.surfaces.flatMap((s) =>
        DIRECTIONS[primaryAxis(s)].map((d) => [
          `${s.servo}:${d.key}`,
          { measured: null, wanted: null },
        ]),
      ),
    ),
  );
  let active = $state(null);

  function entry(servo, key) {
    return entries[`${servo}:${key}`];
  }

  function hold(surface, direction) {
    const axis = primaryAxis(surface);
    active = `${surface.servo}:${direction.key}`;
    wiz.holdAxes({ roll: 0, pitch: 0, yaw: 0, [axis]: direction.stick });
  }

  function apply(surface) {
    const axis = primaryAxis(surface);
    const config = FC.SERVO_CONFIG[surface.servo];
    const reversed = (config.flags & SERVO_FLAG_REVERSE) !== 0;

    for (const direction of DIRECTIONS[axis]) {
      const e = entry(surface.servo, direction.key);
      if (!(e.measured > 0) || !(e.wanted > 0)) continue;
      const output = outputForAxis(
        surface,
        axis,
        direction.stick,
        wiz.axisGains,
      );
      if (output === 0) continue;
      if (servoSide(output, reversed) === "pos") {
        config.rpos = scaleForThrow(
          config.rpos,
          output,
          e.measured,
          e.wanted,
          config.max,
        );
      } else {
        config.rneg = scaleForThrow(
          config.rneg,
          output,
          e.measured,
          e.wanted,
          -config.min,
        );
      }
      e.measured = null;
    }
    wiz.sendServo(surface.servo);
  }

  function canApply(surface) {
    return DIRECTIONS[primaryAxis(surface)].some((d) => {
      const e = entries[`${surface.servo}:${d.key}`];
      return e && e.measured > 0 && e.wanted > 0;
    });
  }
</script>

<p>{$i18n.t("setupWizardUpDownIntro")}</p>

{#each wiz.surfaces as surface (surface.servo)}
  {@const axis = primaryAxis(surface)}
  {@const config = FC.SERVO_CONFIG[surface.servo]}
  <section class="surface">
    <div class="head">
      <strong>{wiz.surfaceLabel(surface)}</strong>
      <span class="muted">
        {$i18n.t("setupWizardUpDownScales", { 1: config.rneg, 2: config.rpos })}
      </span>
    </div>
    {#if Object.keys(surface.axes).length > 1}
      <span class="muted">{$i18n.t("setupWizardUpDownMixedNote")}</span>
    {/if}
    <table class="rows">
      <tbody>
        {#each DIRECTIONS[axis] as direction (direction.key)}
          {@const e = entry(surface.servo, direction.key)}
          {@const id = `${surface.servo}-${direction.key}`}
          <tr
            class={active === `${surface.servo}:${direction.key}` && "active"}
          >
            <td>
              <button class="btn" onclick={() => hold(surface, direction)}>
                {$i18n.t(`setupWizardUpDown_${direction.key}`)}
              </button>
            </td>
            <td>
              <label for={`measured-${id}`}
                >{$i18n.t("setupWizardThrowsMeasured")}</label
              >
              <input
                id={`measured-${id}`}
                type="number"
                min="0"
                max="90"
                step="0.5"
                bind:value={e.measured}
              /> °
            </td>
            <td>
              <label for={`wanted-${id}`}
                >{$i18n.t("setupWizardUpDownWanted")}</label
              >
              <input
                id={`wanted-${id}`}
                type="number"
                min="1"
                max="90"
                step="0.5"
                bind:value={e.wanted}
              /> °
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div>
      <button
        class="btn"
        disabled={!canApply(surface)}
        onclick={() => apply(surface)}
      >
        {$i18n.t("setupWizardApply")}
      </button>
    </div>
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

  .surface {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
  }

  .rows {
    border-collapse: collapse;

    td {
      padding: 4px 12px 4px 0;
      vertical-align: middle;
      white-space: nowrap;
    }

    tr.active td {
      background-color: var(--color-surface);
    }
  }

  label {
    margin-right: 4px;
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  input {
    width: 5em;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
