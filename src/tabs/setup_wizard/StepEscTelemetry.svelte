<script>
  import { getContext, mount, onDestroy, onMount, unmount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import NumberInput from "@/components/NumberInput.svelte";
  import Switch from "@/components/Switch.svelte";
  import {
    PORT_NAMES_RF2,
    UART_NAMES,
    VCP_PORT_IDENTIFIER,
    getPortFunc,
  } from "@/tabs/configuration/util.js";
  import EscWiringDetectWizard from "@/tabs/motors/EscWiringDetectWizard.svelte";
  import motorState from "@/tabs/motors/state.svelte.js";

  import MotorArt from "./MotorArt.svelte";

  const wiz = getContext("setupWizard");

  const ESC_SENSOR_FUNCTION = 1024;
  const POLL_MS = 250;

  // Battery meter sources (BATTERY_CONFIG.voltageMeterSource and
  // currentMeterSource): 1 is the board's own ADC, 2 is ESC telemetry.
  const METER_ADC = 1;
  const METER_ESC = 2;

  const MAX_CELLS = 14;

  // F.BUS and SRXL2 ESC telemetry don't use the ESC Telemetry port function
  // (F.BUS rides on the receiver, SRXL2 on its own bus), so they stay on the
  // Motors tab.
  const OWN_PORT = ["FrSky F.BUS", "SRXL2"];

  let protocols = $derived(
    motorState.telemetryProtocols
      .map((name, id) => ({ id, name }))
      .filter((p) => p.id > 0 && !OWN_PORT.includes(p.name)),
  );

  let loading = $state(true);
  let rebootNeeded = $state(false);
  let motorChanged = $state(false);
  let batteryChanged = $state(false);
  let pollTimer;
  let stopped = false;

  // What the meter sources were before this step turned ESC on, so turning
  // it off again puts them back.
  let meterBefore = {};

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG);
    await MSP.promise(MSPCodes.MSP_ESC_SENSOR_CONFIG);
    await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);
    await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
    meterBefore = {
      voltageMeterSource: FC.BATTERY_CONFIG.voltageMeterSource,
      currentMeterSource: FC.BATTERY_CONFIG.currentMeterSource,
    };
    loading = false;

    async function poll() {
      if (stopped) return;
      await MSP.promise(MSPCodes.MSP_MOTOR_TELEMETRY);
      await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
      if (!stopped) pollTimer = setTimeout(poll, POLL_MS);
    }
    poll();
  });

  onDestroy(() => {
    stopped = true;
    clearTimeout(pollTimer);
    detectInstance?.stop();
    closeDetect();
  });

  wiz.setCommit(async () => {
    function send(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }
    if (rebootNeeded) {
      await send(MSPCodes.MSP_SET_SERIAL_CONFIG);
      await send(MSPCodes.MSP_SET_FEATURE_CONFIG);
      await send(MSPCodes.MSP_SET_ESC_SENSOR_CONFIG);
    }
    if (rebootNeeded || motorChanged) {
      await send(MSPCodes.MSP_SET_MOTOR_CONFIG);
    }
    if (rebootNeeded || batteryChanged) {
      await send(MSPCodes.MSP_SET_BATTERY_CONFIG);
    }
  });

  function changeConnection() {
    rebootNeeded = true;
    wiz.markChanged();
  }

  //// Which kind of ESC telemetry this model can have.

  let hasMotor = $derived(
    motorState.throttleEnabled && (FC.CONFIG.motorCount ?? 0) > 0,
  );
  let protocolName = $derived(
    motorState.telemetryProtocols[FC.ESC_SENSOR_CONFIG.protocol],
  );
  // Set up some other way: Castle Link reads telemetry on the throttle wire,
  // SRXL2 and F.BUS don't use an ESC Telemetry port.
  let elsewhere = $derived(
    motorState.isCastleLink ||
      motorState.srxl2PortAssigned ||
      OWN_PORT.includes(protocolName),
  );
  let protocol = $derived(
    protocols.find((p) => p.id === FC.ESC_SENSOR_CONFIG.protocol) ?? null,
  );
  let telemetryOn = $derived(motorState.telemEnabled);

  //// 1. Protocol. "None" turns ESC telemetry off and frees its port.

  function chooseProtocol(value) {
    const id = Number(value);
    FC.ESC_SENSOR_CONFIG.protocol = id;
    FC.FEATURE_CONFIG.features.ESC_SENSOR = id > 0;
    if (id === 0) {
      if (escPort)
        escPort.functionMask = maskOf(escPort) & ~ESC_SENSOR_FUNCTION;
      // The battery can't be read from an ESC that isn't there.
      setMeterFromEsc("voltageMeterSource", false);
      setMeterFromEsc("currentMeterSource", false);
    }
    changeConnection();
  }

  //// 2. Port. Only a free port, or the one ESC telemetry is on now.

  function maskOf(port) {
    return port.functionMask ?? 0;
  }

  let ports = $derived(
    (FC.SERIAL_CONFIG.ports ?? []).filter(
      (p) => p && p.identifier !== VCP_PORT_IDENTIFIER,
    ),
  );
  let escPort = $derived(
    ports.find((p) => maskOf(p) & ESC_SENSOR_FUNCTION) ?? null,
  );

  function portName(port) {
    const names = PORT_NAMES_RF2[FC.CONFIG.boardDesign];
    return (
      names?.[port.identifier] ?? UART_NAMES[port.identifier] ?? port.identifier
    );
  }

  function usedFor(port) {
    const func = getPortFunc(maskOf(port));
    return $i18n.t(`portsFunction_${func ? func.name : "CUSTOM"}`);
  }

  function choosePort(port) {
    if (port === escPort || maskOf(port) !== 0) return;
    if (escPort) escPort.functionMask = maskOf(escPort) & ~ESC_SENSOR_FUNCTION;
    port.functionMask = ESC_SENSOR_FUNCTION;
    changeConnection();
  }

  //// 3. Signal: live values from the ESC, and wiring detection (half
  //// duplex, pin swap), which tries each combination on the live port.

  function motorReading(i) {
    const t = FC.MOTOR_TELEMETRY_DATA;
    return {
      voltage: (t.voltage[i] ?? 0) / 1000,
      current: (t.current[i] ?? 0) / 1000,
      temperature: (t.temperature[i] ?? 0) / 10,
      rpm: t.rpm[i] ?? 0,
    };
  }

  let motorCount = $derived(FC.CONFIG.motorCount ?? 0);
  let readings = $derived(
    Array.from({ length: motorCount }, (_, i) => motorReading(i)),
  );
  // The FC sends zeros for an ESC it hasn't heard from lately
  // (msp.c MSP_MOTOR_TELEMETRY), so any non-zero reading means it's talking.
  let receiving = $derived(
    readings.some((r) => r.voltage > 0 || r.current > 0 || r.temperature > 0),
  );

  let canDetect = $derived(
    !rebootNeeded && !!escPort && !!protocol && !elsewhere && !wiz.armed,
  );
  let detecting = $state(false);
  let detectInstance = null;

  function closeDetect() {
    if (!detectInstance) return;
    const instance = detectInstance;
    detectInstance = null;
    unmount(instance);
  }

  function detectWiring() {
    closeDetect();
    const before = {
      halfDuplex: FC.ESC_SENSOR_CONFIG.half_duplex,
      pinSwap: FC.ESC_SENSOR_CONFIG.pinswap,
    };
    let applied = false;
    let saved = false;

    // Mounted to <body>: see the Motors tab's Telemetry.svelte.
    detectInstance = mount(EscWiringDetectWizard, {
      target: document.body,
      props: {
        onDetected: (halfDuplex, pinSwap) => {
          applied = true;
          FC.ESC_SENSOR_CONFIG.half_duplex = halfDuplex;
          FC.ESC_SENSOR_CONFIG.pinswap = pinSwap;
        },
        onButtonDisabled: (v) => (detecting = v),
        onClose: () => {
          if (applied && !saved) {
            FC.ESC_SENSOR_CONFIG.half_duplex = before.halfDuplex;
            FC.ESC_SENSOR_CONFIG.pinswap = before.pinSwap;
          }
          detecting = false;
          closeDetect();
        },
        onSaveRequested: () => {
          saved = true;
          rebootNeeded = true;
          wiz.saveAndReboot();
        },
      },
    });
  }

  //// 4. Battery: voltage and current from the ESC, and the pack. The pack
  //// is stored in the active battery profile.

  let batteryProfile = $derived(FC.BATTERY_STATE.batteryProfile ?? 0);

  function setMeterFromEsc(key, on) {
    const now = FC.BATTERY_CONFIG[key];
    const before =
      meterBefore[key] === METER_ESC ? METER_ADC : meterBefore[key];
    const next = on ? METER_ESC : now === METER_ESC ? before : now;
    if (next === now) return;
    FC.BATTERY_CONFIG[key] = next;
    // Swapping a meter source re-maps the hardware, so it needs a reboot.
    changeConnection();
  }

  function getCells() {
    return FC.BATTERY_CONFIG.hasProfileCells
      ? (FC.BATTERY_CONFIG.cellCounts[batteryProfile] ?? 0)
      : (FC.BATTERY_CONFIG.cellCount ?? 0);
  }

  function setCells(value) {
    const cells = Number(value);
    if (FC.BATTERY_CONFIG.hasProfileCells) {
      FC.BATTERY_CONFIG.cellCounts[batteryProfile] = cells;
    } else {
      FC.BATTERY_CONFIG.cellCount = cells;
    }
    changeBattery();
  }

  function changeBattery() {
    batteryChanged = true;
    wiz.markChanged();
  }

  //// 5. Motor: pole count turns the ESC's electrical RPM into motor RPM.
  //// Bidirectional DShot gives RPM on the throttle wire without a port.

  function changeMotor() {
    motorChanged = true;
    wiz.markChanged();
  }

  // Where the FC takes motor RPM from, in the order rpmSourceInit()
  // (flight/motors.c) picks it at boot. The RPM pin wins only if one is set
  // up for the motor, which the configurator can't see, so a pin in use is
  // only "likely".
  let rpmSource = $derived(
    FC.FEATURE_CONFIG.features.FREQ_SENSOR
      ? "pin"
      : motorState.isDshot && FC.MOTOR_CONFIG.use_dshot_telemetry
        ? "dshot"
        : telemetryOn
          ? "esc"
          : "none",
  );

  function setBidir(on) {
    FC.MOTOR_CONFIG.use_dshot_telemetry = on;
    changeConnection();
  }

  function fixed(value, digits) {
    return value > 0 ? value.toFixed(digits) : "–";
  }
