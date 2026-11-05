<script>
  import { slide } from "svelte/transition";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    THROTTLE_MODE_NORMAL,
    THROTTLE_MODE_BIDIRECTIONAL,
    REVERSE_FLIGHT_STATES,
    COUPLED_AXIS_PITCH,
    COUPLED_AXIS_YAW,
    motorMaskForThrottleMode,
  } from "@/js/ReverseFlight.js";

  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import InfoNote from "@/components/notes/InfoNote.svelte";

  let config = $derived(FC.REVERSE_FLIGHT_CONFIG);
  let status = $derived(FC.REVERSE_FLIGHT_STATUS);
  let bidirectional = $derived(
    config?.throttle_mode === THROTTLE_MODE_BIDIRECTIONAL,
  );

  // Same throttle range as the firmware (fc/rc.c): rc_min/max_throttle, or
  // 90% of the stick deflection around rc_center when they are 0. Computed
  // here so unsaved edits in the Receiver Settings box show up at once.
  let throttleRange = $derived.by(() => {
    const rc = FC.RC_CONFIG;
    const min = rc.rc_min_throttle || rc.rc_center - rc.rc_deflection * 0.9;
    let max = rc.rc_max_throttle || rc.rc_center + rc.rc_deflection * 0.9;
    max = Math.max(max, min + 10);
    return { neutral: Math.round((min + max) / 2), half: (max - min) / 2 };
  });

  let flipUs = $derived(
    config
      ? config.throttle_deadband *
          (1 + config.throttle_reverse_hysteresis / 100)
      : 0,
  );

  // Live bar: stick position and the deadband/flip marks, as % of the bar
  function pos(offsetUs) {
    const half = throttleRange.half || 1;
    return Math.min(100, Math.max(0, 50 + (offsetUs / half) * 50));
  }
  let stickOffset = $derived(
    status ? status.throttleChannel - throttleRange.neutral : 0,
  );

  function setMode(mode) {
    config.throttle_mode = mode;
    // Bidirectional throttle needs every motor in bidirectional mode
    config.motor_bidir_mask = motorMaskForThrottleMode(
      mode,
      config.motor_count,
    );
  }

  function setCoupled(bit, on) {
    config.reverse_coupled_axes = on
      ? config.reverse_coupled_axes | bit
      : config.reverse_coupled_axes & ~bit;
  }

  function signed(v, digits = 2) {
    return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(digits);
  }
</script>

