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
  import {
    BUS_TRIAL,
    BUS_TRIAL_ACTION,
    busTrialEnded,
    readBusTrial,
  } from "./busWiringTrial.js";
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
    clearTimeout(trialTimer);
    // A run still going, or a found wiring that was never saved: the flight
    // controller puts back the wiring it had.
    if (detecting || (wiringFound && wiz.pending)) {
      sendTrial(BUS_TRIAL_ACTION.STOP);
    }
  });

  wiz.setCommit(async () => {
    function send(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }
    // A trial still running has the port on a wiring it is only trying:
    // end it, which puts the old wiring back, before anything is saved.
    if (detecting) {
      await cancelTrial();
    }
    if (rebootNeeded) {
      await send(MSPCodes.MSP_SET_SERIAL_CONFIG);
    }
    // The wiring the trial found is already live and in the FC's config;
    // this sends the same values, for the save that follows.
    if (rebootNeeded || wiringFound) {
      await send(MSPCodes.MSP2_WING_SET_FBUS_MASTER_CONFIG);
    }
    if (rebootNeeded || changed) {
      await send(MSPCodes.MSP_SET_MIXER_CONFIG);
    }
  });

  // Which card the last change needing a reboot was made in, so the Save
  // and Reboot button shows up next to it.
  let rebootAt = $state("port");

  function changeConnection(at = "port") {
    rebootNeeded = true;
    rebootAt = at;
    wiz.markChanged();
  }

  //// 1. Port. "None", a free port, or the one the bus output is on now.

  let ports = $derived(
    (FC.SERIAL_CONFIG.ports ?? []).filter(
      (p) => p && p.identifier !== VCP_PORT_IDENTIFIER,
    ),
  );
  let portNames = $derived(PORT_NAMES_RF2[FC.CONFIG.boardDesign]);
  let protocol = $derived(busProtocol(ports));
  let busPort = $derived(findBusPort(ports));

  // The SBUS connector, offered as the usual place for a bus.
  let suggested = $derived(recommendedPort(ports, portNames, muxPort));

  function muxPort(port) {
    return isFbusMuxSerialPort(FC.FBUS_MUX, port);
  }

  // Whether the wizard can set which pin F.Bus is on: null on firmware that
  // doesn't send the port wiring.
  let canSetPin = $derived(FC.FBUS_MASTER_CONFIG.pinSwap !== null);

  function applyPin(port) {
    if (canSetPin && protocol === "fbus") {
      FC.FBUS_MASTER_CONFIG.pinSwap = needsPinSwap(portNames, port);
    }
  }

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

  // A newly chosen port starts on F.Bus, whose devices can prove the wiring.
  function choosePort(port) {
    if (port === busPort || !isFree(port)) return;
    if (setBusOutput(ports, port, protocol ?? "fbus")) {
      applyPin(port);
      changeConnection();
    }
  }

  function chooseNone() {
    if (!busPort) return;
    clearBusOutput(ports);
    changeConnection();
  }

  //// 2. Protocol, on the chosen port.

  function chooseProtocol(value) {
    const port = busPort;
    if (setBusOutput(ports, port, value)) {
      applyPin(port);
      changeConnection();
    }
  }

  //// 3. Channels: how many servos the bus carries.

  let config = $derived(protocol ? BUS_PROTOCOLS[protocol] : null);

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

  // Fallback for firmware without the wiring trial: the other pin, used
  // after a restart.
  function useOtherPin() {
    FC.FBUS_MASTER_CONFIG.pinSwap = !FC.FBUS_MASTER_CONFIG.pinSwap;
    changeConnection("pin");
  }

  //// Wiring detection: the flight controller tries each pin and polarity on
  //// the live port until a device answers (busWiringTrial.js). A found
  //// wiring is in use at once, so it needs a save but no restart.

  const TRIAL_POLL_MS = 300;
  // Four wirings at a second and a half each, and some margin.
  const TRIAL_TIMEOUT_MS = 10000;

  // null until tried; false on firmware without the trial.
  let trialSupported = $state(null);
  let detecting = $state(false);
  let trial = $state(null);
  // "found", "same", "failed", "rejected" or null
  let trialResult = $state(null);
  let wiringFound = $state(false);
  let trialTimer;
  let trialStartedAt = 0;
  // Counts the runs, so a reply that arrives after its run was cancelled is
  // ignored.
  let trialRun = 0;

  async function cancelTrial() {
    trialRun += 1;
    clearTimeout(trialTimer);
    detecting = false;
    trialResult = null;
    await sendTrial(BUS_TRIAL_ACTION.STOP);
  }

  // The reply, or null if none came within a second (MSP.promise() has no
  // timeout of its own on a real connection).
  function sendTrial(action) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(response?.data ?? null);
      };
      const timeout = setTimeout(() => finish(null), 1000);
      MSP.send_message(
        MSPCodes.MSP2_WING_FBUS_MASTER_TRIAL,
        [action],
        false,
        finish,
        true,
      );
    });
  }

  async function detectWiring() {
    if (detecting || wiz.armed || wiz.saving) return;
    const before = {
      pinSwap: FC.FBUS_MASTER_CONFIG.pinSwap,
      inverted: FC.FBUS_MASTER_CONFIG.inverted,
    };
    detecting = true;
    trialResult = null;
    trial = null;
    trialStartedAt = Date.now();
    trialRun += 1;
    const run = trialRun;

    // The run is given up: the flight controller puts the old wiring back.
    function giveUp() {
      sendTrial(BUS_TRIAL_ACTION.STOP);
      trialResult = "failed";
      detecting = false;
    }

    async function step(action) {
      if (stopped || run !== trialRun) return;
      const status = readBusTrial(await sendTrial(action));
      if (stopped || run !== trialRun) return;
      if (!status && action === BUS_TRIAL_ACTION.START) {
        // No payload: firmware without the trial. The pin can still be
        // switched by hand.
        trialSupported = false;
        detecting = false;
        return;
      }
      if (!status) {
        // A poll went unanswered. The trial may still be running, or have
        // found the wiring, so ask again until the deadline and stop it
        // then: a run is never left on the flight controller unattended.
        if (Date.now() - trialStartedAt > TRIAL_TIMEOUT_MS) {
          giveUp();
          return;
        }
        trialTimer = setTimeout(
          () => step(BUS_TRIAL_ACTION.POLL),
          TRIAL_POLL_MS,
        );
        return;
      }
      trialSupported = true;
      trial = status;
      if (!busTrialEnded(status.state)) {
        if (Date.now() - trialStartedAt > TRIAL_TIMEOUT_MS) {
          giveUp();
          return;
        }
        trialTimer = setTimeout(
          () => step(BUS_TRIAL_ACTION.POLL),
          TRIAL_POLL_MS,
        );
        return;
      }
      detecting = false;
      if (status.state === BUS_TRIAL.SUCCESS) {
        const same =
          status.pinSwap === before.pinSwap &&
          status.inverted === before.inverted;
        FC.FBUS_MASTER_CONFIG.pinSwap = status.pinSwap;
        FC.FBUS_MASTER_CONFIG.inverted = status.inverted;
        trialResult = same ? "same" : "found";
        if (!same) {
          wiringFound = true;
          wiz.markChanged();
        }
      } else if (status.state === BUS_TRIAL.FAILED) {
        trialResult = "failed";
      } else {
        trialResult = "rejected";
      }
    }

    await step(BUS_TRIAL_ACTION.START);
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
    <h3><span class="num">1</span>{$i18n.t("setupWizardBusPortTitle")}</h3>
    <div class="ports" role="radiogroup">
      <button
        type="button"
        role="radio"
        aria-checked={!busPort}
        class={["port", !busPort && "selected"]}
        disabled={wiz.saving || detecting}
        onclick={chooseNone}
      >
        <span class="port-name">
          {$i18n.t("setupWizardBusPortNone")}
          {#if !busPort}
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          {/if}
        </span>
        <span class="port-use">{$i18n.t("setupWizardBusPortNoneUse")}</span>
      </button>
      {#each ports as port (port.identifier)}
        {@const isBus = port === busPort}
        {@const free = isFree(port)}
        <button
          type="button"
          role="radio"
          aria-checked={isBus}
          class={["port", isBus && "selected"]}
          disabled={wiz.saving || detecting || (!isBus && !free)}
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
            {:else if free && port === suggested}
              {$i18n.t("setupWizardBusPortSuggested")}
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

    {#if busPort}
      <h3>
        <span class="num">2</span>{$i18n.t("setupWizardBusProtocolTitle")}
      </h3>
      <div class="protocol">
        <select
          value={protocol}
          disabled={wiz.saving || detecting}
          onchange={(e) => chooseProtocol(e.target.value)}
        >
          <option value="fbus">F.Bus</option>
          <option value="sbus">SBUS</option>
        </select>
        <span class="muted">{$i18n.t("setupWizardBusProtocolHelp")}</span>
      </div>

      {#if FC.FBUS_MUX && protocol === "fbus"}
        <div class="note">{$i18n.t("setupWizardBusMux")}</div>
      {/if}

      <h3>
        <span class="num">3</span>{$i18n.t("setupWizardBusChannelsTitle")}
      </h3>
      <div class="protocol">
        <select
          value={FC.MIXER_CONFIG[config.channelsKey]}
          disabled={wiz.saving}
          onchange={(e) => chooseChannels(e.target.value)}
        >
          {#each config.channels as count (count)}
            <option value={count}>{count}</option>
          {/each}
        </select>
        <span class="muted">{$i18n.t("setupWizardBusChannelsHelp")}</span>
      </div>
    {/if}

    {#if rebootNeeded && rebootAt === "port"}
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
            {#if trialSupported === false}
              <button
                class="btn"
                disabled={wiz.armed || wiz.saving}
                onclick={useOtherPin}
              >
                {$i18n.t("setupWizardBusOtherPin")}
              </button>
            {:else}
              <button
                class="btn"
                disabled={rebootNeeded || detecting || wiz.armed || wiz.saving}
                onclick={detectWiring}
              >
                {$i18n.t("setupWizardBusDetect")}
              </button>
            {/if}
          </div>
          {#if detecting}
            <p>
              {$i18n.t("setupWizardBusDetecting", {
                1: (trial?.comboIndex ?? 0) + 1,
                2: trial?.comboCount ?? 4,
              })}
            </p>
          {:else if trialResult}
            <p class={["result", trialResult]}>
              {$i18n.t(`setupWizardBusDetect_${trialResult}`)}
            </p>
          {/if}
          {#if rebootNeeded && rebootAt === "pin"}
            <div class="actions">
              <span>{$i18n.t("setupWizardRebootNeeded")}</span>
              <button class="btn primary" onclick={wiz.saveAndReboot}>
                {$i18n.t("buttonSaveReboot")}
              </button>
            </div>
          {:else if trialSupported === false}
            <p class="muted">{$i18n.t("setupWizardBusOtherPinHelp")}</p>
          {:else if !detecting && !trialResult}
            <p class="muted">{$i18n.t("setupWizardBusDetectHelp")}</p>
          {/if}
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

  .result {
    font-weight: 600;

    &.found,
    &.same {
      color: var(--color-status-good);
    }

    &.failed,
    &.rejected {
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
