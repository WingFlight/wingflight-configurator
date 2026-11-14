<script>
  import { getContext, onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { isFbusMuxSerialPort } from "@/js/FbusMux.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import {
    PORT_NAMES_RF2,
    UART_NAMES,
    VCP_PORT_IDENTIFIER,
    getPortFunc,
  } from "@/tabs/configuration/util.js";

  import {
    BUS_PROTOCOLS,
    busPort as findBusPort,
    busProtocol,
    clearBusOutput,
    needsPinSwap,
    recommendedPort,
    setBusOutput,
  } from "./busOutput.js";
  import ServoArt from "./ServoArt.svelte";

  const wiz = getContext("setupWizard");

  const POLL_MS = 1000;
  const FBUS_SOURCE = 0; // FC.FBUS_SENSORS source: 0 = F.Bus, 1 = S.Port

  let loading = $state(true);
  let rebootNeeded = $state(false);
  let changed = $state(false);
  let pollTimer;
  let stopped = false;

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP2_WING_FBUS_MASTER_CONFIG);
    loading = false;

    async function poll() {
      if (stopped) return;
      if (protocol === "fbus" && !rebootNeeded) {
        await MSP.promise(MSPCodes.MSP2_WING_FBUS_SENSORS);
      }
      if (!stopped) pollTimer = setTimeout(poll, POLL_MS);
    }
    poll();
  });

  onDestroy(() => {
    stopped = true;
    clearTimeout(pollTimer);
  });

  wiz.setCommit(async () => {
    function send(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }
    if (rebootNeeded) {
      await send(MSPCodes.MSP_SET_SERIAL_CONFIG);
      await send(MSPCodes.MSP2_WING_SET_FBUS_MASTER_CONFIG);
    }
    if (rebootNeeded || changed) {
      await send(MSPCodes.MSP_SET_MIXER_CONFIG);
    }
  });

  function changeConnection() {
    rebootNeeded = true;
    wiz.markChanged();
  }

  //// 1. Protocol. "None" takes the bus output off its port.

  let ports = $derived(
    (FC.SERIAL_CONFIG.ports ?? []).filter(
      (p) => p && p.identifier !== VCP_PORT_IDENTIFIER,
    ),
  );
  let portNames = $derived(PORT_NAMES_RF2[FC.CONFIG.boardDesign]);
  let protocol = $derived(busProtocol(ports));
  let busPort = $derived(findBusPort(ports));

  // A protocol picked before any port is free to take it.
  let wanted = $state(null);
  let shownProtocol = $derived(protocol ?? wanted);

  function muxPort(port) {
    return isFbusMuxSerialPort(FC.FBUS_MUX, port);
  }

  // Whether the wizard can set which pin F.Bus is on: null on firmware that
  // doesn't send the port wiring.
  let canSetPin = $derived(FC.FBUS_MASTER_CONFIG.pinSwap !== null);

  function applyPin(port) {
    if (canSetPin && shownProtocol === "fbus") {
      FC.FBUS_MASTER_CONFIG.pinSwap = needsPinSwap(portNames, port);
    }
  }

  function chooseProtocol(value) {
    wanted = value || null;
    if (!wanted) {
      clearBusOutput(ports);
      changeConnection();
      return;
    }
    // Keep the port already chosen, otherwise start on the SBUS connector.
    const port = busPort ?? recommendedPort(ports, portNames, muxPort);
    if (port && setBusOutput(ports, port, wanted)) {
      applyPin(port);
      changeConnection();
    }
  }

  //// 2. Port. Only a free port, or the one the bus output is on now.

  function maskOf(port) {
    return port.functionMask ?? 0;
  }

  function portName(port) {
    return (
      portNames?.[port.identifier] ??
      UART_NAMES[port.identifier] ??
      port.identifier
    );
  }

  function usedFor(port) {
    const func = getPortFunc(maskOf(port));
    return $i18n.t(`portsFunction_${func ? func.name : "CUSTOM"}`);
  }

  function isFree(port) {
    return maskOf(port) === 0 && !muxPort(port);
  }

  function choosePort(port) {
    if (port === busPort || !isFree(port)) return;
    if (setBusOutput(ports, port, shownProtocol)) {
      applyPin(port);
      changeConnection();
    }
  }

  //// 3. Channels: how many servos the bus carries.

  let config = $derived(shownProtocol ? BUS_PROTOCOLS[shownProtocol] : null);

  function chooseChannels(value) {
    FC.MIXER_CONFIG[config.channelsKey] = Number(value);
    changed = true;
    wiz.markChanged();
  }

  //// 4. Signal. F.Bus devices answer, so they prove the wiring; SBUS is
  //// one-way and can only be checked by watching a servo move.

  let devices = $derived(
    (FC.FBUS_SENSORS ?? []).filter((s) => s.source === FBUS_SOURCE).length,
  );

  function useOtherPin() {
    FC.FBUS_MASTER_CONFIG.pinSwap = !FC.FBUS_MASTER_CONFIG.pinSwap;
    changeConnection();
  }
</script>

<div class="intro">
  <ServoArt />
  <p>{$i18n.t("setupWizardBusIntro")}</p>
</div>

