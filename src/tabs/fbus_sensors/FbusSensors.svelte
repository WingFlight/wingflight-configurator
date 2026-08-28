<script>
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { Features } from "@/js/features.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { RX_PROTOCOLS } from "@/tabs/receiver/protocols.js";

  import Page from "@/components/Page.svelte";
  import Switch from "@/components/Switch.svelte";
  import Meter from "@/components/Meter.svelte";

  // Mirrors fbusSensorGetSourceName() in drivers/fbus_sensor.c
  const SOURCE_NAMES = ["FBUS", "S.Port"];

  // Mirrors FBUS_MASTER_MAX_FORWARDED_SENSORS / FBUS_INVALID_PHYSICAL_ID in
  // pg/fbus_master.h -- fixed-size slot array, 0xFF marks an empty slot.
  const FORWARD_SLOT_COUNT = 8;
  const EMPTY_SLOT = 0xff;

  const POLL_INTERVAL_MS = 1000;

  // Faster than the FBUS sensor poll above -- this is a live channel/link
  // readout for bench-testing SBUS-In Fallback, not passive telemetry.
  const SBUS_INPUT_POLL_INTERVAL_MS = 200;
  const SBUS_METER_MIN = 750;
  const SBUS_METER_MAX = 2250;

  let loading = $state(true);
  let supported = $state(true);
  let clearing = $state(false);
  let togglingKey = $state(null);
  let pollerInterval;
  let sbusInputPollerInterval;

  let sensors = $derived(FC.FBUS_SENSORS ?? []);

  let sbusInput = $derived(
    FC.SBUS_INPUT_STATUS ?? {
      enabled: false,
      linkUp: false,
      activeSource: "main",
      channels: [],
    },
  );

  function sbusChannelWidth(value) {
    return (
      (100 * (value - SBUS_METER_MIN)) /
      (SBUS_METER_MAX - SBUS_METER_MIN)
    ).clamp(0, 100);
  }

  // Forwarding relays sensor data back out over the receiver link's own
  // telemetry return channel (rx/fbus.c), which only exists for FrSky-family
  // protocols (F.Port/F.Port2/FBUS, and the FrSky RX-SPI variants). Reading
  // sensors as an FBUS/S.Port master works regardless of RX protocol --
  // that's a separate UART -- but forwarding specifically needs this.
  // Mirrors the active-protocol lookup in Receiver.svelte.
  let rxFeature = $derived.by(() => {
    for (const f of Features.GROUPS.RX_PROTO) {
      if (FC.FEATURE_CONFIG.features[f]) {
        return f;
      }
    }
  });

  let rxProto = $derived.by(() => {
    if (!rxFeature) {
      return null;
    }

    for (let i = 1; i < RX_PROTOCOLS.length; i++) {
      const proto = RX_PROTOCOLS[i];
      if (proto.feature !== rxFeature) {
        continue;
      }

      if (
        rxFeature === "RX_SERIAL" &&
        proto.id !== FC.RX_CONFIG.serialrx_provider
      ) {
        continue;
      }

      if (rxFeature === "RX_SPI" && proto.id !== FC.RX_CONFIG.rxSpiProtocol) {
        continue;
      }

      return proto;
    }

    return null;
  });

  let canForward = $derived(rxProto?.telemetry?.proto === "smartport");

  function sourceName(source) {
    return SOURCE_NAMES[source] ?? `ID_${source}`;
  }

  function rowKey(sensor) {
    return `${sensor.source}-${sensor.physicalId}`;
  }

  async function refresh() {
    const response = await MSP.promise(MSPCodes.MSP2_WING_FBUS_SENSORS);
    // Older firmware without this command simply won't populate any data.
    if (!response || response.length === 0) {
      supported = false;
    }
  }

  async function refreshForwardConfig() {
    await MSP.promise(MSPCodes.MSP2_WING_FBUS_MASTER_CONFIG);
  }

  async function refreshSbusInput() {
    await MSP.promise(MSPCodes.MSP2_WING_SBUS_INPUT_STATUS);
  }

  async function onClickClear() {
    clearing = true;
    try {
      await MSP.promise(MSPCodes.MSP2_WING_CLEAR_FBUS_SENSORS);
      await refresh();
    } finally {
      clearing = false;
    }
  }

  async function toggleForwarding(sensor) {
    if (togglingKey || !canForward) {
      return;
    }

    const slots = [...(FC.FBUS_MASTER_CONFIG.forwardedSensors ?? [])];
    while (slots.length < FORWARD_SLOT_COUNT) {
      slots.push(EMPTY_SLOT);
    }

    if (sensor.forwarded) {
      const slotIndex = slots.indexOf(sensor.physicalId);
      if (slotIndex === -1) {
        return;
      }
      slots[slotIndex] = EMPTY_SLOT;
    } else {
      const freeIndex = slots.indexOf(EMPTY_SLOT);
      if (freeIndex === -1) {
        GUI.log($i18n.t("fbusSensorsSlotsFull"));
        return;
      }
      slots[freeIndex] = sensor.physicalId;
    }

    togglingKey = rowKey(sensor);
    try {
      FC.FBUS_MASTER_CONFIG.forwardedSensors = slots;
      await MSP.promise(
        MSPCodes.MSP2_WING_SET_FBUS_MASTER_CONFIG,
        mspHelper.crunch(MSPCodes.MSP2_WING_SET_FBUS_MASTER_CONFIG),
      );
      await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
      await Promise.all([refresh(), refreshForwardConfig()]);
    } finally {
      togglingKey = null;
    }
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabFbusSensors"), "_system");
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_RX_CONFIG);
    await Promise.all([refresh(), refreshForwardConfig(), refreshSbusInput()]);
    loading = false;

    pollerInterval = setInterval(refresh, POLL_INTERVAL_MS);
    sbusInputPollerInterval = setInterval(
      refreshSbusInput,
      SBUS_INPUT_POLL_INTERVAL_MS,
    );
  });

  onDestroy(() => {
    clearInterval(pollerInterval);
    clearInterval(sbusInputPollerInterval);
  });
