<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";
  import { SvelteURL } from "svelte/reactivity";
  import { slide } from "svelte/transition";

  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import { Features } from "@/js/features.svelte";
  import { DarkTheme } from "@/js/DarkTheme.js";
  import { windowWatcherUtil } from "@/js/utils/window_watchers.js";

  import ModelPreview from "./ModelPreview.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Meter from "@/components/Meter.svelte";
  import ChannelRange from "./ChannelRange.svelte";
  import ReceiverType from "./ReceiverType.svelte";
  import TelemetrySettings from "./TelemetrySettings.svelte";
  import TelemetrySensors from "./TelemetrySensors/TelemetrySensors.svelte";
  import ChannelAssignment from "./ChannelAssignment/ChannelAssignment.svelte";
  import { UART_NAMES } from "@/tabs/configuration/util.js";
  import {
    TelemetryType,
    RX_PROTOCOLS,
    EXTERNAL_TELEMETRY_PROTOCOLS,
  } from "./protocols.js";

  let loading = $state(true);
  let initialState;
  let sensorUpdateIntervalId;
  let backupRxPollerIntervalId;

  function snapshotState() {
    return $state.snapshot({
      RC_MAP: FC.RC_MAP,
      RSSI_CONFIG: FC.RSSI_CONFIG,
      RC_CONFIG: FC.RC_CONFIG,
      RX_CONFIG: FC.RX_CONFIG,
      TELEMETRY_CONFIG: FC.TELEMETRY_CONFIG,
      features: FC.FEATURE_CONFIG.features.bitfield,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_RX_CONFIG);
    await MSP.promise(MSPCodes.MSP_RX_MAP);
    await MSP.promise(MSPCodes.MSP_RC_CONFIG);
    await MSP.promise(MSPCodes.MSP_RC_TUNING);
    await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
    await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG);
    await MSP.promise(MSPCodes.MSP_TELEMETRY_CONFIG);
    await MSP.promise(MSPCodes.MSP_RC);

    initialState = snapshotState();
    loading = false;

    sensorUpdateIntervalId = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_RX_CHANNELS);
      await MSP.promise(MSPCodes.MSP_RC_COMMAND);
      await MSP.promise(MSPCodes.MSP_ANALOG);
    }, 25);

    if (hasBackupRxPort) {
      await MSP.promise(MSPCodes.MSP2_WING_RX_INPUT_BACKUP_STATUS);
      // 200ms rather than the 25ms main-channel poll above - this only needs to
      // look live when the box below is expanded, not drive a hot loop always.
      backupRxPollerIntervalId = setInterval(() => {
        MSP.promise(MSPCodes.MSP2_WING_RX_INPUT_BACKUP_STATUS);
      }, 200);
    }
  });

  onDestroy(() => {
    clearInterval(sensorUpdateIntervalId);
    clearInterval(backupRxPollerIntervalId);
  });

  export async function onSave() {
    function save(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }

    await save(MSPCodes.MSP_SET_RX_MAP);
    await save(MSPCodes.MSP_SET_RX_CONFIG);
    await save(MSPCodes.MSP_SET_RC_CONFIG);
    await save(MSPCodes.MSP_SET_RSSI_CONFIG);
    await save(MSPCodes.MSP_SET_TELEMETRY_CONFIG);
    await save(MSPCodes.MSP_SET_FEATURE_CONFIG);

    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    reinitialiseConnection();
  }

  export function onRevert() {
    Object.assign(FC.RC_MAP, initialState.RC_MAP);
    Object.assign(FC.RSSI_CONFIG, initialState.RSSI_CONFIG);
    Object.assign(FC.RC_CONFIG, initialState.RC_CONFIG);
    Object.assign(FC.RX_CONFIG, initialState.RX_CONFIG);
    Object.assign(FC.TELEMETRY_CONFIG, initialState.TELEMETRY_CONFIG);
    FC.FEATURE_CONFIG.features.bitfield = initialState.features;
  }

  export function isDirty() {
    return changes.length > 0;
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabReceiver"), "_system");
  }

  let showBindButton = $derived(
    bit_check(
      FC.CONFIG.targetCapabilities,
      FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_RX_BIND,
    ),
  );

  // TODO: Check gui is nwjs
  let showSticksButton = $derived(FC.FEATURE_CONFIG.features.RX_MSP);

  let showToolbar = $derived(
    !loading && (changes.length > 0 || showSticksButton || showBindButton),
  );

  const SERIALRX_FUNCTION = 64;
  let hasSerialRxPort = $derived(
    FC.SERIAL_CONFIG.ports.some(
      (port) => port.functionMask & SERIALRX_FUNCTION,
    ),
  );

  // Serial Rx (Backup) - see FUNCTION_RX_INPUT_BACKUP in wingflight-firmware.
  // No dedicated feature bit, same as SERIALRX_FUNCTION above: the port assignment
  // itself is the enablement.
  const RX_INPUT_BACKUP_FUNCTION = 4194304;
  let hasBackupRxPort = $derived(
    FC.SERIAL_CONFIG.ports.some(
      (port) => port.functionMask & RX_INPUT_BACKUP_FUNCTION,
    ),
  );
  let backupRxPort = $derived(
    FC.SERIAL_CONFIG.ports.find(
      (port) => port.functionMask & RX_INPUT_BACKUP_FUNCTION,
    ),
  );
  let backupRxStatus = $derived(
    FC.RX_INPUT_BACKUP_STATUS ?? {
      enabled: false,
      provider: 0,
      linkUp: false,
      activeSource: "main",
      channels: [],
    },
  );

  // Keep in sync with wingflight-firmware's cli/settings.c
  // lookupTableRxInputBackupProvider[] (same order) - only SBUS exists today.
  const RX_INPUT_BACKUP_PROVIDER_NAMES = ["SBUS", "FBUS", "FPORT", "FPORT2"];

  let backupRxExpanded = $state(false);

  function toggleBackupRxExpanded() {
    backupRxExpanded = !backupRxExpanded;
  }

  const BACKUP_RX_METER_MIN = 750;
  const BACKUP_RX_METER_MAX = 2250;
  function backupRxChannelWidth(value) {
    return (
      (100 * (value - BACKUP_RX_METER_MIN)) /
      (BACKUP_RX_METER_MAX - BACKUP_RX_METER_MIN)
    ).clamp(0, 100);
  }

  let extTelemProto = $derived.by(() => {
    for (const proto of EXTERNAL_TELEMETRY_PROTOCOLS) {
      for (const port of FC.SERIAL_CONFIG.ports) {
        if (port.functionMask & proto.id) {
          return proto;
        }
      }
    }
  });

  let rxFeature = $derived.by(() => {
    // only one rx proto feature should be enabled
    for (const f of Features.GROUPS.RX_PROTO) {
      if (FC.FEATURE_CONFIG.features[f]) {
        return f;
      }
    }
  });

  // find active rx protocol
  let rxProtoIndex = $derived.by(() => {
    if (!rxFeature) {
      return 0;
    }

    for (let i = 1; i < RX_PROTOCOLS.length; i++) {
      const proto = RX_PROTOCOLS[i];
      if (proto.feature !== rxFeature) {
        continue;
      }

      if (
        rxFeature === "RX_SERIAL" &&
        (proto.id !== FC.RX_CONFIG.serialrx_provider || !hasSerialRxPort)
      ) {
        continue;
      }

      if (rxFeature === "RX_SPI" && proto.id !== FC.RX_CONFIG.rxSpiProtocol) {
        continue;
      }

      return i;
    }
  });

  let rxProto = $derived(RX_PROTOCOLS[rxProtoIndex]);

  let telemetry = $derived(extTelemProto?.telemetry ?? rxProto?.telemetry);

  const telemetryCache = {};
  function resetTelemetry(fromProto) {
    if (fromProto && fromProto.type !== TelemetryType.TOGGLE) {
      if (!telemetryCache[fromProto.type]) {
        telemetryCache[fromProto.type] = {};
      }

      // cache current telemetry
      telemetryCache[fromProto.type][fromProto.proto] = {
        telemetry_sensors: FC.TELEMETRY_CONFIG.telemetry_sensors,
        telemetry_sensors_list: $state.snapshot(
          FC.TELEMETRY_CONFIG.telemetry_sensors_list,
        ),
      };
    }

    if (telemetry && telemetry.type !== TelemetryType.TOGGLE) {
      // load cached telemetry
      const cachedTelemetry = telemetryCache[telemetry.type]?.[telemetry.proto];
      if (cachedTelemetry) {
        Object.assign(FC.TELEMETRY_CONFIG, cachedTelemetry);
        return;
      }
    }

    FC.TELEMETRY_CONFIG.telemetry_sensors = 0;
    FC.TELEMETRY_CONFIG.telemetry_sensors_list = [];
  }

  function setRxProto(i) {
    const usingExtTelem = !!extTelemProto;
    const currentProto = rxProto;
    const newRxProto = RX_PROTOCOLS[i];
    FC.FEATURE_CONFIG.features.setGroup("RX_PROTO", false);
    if (newRxProto.feature) {
      FC.FEATURE_CONFIG.features.setFeature(newRxProto.feature, true);
    }

    if (newRxProto.feature === "RX_SERIAL") {
      FC.RX_CONFIG.serialrx_provider = newRxProto.id;
    } else if (newRxProto.feature === "RX_SPI") {
      FC.RX_CONFIG.rxSpiProtocol = newRxProto.id;
    }

    if (!usingExtTelem) {
      resetTelemetry(currentProto.telemetry);
    }
  }

  function showVirtualTx() {
    const windowWidth = 370;
    const windowHeight = 510;

    // use a fully qualified url so nw doesn't look on the filesystem
    // when using the vite dev server
    const location = new SvelteURL(window.location.href);
    location.pathname = "/src/tabs/receiver_msp.html";
    nw.Window.open(
      location.toString(),
      {
        id: "receiver_msp",
        always_on_top: true,
        max_width: windowWidth,
        max_height: windowHeight,
      },
      function (createdWindow) {
        createdWindow.resizeTo(windowWidth, windowHeight);

        // Give the window a callback it can use to send the channels (otherwise it can't see those objects)
        createdWindow.window.setRawRx = function (channels) {
          if (
            CONFIGURATOR.connectionValid &&
            !["cli", "presets"].includes(GUI.active_tab)
          ) {
            const data = [];
            FC.RC_MAP.forEach((axis, channel) => {
              data[axis] = channels[channel];
            });
            mspHelper.setRawRx(data);
            return true;
          } else {
            return false;
          }
        };

        DarkTheme.isDarkThemeEnabled(function (isEnabled) {
          windowWatcherUtil.passValue(
            createdWindow.window,
            "darkTheme",
            isEnabled,
          );
        });
      },
    );
  }

  function onBind() {
    MSP.send_message(MSPCodes.MSP2_BETAFLIGHT_BIND);
    GUI.log(i18n.getMessage("receiverButtonBindMessage"));
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabReceiver")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  {#if showSticksButton}
    <button class="btn" onclick={showVirtualTx}
      >{$i18n.t("receiverButtonSticks")}</button
    >
  {/if}
  {#if showBindButton}
    <button class="btn" onclick={onBind}>{$i18n.t("receiverButtonBind")}</button
    >
  {/if}
  {#if changes.length > 0}
    <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
    <button class="btn" onclick={onSave}>
      {$i18n.t("buttonSaveReboot")}
    </button>
  {/if}
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <div class="content">
    <div>
      <ReceiverType {rxProtoIndex} {hasSerialRxPort} {setRxProto} />
      <ChannelRange />
      {#if telemetry}
        <div transition:slide>
          <TelemetrySettings {telemetry} {resetTelemetry} />
        </div>
        {#if FC.FEATURE_CONFIG.features.TELEMETRY && telemetry.type !== TelemetryType.TOGGLE}
          <div transition:slide|global>
            <TelemetrySensors {telemetry} />
          </div>
        {/if}
      {/if}
    </div>
    <div>
      <ChannelAssignment />
      {#if hasBackupRxPort}
        <Section label="tabRxInputBackupStatus">
          <div class="backup-rx-summary">
            <span class="badge">
              {RX_INPUT_BACKUP_PROVIDER_NAMES[backupRxStatus.provider] ?? "?"}
            </span>
            <span
              class="badge"
              class:up={backupRxStatus.linkUp}
              class:down={!backupRxStatus.linkUp}
            >
              {backupRxPort
                ? (UART_NAMES[backupRxPort.identifier] ??
                  backupRxPort.identifier)
                : ""}
              &mdash;
              {backupRxStatus.linkUp
                ? $i18n.t("rxInputBackupStatusLinkUp")
                : $i18n.t("rxInputBackupStatusLinkDown")}
            </span>
            <span
              class="badge"
              class:active={backupRxStatus.activeSource === "backup"}
            >
              {backupRxStatus.activeSource === "backup"
                ? $i18n.t("rxInputBackupStatusActiveBackup")
                : $i18n.t("rxInputBackupStatusActiveMain")}
            </span>
            <div class="grow"></div>
            <button
              class="icon fas"
              class:fa-chevron-down={!backupRxExpanded}
              class:fa-chevron-up={backupRxExpanded}
              onclick={toggleBackupRxExpanded}
              aria-label={backupRxExpanded
                ? $i18n.t("receiverBackupRxHide")
                : $i18n.t("receiverBackupRxViewDetails")}
              title={backupRxExpanded
                ? $i18n.t("receiverBackupRxHide")
                : $i18n.t("receiverBackupRxViewDetails")}
            ></button>
          </div>
          {#if backupRxExpanded}
            <div class="backup-rx-details" transition:slide|global>
              {#if backupRxStatus.channels.length === 0}
                <p class="note">{$i18n.t("rxInputBackupStatusEmpty")}</p>
              {:else}
                <div class="backup-rx-channels">
                  {#each backupRxStatus.channels as value, index (index)}
                    <Meter
                      --fill-hue={(index * 20).toString()}
                      title={`CH${index + 1}`}
                      leftLabel={value}
                      value={backupRxChannelWidth(value)}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </Section>
      {/if}
      <ModelPreview />
    </div>
  </div>
</Page>

<style lang="scss">
  .content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  .backup-rx-summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .backup-rx-details {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-border);
  }

  .backup-rx-channels {
    display: grid;
    gap: 4px;
    margin-top: 8px;
  }

  .note {
    margin: 0;
    color: var(--color-text-soft);
  }

  .badge {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
  }

  .badge.up {
    color: var(--color-border-accent);
    border-color: var(--color-border-accent);
  }

  // "active" here means the SBUS-in link is the one currently driving the
  // aircraft (main link down) -- worth calling out the same way "down" is.
  .badge.down,
  .badge.active {
    color: var(--color-danger, var(--color-border-accent));
    border-color: var(--color-danger, var(--color-border-accent));
  }

  // Matches Section.svelte's own header icon button exactly, for the
  // expand/collapse chevron - same look as the rest of the app's
  // disclosure controls, not a one-off.
  .icon {
    background: none;
    border: none;
    padding: 8px;
    margin: 0;
    font-size: 1rem;
    cursor: pointer;

    -webkit-tap-highlight-color: transparent;

    :global(html[data-theme="light"]) & {
      color: var(--color-neutral-400);
    }

    :global(html[data-theme="dark"]) & {
      color: var(--color-neutral-500);
    }

    &:hover {
      :global(html[data-theme="light"]) & {
        color: var(--color-neutral-500);
      }

      :global(html[data-theme="dark"]) & {
        color: var(--color-neutral-500);
      }
    }
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }
</style>
