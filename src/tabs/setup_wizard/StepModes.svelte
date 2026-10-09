<script>
  import { getContext, onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { bit_check } from "@/js/serial_backend";

  import { rangeForSwitch } from "./modeRanges.js";
  import ModeRangeBar from "./ModeRangeBar.svelte";
  import SwitchFlick from "./SwitchFlick.svelte";

  // Click Assign, flick the switch: the wizard sees which AUX channel moved
  // and where it went, and writes a mode range for that position.
  const wiz = getContext("setupWizard");

  // Permanent box IDs (wingflight-firmware msp/msp_box.c) and the box names
  // the FC reports for them, before and after the firmware#182 rename. ARM
  // is the only one the model can't fly without; the rest are optional,
  // flight modes first and the PASSTHROUGH bench tool last. ATT HOLD and TRAINER
  // need an accelerometer, so the FC only reports them on a board with one.
  const MODES = [
    { id: 0, key: "arm", names: ["ARM"], icon: "fa-power-off", required: true },
    {
      id: 59,
      key: "manual",
      names: ["MANUAL", "GYRO OFF"],
      icon: "fa-hand-paper",
    },
    { id: 6, key: "attHold", names: ["ATT HOLD"], icon: "fa-lock" },
    { id: 47, key: "trainer", names: ["TRAINER"], icon: "fa-graduation-cap" },
    // See the Trim and gain step.
    { id: 60, key: "autoTrim", names: ["AUTO TRIM"], icon: "fa-crosshairs" },
    {
      id: 12,
      key: "passthrough",
      names: ["PASSTHROUGH", "SETUP"],
      icon: "fa-tools",
    },
  ];

  // Only the modes this FC offers.
  let offered = $derived(
    MODES.filter((m) => FC.AUX_CONFIG.some((name) => m.names.includes(name))),
  );

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

  // Where an AUX channel is now (us), for the range bar.
  function auxValue(auxChannelIndex) {
    return FC.RC.channels[AUX_OFFSET + auxChannelIndex] ?? null;
  }

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

  function switchInRange(range) {
    if (!range) return false;
    const value = auxValue(range.auxChannelIndex);
    return value >= range.range.start && value <= range.range.end;
  }

  function displayActive(mode, range) {
    // ARM cannot become truly active while MSP is connected, so confirm it
    // from the detected switch direction/range instead.
    return mode.id === 0 ? switchInRange(range) : isActive(mode);
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

{#snippet modeRow(mode)}
  {@const range = assignment(mode)}
  {@const active = displayActive(mode, range)}
  <li
    class={[
      listening === mode.id && "listening",
      range && "assigned-mode",
      range && active && "active",
    ]}
  >
    <span class="mode-icon">
      <i class={["fas", mode.icon]} aria-hidden="true"></i>
    </span>
    <div class="text">
      <span class="mode-name">
        {$i18n.t(`setupWizardModes_${mode.key}`)}
        <span class={["tag", mode.required && "required"]}>
          {mode.required
            ? $i18n.t("setupWizardModesRequired")
            : $i18n.t("setupWizardModesOptional")}
        </span>
      </span>
      <span class="muted">{$i18n.t(`setupWizardModesHelp_${mode.key}`)}</span>
    </div>
    <div class="state">
      {#if listening === mode.id}
        <SwitchFlick />
        <span class="prompt">{$i18n.t("setupWizardModesFlick")}</span>
        <button class="btn" onclick={cancel}>
          {$i18n.t("setupWizardModesCancel")}
        </button>
      {:else if range}
        <span class="assigned">
          <ModeRangeBar
            start={range.range.start}
            end={range.range.end}
            value={auxValue(range.auxChannelIndex)}
            {active}
          />
          <span class="range-text">
            {$i18n.t("setupWizardModesRange", {
              1: range.auxChannelIndex + 1,
              2: range.range.start,
              3: range.range.end,
            })}
          </span>
        </span>
        <span class={["live", active && "on"]}>
          {active
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
        <button
          class={["btn", mode.required && "primary"]}
          onclick={() => listen(mode)}
        >
          {$i18n.t("setupWizardModesAssign")}
        </button>
      {/if}
    </div>
  </li>
{/snippet}

<p>{$i18n.t("setupWizardModesIntro")}</p>

<h3 class="group">{$i18n.t("setupWizardModesGroupRequired")}</h3>
<ul class="modes">
  {#each offered.filter((m) => m.required) as mode (mode.id)}
    {@render modeRow(mode)}
  {/each}
</ul>

{#if !assignment(MODES[0])}
  <div class="note warn">{$i18n.t("setupWizardModesArmMissing")}</div>
{:else if displayActive(MODES[0], assignment(MODES[0]))}
  <div class="note warn">{$i18n.t("setupWizardModesArmOn")}</div>
{/if}

<h3 class="group">{$i18n.t("setupWizardModesGroupOptional")}</h3>
<p class="hint">{$i18n.t("setupWizardModesOptionalHint")}</p>
<ul class="modes">
  {#each offered.filter((m) => !m.required) as mode (mode.id)}
    {@render modeRow(mode)}
  {/each}
</ul>

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
    gap: 10px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
      padding: 12px 16px;
      border: 1px solid var(--color-border-soft);
      border-radius: var(--radius-md);
      background-color: var(--color-surface-sunken);
      transition:
        border-color var(--animation-speed),
        box-shadow var(--animation-speed);

      &.listening {
        border-color: var(--color-accent-500);
        box-shadow: inset 4px 0 0 var(--color-accent-500);
      }

      &.active {
        border-color: var(--color-status-good);
      }
    }
  }

  .mode-icon {
    flex: 0 0 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-muted);
    font-size: 1.1em;
    transition:
      background-color var(--animation-speed),
      color var(--animation-speed);

    .assigned-mode & {
      border-color: var(--color-accent-500);
      color: var(--color-accent-500);
    }

    .active & {
      border-color: var(--color-status-good);
      background-color: var(--color-status-good);
      color: #fff;
    }
  }

  .mode-name {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }

  // Group headings sit close to their list (the step body spaces its
  // children 20px apart).
  .group {
    margin: 8px 0 -10px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-soft);
  }

  .hint {
    margin-bottom: -8px;
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .tag {
    padding: 0 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-soft);
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;

    &.required {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-500);
      color: var(--color-accent-fg);
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
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }

  .range-text {
    color: var(--color-text-soft);
    font-size: 0.8em;
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
    padding: 10px 14px;
    border-left: 4px solid var(--color-status-bad);
    background-color: var(--color-surface-sunken);
    border-radius: var(--radius-xs);
    max-width: 70ch;
    font-weight: 600;

    &.warn {
      border-left-color: var(--color-yellow-500);
    }
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
