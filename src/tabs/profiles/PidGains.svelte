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
  } from "@/tabs/adjustments/adjustmentState.js";

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

{#snippet valueCell(axisIndex, gainIndex)}
  {@const adjustment = pidAdjustmentState(axisIndex, gainIndex)}
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
{/snippet}

<Section label="profilesPidGains">
  <!-- Desktop: axes as rows, gain terms as columns. -->
  <div class="table-scroll desktop-table">
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
              <td>{@render valueCell(axisIndex, gainIndex)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Mobile: five gain-term columns don't fit a phone width even shrunk,
       so terms become rows and the 3 axes become columns instead - same
       data, same steppers, just reoriented to fit. -->
  <div class="table-scroll mobile-table">
    <table class="grid">
      <thead>
        <tr>
          <th></th>
          {#each AXES as axis (axis)}
            <th class="axis-header {axis}">{$i18n.t(`axis${axis}`)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each GAINS as gain, gainIndex (gain.key)}
          <tr>
            <td class="term-label">
              <span class="header-label">
                <span class="term-key">{gain.key}</span>
                <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
              </span>
            </td>
            {#each AXES as axis, axisIndex (axis)}
              <td>{@render valueCell(axisIndex, gainIndex)}</td>
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

  .mobile-table {
    display: none;
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
  }

  .runtime-active {
    opacity: 1;
  }

  // Absolutely positioned, not a normal flex child -- a td centers
  // .runtime-control as one box (`td { text-align: center }` above), so a
  // badge sharing the flex row would widen that box on badge-carrying rows
  // only, visibly dragging the number input itself left of where it sits
  // on every badge-less row in the same column. Taking the badge out of
  // flow keeps .runtime-control's own width (and so its centered position)
  // down to just the input, on every row alike; the badge just hangs
  // beside it without moving anything.
  .adjustment-badge {
    position: absolute;
    left: 100%;
    margin-left: 8px;
    min-width: 2.5rem;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: var(--radius-xs);
    background-color: var(--color-accent, var(--accent));
    color: var(--color-text-inverse, #fff);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .runtime-control:not(.runtime-active) .adjustment-badge {
    background-color: transparent;
    color: var(--color-text-soft);
  }

  .runtime-control.runtime-active :global(.container) {
    opacity: 0.62;
  }

  .axis,
  .axis-header {
    font-weight: 600;
    white-space: nowrap;
  }

  .axis {
    text-align: left;
    padding-left: 8px;
  }

  .term-label {
    text-align: left;
    padding-left: 8px;
    font-weight: 600;
    white-space: nowrap;
  }

  // P/I/D/F/B render at slightly different widths (an "I" is narrower
  // than a "P"), which would otherwise nudge each row's help icon a
  // couple pixels out of line with the others. Fixed width keeps them in
  // one clean column regardless of which letter precedes it.
  .term-key {
    display: inline-block;
    width: 12px;
  }

  .axis.ROLL,
  .axis-header.ROLL {
    background-color: hsl(0, 100%, 85%);
  }

  .axis.PITCH,
  .axis-header.PITCH {
    background-color: hsl(120, 100%, 85%);
  }

  .axis.YAW,
  .axis-header.YAW {
    background-color: hsl(240, 100%, 88%);
  }

  :global(html[data-theme="dark"]) .axis.ROLL,
  :global(html[data-theme="dark"]) .axis-header.ROLL {
    background-color: hsl(0, 40%, 30%);
  }

  :global(html[data-theme="dark"]) .axis.PITCH,
  :global(html[data-theme="dark"]) .axis-header.PITCH {
    background-color: hsl(120, 25%, 25%);
  }

  :global(html[data-theme="dark"]) .axis.YAW,
  :global(html[data-theme="dark"]) .axis-header.YAW {
    background-color: hsl(240, 35%, 32%);
  }

  // 820px, not the usual 480px phone breakpoint: this table needs real
  // room (5 columns) before staying in desktop mode makes sense - below
  // that it was falling into its own horizontal scroll well before the
  // generic phone breakpoint kicked in. See Profiles.svelte's matching
  // comment - this must switch in step with the rest of the page.
  //
  // Once transposed, mobile has only 3 axis columns left (see markup
  // above) - much more headroom than the 5-column desktop table, so
  // NumberInput can sit closer to its normal desktop size instead of the
  // aggressively clawed-back width a 5-column fit would need. Still skip
  // width:100% on .grid though: even 3 columns of fixed-width steppers
  // get stretched far past their content by a full-width table, which is
  // what made this look sparse before.
  @media only screen and (max-width: 820px) {
    .desktop-table {
      display: none;
    }

    .mobile-table {
      display: block;
    }

    .table-scroll {
      --number-input-height: 1.7rem;
      --number-input-btn-size: 1.7rem;
      --number-input-max-width: 116px;
      --number-input-padding-x: 6px;
    }

    .grid {
      width: auto;
      min-width: 0;
    }

    th,
    td {
      padding: 4px 6px;
    }
  }
</style>
