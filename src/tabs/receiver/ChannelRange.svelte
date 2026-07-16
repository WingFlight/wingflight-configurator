<script>
  import { slide } from "svelte/transition";

  import { FC } from "@/js/fc.svelte.js";
  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";

  let initial_rc_min_throttle = FC.RC_CONFIG.rc_min_throttle;
  let initial_rc_max_throttle = FC.RC_CONFIG.rc_max_throttle;

  let autoThrottleRange = $derived(
    FC.RC_CONFIG.rc_min_throttle === 0 && FC.RC_CONFIG.rc_max_throttle === 0,
  );
</script>

{#snippet throttle()}
  <SubSection label="receiverSettingsThrottleChannel">
    <Field
      id="auto-throttle-range"
      label="receiver.channel_range.automatic_throttle_range.label"
    >
      {#snippet tooltip()}
        <Tooltip help="receiver.channel_range.automatic_throttle_range.help" />
      {/snippet}
      <Switch
        id="auto-throttle-range"
        checked={autoThrottleRange}
        onchange={(e) => {
          if (e.target.checked) {
            initial_rc_min_throttle = FC.RC_CONFIG.rc_min_throttle;
            initial_rc_max_throttle = FC.RC_CONFIG.rc_max_throttle;

            FC.RC_CONFIG.rc_min_throttle = 0;
            FC.RC_CONFIG.rc_max_throttle = 0;
          } else {
            FC.RC_CONFIG.rc_min_throttle = initial_rc_min_throttle || 1100;
            FC.RC_CONFIG.rc_max_throttle = initial_rc_max_throttle || 1900;
          }
        }}
      />
    </Field>
    {#if !autoThrottleRange}
      <div transition:slide>
        <Field
          id="receiver-zero-throttle"
          label="receiverZeroThrottle"
          unit="μs"
        >
          {#snippet tooltip()}
            <Tooltip
              help="receiverHelpZeroThrottle2"
              attrs={[
                { name: "genericDefault", value: "1100μs" },
                { name: "genericRange", value: "885μs - 2115μs" },
              ]}
            />
          {/snippet}
          <NumberInput
            id="receiver-zero-throttle"
            min="885"
            max="2115"
            bind:value={FC.RC_CONFIG.rc_min_throttle}
          />
        </Field>
        <Field
          id="receiver-full-throttle"
          label="receiverFullThrottle"
          unit="μs"
        >
          {#snippet tooltip()}
            <Tooltip
              help="receiverHelpFullThrottle2"
              attrs={[
                { name: "genericDefault", value: "1900μs" },
                { name: "genericRange", value: "885μs - 2115μs" },
              ]}
            />
          {/snippet}
          <NumberInput
            id="receiver-full-throttle"
            min="885"
            max="2115"
            bind:value={FC.RC_CONFIG.rc_max_throttle}
          />
        </Field>
      </div>
    {/if}
  </SubSection>
{/snippet}

<Section label="receiverSettings">
  <SubSection>
    <Field id="receiver-stick-center" label="receiverStickCenter" unit="μs">
      {#snippet tooltip()}
        <Tooltip
          help="receiverHelpStickCenter"
          attrs={[
            { name: "genericDefault", value: "1500μs" },
            { name: "genericRange", value: "1400μs - 1600μs" },
          ]}
        />
      {/snippet}
      <NumberInput
        id="receiver-stick-center"
        min="1400"
        max="1600"
        bind:value={FC.RC_CONFIG.rc_center}
      />
    </Field>
    <Field
      id="receiver-stick-deflection"
      label="receiverStickDeflection"
      unit="μs"
    >
      {#snippet tooltip()}
        <Tooltip
          help="receiverHelpStickDeflection"
          attrs={[
            { name: "genericDefault", value: "510μs" },
            { name: "genericRange", value: "200μs - 700μs" },
          ]}
        />
      {/snippet}
      <NumberInput
        id="receiver-stick-deflection"
        min="200"
        max="700"
        bind:value={FC.RC_CONFIG.rc_deflection}
      />
    </Field>
    <Field
      id="receiver-cyclic-deadband"
      label="receiverCyclicDeadband"
      unit="μs"
    >
      {#snippet tooltip()}
        <Tooltip
          help="receiverHelpCyclicDeadband"
          attrs={[
            { name: "genericDefault", value: "5μs" },
            { name: "genericRange", value: "0μs - 100μs" },
          ]}
        />
      {/snippet}
      <NumberInput
        id="receiver-cyclic-deadband"
        min="0"
        max="100"
        bind:value={FC.RC_CONFIG.rc_deadband}
      />
    </Field>
    <Field id="receiver-yaw-deadband" label="receiverYawDeadband" unit="μs">
      {#snippet tooltip()}
        <Tooltip
          help="receiverHelpYawDeadband"
          attrs={[
            { name: "genericDefault", value: "5μs" },
            { name: "genericRange", value: "0μs - 100μs" },
          ]}
        />
      {/snippet}
      <NumberInput
        id="receiver-yaw-deadband"
        min="0"
        max="100"
        bind:value={FC.RC_CONFIG.rc_yaw_deadband}
      />
    </Field>
  </SubSection>
  {@render throttle()}
</Section>

<style lang="scss">
</style>
