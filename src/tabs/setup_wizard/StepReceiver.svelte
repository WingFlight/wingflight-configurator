<script>
  import { getContext, mount, onDestroy, onMount, unmount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import {
    PORT_NAMES_RF2,
    UART_NAMES,
    VCP_PORT_IDENTIFIER,
    getPortFunc,
  } from "@/tabs/configuration/util.js";
  import WarningNote from "@/components/notes/WarningNote.svelte";
  import { RX_PROTOCOLS, isCrsfReceiver } from "@/tabs/receiver/protocols.js";
  import RxWiringDetectWizard from "@/tabs/receiver/RxWiringDetectWizard.svelte";

  import ReceiverArt from "./ReceiverArt.svelte";
  import SticksBottomLeft from "./SticksBottomLeft.svelte";
  import StickIcon from "./StickIcon.svelte";
  import { mapFromDetected, movedChannel, orderLabel } from "./receiver.js";

  const wiz = getContext("setupWizard");

  const SERIALRX_FUNCTION = 64;
  const POLL_MS = 100;

  // Serial receivers only: SPI and PPM are not built into Wingflight, and
  // MSP input is for simulators.
  const PROTOCOLS = RX_PROTOCOLS.filter(
    (p) => p.feature === "RX_SERIAL" && !p.hide,
  );

  // The two common orders. RC_MAP[function] = receiver channel, functions in
  // the order roll, pitch, yaw, throttle, aux 1-4.
  const ORDERS = [
    { key: "aetr", map: [0, 1, 3, 2, 4, 5, 6, 7] },
    { key: "taer", map: [1, 2, 3, 0, 4, 5, 6, 7] },
  ];

  // `move`: the stick movement asked for when detecting the order, drawn
  // with StickIcon (x 1 right, y -1 forward).
  const FUNCTIONS = [
    { key: "roll", label: "controlAxisRoll", move: { x: 1, y: 0 } },
    { key: "pitch", label: "controlAxisPitch", move: { x: 0, y: -1 } },
    { key: "yaw", label: "controlAxisYaw", move: { x: 1, y: 0 } },
    { key: "throttle", label: "controlAxisThrottle", move: { x: 0, y: -1 } },
  ];

  // Order detection asks for throttle first: it is the one stick that
  // starts at an end, so it is the least likely to be bumped by mistake.
  const DETECT_ORDER = [3, 0, 1, 2].map((i) => FUNCTIONS[i]);

  // How far from center (fraction of rc_deflection) counts as "at the end".
  const AT_END = 0.7;

  let loading = $state(true);
  let connChanged = $state(false);
  let mapChanged = $state(false);
  let pollTimer;
  let stopped = false;

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG);
    await MSP.promise(MSPCodes.MSP_RX_CONFIG);
    await MSP.promise(MSPCodes.MSP_RC_CONFIG);
    loading = false;

    async function poll() {
      if (stopped) return;
      await MSP.promise(MSPCodes.MSP_RX_CHANNELS);
      orderDetectTick();
      await MSP.promise(MSPCodes.MSP2_WING_RX_INPUT_BACKUP_STATUS);
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
    if (connChanged) {
      await send(MSPCodes.MSP_SET_SERIAL_CONFIG);
      await send(MSPCodes.MSP_SET_FEATURE_CONFIG);
      await send(MSPCodes.MSP_SET_RX_CONFIG);
    }
    if (mapChanged) {
      await send(MSPCodes.MSP_SET_RX_MAP);
    }
  });

  //// 1. Port. Only a free port, or the one the receiver is on now, can be
  //// chosen: the others are in use for something else.

  function maskOf(port) {
    return port.functionMask ?? 0;
  }

  let ports = $derived(
    (FC.SERIAL_CONFIG.ports ?? []).filter(
      (p) => p && p.identifier !== VCP_PORT_IDENTIFIER,
    ),
  );
  let rxPort = $derived(
    ports.find((p) => maskOf(p) & SERIALRX_FUNCTION) ?? null,
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
    if (port === rxPort || maskOf(port) !== 0) return;
    if (rxPort) rxPort.functionMask = maskOf(rxPort) & ~SERIALRX_FUNCTION;
    port.functionMask = SERIALRX_FUNCTION;
    changeConnection();
  }

  //// 2. Protocol.

  let serialRx = $derived(!!FC.FEATURE_CONFIG.features.RX_SERIAL);
  let protocol = $derived(
    serialRx
      ? (PROTOCOLS.find((p) => p.id === FC.RX_CONFIG.serialrx_provider) ?? null)
      : null,
  );

  function chooseProtocol(id) {
    const proto = PROTOCOLS.find((p) => p.id === Number(id));
    if (!proto) return;
    FC.FEATURE_CONFIG.features.setGroup("RX_PROTO", false);
    FC.FEATURE_CONFIG.features.setFeature("RX_SERIAL", true);
    FC.RX_CONFIG.serialrx_provider = proto.id;
    changeConnection();
  }

  function changeConnection() {
    connChanged = true;
    wiz.markChanged();
  }

  //// 3. Signal: link status and wiring detection (inverted, half duplex,
  //// pin swap), which tries each combination on the live port.

  let linkUp = $derived(FC.RX_INPUT_BACKUP_STATUS?.mainLinkUp ?? null);
  let canDetect = $derived(
    !connChanged && !!rxPort && !!protocol && !wiz.armed,
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
      inverted: FC.RX_CONFIG.serialrx_inverted,
      halfDuplex: FC.RX_CONFIG.serialrx_halfduplex,
      pinSwap: FC.RX_CONFIG.serialrx_pinswap,
    };
    let applied = false;
    let saved = false;

    // Mounted to <body>: see ReceiverType.svelte.
    detectInstance = mount(RxWiringDetectWizard, {
      target: document.body,
      props: {
        mspCode: MSPCodes.MSP2_WING_RX_SERIAL_TRIAL,
        onDetected: (inverted, halfDuplex, pinSwap) => {
          applied = true;
          FC.RX_CONFIG.serialrx_inverted = inverted;
          FC.RX_CONFIG.serialrx_halfduplex = halfDuplex;
          FC.RX_CONFIG.serialrx_pinswap = pinSwap;
        },
        onButtonDisabled: (v) => (detecting = v),
        onClose: () => {
          if (applied && !saved) {
            FC.RX_CONFIG.serialrx_inverted = before.inverted;
            FC.RX_CONFIG.serialrx_halfduplex = before.halfDuplex;
            FC.RX_CONFIG.serialrx_pinswap = before.pinSwap;
          }
          detecting = false;
          closeDetect();
        },
        onSaveRequested: () => {
          saved = true;
          connChanged = true;
          wiz.saveAndReboot();
        },
      },
    });
  }

  //// 4. Channels: order, and a live bar per stick function. With both
  //// sticks bottom-left every bar should be at the left.

  let order = $derived(
    ORDERS.find((o) => o.map.every((ch, i) => FC.RC_MAP?.[i] === ch))?.key ??
      null,
  );

  function chooseOrder(o) {
    orderDetect = null;
    if (order === o.key) return;
    setMap(o.map);
  }

  function setMap(map) {
    FC.RC_MAP = [...map];
    mapChanged = true;
    wiz.markChanged();
  }

  //// Order detection: one stick at a time, the channel that clearly moves
  //// most from where it started is that stick's. The result is a custom
  //// order unless it happens to match one of the common ones.

  let orderDetect = $state(null);

  let hasChannels = $derived((FC.RX_CHANNELS ?? []).some((v) => v > 0));

  function channelsNow() {
    const length = Math.min(FC.RC_MAP?.length ?? 8, FC.RX_CHANNELS.length);
    return Array.from({ length }, (_, i) => FC.RX_CHANNELS[i] ?? 0);
  }

  function startOrderDetect() {
    const start = channelsNow();
    orderDetect = { found: [], start, peaks: start.map(() => 0) };
  }

  function orderDetectTick() {
    if (!orderDetect) return;
    const now = channelsNow();
    const { found, start } = orderDetect;
    const peaks = orderDetect.peaks.map((p, i) =>
      Math.max(p, Math.abs((now[i] ?? 0) - (start[i] ?? 0))),
    );
    const channel = movedChannel(peaks, found);
    if (channel < 0) {
      orderDetect.peaks = peaks;
      return;
    }
    const next = [...found, channel];
    if (next.length === DETECT_ORDER.length) {
      orderDetect = null;
      // Back into roll, pitch, yaw, throttle order.
      const byFunction = FUNCTIONS.map((fn) => next[DETECT_ORDER.indexOf(fn)]);
      setMap(mapFromDetected(byFunction, FC.RC_MAP.length));
      return;
    }
    // Next stick: measured from where everything is now.
    orderDetect = { found: next, start: now, peaks: now.map(() => 0) };
  }

  function reading(index) {
    const channel = FC.RC_MAP?.[index];
    const raw = FC.RX_CHANNELS?.[channel] ?? 0;
    const centre = FC.RC_CONFIG?.rc_center || 1500;
    const span = FC.RC_CONFIG?.rc_deflection || 500;
    const known = raw > 0;
    const f = known ? Math.max(-1, Math.min(1, (raw - centre) / span)) : 0;
    return {
      channel,
      raw,
      known,
      f,
      state: !known
        ? "none"
        : f <= -AT_END
          ? "left"
          : f >= AT_END
            ? "right"
            : "mid",
    };
  }

  let readings = $derived(FUNCTIONS.map((fn, i) => ({ ...fn, ...reading(i) })));
  let allLeft = $derived(readings.every((r) => r.state === "left"));
  let anyRight = $derived(readings.some((r) => r.state === "right"));