</script>

{#snippet header()}
  <h1>{$i18n.t("tabFbusSensors")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onClickClear} disabled={clearing}>
    {$i18n.t("fbusSensorsClear")}
  </button>
{/snippet}

<Page {header} {loading} {toolbar}>
  {#if !supported}
    <p class="note">{$i18n.t("fbusSensorsNotSupported")}</p>
  {:else}
    <p class="description">
      {$i18n.t("fbusSensorsDescription")}
      <a
        class="learn-more"
        href={getTabHelpURL("tabFbusSensors")}
        target="_system"
      >
        {$i18n.t("fbusSensorsLearnMore")}
      </a>
    </p>

    {#if sensors.length === 0}
      <p class="note">{$i18n.t("fbusSensorsEmpty")}</p>
    {:else}
      <div class="table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>{$i18n.t("fbusSensorsColPhysicalId")}</th>
              <th>{$i18n.t("fbusSensorsColSource")}</th>
              <th>{$i18n.t("fbusSensorsColName")}</th>
              <th>{$i18n.t("fbusSensorsColAppIds")}</th>
              <th>{$i18n.t("fbusSensorsColPackets")}</th>
              <th>{$i18n.t("fbusSensorsColForwarded")}</th>
            </tr>
          </thead>
          <tbody>
            {#each sensors as sensor (rowKey(sensor))}
              <tr>
                <td>{sensor.physicalId}</td>
                <td>{sourceName(sensor.source)}</td>
                <td class="name">{sensor.name}</td>
                <td class="app-ids">{sensor.appIds.join(", ")}</td>
                <td>{sensor.packetCount}</td>
                <td
                  class:dimmed={!canForward}
                  title={!canForward
                    ? $i18n.t("fbusSensorsForwardingUnavailable")
                    : undefined}
                >
                  <Switch
                    checked={sensor.forwarded}
                    disabled={!canForward ||
                      (togglingKey !== null && togglingKey !== rowKey(sensor))}
                    onchange={() => toggleForwarding(sensor)}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#if sbusInput.enabled}
    <h2 class="section-title">{$i18n.t("sbusInputStatusTitle")}</h2>
    <p class="description">{$i18n.t("sbusInputStatusDescription")}</p>

    <div class="status-row">
      <span
        class="badge"
        class:up={sbusInput.linkUp}
        class:down={!sbusInput.linkUp}
      >
        {sbusInput.linkUp
          ? $i18n.t("sbusInputStatusLinkUp")
          : $i18n.t("sbusInputStatusLinkDown")}
      </span>
      <span class="badge" class:active={sbusInput.activeSource === "fallback"}>
        {sbusInput.activeSource === "fallback"
          ? $i18n.t("sbusInputStatusActiveFallback")
          : $i18n.t("sbusInputStatusActiveMain")}
      </span>
    </div>

    <div class="channels">
      {#each sbusInput.channels as value, index (index)}
        <Meter
          --fill-hue={(index * 20).toString()}
          title={`CH${index + 1}`}
          leftLabel={value}
          value={sbusChannelWidth(value)}
        />
      {/each}
    </div>
  {/if}
</Page>

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

  .description {
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
    padding: 8px 12px;
    border-radius: 4px;

    color: var(--color-text-soft);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .learn-more {
    color: var(--color-border-accent);
    white-space: nowrap;

    &:hover {
      text-decoration: none;
    }
  }

  .note {
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
    padding: 8px 12px;
    border-radius: 4px;

    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);
  }

  .table-wrap {
    @extend %section-shadow;

    overflow-x: auto;
    border-radius: 4px;
    background-color: var(--color-surface);
  }

  .grid {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
  }

  th {
    padding: 6px 12px;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;

    // surface-alt is a dark band in both themes -- text-alt is the token
    // for text on it (same one %section-header uses), giving near-white
    // headers in both themes. Plain text-soft/text read near-black here in
    // light theme since they're tuned for the light surface, not this band.
    color: var(--color-text-alt);
    background-color: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
  }

  td {
    padding: 6px 12px;
    font-size: 0.85rem;
    border-bottom: 1px solid var(--color-border);
  }

  // Opacity rather than recoloring the switch itself -- reliably dims it
  // regardless of checked/disabled state, sidestepping Switch.svelte's own
  // checked-color vs. disabled-color specificity.
  td.dimmed {
    opacity: 0.45;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .name {
    font-weight: 600;
  }

  .app-ids {
    color: var(--color-text-soft);
    font-variant-numeric: tabular-nums;
  }

  .section-title {
    margin-top: calc(var(--section-gap) * 2);
    font-weight: 600;
  }

  .status-row {
    display: flex;
    gap: 8px;
    margin: var(--section-gap) 0;
  }

  .badge {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    background-color: var(--color-surface);
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

  .channels {
    display: grid;
    gap: 6px;
    margin-bottom: var(--section-gap);
  }
</style>
