<script>
  import { slide } from "svelte/transition";

  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { getProfile } from "@/js/profile.svelte.js";
  import { visible } from "@/js/relevance.js";

  import Switch from "@/components/Switch.svelte";
  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Tier from "@/components/Tier.svelte";

  let { FC = $bindable() } = $props();

  // "Lowpass filter 1" only needs a heading of its own while filter 2 is
  // shown alongside it; both follow the same registry entry.
  let showLowpass2 = $derived(
    visible(
      "gyro.lowpass2.section",
      getProfile(),
      CONFIGURATOR.disclosureLevel,
    ),
  );

  const FILTER_TYPES = [
    { id: 0, name: "Disabled", visible: false },
    { id: 1, name: "1ˢᵗ order", visible: true },
    { id: 2, name: "2ⁿᵈ order", visible: true },
    { id: 3, name: "PT1", visible: false },
    { id: 4, name: "PT2", visible: false },
    { id: 5, name: "PT3", visible: false },
    { id: 6, name: "Order1", visible: false },
    { id: 7, name: "Butter", visible: false },
    { id: 8, name: "Bessel", visible: false },
    { id: 9, name: "Damped", visible: false },
  ];

  const defaultValues = FC.getFilterDefaults();
  const previousValues = {};

  let lowpass1Enabled = $derived(FC.FILTER_CONFIG.gyro_lowpass_type > 0);

  let lowpass1DynEnabled = $derived(
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 &&
      FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz <
        FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz,
  );
  const lowpass1DynEnabledInitial =
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 &&
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz <
      FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz;

  let lowpass2Enabled = $derived(FC.FILTER_CONFIG.gyro_lowpass2_type > 0);

  function loadValue(name) {
    FC.FILTER_CONFIG[name] =
      FC.FILTER_CONFIG[name] || previousValues[name] || defaultValues[name];
  }

  function toggleLowpass1(enable) {
    if (enable) {
      loadValue("gyro_lowpass_type");
      loadValue("gyro_lowpass_hz");

      if (previousValues.gyro_lowpass_dyn_enable) {
        loadValue("gyro_lowpass_dyn_min_hz");
        loadValue("gyro_lowpass_dyn_max_hz");
      }
    } else {
      previousValues.gyro_lowpass_type = FC.FILTER_CONFIG.gyro_lowpass_type;
      previousValues.gyro_lowpass_hz = FC.FILTER_CONFIG.gyro_lowpass_hz;
      if (lowpass1DynEnabled) {
        previousValues.gyro_lowpass_dyn_min_hz =
          FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz;
        previousValues.gyro_lowpass_dyn_max_hz =
          FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz;
      }

      FC.FILTER_CONFIG.gyro_lowpass_type = 0;
      FC.FILTER_CONFIG.gyro_lowpass_hz = 0;
      FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 0;
      FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = 0;
    }
  }

  function toggleLowpass1Dyn(enable) {
    if (enable) {
      loadValue("gyro_lowpass_dyn_min_hz");
      loadValue("gyro_lowpass_dyn_max_hz");
    } else {
      previousValues.gyro_lowpass_dyn_min_hz =
        FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz;
      previousValues.gyro_lowpass_dyn_max_hz =
        FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz;

      FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = 0;
      FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = 0;
    }

    previousValues.gyro_lowpass_dyn_enable = enable;
  }

  function toggleLowpass2(enable) {
    if (enable) {
      loadValue("gyro_lowpass2_type");
      loadValue("gyro_lowpass2_hz");
    } else {
      previousValues.gyro_lowpass2_type = FC.FILTER_CONFIG.gyro_lowpass2_type;
      previousValues.gyro_lowpass2_hz = FC.FILTER_CONFIG.gyro_lowpass2_hz;

      FC.FILTER_CONFIG.gyro_lowpass2_type = 0;
      FC.FILTER_CONFIG.gyro_lowpass2_hz = 0;
    }
  }
</script>