{#if config}
  <Section label="receiverThrottleMode">
    <SubSection>
      <Field id="throttle-mode" label="receiverThrottleModeLabel">
        {#snippet tooltip()}
          <Tooltip help="receiverThrottleModeHelp" />
        {/snippet}
        <select
          id="throttle-mode"
          value={config.throttle_mode}
          onchange={(e) => setMode(Number(e.target.value))}
        >
          <option value={THROTTLE_MODE_NORMAL}>
            {$i18n.t("receiverThrottleModeNormal")}
          </option>
          <option value={THROTTLE_MODE_BIDIRECTIONAL}>
            {$i18n.t("receiverThrottleModeBidirectional")}
          </option>
        </select>
      </Field>
    </SubSection>

    {#if bidirectional}
      <div transition:slide>
        <SubSection>
          <InfoNote>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html $i18n.t("receiverThrottleModeNote", {
              1: throttleRange.neutral,
            })}
          </InfoNote>

          <div class="stick" aria-label={$i18n.t("receiverThrottleStick")}>
            <div
              class="zone deadband"
              style:left="{pos(-config.throttle_deadband)}%"
              style:width="{pos(config.throttle_deadband) -
                pos(-config.throttle_deadband)}%"
            ></div>
            <div class="mark" style:left="{pos(-flipUs)}%"></div>
            <div class="mark" style:left="{pos(flipUs)}%"></div>
            <div class="mark centre" style:left="50%"></div>
            {#if status}
              <div
                class="thumb"
                class:reverse={status.direction < 0}
                style:left="{pos(stickOffset)}%"
              ></div>
            {/if}
          </div>
          <div class="scale">
            <span>{$i18n.t("receiverThrottleReverse")}</span>
            <span>
              {throttleRange.neutral} μs ± {config.throttle_deadband} ·
              {$i18n.t("receiverThrottleFlipAt", { 1: Math.round(flipUs) })}
            </span>
            <span>{$i18n.t("receiverThrottleForward")}</span>
          </div>

          {#if status}
            <div class="readouts">
              <div>
                <span class="label">{$i18n.t("receiverReverseState")}</span>
                <span class="value">
                  {$i18n.t(
                    "receiverReverseState_" +
                      (REVERSE_FLIGHT_STATES[status.state] ?? "off"),
                  )}
                </span>
              </div>
              <div>
                <span class="label">{$i18n.t("receiverReverseMotor")}</span>
                <span class="value">
                  {signed(status.motorCommand * 100, 0)} %
                </span>
              </div>
              <div>
                <span class="label">{$i18n.t("receiverReverseGimbal")}</span>
                <span class="value">{signed(status.vectorFactor)}</span>
              </div>
              <div>
                <span class="label">{$i18n.t("receiverReverseSurfaces")}</span>
                <span class="value">{signed(status.surfaceFactor)}</span>
              </div>
            </div>
          {/if}

          <Field
            id="throttle-deadband"
            label="receiverThrottleDeadband"
            unit="μs"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverThrottleDeadbandHelp"
                attrs={[
                  { name: "genericDefault", value: "40μs" },
                  { name: "genericRange", value: "0μs - 200μs" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="throttle-deadband"
              min="0"
              max="200"
              bind:value={config.throttle_deadband}
            />
          </Field>
          <Field
            id="throttle-hysteresis"
            label="receiverThrottleHysteresis"
            unit="%"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverThrottleHysteresisHelp"
                attrs={[
                  { name: "genericDefault", value: "50%" },
                  { name: "genericRange", value: "0% - 200%" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="throttle-hysteresis"
              min="0"
              max="200"
              bind:value={config.throttle_reverse_hysteresis}
            />
          </Field>
          <Field
            id="throttle-reverse-limit"
            label="receiverThrottleReverseLimit"
            unit="%"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverThrottleReverseLimitHelp"
                attrs={[
                  { name: "genericDefault", value: "100%" },
                  { name: "genericRange", value: "10% - 100%" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="throttle-reverse-limit"
              min="10"
              max="100"
              bind:value={config.throttle_reverse_limit}
            />
          </Field>
        </SubSection>

        <SubSection label="receiverReverseFlight">
          <Field
            id="reverse-surface-gain"
            label="receiverReverseSurfaceGain"
            unit="%"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverReverseSurfaceGainHelp"
                attrs={[
                  { name: "genericDefault", value: "100%" },
                  { name: "genericRange", value: "0% - 300%" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="reverse-surface-gain"
              min="0"
              max="300"
              bind:value={config.reverse_surface_gain}
            />
          </Field>
          <Field
            id="reverse-motor-time"
            label="receiverReverseMotorTime"
            unit="ms"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverReverseMotorTimeHelp"
                attrs={[
                  { name: "genericDefault", value: "80ms" },
                  { name: "genericRange", value: "10ms - 1000ms" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="reverse-motor-time"
              min="10"
              max="1000"
              bind:value={config.reverse_motor_time}
            />
          </Field>
          <Field
            id="reverse-time-constant"
            label="receiverReverseTimeConstant"
            unit="ms"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverReverseTimeConstantHelp"
                attrs={[
                  { name: "genericDefault", value: "400ms" },
                  { name: "genericRange", value: "50ms - 5000ms" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="reverse-time-constant"
              min="50"
              max="5000"
              bind:value={config.reverse_time_constant}
            />
          </Field>
          <Field id="reverse-fade" label="receiverReverseFade" unit="%">
            {#snippet tooltip()}
              <Tooltip
                help="receiverReverseFadeHelp"
                attrs={[
                  { name: "genericDefault", value: "15%" },
                  { name: "genericRange", value: "1% - 50%" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="reverse-fade"
              min="1"
              max="50"
              bind:value={config.reverse_fade}
            />
          </Field>
          <Field
            id="reverse-motor-dwell"
            label="receiverReverseMotorDwell"
            unit="ms"
          >
            {#snippet tooltip()}
              <Tooltip
                help="receiverReverseMotorDwellHelp"
                attrs={[
                  { name: "genericDefault", value: "0ms" },
                  { name: "genericRange", value: "0ms - 250ms" },
                ]}
              />
            {/snippet}
            <NumberInput
              id="reverse-motor-dwell"
              min="0"
              max="250"
              bind:value={config.reverse_motor_dwell}
            />
          </Field>
        </SubSection>

        <SubSection label="receiverReverseCoupled">
          <Field id="reverse-coupled-yaw" label="receiverReverseCoupledYaw">
            {#snippet tooltip()}
              <Tooltip help="receiverReverseCoupledHelp" />
            {/snippet}
            <Switch
              id="reverse-coupled-yaw"
              checked={(config.reverse_coupled_axes & COUPLED_AXIS_YAW) !== 0}
              onchange={(e) => setCoupled(COUPLED_AXIS_YAW, e.target.checked)}
            />
          </Field>
          <Field id="reverse-coupled-pitch" label="receiverReverseCoupledPitch">
            {#snippet tooltip()}
              <Tooltip help="receiverReverseCoupledHelp" />
            {/snippet}
            <Switch
              id="reverse-coupled-pitch"
              checked={(config.reverse_coupled_axes & COUPLED_AXIS_PITCH) !== 0}
              onchange={(e) => setCoupled(COUPLED_AXIS_PITCH, e.target.checked)}
            />
          </Field>
        </SubSection>
      </div>
    {/if}
  </Section>
{/if}

<style lang="scss">
  .stick {
    position: relative;
    height: 14px;
    margin: 10px 8px 4px;
    border-radius: 7px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
  }

  .zone {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  .deadband {
    background-color: var(--color-accent-soft, var(--color-border));
  }

  .mark {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background-color: var(--color-border-accent);
  }

  .mark.centre {
    background-color: var(--color-text);
    opacity: 0.4;
  }

  .thumb {
    position: absolute;
    top: -5px;
    width: 10px;
    height: 22px;
    margin-left: -5px;
    border-radius: 3px;
    background-color: var(--color-text);
  }

  .thumb.reverse {
    background-color: var(--color-border-accent);
  }

  .scale {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 0 8px 8px;
    font-size: 0.8rem;
    opacity: 0.8;
  }

  .readouts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0 8px 8px;
  }

  .readouts div {
    display: grid;
    gap: 2px;
  }

  .label {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
