<script>
  import { slide } from "svelte/transition";

  import { FC } from "@/js/fc.svelte.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tier from "@/components/Tier.svelte";
  import Tooltip from "@/components/Tooltip.svelte";

  import motorState from "./state.svelte.js";

  // FBUS/S.Port master and SRXL2 ESC both read via their own dedicated
  // serial port function, not this module's own "ESC Telemetry" one -- the
  // generic tooltip below is actively wrong for them (it used to point
  // everyone at "ESC Telemetry" on the Configuration tab regardless of
  // protocol), so they each get their own pointing at the right one.
  let selectedProtocolName = $derived(
    motorState.telemetryProtocols[FC.ESC_SENSOR_CONFIG.protocol],
  );
  let telemetryProtocolHelp = $derived.by(() => {
    if (motorState.srxl2PortAssigned) {
      return "motorsEscTelemetryProtocolSrxl2LockedHelp";
    }
    if (selectedProtocolName === "FrSky F.BUS") {
      return "motorsEscTelemetryProtocolFbusHelp";
    }
    return "motorsEscTelemetryProtocolHelp";
  });
</script>

<Tier id="motors.telemetry.section">
  <Section label="motorsEscTelemetry">
    {#if !motorState.isCastleLink}
      <div transition:slide>
        <SubSection>
          <Tier id="motors.telemetry.protocol">
            <Field
              id="esc-telemetry-protocol"
              label="motorsEscTelemetryProtocol"
            >
              {#snippet tooltip()}
                <Tooltip help={telemetryProtocolHelp} />
              {/snippet}
              <select
                id="esc-telemetry-protocol"
                bind:value={FC.ESC_SENSOR_CONFIG.protocol}
                disabled={motorState.srxl2PortAssigned}
              >
                {#each motorState.telemetryProtocols as proto, index (proto)}
                  <option value={index}>{proto}</option>
                {/each}
              </select>
            </Field>
          </Tier>
        </SubSection>
      </div>
    {/if}
    {#if motorState.telemEnabled && motorState.hasTelemPort}
      <div transition:slide>
        <Tier id="motors.telemetry.signaling">
          <SubSection label="motorsSectionSignaling">
            <Tier id="motors.telemetry.halfDuplex">
              <Field
                id="esc-telemetry-half-duplex"
                label="motorsEscTelemetryHalfDuplex"
              >
                {#snippet tooltip()}
                  <Tooltip
                    help={motorState.srxl2PortAssigned
                      ? "motorsEscTelemetryHalfDuplexSrxl2LockedHelp"
                      : "motorsEscTelemetryHalfDuplexHelp"}
                  />
                {/snippet}
                <Switch
                  id="esc-telemetry-half-duplex"
                  bind:checked={FC.ESC_SENSOR_CONFIG.half_duplex}
                  disabled={motorState.srxl2PortAssigned}
                />
              </Field>
            </Tier>

            <Tier id="motors.telemetry.pinswap">
              <Field
                id="esc-telemetry-pinswap"
                label="motorsEscTelemetryPinswap"
              >
                {#snippet tooltip()}
                  <Tooltip help="motorsEscTelemetryPinswapHelp" />
                {/snippet}
                <Switch
                  id="esc-telemetry-pinswap"
                  bind:checked={FC.ESC_SENSOR_CONFIG.pinswap}
                />
              </Field>
            </Tier>
          </SubSection>
        </Tier>
      </div>
    {/if}
    {#if motorState.telemEnabled}
      <div transition:slide>
        <Tier id="motors.telemetry.sensorCorrection">
          <SubSection label="motorsSectionSensorCorrection">
            <Tier id="motors.telemetry.voltageCorrection">
              <Field
                id="voltage-correction"
                label="motorsVoltageCorrection"
                unit="%"
              >
                {#snippet tooltip()}
                  <Tooltip
                    help="motorsVoltageCorrectionHelp"
                    attrs={[
                      { name: "genericDefault", value: "0%" },
                      { name: "genericRange", value: "-100% - 125%" },
                    ]}
                  />
                {/snippet}
                <NumberInput
                  id="voltage-correction"
                  min="-100"
                  max="125"
                  bind:value={FC.ESC_SENSOR_CONFIG.voltage_correction}
                />
              </Field>
            </Tier>
            <Tier id="motors.telemetry.currentCorrection">
              <Field
                id="current-correction"
                label="motorsCurrentCorrection"
                unit="%"
              >
                {#snippet tooltip()}
                  <Tooltip
                    help="motorsCurrentCorrectionHelp"
                    attrs={[
                      { name: "genericDefault", value: "0%" },
                      { name: "genericRange", value: "-100% - 125%" },
                    ]}
                  />
                {/snippet}
                <NumberInput
                  id="current-correction"
                  min="-100"
                  max="125"
                  bind:value={FC.ESC_SENSOR_CONFIG.current_correction}
                />
              </Field>
            </Tier>
            <Tier id="motors.telemetry.consumptionCorrection">
              <Field
                id="consumption-correction"
                label="motorsConsumptionCorrection"
                unit="%"
              >
                {#snippet tooltip()}
                  <Tooltip
                    help="motorsConsumptionCorrectionHelp"
                    attrs={[
                      { name: "genericDefault", value: "0%" },
                      { name: "genericRange", value: "-100% - 125%" },
                    ]}
                  />
                {/snippet}
                <NumberInput
                  id="consumption-correction"
                  min="-100"
                  max="125"
                  bind:value={FC.ESC_SENSOR_CONFIG.consumption_correction}
                />
              </Field>
            </Tier>
          </SubSection>
        </Tier>
      </div>
    {/if}
  </Section>
</Tier>

<style lang="scss">
</style>