{#snippet filterOpts(value)}
  {#each FILTER_TYPES as filterType (filterType.id)}
    {#if filterType.visible || filterType.id === value}
      <option value={filterType.id}>{filterType.name}</option>
    {/if}
  {/each}
{/snippet}

<Section label="gyroLowpassFilterHeading" summary="gyroLowpassFilterHelp">
  <SubSection label={showLowpass2 ? "gyroLowpassFilter1" : null}>
    <Tier id="gyro.lowpass1.enable">
      <Field id="lowpass-filter-1-enable" label="genericEnable">
        <Switch
          id="lowpass-filter-1-enable"
          bind:checked={() => lowpass1Enabled, toggleLowpass1}
        />
      </Field>
    </Tier>
    {#if lowpass1Enabled}
      <div transition:slide>
        <SubSection>
          <Tier id="gyro.lowpass1.type">
            <Field id="gyro-lowpass-1-type" label="gyroLowpassType">
              <select
                id="gyro-lowpass-1-type"
                bind:value={FC.FILTER_CONFIG.gyro_lowpass_type}
              >
                {@render filterOpts(FC.FILTER_CONFIG.gyro_lowpass_type)}
              </select>
            </Field>
          </Tier>
          <Tier id="gyro.lowpass1.frequency">
            <Field
              id="gyro-lowpass-1-freq"
              label="gyroLowpassFrequency"
              unit="Hz"
            >
              <NumberInput
                id="gyro-lowpass-1-freq"
                min="0"
                max="1000"
                bind:value={FC.FILTER_CONFIG.gyro_lowpass_hz}
              />
            </Field>
          </Tier>
          <!-- The dynamic-cutoff switch is expert, but once it is (or was
               on load) switched on it must stay reachable at every level so
               the user can turn it off again: force the essential tier then. -->
          <Tier
            id="gyro.lowpass1.dynamicCutoff"
            level={lowpass1DynEnabledInitial || lowpass1DynEnabled
              ? "essential"
              : undefined}
          >
            <Field id="gyro-lowpass-1-dyn" label="gyroLowpassDynamicCutoff">
              <Switch
                id="gyro-lowpass-1-dyn"
                bind:checked={() => lowpass1DynEnabled, toggleLowpass1Dyn}
              />
            </Field>
          </Tier>
          {#if lowpass1DynEnabled}
            <div transition:slide>
              <SubSection>
                <Tier id="gyro.lowpass1.dynMinFrequency">
                  <Field
                    id="gyro-dyn-lowpass-min-freq"
                    label="gyroLowpassDynMinFrequency"
                    unit="Hz"
                  >
                    <NumberInput
                      id="gyro-dyn-lowpass-min-freq"
                      min="0"
                      max="1000"
                      bind:value={FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz}
                    />
                  </Field>
                </Tier>
                <Tier id="gyro.lowpass1.dynMaxFrequency">
                  <Field
                    id="gyro-dyn-lowpass-max-freq"
                    label="gyroLowpassDynMaxFrequency"
                    unit="Hz"
                  >
                    <NumberInput
                      id="gyro-dyn-lowpass-max-freq"
                      min="0"
                      max="1000"
                      bind:value={FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz}
                    />
                  </Field>
                </Tier>
              </SubSection>
            </div>
          {/if}
        </SubSection>
      </div>
    {/if}
  </SubSection>
  <Tier id="gyro.lowpass2.section">
    <div>
      <SubSection label="gyroLowpassFilter2">
        <Field id="lowpass-filter-2-enable" label="genericEnable">
          <Switch
            id="lowpass-filter-2-enable"
            bind:checked={() => lowpass2Enabled, toggleLowpass2}
          />
        </Field>
        {#if lowpass2Enabled}
          <div transition:slide>
            <SubSection>
              <Field id="gyro-lowpass-2-type" label="gyroLowpassType">
                <select
                  id="gyro-lowpass-2-type"
                  bind:value={FC.FILTER_CONFIG.gyro_lowpass2_type}
                >
                  {@render filterOpts(FC.FILTER_CONFIG.gyro_lowpass2_type)}
                </select>
              </Field>
              <Field
                id="gyro-lowpass-2-freq"
                label="gyroLowpassFrequency"
                unit="Hz"
              >
                <NumberInput
                  id="gyro-lowpass-2-freq"
                  min="0"
                  max="1000"
                  bind:value={FC.FILTER_CONFIG.gyro_lowpass2_hz}
                />
              </Field>
            </SubSection>
          </div>
        {/if}
      </SubSection>
    </div>
  </Tier>
</Section>

<style lang="scss">
</style>
