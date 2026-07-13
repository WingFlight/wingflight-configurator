<script>
  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";

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
</script>

<Section label="profilesPidGains">
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
            <td>
              <NumberInput
                min="0"
                max="1000"
                bind:value={FC.PIDS[axisIndex][gainIndex]}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</Section>

<style lang="scss">
  .grid {
    width: 100%;
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
