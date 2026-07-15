<script>
  import diff from "microdiff";
  import semver from "semver";
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSP } from "@/js/msp.svelte.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import {
    API_VERSION_12_7,
    API_VERSION_12_9,
  } from "@/js/configurator.svelte.js";
  import { getTabHelpURL } from "@/js/help";
  import * as flightStats from "@/js/flight-stats.js";
  import { reinitialiseConnection } from "@/js/serial_backend.js";

  import Field from "@/components/Field.svelte";
  import Model from "@/components/Model.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tooltip from "@/components/Tooltip.svelte";

  import BoardAutoAlignWizard from "./BoardAutoAlignWizard.svelte";
  import SerialPortRow from "./SerialPortRow.svelte";
  import {
    PORT_FUNCTIONS,
    VCP_PORT_IDENTIFIER,
    getPortExcl,
  } from "./serial_ports.js";

  const MAG_ALIGN_OPTIONS = [
    "CW 0°",
    "CW 90°",
    "CW 180°",
    "CW 270°",
    "CW 0° flip",
    "CW 90° flip",
    "CW 180° flip",
    "CW 270° flip",
    "Custom",
  ].map((label, i) => ({ value: i + 1, label }));

  let loading = $state(true);
  let initialState = $state(null);

  let modelRef = $state();
  let yawFix = $state(0);
  let attitudeInterval;

  let autoAlignWizard = $state();
  let autoAlignDisabled = $state(false);

  function snapshotState() {
    return $state.snapshot({
      name: FC.CONFIG.name,
      accelerometerTrims: FC.CONFIG.accelerometerTrims,
      PILOT_CONFIG: FC.PILOT_CONFIG,
      FLIGHT_STATS: FC.FLIGHT_STATS,
      features: FC.FEATURE_CONFIG.features.bitfield,
      ADVANCED_CONFIG: FC.ADVANCED_CONFIG,
      SENSOR_CONFIG: FC.SENSOR_CONFIG,
      wiggleReady: FC.ARMING_CONFIG.wiggle.READY,
      SENSOR_ALIGNMENT: FC.SENSOR_ALIGNMENT,
      BOARD_ALIGNMENT_CONFIG: FC.BOARD_ALIGNMENT_CONFIG,
      ports: FC.SERIAL_CONFIG.ports,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }
    return diff(initialState, snapshotState());
  });

  let dirty = $derived(changes.length > 0);
  let showToolbar = $derived(!loading && dirty);

  let hasPilotConfig = $derived(
    semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_7),
  );
  let hasFlightStats = $derived(
    semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_9),
  );

  let pidBaseFreq = $derived(FC.CONFIG.sampleRateHz);

  let gyroFrequencyLabel = $derived(
    pidBaseFreq === 0
      ? $i18n.t("configurationSpeedGyroNoGyro")
      : $i18n.t("configurationKHzUnitLabel", {
          value: (pidBaseFreq / 1000).toFixed(2),
        }),
  );

  let pidDenomOptions = $derived.by(() => {
    const opts = [];
    for (let denom = 1; denom <= 16; denom++) {
      if (pidBaseFreq / denom < 1000) {
        continue;
      }
      const label =
        pidBaseFreq === 0
          ? $i18n.t("configurationSpeedPidNoGyro", { value: denom })
          : $i18n.t("configurationKHzUnitLabel", {
              value: (pidBaseFreq / denom / 1000).toFixed(2),
            });
      opts.push({ value: denom, label });
    }
    return opts;
  });

  function getAccHardwareEnabled() {
    return FC.SENSOR_CONFIG.acc_hardware !== 1;
  }
  function setAccHardwareEnabled(v) {
    FC.SENSOR_CONFIG.acc_hardware = v ? 0 : 1;
  }
  function getBaroHardwareEnabled() {
    return FC.SENSOR_CONFIG.baro_hardware !== 1;
  }
  function setBaroHardwareEnabled(v) {
    FC.SENSOR_CONFIG.baro_hardware = v ? 0 : 1;
  }
  function getMagHardwareEnabled() {
    return FC.SENSOR_CONFIG.mag_hardware !== 1;
  }
  function setMagHardwareEnabled(v) {
    FC.SENSOR_CONFIG.mag_hardware = v ? 0 : 1;
  }

  let accEnabled = $derived(getAccHardwareEnabled());
  let magEnabled = $derived(getMagHardwareEnabled());

  function getFlightStatsEnabled() {
    return FC.FLIGHT_STATS.stats_min_armed_time_s >= 0;
  }
  function setFlightStatsEnabled(v) {
    FC.FLIGHT_STATS.stats_min_armed_time_s = v
      ? Math.max(FC.FLIGHT_STATS.stats_min_armed_time_s, 0) || 15
      : -1;
  }

  function resetFlightStats() {
    FC.FLIGHT_STATS.stats_total_flights = 0;
    FC.FLIGHT_STATS.stats_total_time_s = 0;
    FC.FLIGHT_STATS.stats_total_dist_m = 0;
  }

  let visiblePorts = $derived(
    FC.SERIAL_CONFIG.ports.filter(
      (port) => port.identifier !== VCP_PORT_IDENTIFIER,
    ),
  );

  let availableFunctions = $derived(
    PORT_FUNCTIONS.filter(
      (func) =>
        !func.minVersion || semver.gte(FC.CONFIG.apiVersion, func.minVersion),
    ),
  );

  let usedFunctionsMask = $derived(
    FC.SERIAL_CONFIG.ports.reduce(
      (acc, port) => acc | getPortExcl(port.functionMask),
      0,
    ),
  );

  function onClickHelp() {
    window.open(getTabHelpURL("tabConfiguration"), "_system");
  }

  function resetZAxis() {
    yawFix = FC.SENSOR_DATA.kinematics[2] * -1.0;
  }

  function renderModel() {
    const x = -FC.SENSOR_DATA.kinematics[1] * 0.017453292519943295;
    const y = (-FC.SENSOR_DATA.kinematics[2] - yawFix) * 0.017453292519943295;
    const z = -FC.SENSOR_DATA.kinematics[0] * 0.017453292519943295;
    modelRef?.rotateTo(x, y, z);
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_NAME);
    await MSP.promise(MSPCodes.MSP_BOARD_INFO);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);
    await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
    await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT);
    await MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG);
    await MSP.promise(MSPCodes.MSP_ACC_TRIM);
    await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG);

    if (hasPilotConfig) {
      await MSP.promise(MSPCodes.MSP_PILOT_CONFIG);
    }
    if (hasFlightStats) {
      await MSP.promise(MSPCodes.MSP_FLIGHT_STATS);
    }

    initialState = snapshotState();
    loading = false;

    attitudeInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_ATTITUDE);
      renderModel();
    }, 50);
  });

  onDestroy(() => {
    clearInterval(attitudeInterval);
  });

  export async function onSave() {
    FC.CONFIG.name = FC.CONFIG.name.trim();

    function save(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }

    await save(MSPCodes.MSP_SET_NAME);
    await save(MSPCodes.MSP_SET_FEATURE_CONFIG);
    await save(MSPCodes.MSP_SET_ADVANCED_CONFIG);
    await save(MSPCodes.MSP_SET_SENSOR_CONFIG);
    await save(MSPCodes.MSP_SET_ARMING_CONFIG);
    await save(MSPCodes.MSP_SET_SENSOR_ALIGNMENT);
    await save(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG);
    await save(MSPCodes.MSP_SET_ACC_TRIM);
    await save(MSPCodes.MSP_SET_SERIAL_CONFIG);

    if (hasPilotConfig) {
      await save(MSPCodes.MSP_SET_PILOT_CONFIG);
    }
    if (hasFlightStats) {
      await save(MSPCodes.MSP_SET_FLIGHT_STATS);
    }

    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    await new Promise((resolve) => reinitialiseConnection(resolve));

    initialState = snapshotState();
  }

  export function onRevert() {
    FC.CONFIG.name = initialState.name;
    FC.CONFIG.accelerometerTrims[0] = initialState.accelerometerTrims[0];
    FC.CONFIG.accelerometerTrims[1] = initialState.accelerometerTrims[1];
    Object.assign(FC.PILOT_CONFIG, initialState.PILOT_CONFIG);
    Object.assign(FC.FLIGHT_STATS, initialState.FLIGHT_STATS);
    FC.FEATURE_CONFIG.features.bitfield = initialState.features;
    Object.assign(FC.ADVANCED_CONFIG, initialState.ADVANCED_CONFIG);
    Object.assign(FC.SENSOR_CONFIG, initialState.SENSOR_CONFIG);
    FC.ARMING_CONFIG.wiggle.READY = initialState.wiggleReady;
    Object.assign(FC.SENSOR_ALIGNMENT, initialState.SENSOR_ALIGNMENT);
    Object.assign(
      FC.BOARD_ALIGNMENT_CONFIG,
      initialState.BOARD_ALIGNMENT_CONFIG,
    );
    FC.SERIAL_CONFIG.ports = initialState.ports.map((port) => ({
      ...port,
    }));
  }

  export function isDirty() {
    return dirty;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabConfiguration")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>
    {$i18n.t("buttonSaveReboot")}
  </button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <div class="columns">
    <div class="column">
      <Section label="configurationPersonalization">
        <Field id="config-craft-name" label="craftName">
          <input
            id="config-craft-name"
            type="text"
            maxlength="32"
            bind:value={FC.CONFIG.name}
          />
        </Field>
        {#if hasPilotConfig}
          <Field
            id="config-model-id"
            label="configuration.personalisation.model_id.label"
          >
            <NumberInput
              id="config-model-id"
              bind:value={FC.PILOT_CONFIG.model_id}
              min={0}
              max={99}
              step={1}
            />
          </Field>
        {/if}
      </Section>

      {#if hasFlightStats}
        <Section label="configuration.flight_stats.heading">
          <Field
            id="config-flight-stats-enable"
            label="configuration.flight_stats.enable.label"
          >
            <Switch
              id="config-flight-stats-enable"
              bind:checked={getFlightStatsEnabled, setFlightStatsEnabled}
            />
          </Field>
          {#if getFlightStatsEnabled()}
            <Field
              id="config-min-armed-time"
              label="configuration.flight_stats.min_armed_time.label"
              unit="s"
            >
              {#snippet tooltip()}
                <Tooltip
                  help="configuration.flight_stats.min_armed_time.help"
                />
              {/snippet}
              <NumberInput
                id="config-min-armed-time"
                bind:value={FC.FLIGHT_STATS.stats_min_armed_time_s}
                min={0}
                max={99}
                step={1}
              />
            </Field>
            <div class="flight-stats-display">
              <table class="cf_table">
                <tbody>
                  <tr>
                    <td
                      >{$i18n.t(
                        "configuration.flight_stats.flight_count.label",
                      )}</td
                    >
                    <td>{FC.FLIGHT_STATS.stats_total_flights}</td>
                  </tr>
                  <tr>
                    <td
                      >{$i18n.t(
                        "configuration.flight_stats.flight_time.label",
                      )}</td
                    >
                    <td>{flightStats.getDuration()}</td>
                  </tr>
                  <tr>
                    <td
                      >{$i18n.t(
                        "configuration.flight_stats.distance.label",
                      )}</td
                    >
                    <td
                      >{FC.FLIGHT_STATS.stats_total_dist_m.toLocaleString()} m</td
                    >
                  </tr>
                </tbody>
              </table>
              <button class="btn" onclick={resetFlightStats}>
                {$i18n.t("configuration.flight_stats.reset.label")}
              </button>
            </div>
          {/if}
        </Section>
      {/if}

      <Section label="configurationSystem">
        <Field id="config-gyro-frequency" label="configurationGyroSyncDenom">
          <span class="readonly-value">{gyroFrequencyLabel}</span>
        </Field>
        <Field id="config-pid-denom" label="configurationPidProcessDenom">
          {#snippet tooltip()}
            <Tooltip help="configurationPidProcessDenomHelp" />
          {/snippet}
          <Select
            id="config-pid-denom"
            bind:value={FC.ADVANCED_CONFIG.pid_process_denom}
            options={pidDenomOptions}
          />
        </Field>
        <Field id="config-acc-hardware" label="configurationAccHardware">
          {#snippet tooltip()}
            <Tooltip help="configurationAccHardwareHelp" />
          {/snippet}
          <Switch
            id="config-acc-hardware"
            bind:checked={getAccHardwareEnabled, setAccHardwareEnabled}
          />
        </Field>
        <Field id="config-baro-hardware" label="configurationBaroHardware">
          {#snippet tooltip()}
            <Tooltip help="configurationBaroHardwareHelp" />
          {/snippet}
          <Switch
            id="config-baro-hardware"
            bind:checked={getBaroHardwareEnabled, setBaroHardwareEnabled}
          />
        </Field>
        <Field id="config-mag-hardware" label="configurationMagHardware">
          {#snippet tooltip()}
            <Tooltip help="configurationMagHardwareHelp" />
          {/snippet}
          <Switch
            id="config-mag-hardware"
            bind:checked={getMagHardwareEnabled, setMagHardwareEnabled}
          />
        </Field>
        <Field id="config-wiggle-ready" label="configurationWiggleReady">
          {#snippet tooltip()}
            <Tooltip help="configurationWiggleReadyHelp" />
          {/snippet}
          <Switch
            id="config-wiggle-ready"
            bind:checked={FC.ARMING_CONFIG.wiggle.READY}
          />
        </Field>
      </Section>

      <Section
        label="configurationFeatures"
        summary="configurationFeaturesHelp"
      >
        <Field id="feature-gps" label="feature_GPS">
          {#snippet tooltip()}
            <Tooltip help="featureTip_GPS" />
          {/snippet}
          <Switch
            id="feature-gps"
            bind:checked={FC.FEATURE_CONFIG.features.GPS}
            onchange={() => updateTabList(FC.FEATURE_CONFIG.features)}
          />
        </Field>
        <Field id="feature-led-strip" label="feature_LED_STRIP">
          {#snippet tooltip()}
            <Tooltip help="featureTip_LED_STRIP" />
          {/snippet}
          <Switch
            id="feature-led-strip"
            bind:checked={FC.FEATURE_CONFIG.features.LED_STRIP}
            onchange={() => updateTabList(FC.FEATURE_CONFIG.features)}
          />
        </Field>
        <Field id="feature-cms" label="feature_CMS">
          {#snippet tooltip()}
            <Tooltip help="featureTip_CMS" />
          {/snippet}
          <Switch
            id="feature-cms"
            bind:checked={FC.FEATURE_CONFIG.features.CMS}
            onchange={() => updateTabList(FC.FEATURE_CONFIG.features)}
          />
        </Field>
      </Section>
    </div>

    <div class="column">
      <Section
        label="configurationSerialPorts"
        summary="configurationSerialPortsHelp"
      >
        {#each visiblePorts as port (port.identifier)}
          <SerialPortRow
            {port}
            boardDesign={FC.CONFIG.boardDesign}
            functionOptions={availableFunctions}
            {usedFunctionsMask}
          />
        {/each}
      </Section>

      <Section
        label="configurationBoardAlignment"
        summary="configurationBoardAlignmentHelp"
      >
        <div class="board-align-row">
          <Field id="board-align-roll" label="configurationBoardAlignmentRoll">
            <NumberInput
              id="board-align-roll"
              bind:value={FC.BOARD_ALIGNMENT_CONFIG.roll}
              min={-180}
              max={360}
              step={1}
            />
          </Field>
          <Field
            id="board-align-pitch"
            label="configurationBoardAlignmentPitch"
          >
            <NumberInput
              id="board-align-pitch"
              bind:value={FC.BOARD_ALIGNMENT_CONFIG.pitch}
              min={-180}
              max={360}
              step={1}
            />
          </Field>
          <Field id="board-align-yaw" label="configurationBoardAlignmentYaw">
            <NumberInput
              id="board-align-yaw"
              bind:value={FC.BOARD_ALIGNMENT_CONFIG.yaw}
              min={-180}
              max={360}
              step={1}
            />
          </Field>
        </div>
        <div class="board-auto-align">
          <button
            class="btn"
            disabled={autoAlignDisabled}
            onclick={() => autoAlignWizard.open()}
          >
            {$i18n.t("configurationBoardAutoAlignStart")}
          </button>
          <span class="description"
            >{$i18n.t("configurationBoardAutoAlignHelp")}</span
          >
        </div>
        {#if magEnabled}
          <Field id="config-mag-align" label="configurationSensorAlignmentMag">
            <Select
              id="config-mag-align"
              bind:value={FC.SENSOR_ALIGNMENT.align_mag}
              options={MAG_ALIGN_OPTIONS}
            />
          </Field>
        {/if}
      </Section>

      {#if accEnabled}
        <Section
          label="configurationAccelTrims"
          summary="configurationAccelTrimsHelp"
        >
          <Field id="config-acc-trim-roll" label="configurationAccelTrimRoll">
            {#snippet tooltip()}
              <Tooltip help="configurationAccelRollTrimHelp" />
            {/snippet}
            <NumberInput
              id="config-acc-trim-roll"
              bind:value={FC.CONFIG.accelerometerTrims[1]}
              min={-300}
              max={300}
              step={1}
            />
          </Field>
          <Field id="config-acc-trim-pitch" label="configurationAccelTrimPitch">
            {#snippet tooltip()}
              <Tooltip help="configurationAccelPitchTrimHelp" />
            {/snippet}
            <NumberInput
              id="config-acc-trim-pitch"
              bind:value={FC.CONFIG.accelerometerTrims[0]}
              min={-300}
              max={300}
              step={1}
            />
          </Field>
        </Section>
      {/if}

      <div class="model-container">
        <div class="content">
          <Model bind:this={modelRef} />
          <button class="reset-btn" onclick={resetZAxis}>
            {$i18n.t("statusButtonResetZaxisValue", { 1: yawFix })}
          </button>
        </div>
      </div>
    </div>
  </div>
</Page>

<BoardAutoAlignWizard
  bind:this={autoAlignWizard}
  onDisabledChange={(v) => (autoAlignDisabled = v)}
/>

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    min-width: 60px;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    column-gap: var(--section-gap);
    align-items: start;
  }

  input[type="text"] {
    width: 140px;
  }

  .readonly-value {
    font-weight: 600;
  }

  table.cf_table {
    width: 100%;
    border-collapse: collapse;
  }

  table.cf_table td {
    padding: 4px 8px;
    font-size: 0.8rem;
  }

  .flight-stats-display {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 8px 8px;
  }

  .board-align-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .board-auto-align {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 8px;
  }

  .board-auto-align .description {
    color: var(--color-text-soft);
    font-size: 0.85rem;
  }

  .model-container {
    @extend %section-shadow;
    margin-top: var(--section-gap);
  }

  .model-container .content {
    position: relative;
    height: 300px;
    border-radius: 4px;
    overflow: hidden;
  }

  .reset-btn {
    @extend %button;
    position: absolute;
    top: 8px;
    right: 8px;
  }

  @media only screen and (max-width: 480px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