{#if loading}
  <!-- Waiting for the FC. -->
{:else}
  <section class="card">
    <h3><span class="num">1</span>{$i18n.t("setupWizardBusProtocolTitle")}</h3>
    <div class="protocol">
      <select
        value={shownProtocol ?? ""}
        onchange={(e) => chooseProtocol(e.target.value)}
      >
        <option value="">{$i18n.t("setupWizardBusProtocolNone")}</option>
        <option value="fbus">F.Bus</option>
        <option value="sbus">SBUS</option>
      </select>
      <span class="muted">{$i18n.t("setupWizardBusProtocolHelp")}</span>
    </div>

    {#if FC.FBUS_MUX && shownProtocol === "fbus"}
      <div class="note">{$i18n.t("setupWizardBusMux")}</div>
    {/if}

    {#if shownProtocol}
      <h3><span class="num">2</span>{$i18n.t("setupWizardBusPortTitle")}</h3>
      <div class="ports" role="radiogroup">
        {#each ports as port (port.identifier)}
          {@const isBus = port === busPort}
          {@const free = isFree(port)}
          <button
            type="button"
            role="radio"
            aria-checked={isBus}
            class={["port", isBus && "selected"]}
            disabled={!isBus && !free}
            onclick={() => choosePort(port)}
          >
            <span class="port-name">
              {portName(port)}
              {#if isBus}
                <i class="fas fa-check-circle" aria-hidden="true"></i>
              {/if}
            </span>
            <span class="port-use">
              {#if isBus}
                {$i18n.t(`portsFunction_${getPortFunc(maskOf(port))?.name}`)}
              {:else if free}
                {$i18n.t("setupWizardReceiverPortFree")}
              {:else}
                {$i18n.t("setupWizardReceiverPortInUse", {
                  1: usedFor(port),
                })}
              {/if}
            </span>
          </button>
        {/each}
      </div>
      {#if !busPort}
        <p class="muted">{$i18n.t("setupWizardBusPortNone")}</p>
      {/if}

      <h3>
        <span class="num">3</span>{$i18n.t("setupWizardBusChannelsTitle")}
      </h3>
      <div class="protocol">
        <select
          value={FC.MIXER_CONFIG[config.channelsKey]}
          onchange={(e) => chooseChannels(e.target.value)}
        >
          {#each config.channels as count (count)}
            <option value={count}>{count}</option>
          {/each}
        </select>
        <span class="muted">{$i18n.t("setupWizardBusChannelsHelp")}</span>
      </div>
    {/if}

    {#if rebootNeeded}
      <div class="actions">
        <span>{$i18n.t("setupWizardRebootNeeded")}</span>
        <button class="btn primary" onclick={wiz.saveAndReboot}>
          {$i18n.t("buttonSaveReboot")}
        </button>
      </div>
    {/if}
  </section>

  {#if busPort}
    <section class="card">
      <h3>
        <span class="num">4</span>{$i18n.t("setupWizardBusSignalTitle")}
        {#if protocol === "fbus" && !rebootNeeded}
          <span class={["badge", devices > 0 ? "good" : "bad"]}>
            <i
              class={["fas", devices > 0 ? "fa-check" : "fa-times"]}
              aria-hidden="true"
            ></i>
            {devices > 0
              ? $i18n.t("setupWizardBusDevices", { 1: devices })
              : $i18n.t("setupWizardBusNoDevices")}
          </span>
        {/if}
      </h3>

      {#if protocol === "sbus"}
        <p>{$i18n.t("setupWizardBusSbusSignal")}</p>
      {:else}
        <p>{$i18n.t("setupWizardBusFbusSignal")}</p>
        {#if canSetPin}
          <div class="actions">
            <span>
              {FC.FBUS_MASTER_CONFIG.pinSwap
                ? $i18n.t("setupWizardBusOnRxPin", { 1: portName(busPort) })
                : $i18n.t("setupWizardBusOnTxPin", { 1: portName(busPort) })}
            </span>
            <button class="btn" disabled={wiz.armed} onclick={useOtherPin}>
              {$i18n.t("setupWizardBusOtherPin")}
            </button>
          </div>
          <p class="muted">{$i18n.t("setupWizardBusOtherPinHelp")}</p>
        {:else}
          <p class="muted">{$i18n.t("setupWizardBusPinFixed")}</p>
        {/if}
      {/if}
    </section>
  {/if}
{/if}

<div>
  <button class="btn" onclick={() => wiz.openTab("servos")}>
    {$i18n.t("setupWizardBusOpenServos")}
  </button>
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 28px;
  }

  //// Numbered cards, as on the Receiver step.

  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
  }

  h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    margin: 0;
    font-size: 1em;
    font-weight: 700;
  }

  .num {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background-color: var(--color-accent-500);
    color: var(--color-accent-fg);
    font-size: 0.8em;
  }

  .card h3:not(:first-child) {
    margin-top: 6px;
  }

  .protocol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;

    select {
      min-width: 220px;
    }
  }

  .ports {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }

  .port {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed),
      box-shadow var(--animation-speed);

    &:hover:not(:disabled) {
      border-color: var(--color-border);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-focus-ring);
    }

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
      background-color: transparent;
    }

    i {
      color: var(--color-accent-500);
    }
  }

  .port-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
  }

  .port-use {
    color: var(--color-text-soft);
    font-size: 0.85em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border: 1px solid currentColor;
    border-radius: var(--radius-pill);
    font-size: 0.8em;
    font-weight: 600;

    &.good {
      color: var(--color-status-good);
    }

    &.bad {
      color: var(--color-status-bad);
    }
  }

  .note {
    padding: 10px 14px;
    border-left: 4px solid var(--color-accent-500);
    border-radius: var(--radius-xs);
    background-color: var(--color-surface-sunken);
    max-width: 70ch;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
