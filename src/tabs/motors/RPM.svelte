<script>
  import { slide } from "svelte/transition";

  import { FC } from "@/js/fc.svelte.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tooltip from "@/components/Tooltip.svelte";

  import motorState from "./state.svelte.js";
</script>

<Section label="motorsSectionLabelRPM">
  <SubSection>
    <Field id="rpm-sensor" label="motorsRPMSensor">
      {#snippet tooltip()}
        <Tooltip help="motorsRPMSensorHelp" />
      {/snippet}
      <Switch
        id="rpm-sensor"
        bind:checked={FC.FEATURE_CONFIG.features.FREQ_SENSOR}
      />
    </Field>

    {#if motorState.isDshot}
      <div transition:slide>
        <Field id="dshot-bidir" label="motorsDshotBidir">
          {#snippet tooltip()}
            <Tooltip help="motorsDshotBidirHelp" />
          {/snippet}
          <Switch
            id="dshot-bidir"
            bind:checked={FC.MOTOR_CONFIG.use_dshot_telemetry}
          />
        </Field>
      </div>
    {/if}

    {#each { length: FC.CONFIG.motorCount } as _, i (i)}
      <Field id={`motor-poles-${i + 1}`} label={`motorsMotorPoles${i + 1}Long`}>
        {#snippet tooltip()}
          <Tooltip help="motorsMotorPolesHelp" />
        {/snippet}
        <NumberInput
          id={`motor-poles-${i + 1}`}
          min="2"
          max="255"
          step="2"
          bind:value={FC.MOTOR_CONFIG.motor_poles[i]}
        />
      </Field>
    {/each}
  </SubSection>
</Section>