</script>

<div class="intro">
  <MotorArt />
  <p>{$i18n.t("setupWizardEscIntro")}</p>
</div>

{#if loading}
  <!-- Waiting for the FC. -->
{:else if !hasMotor}
  <div class="note">{$i18n.t("setupWizardEscNoMotor")}</div>
{:else}
  <!-- 1 + 2: how the ESC telemetry is connected. -->
  <section class="card">
    <h3><span class="num">1</span>{$i18n.t("setupWizardEscProtocolTitle")}</h3>
    {#if elsewhere}
      <p>
        {motorState.isCastleLink
          ? $i18n.t("setupWizardEscCastle")
          : $i18n.t("setupWizardEscElsewhere", { 1: protocolName })}
      </p>
    {:else}
      <div class="protocol">
        <select
          value={protocol?.id ?? 0}
          onchange={(e) => chooseProtocol(e.target.value)}
        >
          <option value={0}>{$i18n.t("setupWizardEscProtocolNone")}</option>
          {#each protocols as proto (proto.id)}
            <option value={proto.id}>{proto.name}</option>
          {/each}
        </select>
        <span class="muted">{$i18n.t("setupWizardEscProtocolHelp")}</span>
      </div>

      {#if protocol}
        <h3><span class="num">2</span>{$i18n.t("setupWizardEscPortTitle")}</h3>
        <div class="ports" role="radiogroup">
          {#each ports as port (port.identifier)}
            {@const isEsc = port === escPort}
            {@const free = maskOf(port) === 0}
            <button
              type="button"
              role="radio"
              aria-checked={isEsc}
              class={["port", isEsc && "selected"]}
              disabled={!isEsc && !free}
              onclick={() => choosePort(port)}
            >
              <span class="port-name">
                {portName(port)}
                {#if isEsc}
                  <i class="fas fa-check-circle" aria-hidden="true"></i>
                {/if}
              </span>
              <span class="port-use">
                {#if isEsc}
                  {$i18n.t("portsFunction_ESC_SENSOR")}
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
        {#if !escPort}
          <p class="muted">{$i18n.t("setupWizardEscPortNone")}</p>
        {/if}
      {/if}
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

  {#if telemetryOn}
    <!-- 3: is anything arriving? -->
    <section class="card">
      <h3>
        <span class="num">3</span>{$i18n.t("setupWizardEscSignalTitle")}
        {#if !rebootNeeded}
          <span class={["badge", receiving ? "good" : "bad"]}>
            <i
              class={["fas", receiving ? "fa-check" : "fa-times"]}
              aria-hidden="true"
            ></i>
            {receiving
              ? $i18n.t("setupWizardEscReceiving")
              : $i18n.t("setupWizardEscNotReceiving")}
          </span>
        {/if}
      </h3>
      <p>{$i18n.t("setupWizardEscSignalText")}</p>

      <div class="values">
        <span></span>
        <span class="head">{$i18n.t("setupWizardEscVoltage")}</span>
        <span class="head">{$i18n.t("setupWizardEscCurrent")}</span>
        <span class="head">{$i18n.t("setupWizardEscTemperature")}</span>
        <span class="head">{$i18n.t("setupWizardEscRpm")}</span>
        {#each readings as r, i (i)}
          <span class="head">
            {$i18n.t("setupWizardEscMotor", { 1: i + 1 })}
          </span>
          <span>{fixed(r.voltage, 1)} V</span>
          <span>{fixed(r.current, 1)} A</span>
          <span>{fixed(r.temperature, 0)} °C</span>
          <span>{r.rpm > 0 ? r.rpm : "–"}</span>
        {/each}
      </div>

      {#if !elsewhere}
        <div class="actions">
          <button
            class="btn"
            disabled={!canDetect || detecting}
            onclick={detectWiring}
          >
            {$i18n.t("motorsEscWiringDetectButton")}
          </button>
          {#if rebootNeeded}
            <span class="muted">{$i18n.t("setupWizardReceiverSaveFirst")}</span>
          {:else}
            <span class="muted">{$i18n.t("setupWizardEscDetectHelp")}</span>
          {/if}
        </div>
      {/if}
    </section>

    <!-- 4: battery from the ESC. -->
    <section class="card">
      <h3><span class="num">4</span>{$i18n.t("setupWizardEscBatteryTitle")}</h3>
      <div class="form">
        <label for="esc-cells">{$i18n.t("powerBatteryCellCount")}</label>
        <select
          id="esc-cells"
          value={getCells()}
          onchange={(e) => setCells(e.target.value)}
        >
          <option value={0}>{$i18n.t("setupWizardEscCellsAuto")}</option>
          {#each { length: MAX_CELLS } as _, i (i)}
            <option value={i + 1}>{i + 1}S</option>
          {/each}
        </select>

        <label for="esc-capacity">{$i18n.t("powerBatteryCapacity")}</label>
        <NumberInput
          id="esc-capacity"
          min="0"
          max="40000"
          step="10"
          bind:value={FC.BATTERY_CONFIG.capacities[batteryProfile]}
          onchange={changeBattery}
        />

        <label for="esc-voltage-source">
          {$i18n.t("setupWizardEscUseVoltage")}
        </label>
        <Switch
          id="esc-voltage-source"
          checked={FC.BATTERY_CONFIG.voltageMeterSource === METER_ESC}
          onchange={(e) =>
            setMeterFromEsc("voltageMeterSource", e.target.checked)}
        />

        <label for="esc-current-source">
          {$i18n.t("setupWizardEscUseCurrent")}
        </label>
        <Switch
          id="esc-current-source"
          checked={FC.BATTERY_CONFIG.currentMeterSource === METER_ESC}
          onchange={(e) =>
            setMeterFromEsc("currentMeterSource", e.target.checked)}
        />
      </div>
      <p class="muted">
        {$i18n.t("setupWizardEscBatteryNow", {
          1: FC.BATTERY_STATE.voltage ?? 0,
          2: FC.BATTERY_STATE.cellCount ?? 0,
          3: batteryProfile + 1,
        })}
      </p>
    </section>
  {/if}

  <!-- 5: motor RPM. -->
  <section class="card">
    <h3><span class="num">5</span>{$i18n.t("setupWizardEscRpmTitle")}</h3>
    <p>{$i18n.t("setupWizardEscRpmText")}</p>
    <p class={["source", rpmSource]}>
      {$i18n.t("setupWizardEscRpmSource", {
        1: $i18n.t(`setupWizardEscRpmSource_${rpmSource}`),
      })}
    </p>
    {#if rpmSource === "pin"}
      <div class="note">{$i18n.t("setupWizardEscRpmPinNote")}</div>
    {/if}
    <div class="form">
      {#if motorState.isDshot}
        <label for="esc-bidir">{$i18n.t("motorsDshotBidir")}</label>
        <Switch
          id="esc-bidir"
          checked={FC.MOTOR_CONFIG.use_dshot_telemetry}
          onchange={(e) => setBidir(e.target.checked)}
        />
      {/if}
      {#each { length: motorCount } as _, i (i)}
        <label for={`esc-poles-${i}`}>
          {$i18n.t("setupWizardEscPoles", { 1: i + 1 })}
        </label>
        <span class="with-rpm">
          <NumberInput
            id={`esc-poles-${i}`}
            min="2"
            max="255"
            step="2"
            bind:value={FC.MOTOR_CONFIG.motor_poles[i]}
            onchange={changeMotor}
          />
          <span class="muted rpm">
            {$i18n.t("setupWizardEscRpmNow", {
              1: readings[i]?.rpm > 0 ? readings[i].rpm : "–",
            })}
          </span>
        </span>
      {/each}
    </div>
    <p class="muted">{$i18n.t("setupWizardEscPolesHelp")}</p>
  </section>
{/if}

<div>
  <button class="btn" onclick={() => wiz.openTab("motors")}>
    {$i18n.t("setupWizardOpenMotors")}
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

  //// Live values, one row per motor.

  .values {
    display: grid;
    grid-template-columns: auto repeat(4, minmax(70px, max-content));
    gap: 6px 18px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    font-variant-numeric: tabular-nums;
  }

  .head {
    color: var(--color-text-soft);
    font-size: 0.85em;
    font-weight: 600;
  }

  //// Settings.

  // Label and control in two columns, so the controls line up.
  .form {
    display: grid;
    grid-template-columns: max-content max-content;
    align-items: center;
    justify-items: start;
    gap: 10px 24px;

    select {
      min-width: 120px;
    }
  }

  .with-rpm {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .rpm {
    min-width: 9ch;
    font-variant-numeric: tabular-nums;
  }

  .source {
    font-weight: 600;

    &.none {
      color: var(--color-text-soft);
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
