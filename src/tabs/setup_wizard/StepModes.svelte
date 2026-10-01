<script>
  import { getContext, onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { bit_check } from "@/js/serial_backend";

  import { rangeForSwitch } from "./modeRanges.js";

  // Click Assign, flick the switch: the wizard sees which AUX channel moved
  // and where it went, and writes a mode range for that position.
  const wiz = getContext("setupWizard");

  // Permanent box IDs (wingflight-firmware msp/msp_box.c) and the box names
  // the FC reports for them, before and after the firmware#182 rename.
  const MODES = [
    { id: 0, key: "arm", names: ["ARM"] },
    { id: 12, key: "setup", names: ["SETUP", "PASSTHROUGH"] },
    { id: 59, key: "gyroOff", names: ["GYRO OFF", "MANUAL"] },
  ];

  const AUX_OFFSET = 4; // AUX1 is the fifth channel
  const MOVE_US = 300; // a switch, not stick noise
  const SETTLE_MS = 400;
  const LISTEN_MS = 15000;
  const EMPTY_RANGE = { start: 1500, end: 1500 };

  let listening = $state(null);
  let baseline = [];
  let detectTimer;
  let settleTimer;
  let poller;
  let polling = false;

  onMount(() => {
    poller = setInterval(async () => {
      if (polling) return;
      polling = true;
      await MSP.promise(MSPCodes.MSP_RC);
      polling = false;
      if (listening !== null) detect();
    }, 100);
  });

  onDestroy(() => {
    clearInterval(poller);
    clearTimeout(detectTimer);
    clearTimeout(settleTimer);
  });

  function auxValues() {
    return FC.RC.channels.slice(AUX_OFFSET, FC.RC.active_channels);
  }

  function rangeIndex(mode) {
    return FC.MODE_RANGES.findIndex(
      (r) => r.id === mode.id && r.range.start < r.range.end,
    );
  }

  function assignment(mode) {
    const index = rangeIndex(mode);
    return index < 0 ? null : FC.MODE_RANGES[index];
  }

  function isActive(mode) {
    const index = FC.AUX_CONFIG.findIndex((n) => mode.names.includes(n));
    return index >= 0 && bit_check(FC.CONFIG.mode, index);
  }

  function listen(mode) {
    clearTimeout(detectTimer);
    clearTimeout(settleTimer);
    settleTimer = null;
    baseline = auxValues();
    listening = mode.id;
    detectTimer = setTimeout(() => (listening = null), LISTEN_MS);
  }

  function cancel() {
    clearTimeout(detectTimer);
    clearTimeout(settleTimer);
    settleTimer = null;
    listening = null;
  }

  // The channel that moved furthest from where it was when Assign was
  // clicked. Wait for it to settle, then take where it ended up.
  function detect() {
    if (settleTimer) return;
    const now = auxValues();
    let best = -1;
    let bestMove = MOVE_US;
    now.forEach((value, aux) => {
      const move = Math.abs(value - (baseline[aux] ?? value));
      if (move > bestMove) {
        best = aux;
        bestMove = move;
      }
    });
    if (best < 0) return;

    const modeId = listening;
    settleTimer = setTimeout(() => {
      settleTimer = null;
      const from = baseline[best];
      const to = auxValues()[best];
      cancel();
      if (Math.abs(to - from) > MOVE_US) {
        save(
          MODES.find((m) => m.id === modeId),
          best,
          from,
          to,
        );
      }
    }, SETTLE_MS);
  }

  async function writeSlot(index, id, auxChannelIndex, range) {
    FC.MODE_RANGES[index] = { id, auxChannelIndex, range };
    FC.MODE_RANGES_EXTRA[index] = {
      ...(FC.MODE_RANGES_EXTRA[index] ?? {}),
      id,
      modeLogic: 0,
      linkedTo: 0,
    };
    await new Promise((resolve) => mspHelper.sendModeRange(index, resolve));
    wiz.markChanged();
  }

  async function save(mode, aux, from, to) {
    let index = rangeIndex(mode);
    if (index < 0) {
      index = FC.MODE_RANGES.findIndex((r) => !(r.range.start < r.range.end));
    }
    if (index < 0) return;
    await writeSlot(index, mode.id, aux, rangeForSwitch(from, to));
  }

  async function remove(mode) {
    const index = rangeIndex(mode);
    if (index < 0) return;
    await writeSlot(index, 0, 0, { ...EMPTY_RANGE });
  }
</script>

<p>{$i18n.t("setupWizardModesIntro")}</p>

<ul class="modes">
  {#each MODES as mode (mode.id)}
    {@const range = assignment(mode)}
    <li class={listening === mode.id && "listening"}>
      <div class="text">
        <strong>{$i18n.t(`setupWizardModes_${mode.key}`)}</strong>
        <span class="muted">{$i18n.t(`setupWizardModesHelp_${mode.key}`)}</span>
      </div>
      <div class="state">
        {#if listening === mode.id}
          <span class="prompt">{$i18n.t("setupWizardModesFlick")}</span>
          <button class="btn" onclick={cancel}>
            {$i18n.t("setupWizardModesCancel")}
          </button>
        {:else if range}
          <span class="assigned">
            {$i18n.t("setupWizardModesRange", {
              1: range.auxChannelIndex + 1,
              2: range.range.start,
              3: range.range.end,
            })}
          </span>
          <span class={["live", isActive(mode) && "on"]}>
            {isActive(mode)
              ? $i18n.t("setupWizardModesOn")
              : $i18n.t("setupWizardModesOff")}
          </span>
          <button class="btn" onclick={() => listen(mode)}>
            {$i18n.t("setupWizardModesChange")}
          </button>
          <button class="btn" onclick={() => remove(mode)}>
            {$i18n.t("setupWizardModesRemove")}
          </button>
        {:else}
          <span class="muted">{$i18n.t("setupWizardModesNotAssigned")}</span>
          <button class="btn primary" onclick={() => listen(mode)}>
            {$i18n.t("setupWizardModesAssign")}
          </button>
        {/if}
      </div>
    </li>
  {/each}
</ul>

{#if assignment(MODES[0]) && isActive(MODES[0])}
  <div class="note">{$i18n.t("setupWizardModesArmOn")}</div>
{/if}

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

  .modes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 820px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);

      &.listening {
        border-color: var(--color-accent-500);
      }
    }
  }

  .text {
    display: flex;
    flex-direction: column;
    flex: 1 1 280px;
    min-width: 0;
  }

  .state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .prompt {
    font-weight: 600;
  }

  .assigned {
    font-variant-numeric: tabular-nums;
  }

  .live {
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    color: var(--color-text-soft);
    font-size: 0.9em;

    &.on {
      border-color: var(--color-status-good);
      color: var(--color-status-good);
      font-weight: 600;
    }
  }

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-status-bad);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
    font-weight: 600;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
