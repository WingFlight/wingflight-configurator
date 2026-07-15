<script>
  import semver from "semver";
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSP } from "@/js/msp.svelte.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import {
    API_VERSION_12_8,
    API_VERSION_12_9,
  } from "@/js/configurator.svelte.js";
  import { getTabHelpURL } from "@/js/help";
  import * as flightStats from "@/js/flight-stats.js";

  import Field from "@/components/Field.svelte";
  import Meter from "@/components/Meter.svelte";
  import Model from "@/components/Model.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tooltip from "@/components/Tooltip.svelte";

  const AXIS_NAMES = [
    "controlAxisRoll",
    "controlAxisPitch",
    "controlAxisYaw",
    "controlAxisThrottle",
    "controlAxisAux1",
    "controlAxisAux2",
    "controlAxisAux3",
    "controlAxisAux4",
    "controlAxisAux5",
    "controlAxisAux6",
    "controlAxisAux7",
    "controlAxisAux8",
    "controlAxisAux9",
    "controlAxisAux10",
    "controlAxisAux11",
    "controlAxisAux12",
    "controlAxisAux13",
    "controlAxisAux14",
    "controlAxisAux15",
    "controlAxisAux16",
    "controlAxisAux17",
    "controlAxisAux18",
    "controlAxisAux19",
    "controlAxisAux20",
    "controlAxisAux21",
    "controlAxisAux22",
    "controlAxisAux23",
    "controlAxisAux24",
    "controlAxisAux25",
    "controlAxisAux26",
    "controlAxisAux27",
  ];

  const RC_BAR_MIN = 750;
  const RC_BAR_MAX = 2250;

  let loading = $state(true);

  let modelRef = $state();
  let attitudeEl = $state();
  let headingEl = $state();
  let altitudeEl = $state();
  let attitudeIndicator;
  let headingIndicator;
  let altitudeIndicator;

  let yawFix = $state(0);
  let armingSwitchChecked = $state(false);
  let confirmDialog = $state();

  let fastInterval;
  let slowInterval;

  let disarmFlags = $derived([
    "NO_GYRO",
    "FAILSAFE",
    "RX_FAILSAFE",
    "BAD_RX_RECOVERY",
    "BOXFAILSAFE",
    "GOVERNOR",
    semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_8) ? "RPM_SIGNAL" : "CRASH",
    "THROTTLE",
    "ANGLE",
    "BOOT_GRACE_TIME",
    "NOPREARM",
    "LOAD",
    "CALIBRATING",
    "CLI",
    "CMS_MENU",
    "BST",
    "MSP",
    "PARALYZE",
    "GPS",
    "RESC",
    "RPMFILTER",
    "REBOOT_REQ",
    "DSHOT_BITBANG",
    "ACC_CALIB",
    "MOTOR_PROTO",
    ...(semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_9) ? ["OVERRIDE"] : []),
    "ARM_SWITCH",
  ]);

  let activeDisarmFlags = $derived.by(() => {
    const flags = [];
    for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {
      if ((FC.CONFIG.armingDisableFlags & (1 << i)) === 0) {
        continue;
      }
      const key = disarmFlags[i];
      flags.push({
        id: i,
        label: key ?? String(i + 1),
        tooltip: key
          ? $i18n.t(`statusArmingDisableFlagsTooltip${key}`)
          : undefined,
      });
    }
    return flags;
  });

  let canArm = $derived(FC.CONFIG.armingDisableFlags === 0);

  let hasFlightStats = $derived(
    semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_9),
  );

  let configStateKey = $derived.by(() => {
    switch (FC.CONFIG.configurationState) {
      case FC.CONFIGURATION_STATES.CONFIGURED:
        return "statusConfigConfigured";
      case FC.CONFIGURATION_STATES.DEFAULTS_CUSTOM:
        return "statusConfigDefaults";
      default:
        return "statusConfigBare";
    }
  });

  let numChannels = $derived(Math.min(FC.RC.active_channels, 18));
  let numBars = $derived(Math.max(numChannels, 8));

  let rssiPercent = $derived(((FC.ANALOG.rssi / 1023) * 100).clamp(0, 100));

  function channelWidth(i) {
    return (
      ((FC.RC.channels[i] - RC_BAR_MIN) / (RC_BAR_MAX - RC_BAR_MIN)) *
      100
    ).clamp(0, 100);
  }

  function channelPercent(i) {
    if (i >= 4 || !Number.isFinite(FC.RC_COMMAND[i])) {
      return "";
    }
    return `${(FC.RC_COMMAND[i] / 5).toFixed(1)}%`;
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabStatus"), "_system");
  }

  function resetZAxis() {
    yawFix = FC.SENSOR_DATA.kinematics[2] * -1.0;
  }

  function renderModel() {
    const x = FC.SENSOR_DATA.kinematics[1] * -1.0 * 0.017453292519943295;
    const y =
      (FC.SENSOR_DATA.kinematics[2] * -1.0 - yawFix) * 0.017453292519943295;
    const z = FC.SENSOR_DATA.kinematics[0] * -1.0 * 0.017453292519943295;
    modelRef?.rotateTo(x, y, z);
  }

  function updateArming(active) {
    FC.CONFIG.enableArmingFlag = active;
    armingSwitchChecked = active;
    mspHelper.setArmingEnabled(active);
  }

  function onArmingSwitchChange(e) {
    if (e.target.checked) {
      confirmDialog.showModal();
    } else {
      updateArming(false);
    }
  }

  function onConfirmArming() {
    confirmDialog.close();
    updateArming(true);
  }

  function onCancelArming() {
    confirmDialog.close();
    updateArming(false);
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP_ACC_TRIM);
    await MSP.promise(MSPCodes.MSP_NAME);
    await MSP.promise(MSPCodes.MSP_FLIGHT_STATS);
    await MSP.promise(MSPCodes.MSP_RC);

    loading = false;

    const options = {
      size: 90,
      showBox: false,
      img_directory: "/images/flightindicators/",
    };
    attitudeIndicator = globalThis.$.flightIndicator(
      attitudeEl,
      "attitude",
      options,
    );
    headingIndicator = globalThis.$.flightIndicator(
      headingEl,
      "heading",
      options,
    );
    altitudeIndicator = globalThis.$.flightIndicator(
      altitudeEl,
      "altimeter",
      options,
    );

    armingSwitchChecked = FC.CONFIG.enableArmingFlag;
    mspHelper.setArmingEnabled(armingSwitchChecked);

    fastInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_RC);
      await MSP.promise(MSPCodes.MSP_RC_COMMAND);
      await MSP.promise(MSPCodes.MSP_ATTITUDE);

      renderModel();
      attitudeIndicator.setRoll(FC.SENSOR_DATA.kinematics[0]);
      attitudeIndicator.setPitch(FC.SENSOR_DATA.kinematics[1]);
      headingIndicator.setHeading(FC.SENSOR_DATA.kinematics[2]);
    }, 50);

    slowInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_STATUS);
      await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
      await MSP.promise(MSPCodes.MSP_ANALOG);
      await MSP.promise(MSPCodes.MSP_ALTITUDE);

      altitudeIndicator.setAltitude(FC.SENSOR_DATA.altitude * 100);
    }, 250);
  });

  onDestroy(() => {
    clearInterval(fastInterval);
    clearInterval(slowInterval);
  });
