<script>
  import { slide } from "svelte/transition";

  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tooltip from "@/components/Tooltip.svelte";

  const filterStrengths = [
    "gyroRpmFilterPresetCustom",
    "gyroRpmFilterPresetLow",
    "gyroRpmFilterPresetMedium",
    "gyroRpmFilterPresetHigh",
  ];

  let { FC = $bindable() } = $props();

  let enabled = $derived(FC.FEATURE_CONFIG.features.RPM_FILTER);
</script>

{#snippet header()}
  <div class="header">
    <span class="title">{$i18n.t("gyroRpmFilterSettings")}</span>
    <div class="grow"></div>
    <HelpIcon>{$i18n.t("gyroRpmFilterHelp")}</HelpIcon>
  </div>
{/snippet}

<Section {header}>
  <SubSection>
    <Field id="rpm-filter-enable" label="genericEnable">
      <Switch
        id="rpm-filter-enable"
        bind:checked={FC.FEATURE_CONFIG.features.RPM_FILTER}
      />
    </Field>

    {#if enabled}
      <div transition:slide>
        <SubSection>
          <Field id="rpm-filter-preset" label="gyroRpmFilterPreset">
            {#snippet tooltip()}
              <Tooltip
                help="gyroRpmFilterPresetHelp"
                attrs={[
                  {
                    name: "genericDefault",
                    value: $i18n.t("gyroRpmFilterPresetMedium"),
                  },
                ]}
              />
            {/snippet}
            <select
              id="rpm-filter-preset"
              bind:value={FC.FILTER_CONFIG.rpm_preset}
            >
              {#each filterStrengths as strength, index (strength)}
                <option value={index}>{$i18n.t(strength)}</option>
              {/each}
            </select>
          </Field>
          {#if CONFIGURATOR.expertMode}
            <div transition:slide>
              <Field
                id="rpm-filter-min-freq"
                label="gyroRpmFilterMinFreq"
                unit="Hz"
              >
                {#snippet tooltip()}
                  <Tooltip
                    help="gyroRpmFilterMinFreqHelp"
                    attrs={[{ name: "genericDefault", value: "20Hz" }]}
                  />
                {/snippet}
                <NumberInput
                  id="rpm-filter-min-freq"
                  min="1"
                  max="100"
                  bind:value={FC.FILTER_CONFIG.rpm_min_hz}
                />
              </Field>
            </div>
          {/if}
        </SubSection>
      </div>
    {/if}
  </SubSection>
</Section>

<style lang="scss">
  .header {
    @extend %section-header;
    padding-right: 8px;
  }

  .title {
    padding-left: 8px;
  }

  .grow {
    flex-grow: 1;
  }

  .row {
    display: flex;
    align-items: center;
    min-height: 2rem;

    label {
      display: flex;
      flex-grow: 1;
      align-items: center;
      padding: 4px 0;
    }
  }

  .input {
    max-width: 120px;
  }

  .group-heading {
    display: flex;
    font-weight: 600;
    grid-column: 1 / -1;
    margin-top: 8px;
  }

  @media only screen and (max-width: 480px) {
    .row {
      height: 3rem;
    }

    .row + .row {
      border-top-width: 1px;
      border-top-style: solid;

      :global(html[data-theme="light"]) & {
        border-top-color: var(--color-neutral-400);
      }

      :global(html[data-theme="dark"]) & {
        border-top-color: var(--color-neutral-700);
      }
    }
  }
</style>
