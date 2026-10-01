<script>
  import { getContext } from "svelte";

  import { i18n } from "@/js/i18n.js";

  import { AXES, gainForThrow } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  // Full stick in the direction named on the button; signs as in the
  // Direction step (pitch - is stick back, yaw - is yaw right).
  const FULL = { roll: 1, pitch: -1, yaw: -1 };

  let target = $state({ roll: null, pitch: null, yaw: null });
  let measured = $state({ roll: null, pitch: null, yaw: null });
  let active = $state(null);

  let axes = $derived(
    AXES.filter((a) => wiz.surfaces.some((s) => s.axes[a.key])).map(
      (a) => a.key,
    ),
  );

  function hold(axis) {
    active = axis;
    wiz.holdAxes({ roll: 0, pitch: 0, yaw: 0, [axis]: FULL[axis] });
  }

  function apply(axis) {
    const next = gainForThrow(
      wiz.axisGainPercent(axis),
      measured[axis],
      target[axis],
    );
    wiz.setAxisGainPercent(axis, next);
    measured[axis] = null;
  }
</script>

<p>{$i18n.t("setupWizardThrowsIntro")}</p>

<table class="rows">
  <thead>
    <tr>
      <th>{$i18n.t("setupWizardThrowsAxis")}</th>
      <th>{$i18n.t("setupWizardThrowsTarget")}</th>
      <th></th>
      <th>{$i18n.t("setupWizardThrowsMeasured")}</th>
      <th>{$i18n.t("setupWizardThrowsGain")}</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each axes as axis (axis)}
      <tr class={active === axis && "active"}>
        <td class="name">{$i18n.t(`setupWizardAxis_${axis}`)}</td>
        <td>
          <input
            id={`throw-target-${axis}`}
            type="number"
            min="1"
            max="90"
            step="1"
            bind:value={target[axis]}
          /> °
        </td>
        <td>
          <button class="btn" onclick={() => hold(axis)}>
            {$i18n.t(`setupWizardThrowsHold_${axis}`)}
          </button>
        </td>
        <td>
          <input
            id={`throw-measured-${axis}`}
            type="number"
            min="0"
            max="90"
            step="0.5"
            disabled={active !== axis}
            bind:value={measured[axis]}
          /> °
        </td>
        <td class="gain">{wiz.axisGainPercent(axis)}%</td>
        <td>
          <button
            class="btn"
            disabled={active !== axis ||
              !(measured[axis] > 0) ||
              !(target[axis] > 0)}
            onclick={() => apply(axis)}
          >
            {$i18n.t("setupWizardApply")}
          </button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<p class="muted">{$i18n.t("setupWizardThrowsRepeat")}</p>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .rows {
    border-collapse: collapse;

    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.9em;
      color: var(--color-text-soft);
      padding: 0 12px 4px 0;
    }

    td {
      padding: 6px 12px 6px 0;
      vertical-align: middle;
      white-space: nowrap;
    }

    tr.active td {
      background-color: var(--color-surface);
    }
  }

  input {
    width: 5em;
  }

  .name {
    font-weight: 600;
    padding-left: 8px;
  }

  .gain {
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