</script>

{#snippet header()}
  <h1>{$i18n.t("tabStatus")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

<Page {header} {loading}>
  {#if canArm}
    <div class="arm-danger-note">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("statusArmingDanger")}
    </div>
  {/if}

  <div class="primary-row">
    {#snippet infoHeader()}
      <div class="status-header">
        <span class="title">{$i18n.t("statusInfoHead")}</span>
        <div class="grow"></div>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span class="config-state">{@html $i18n.t(configStateKey)}</span>
      </div>
    {/snippet}
    <Section label="statusInfoHead" header={infoHeader}>
      <table class="cf_table">
        <tbody>
          <tr>
            <td>{$i18n.t("statusCraftName")}</td>
            <td>{FC.CONFIG.name}</td>
          </tr>
          <tr>
            <td>{$i18n.t("statusTargetName")}</td>
            <td>{FC.CONFIG.targetName}</td>
          </tr>
          <tr>
            <td>{$i18n.t("statusBoardName")}</td>
            <td>{FC.CONFIG.boardName}</td>
          </tr>
          {#if hasFlightStats}
            <tr>
              <td>{$i18n.t("statusFlightCount")}</td>
              <td>{FC.FLIGHT_STATS.stats_total_flights.toLocaleString()}</td>
            </tr>
            <tr>
              <td>{$i18n.t("statusFlightTime")}</td>
              <td>{flightStats.getDuration()}</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </Section>

    <Section label="statusArmingHead">
      <Field id="status-enable-arming" label="statusEnableArming">
        <Switch
          id="status-enable-arming"
          bind:checked={armingSwitchChecked}
          onchange={onArmingSwitchChange}
        />
      </Field>
      {#if activeDisarmFlags.length > 0}
        <Field id="status-disable-flags" label="statusArmingDisableFlags">
          {#snippet tooltip()}
            <Tooltip help="statusArmingDisableFlagsTooltip" />
          {/snippet}
          <div class="disarm-flags">
            {#each activeDisarmFlags as flag (flag.id)}
              <span class="disarm-flag" title={flag.tooltip}>{flag.label}</span>
            {/each}
          </div>
        </Field>
      {/if}
    </Section>

    <Section label="statusBatteryHead">
      <table class="cf_table">
        <tbody>
          <tr>
            <td>{$i18n.t("statusBattery")}</td>
            <td
              >{$i18n.t("powerVoltageValue", {
                1: FC.BATTERY_STATE.voltage,
              })}</td
            >
          </tr>
          <tr>
            <td>{$i18n.t("statusDrawing")}</td>
            <td
              >{$i18n.t("powerAmperageValue", {
                1: FC.BATTERY_STATE.amperage,
              })}</td
            >
          </tr>
          <tr>
            <td>{$i18n.t("statusDrawn")}</td>
            <td>{$i18n.t("powerMahValue", { 1: FC.BATTERY_STATE.mAhDrawn })}</td
            >
          </tr>
          <tr>
            <td>{$i18n.t("statusChargeLevel")}</td>
            <td
              >{$i18n.t("powerChargeLevel", {
                1: FC.BATTERY_STATE.chargeLevel,
              })}</td
            >
          </tr>
        </tbody>
      </table>
    </Section>
  </div>

  <div class="secondary-row">
    <div class="model-container">
      <div class="header">{$i18n.t("statusInstrumentsHead")}</div>
      <div class="content">
        <Model bind:this={modelRef} />
        <div class="attitude-overlay">
          <dl>
            <dt>{$i18n.t("titleHeading")}:</dt>
            <dd>
              {$i18n.t("statusAttitude", { 1: FC.SENSOR_DATA.kinematics[2] })}
            </dd>
            <dt>{$i18n.t("titlePitch")}:</dt>
            <dd>
              {$i18n.t("statusAttitude", { 1: FC.SENSOR_DATA.kinematics[1] })}
            </dd>
            <dt>{$i18n.t("titleRoll")}:</dt>
            <dd>
              {$i18n.t("statusAttitude", { 1: FC.SENSOR_DATA.kinematics[0] })}
            </dd>
          </dl>
        </div>
        <button class="reset-btn" onclick={resetZAxis}>
          {$i18n.t("statusButtonResetZaxisValue", { 1: yawFix })}
        </button>
      </div>
      <div class="instruments">
        <div bind:this={attitudeEl}></div>
        <div bind:this={headingEl}></div>
        <div bind:this={altitudeEl}></div>
      </div>
    </div>

    <Section label="statusReceiverHead">
      <div class="bars">
        {#each Array.from({ length: numBars }) as _, i (i)}
          <span class="bar-label">{$i18n.t(AXIS_NAMES[i])}</span>
          <Meter
            leftLabel={FC.RC.channels[i]?.toFixed(0) ?? ""}
            value={channelWidth(i)}
            rightLabel={channelPercent(i)}
          />
        {/each}
        <span class="bar-label">RSSI</span>
        <Meter
          leftLabel={FC.ANALOG.rssi}
          value={rssiPercent}
          rightLabel={`${rssiPercent.toFixed(0)}%`}
        />
      </div>
    </Section>
  </div>
</Page>

<dialog bind:this={confirmDialog}>
  <h3>{$i18n.t("dialogConfirmArmingTitle")}</h3>
  <div class="content">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("dialogConfirmArmingNote")}</p>
  </div>
  <div class="buttons">
    <button class="btn" onclick={onConfirmArming}>
      {$i18n.t("dialogConfirmArmingConfirm")}
    </button>
    <button class="btn" onclick={onCancelArming}>
      {$i18n.t("dialogConfirmArmingClose")}
    </button>
  </div>
</dialog>

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

  .arm-danger-note {
    border-radius: 2px;
    padding: 8px 16px;
    margin-bottom: var(--section-gap);
    font-size: 0.9rem;

    :global(html[data-theme="light"]) & {
      color: var(--color-red-900);
      background: var(--color-red-100);
      border: 1px solid var(--color-red-200);
    }

    :global(html[data-theme="dark"]) & {
      color: var(--color-red-500);
      background: var(--color-neutral-800);
      border-left: 3px solid var(--color-red-500);
    }
  }

  .primary-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    column-gap: var(--section-gap);
    align-items: start;
  }

  .secondary-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    column-gap: var(--section-gap);
    align-items: start;
    padding-top: var(--section-gap);
  }

  .status-header {
    @extend %section-header;
    width: 100%;
    padding: 0 8px;
  }

  .config-state :global(span) {
    font-size: 10px;
    color: #fff;
    padding: 2px 5px;
    border-radius: 3px;
  }

  .config-state :global(.configBare) {
    background-color: #e60000;
  }

  .config-state :global(.configDefaults) {
    background-color: #f5a834;
  }

  .config-state :global(.configConfigured) {
    background-color: #56ac1d;
  }

  table.cf_table {
    width: 100%;
    border-collapse: collapse;
  }

  table.cf_table td {
    padding: 4px 8px;
    font-size: 0.8rem;
  }

  .disarm-flags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }

  .disarm-flag {
    font-weight: bold;
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 3px;

    :global(html[data-theme="light"]) & {
      color: var(--color-red-900);
      background: var(--color-red-100);
    }

    :global(html[data-theme="dark"]) & {
      color: var(--color-red-500);
      background: var(--color-neutral-800);
    }
  }

  .model-container {
    @extend %section-shadow;
  }

  .model-container .header {
    @extend %section-header;
    padding-left: 8px;
  }

  .model-container .content {
    position: relative;
    height: 400px;
    overflow: hidden;
  }

  .attitude-overlay {
    position: absolute;
    top: 10px;
    left: 10px;
    font-weight: normal;
    color: var(--mutedText);
    pointer-events: none;
  }

  .attitude-overlay dl {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 6px;
  }

  .reset-btn {
    @extend %button;
    position: absolute;
    top: 8px;
    right: 8px;
  }

  .instruments {
    display: flex;
    justify-content: center;
    gap: 16px;
    padding: 8px;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    background-color: var(--color-surface);
  }

  .bars {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    row-gap: 8px;
    align-items: center;
    padding: 4px;
  }

  .bar-label {
    text-align: right;
    font-size: 0.75rem;
    font-weight: bold;
  }

  dialog {
    width: 32em;
    border-radius: 5px;
  }

  dialog .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
  }

  dialog h3 {
    margin-bottom: 0.5em;
  }

  @media only screen and (max-width: 768px) {
    .secondary-row {
      grid-template-columns: 1fr;
    }
  }

  @media only screen and (max-width: 480px) {
    .primary-row {
      grid-template-columns: 1fr;
    }

    dialog {
      width: calc(100% - 2em);
      border-radius: unset;
    }
  }
</style>