</script>

<div class="intro">
  <ReceiverArt />
  <p>{$i18n.t("setupWizardReceiverIntro")}</p>
</div>

{#if !loading}
  <!-- 1 + 2: how the receiver is connected. -->
  <section class="card">
    <h3><span class="num">1</span>{$i18n.t("setupWizardReceiverPortTitle")}</h3>
    <div class="ports" role="radiogroup">
      {#each ports as port (port.identifier)}
        {@const isRx = port === rxPort}
        {@const free = maskOf(port) === 0}
        <button
          type="button"
          role="radio"
          aria-checked={isRx}
          class={["port", isRx && "selected"]}
          disabled={!isRx && !free}
          onclick={() => choosePort(port)}
        >
          <span class="port-name">
            {portName(port)}
            {#if isRx}
              <i class="fas fa-check-circle" aria-hidden="true"></i>
            {/if}
          </span>
          <span class="port-use">
            {#if isRx}
              {$i18n.t("setupWizardReceiverPortReceiver")}
            {:else if free}
              {$i18n.t("setupWizardReceiverPortFree")}
            {:else}
              {$i18n.t("setupWizardReceiverPortInUse", { 1: usedFor(port) })}
            {/if}
          </span>
        </button>
      {/each}
    </div>
    {#if !rxPort}
      <p class="muted">{$i18n.t("setupWizardReceiverPortNone")}</p>
    {/if}

    <h3>
      <span class="num">2</span>{$i18n.t("setupWizardReceiverProtocolTitle")}
    </h3>
    <div class="protocol">
      <select
        value={protocol?.id ?? ""}
        onchange={(e) => chooseProtocol(e.target.value)}
      >
        {#if !protocol}
          <option value="" disabled>
            {$i18n.t("setupWizardReceiverProtocolPick")}
          </option>
        {/if}
        {#each PROTOCOLS as proto (proto.name)}
          <option value={proto.id}>{proto.name}</option>
        {/each}
      </select>
      <span class="muted">{$i18n.t("setupWizardReceiverProtocolHelp")}</span>
    </div>
    {#if isCrsfReceiver()}
      <WarningNote message="receiverElrsFullResWarning" />
    {/if}

    {#if connChanged}
      <div class="actions">
        <span>{$i18n.t("setupWizardRebootNeeded")}</span>
        <button class="btn primary" onclick={wiz.saveAndReboot}>
          {$i18n.t("buttonSaveReboot")}
        </button>
      </div>
    {/if}
  </section>

  <!-- 3: is anything arriving? -->
  <section class="card">
    <h3>
      <span class="num">3</span>{$i18n.t("setupWizardReceiverSignalTitle")}
      {#if !connChanged && linkUp !== null}
        <span class={["badge", linkUp ? "good" : "bad"]}>
          <i
            class={["fas", linkUp ? "fa-check" : "fa-times"]}
            aria-hidden="true"
          ></i>
          {linkUp
            ? $i18n.t("setupWizardReceiverLinkUp")
            : $i18n.t("setupWizardReceiverLinkDown")}
        </span>
      {/if}
    </h3>
    <p>{$i18n.t("setupWizardReceiverSignalText")}</p>
    <div class="actions">
      <button
        class="btn"
        disabled={!canDetect || detecting}
        onclick={detectWiring}
      >
        {$i18n.t("receiverWiringDetectButton")}
      </button>
      {#if connChanged}
        <span class="muted">{$i18n.t("setupWizardReceiverSaveFirst")}</span>
      {/if}
    </div>
  </section>

  <!-- 4: channel order and direction. -->
  <section class="card">
    <h3>
      <span class="num">4</span>{$i18n.t("setupWizardReceiverChannelsTitle")}
    </h3>
    <div class="orders" role="radiogroup">
      {#each ORDERS as o (o.key)}
        <button
          type="button"
          role="radio"
          aria-checked={order === o.key}
          class={["order", order === o.key && "selected"]}
          onclick={() => chooseOrder(o)}
        >
          <span class="order-name">
            {$i18n.t(`setupWizardReceiverOrder_${o.key}`)}
            {#if order === o.key}
              <i class="fas fa-check-circle" aria-hidden="true"></i>
            {/if}
          </span>
          <span class="code">{orderLabel(o.map).slice(0, 4)}</span>
          <span class="muted"
            >{$i18n.t(`setupWizardReceiverOrderHelp_${o.key}`)}</span
          >
        </button>
      {/each}
      <!-- Custom: detected from the sticks, or set on the Receiver tab. -->
      <button
        type="button"
        role="radio"
        aria-checked={!order}
        class={["order", !order && !orderDetect && "selected"]}
        disabled={!hasChannels || !!orderDetect}
        onclick={startOrderDetect}
      >
        <span class="order-name">
          {$i18n.t("setupWizardReceiverOrder_custom")}
          {#if !order && !orderDetect}
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          {/if}
        </span>
        {#if !order && FC.RC_MAP}
          <span class="code">{orderLabel(FC.RC_MAP).slice(0, 4)}</span>
        {/if}
        <span class="muted"
          >{$i18n.t("setupWizardReceiverOrderHelp_custom")}</span
        >
      </button>
    </div>

    {#if orderDetect}
      {@const active = orderDetect.found.length}
      <div class="detect" aria-live="polite">
        <strong>{$i18n.t("setupWizardReceiverDetectTitle")}</strong>
        <ol class="detect-steps">
          {#each DETECT_ORDER as fn, i (fn.key)}
            <li class={[i < active && "done", i === active && "active"]}>
              <StickIcon x={fn.move.x} y={fn.move.y} />
              <span class="detect-text">
                {$i18n.t(`setupWizardReceiverDetect_${fn.key}`)}
              </span>
              <span class="detect-state">
                {#if i < active}
                  <i class="fas fa-check" aria-hidden="true"></i>
                  {$i18n.t("setupWizardReceiverChannel", {
                    1: orderDetect.found[i] + 1,
                  })}
                {:else if i === active}
                  {$i18n.t("setupWizardReceiverDetectWaiting")}
                {/if}
              </span>
            </li>
          {/each}
        </ol>
        <div class="actions">
          <button class="btn" onclick={startOrderDetect}>
            {$i18n.t("setupWizardReceiverDetectRestart")}
          </button>
          <button class="btn" onclick={() => (orderDetect = null)}>
            {$i18n.t("cancel")}
          </button>
        </div>
      </div>
    {/if}

    <div class="check">
      <SticksBottomLeft />
      <div class="check-text">
        <strong>{$i18n.t("setupWizardReceiverCheckTitle")}</strong>
        <span>{$i18n.t("setupWizardReceiverCheckText")}</span>
      </div>
    </div>

    <div class="bars">
      {#each readings as r (r.key)}
        <span class="bar-name">{$i18n.t(r.label)}</span>
        <span class="bar-channel">
          {$i18n.t("setupWizardReceiverChannel", { 1: r.channel + 1 })}
        </span>
        <span class={["track", r.state]} aria-hidden="true">
          <span class="centre"></span>
          <span
            class="fill"
            style:left={r.f >= 0 ? "50%" : `${50 + r.f * 50}%`}
            style:width="{Math.abs(r.f) * 50}%"
          ></span>
        </span>
        <span class={["bar-state", r.state]}>
          {#if r.state === "left"}
            <i class="fas fa-check" aria-hidden="true"></i>
          {:else if r.state === "right"}
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          {/if}
          {r.known ? r.raw : "–"}
        </span>
      {/each}
    </div>

    {#if allLeft}
      <p class="good-text">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        {$i18n.t("setupWizardReceiverCheckOk")}
      </p>
    {:else if anyRight}
      <div class="note">{$i18n.t("setupWizardReceiverCheckReversed")}</div>
    {/if}
    <p class="muted">{$i18n.t("setupWizardReceiverCheckWrongBar")}</p>
  </section>
{/if}

<div>
  <button class="btn" onclick={() => wiz.openTab("receiver")}>
    {$i18n.t("setupWizardOpenReceiver")}
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

  //// Numbered cards, in the order the receiver is set up.

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

  //// Tiles: ports and channel orders.

  .ports {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }

  .orders {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .port,
  .order {
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

  .port-name,
  .order-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
  }

  // The order as letters, e.g. AETR.
  .code {
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--color-accent-500);
  }

  //// Order detection, one stick at a time.

  .detect {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--color-accent-500);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
  }

  .detect-steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      opacity: 0.5;

      &.active {
        opacity: 1;
        background-color: var(--color-accent-soft);
        font-weight: 600;
      }

      &.done {
        opacity: 1;
      }
    }
  }

  .detect-text {
    flex: 1;
  }

  .detect-state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;

    .done & {
      color: var(--color-status-good);
    }

    .active & {
      animation: waiting 0.8s ease-in-out infinite alternate;
    }
  }

  @keyframes waiting {
    from {
      opacity: 0.4;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .detect-state {
      animation: none !important;
    }
  }

  .port-use {
    color: var(--color-text-soft);
    font-size: 0.85em;
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

  //// Channel check.

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
  }

  .check-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 260px;
  }

  .bars {
    display: grid;
    grid-template-columns: auto auto minmax(120px, 1fr) 7ch;
    align-items: center;
    gap: 10px 12px;
  }

  .bar-name {
    font-weight: 600;
  }

  .bar-channel {
    color: var(--color-text-soft);
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }

  .track {
    position: relative;
    display: block;
    height: 12px;
    border-radius: var(--radius-pill);
    background-color: var(--color-border-soft);
    overflow: hidden;

    &.left .fill {
      background-color: var(--color-status-good);
    }

    &.right .fill {
      background-color: var(--color-status-bad);
    }
  }

  .centre {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background-color: var(--color-text-soft);
  }

  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: var(--color-accent-500);
    transition:
      left 0.1s linear,
      width 0.1s linear;
  }

  .bar-state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;

    &.left {
      color: var(--color-status-good);
    }

    &.right {
      color: var(--color-status-bad);
    }
  }

  .note {
    padding: 10px 14px;
    border: 1px solid var(--color-status-bad);
    border-radius: var(--radius-sm);
    background-color: color-mix(
      in srgb,
      var(--color-status-bad) 8%,
      transparent
    );
  }

  .good-text {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-status-good);
    font-weight: 600;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
