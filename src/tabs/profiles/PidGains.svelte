<script>
  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import {
    PID_ADJUSTMENT_FUNCTIONS,
    adjustmentChannelLabel,
    adjustmentTitle,
    getAdjustmentState,
  } from "./adjustmentState.js";

  const AXES = ["ROLL", "PITCH", "YAW"];
  const GAINS = [
    {
      key: "P",
      label: "profilesProportional",
      help: "profilesProportionalHelp",
    },
    { key: "I", label: "profilesIntegral", help: "profilesIntegralHelp" },
    { key: "D", label: "profilesDerivative", help: "profilesDerivativeHelp" },
    { key: "F", label: "profilesFeedforward", help: "profilesFeedforwardHelp" },
    { key: "B", label: "profilesBoost", help: "profilesBoostHelp" },
  ];

  function pidAdjustmentState(axisIndex, gainIndex) {
    return getAdjustmentState(PID_ADJUSTMENT_FUNCTIONS[axisIndex][gainIndex]);
  }
</script>

<Section label="profilesPidGains">
  <div class="table-scroll">
    <table class="grid">
      <thead>
        <tr>
          <th></th>
          {#each GAINS as gain (gain.key)}
            <th>
              <span class="header-label">
                {$i18n.t(gain.label)}
                <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
              </span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each AXES as axis, axisIndex (axis)}
          <tr>
            <td class="axis {axis}">{$i18n.t(`axis${axis}`)}</td>
            {#each GAINS as gain, gainIndex (gain.key)}
              {@const adjustment = pidAdjustmentState(axisIndex, gainIndex)}
              <td>
                <div
                  class="runtime-control"
                  class:runtime-controlled={adjustment}
                  class:runtime-active={adjustment?.active}
                  title={adjustmentTitle(adjustment)}
                >
                  <NumberInput
                    min="0"
                    max="1000"
                    bind:value={FC.PIDS[axisIndex][gainIndex]}
                  />
                  {#if adjustment}
                    <span class="adjustment-badge">
                      {adjustment.active
                        ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
                        : "ADJ"}
                    </span>
                  {/if}
                </div>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Section>

<style lang="scss">
  .table-scroll {
    overflow-x: auto;
  }

  .grid {
    width: 100%;
    min-width: 480px;
    border-collapse: collapse;
  }

  th {
    padding: 4px;
    font-weight: 600;
    font-size: 0.8rem;
    text-align: center;

    color: var(--color-text-soft);
    border-bottom: 1px solid var(--color-border);
  }

  .header-label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    white-space: nowrap;
  }

  td {
    padding: 4px;
    text-align: center;
  }

  .runtime-control {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .runtime-controlled {
    padding-right: 2px;
  }

  .runtime-active {
    opacity: 1;
  }

  .adjustment-badge {
    min-width: 2.5rem;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: 3px;
    background-color: var(--color-accent, var(--accent));
    color: var(--color-text-inverse, #fff);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
    letter-spacing: 0;
  }

  .runtime-control:not(.runtime-active) .adjustment-badge {
    background-color: transparent;
    color: var(--color-text-soft);
  }

  .runtime-control.runtime-active :global(.container) {
    opacity: 0.62;
  }

  .axis {
    font-weight: 600;
    text-align: left;
    padding-left: 8px;
  }

  .axis.ROLL {
    background-color: hsl(0, 100%, 85%);
  }

  .axis.PITCH {
    background-color: hsl(120, 100%, 85%);
  }

  .axis.YAW {
    background-color: hsl(240, 100%, 88%);
  }

  :global(html[data-theme="dark"]) .axis.ROLL {
    background-color: hsl(0, 40%, 30%);
  }

  :global(html[data-theme="dark"]) .axis.PITCH {
    background-color: hsl(120, 25%, 25%);
  }

  :global(html[data-theme="dark"]) .axis.YAW {
    background-color: hsl(240, 35%, 32%);
  }
</style>
