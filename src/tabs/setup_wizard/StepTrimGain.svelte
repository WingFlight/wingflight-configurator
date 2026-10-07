<script>
  import { getContext, onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import { resetToOff } from "@/tabs/adjustments/util.js";

  import AxisIcon from "./AxisIcon.svelte";
  import KnobArt from "./KnobArt.svelte";
  import TrimArt from "./TrimArt.svelte";
  import { movedChannel } from "./receiver.js";
  import {
    GAIN_MAX,
    GAIN_MIN,
    MASTER_GAIN,
    SERVO_TRIM,
    STEPPED_TRIM_STEP,
    TRIM_BUTTONS,
    buttonAt,
    channelOf,
    gainMode,
    gainRange,
    mappedValue,
    slotFor,
    steppedTrimRange,
    trimMode,
    trimRange,
  } from "./trimGain.js";

  // Each control is found by moving it: the AUX channel that clearly moves
  // most from where it was when Detect was clicked. Ranges are sent as soon
  // as they are set, so the knob and trims work on the bench straight away;
  // Save writes them to EEPROM.
  const wiz = getContext("setupWizard");

  const AXES = ["roll", "pitch", "yaw"];
  const AUX_OFFSET = 4; // AUX1 is the fifth channel
  const LISTEN_MS = 15000;
  // A trim button moves its channel a little at a time; a knob a long way.
  // A trim button on the shared trim channel jumps it at least 100 us.
  const MOVE_US = { trim: 40, buttons: 40, gain: 250 };

  let poller;
  let polling = false;
  let listening = $state(null); // { kind: "trim" | "gain", axis }
  let start = [];
  let peaks = [];
  let listenTimer;

  onMount(() => {
    poller = setInterval(async () => {
      if (polling) return;
      polling = true;
      await MSP.promise(MSPCodes.MSP_RC);
      polling = false;
      if (listening) detect();
    }, 100);
  });

  onDestroy(() => {
    clearInterval(poller);
    clearTimeout(listenTimer);
  });

  function auxValues() {
    return FC.RC.channels.slice(AUX_OFFSET, FC.RC.active_channels);
  }

  function auxValue(aux) {
    return aux === null ? null : (FC.RC.channels[AUX_OFFSET + aux] ?? null);
  }

  function listen(kind, axis = null) {
    clearTimeout(listenTimer);
    start = auxValues();
    peaks = start.map(() => 0);
    listening = { kind, axis };
    listenTimer = setTimeout(() => (listening = null), LISTEN_MS);
  }

  function cancel() {
    clearTimeout(listenTimer);
    listening = null;
  }

  function isListening(kind, axis = null) {
    return listening?.kind === kind && listening?.axis === axis;
  }

  async function detect() {
    const now = auxValues();
    peaks = peaks.map((p, i) =>
      Math.max(p, Math.abs((now[i] ?? 0) - (start[i] ?? 0))),
    );
    const aux = movedChannel(peaks, [], MOVE_US[listening.kind]);
    if (aux < 0) return;
    const { kind, axis } = listening;
    cancel();
    if (kind === "trim") {
      await writeRange(trimRange(axis, aux));
    } else if (kind === "buttons") {
      for (const a of AXES) await writeRange(steppedTrimRange(a, aux));
    } else if (axis) {
      await writeRange(gainRange(axis, aux));
    } else {
      for (const a of AXES) await writeRange(gainRange(a, aux));
    }
  }

  //// Adjustment slots.

  let ranges = $derived(FC.ADJUSTMENT_RANGES ?? []);
  let full = $state(false);

  async function writeRange(range) {
    const index = slotFor(FC.ADJUSTMENT_RANGES, range.adjFunction);
    if (index < 0) {
      full = true;
      return;
    }
    FC.ADJUSTMENT_RANGES[index] = range;
    await sendSlot(index);
  }

  async function removeFunction(adjFunction) {
    const index = FC.ADJUSTMENT_RANGES.findIndex(
      (r) => r?.adjFunction === adjFunction,
    );
    if (index < 0) return;
    resetToOff(FC.ADJUSTMENT_RANGES[index]);
    await sendSlot(index);
  }

  async function sendSlot(index) {
    await new Promise((resolve) =>
      mspHelper.sendAdjustmentRange(index, resolve),
    );
    wiz.markChanged();
  }

  function rangeOf(adjFunction) {
    return ranges.find((r) => r?.adjFunction === adjFunction) ?? null;
  }

  // Live value of a mapped range, from where its channel is now.
  function liveValue(adjFunction) {
    const range = rangeOf(adjFunction);
    const position = range ? auxValue(range.adjChannel) : null;
    return position ? mappedValue(range, position) : null;
  }

  //// Trim.

  let radio = $state(trimMode(FC.ADJUSTMENT_RANGES ?? []));

  async function chooseRadio(value) {
    if (radio === value) return;
    const was = radio;
    radio = value;
    cancel();
    // Trims from channels only make sense on a radio that can send them,
    // and stepped (buttons) and mapped (a channel each) ranges are set up
    // differently, so switching between them starts again from Detect.
    if (value === "other" || was !== null) {
      for (const a of AXES) await removeFunction(SERVO_TRIM[a]);
    }
  }

  // The shared trim channel, and the button it shows now.
  let buttonsChannel = $derived(channelOf(ranges, SERVO_TRIM.roll));
  let buttonsPosition = $derived(auxValue(buttonsChannel));
  let pressed = $derived(buttonAt(buttonsPosition));

  function buttonLabel(b) {
    return `${axisName(b.axis)} ${b.dir > 0 ? "+" : "−"}`;
  }

  //// Gain.

  let mode = $state(gainMode(FC.ADJUSTMENT_RANGES ?? []));

  async function chooseMode(value) {
    if (mode === value) return;
    cancel();
    const was = mode;
    mode = value;
    if (value === "none") {
      for (const a of AXES) await removeFunction(MASTER_GAIN[a]);
    } else if (value === "single" && was === "separate") {
      // Keep the roll knob for all three.
      const aux = channelOf(FC.ADJUSTMENT_RANGES, MASTER_GAIN.roll);
      if (aux !== null) {
        for (const a of AXES) await writeRange(gainRange(a, aux));
      }
    }
  }

  let singleChannel = $derived(channelOf(ranges, MASTER_GAIN.roll));

  //// Shared channels. Allowed (it is the user's radio), but flagged: two
  //// trims on one channel move together, and a trim or knob on a switch
  //// channel changes whenever that switch is flicked.

  function axisName(axis) {
    return $i18n.t(`setupWizardAxis_${axis}`);
  }

  let users = $derived.by(() => {
    const list = [];
    if (radio === "buttons") {
      list.push({
        key: "buttons",
        label: $i18n.t("setupWizardTrimButtonsUse"),
        aux: buttonsChannel,
      });
    } else if (radio === "programmable") {
      for (const axis of AXES) {
        list.push({
          key: `trim-${axis}`,
          label: $i18n.t("setupWizardTrimUse", { 1: axisName(axis) }),
          aux: channelOf(ranges, SERVO_TRIM[axis]),
        });
      }
    }
    if (mode === "single") {
      list.push({
        key: "gain",
        label: $i18n.t("setupWizardGainUse"),
        aux: singleChannel,
      });
    } else if (mode === "separate") {
      for (const axis of AXES) {
        list.push({
          key: `gain-${axis}`,
          label: $i18n.t("setupWizardGainAxisUse", { 1: axisName(axis) }),
          aux: channelOf(ranges, MASTER_GAIN[axis]),
        });
      }
    }
    (FC.MODE_RANGES ?? []).forEach((r, i) => {
      if (!(r.range.start < r.range.end)) return;
      const box = FC.AUX_CONFIG_IDS?.indexOf(r.id) ?? -1;
      list.push({
        key: `mode-${i}`,
        label: $i18n.t("setupWizardModeUse", {
          1: box >= 0 ? FC.AUX_CONFIG[box] : r.id,
        }),
        aux: r.auxChannelIndex,
      });
    });
    return list.filter((u) => u.aux !== null);
  });

  // The other things on the same channel as `key`, by name (each once).
  function sharedWith(key) {
    const own = users.find((u) => u.key === key);
    if (!own) return [];
    const labels = users
      .filter((u) => u.key !== key && u.aux === own.aux)
      .map((u) => u.label);
    return [...new Set(labels)];
  }
</script>

{#snippet channelRow(kind, axis, adjFunction, unit)}
  {@const aux = channelOf(ranges, adjFunction)}
  {@const value = liveValue(adjFunction)}
  {@const shared =
    aux === null ? [] : sharedWith(axis ? `${kind}-${axis}` : kind)}
  <li
    class={[
      "row",
      isListening(kind, axis) && "listening",
      shared.length > 0 && "shared",
    ]}
  >
    {#if axis}
      <AxisIcon {axis} size={28} />
      <span class="row-name">{$i18n.t(`setupWizardAxis_${axis}`)}</span>
    {:else}
      <span class="row-name">{$i18n.t("setupWizardGainAllAxes")}</span>
    {/if}
    <span class="row-state">
      {#if isListening(kind, axis)}
        <span class="prompt">
          {kind === "trim"
            ? $i18n.t("setupWizardTrimPress", {
                1: $i18n.t(`setupWizardAxis_${axis}`),
              })
            : $i18n.t("setupWizardGainTurn")}
        </span>
        <button class="btn" onclick={cancel}>{$i18n.t("cancel")}</button>
      {:else if aux !== null}
        <span class="assigned">
          {$i18n.t("setupWizardTrimGainChannel", { 1: aux + 5 })}
          {#if value !== null}
            <span class="value"
              >{value > 0 && unit === "µs" ? "+" : ""}{value}{unit}</span
            >
          {/if}
        </span>
        <button class="btn" onclick={() => listen(kind, axis)}>
          {$i18n.t("setupWizardModesChange")}
        </button>
      {:else}
        <span class="muted">{$i18n.t("setupWizardModesNotAssigned")}</span>
        <button class="btn" onclick={() => listen(kind, axis)}>
          {$i18n.t("setupWizardTrimGainDetect")}
        </button>
      {/if}
    </span>
    {#if shared.length > 0 && !isListening(kind, axis)}
      <span class="shared-text">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        {$i18n.t("setupWizardTrimGainShared", {
          1: aux + 5,
          2: shared.join(", "),
        })}
      </span>
    {/if}
  </li>
{/snippet}

<p>{$i18n.t("setupWizardTrimGainIntro")}</p>

{#if full}
  <div class="note">{$i18n.t("setupWizardTrimGainFull")}</div>
{/if}

<!-- Trim -->
<section class="card">
  <div class="card-head">
    <TrimArt />
    <div class="card-text">
      <h3>{$i18n.t("setupWizardTrimTitle")}</h3>
      <span class="muted">{$i18n.t("setupWizardTrimQuestion")}</span>
    </div>
  </div>

  <div class="tiles three" role="radiogroup">
    {#each ["buttons", "programmable", "other"] as value (value)}
      <button
        type="button"
        role="radio"
        aria-checked={radio === value}
        class={["tile", radio === value && "selected"]}
        onclick={() => chooseRadio(value)}
      >
        <span class="tile-name">
          {$i18n.t(`setupWizardTrimRadio_${value}`)}
          {#if radio === value}
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          {/if}
        </span>
        <span class="muted">{$i18n.t(`setupWizardTrimRadioHelp_${value}`)}</span
        >
      </button>
    {/each}
  </div>

  {#if radio === "buttons"}
    {@const shared = buttonsChannel === null ? [] : sharedWith("buttons")}
    <p>{$i18n.t("setupWizardTrimButtonsIntro", { 1: STEPPED_TRIM_STEP })}</p>
    <ol class="guide">
      <li>
        <div class="guide-text">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html $i18n.t("setupWizardTrimButtonsStep1")}
        </div>
        <img
          src="/images/setup_wizard/ethos_trims_page.png"
          alt={$i18n.t("setupWizardTrimButtonsImage1")}
        />
      </li>
      <li>
        <div class="guide-text">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html $i18n.t("setupWizardTrimButtonsStep2")}
        </div>
        <img
          src="/images/setup_wizard/ethos_stick_mix_trim_off.png"
          alt={$i18n.t("setupWizardTrimButtonsImage2")}
        />
      </li>
      <li>
        <div class="guide-text">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html $i18n.t("setupWizardTrimButtonsStep3")}
          <table class="weights">
            <thead>
              <tr>
                <th>{$i18n.t("setupWizardTrimButtonsButton")}</th>
                <th>{$i18n.t("setupWizardTrimButtonsWeight")}</th>
                <th>{$i18n.t("setupWizardTrimButtonsTrims")}</th>
              </tr>
            </thead>
            <tbody>
              {#each [...TRIM_BUTTONS].reverse() as b (b.button)}
                <tr>
                  <td>{b.button}</td>
                  <td>{b.weight}%</td>
                  <td>{buttonLabel(b)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <span class="muted">{$i18n.t("setupWizardTrimButtonsLayout")}</span>
        </div>
        <img
          class="tall"
          src="/images/setup_wizard/ethos_trim_mix.png"
          alt={$i18n.t("setupWizardTrimButtonsImage3")}
        />
      </li>
      <li>
        <div class="guide-text">{$i18n.t("setupWizardTrimButtonsStep4")}</div>
      </li>
    </ol>

    <ul class="rows">
      <li
        class={[
          "row",
          isListening("buttons") && "listening",
          shared.length > 0 && "shared",
        ]}
      >
        <span class="row-name">{$i18n.t("setupWizardTrimButtonsUse")}</span>
        <span class="row-state">
          {#if isListening("buttons")}
            <span class="prompt">{$i18n.t("setupWizardTrimButtonsPress")}</span>
            <button class="btn" onclick={cancel}>{$i18n.t("cancel")}</button>
          {:else if buttonsChannel !== null}
            <span class="assigned">
              {$i18n.t("setupWizardTrimGainChannel", { 1: buttonsChannel + 5 })}
            </span>
            <button class="btn" onclick={() => listen("buttons")}>
              {$i18n.t("setupWizardModesChange")}
            </button>
          {:else}
            <span class="muted">{$i18n.t("setupWizardModesNotAssigned")}</span>
            <button class="btn" onclick={() => listen("buttons")}>
              {$i18n.t("setupWizardTrimGainDetect")}
            </button>
          {/if}
        </span>
        {#if shared.length > 0 && !isListening("buttons")}
          <span class="shared-text">
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
            {$i18n.t("setupWizardTrimGainShared", {
              1: buttonsChannel + 5,
              2: shared.join(", "),
            })}
          </span>
        {/if}
      </li>
    </ul>

    {#if buttonsChannel !== null}
      <p class="muted">{$i18n.t("setupWizardTrimButtonsCheck")}</p>
      <div class="buttons-check">
        {#each [...TRIM_BUTTONS].reverse() as b (b.button)}
          <span class={["button-chip", pressed === b && "lit"]}>
            <span class="chip-button">{b.button}</span>
            <span class="chip-trim">{buttonLabel(b)}</span>
          </span>
        {/each}
      </div>
      {#if !pressed && buttonsPosition}
        <p class="muted">
          {$i18n.t("setupWizardTrimButtonsIdle", {
            1: buttonsChannel + 5,
            2: buttonsPosition,
          })}
        </p>
      {/if}
    {/if}
  {:else if radio === "programmable"}
    <p>{$i18n.t("setupWizardTrimProgrammable")}</p>
    <div class="note">{$i18n.t("setupWizardTrimSticksOff")}</div>
    <ul class="rows">
      {#each AXES as axis (axis)}
        {@render channelRow("trim", axis, SERVO_TRIM[axis], "µs")}
      {/each}
    </ul>
  {:else if radio === "other"}
    <p>{$i18n.t("setupWizardTrimAuto")}</p>
  {/if}
  {#if radio}
    <p class="muted">{$i18n.t("setupWizardTrimAutoEveryone")}</p>
  {/if}
</section>

<!-- Gain -->
<section class="card">
  <div class="card-head">
    <KnobArt
      value={liveValue(MASTER_GAIN.roll) ?? 100}
      min={GAIN_MIN}
      max={GAIN_MAX}
    />
    <div class="card-text">
      <h3>{$i18n.t("setupWizardGainTitle")}</h3>
      <span class="muted">{$i18n.t("setupWizardGainText")}</span>
    </div>
  </div>

  <div class="tiles three" role="radiogroup">
    {#each ["single", "separate", "none"] as value (value)}
      <button
        type="button"
        role="radio"
        aria-checked={mode === value}
        class={["tile", mode === value && "selected"]}
        onclick={() => chooseMode(value)}
      >
        <span class="tile-name">
          {$i18n.t(`setupWizardGainMode_${value}`)}
          {#if mode === value}
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          {/if}
        </span>
        {#if value === "single"}
          <span class="tag">{$i18n.t("setupWizardRecommended")}</span>
        {/if}
        <span class="muted">{$i18n.t(`setupWizardGainModeHelp_${value}`)}</span>
      </button>
    {/each}
  </div>

  {#if mode === "single"}
    <ul class="rows">
      {@render channelRow("gain", null, MASTER_GAIN.roll, "%")}
    </ul>
    {#if singleChannel !== null}
      <p class="muted">{$i18n.t("setupWizardGainCentre")}</p>
    {/if}
  {:else if mode === "separate"}
    <ul class="rows">
      {#each AXES as axis (axis)}
        {@render channelRow("gain", axis, MASTER_GAIN[axis], "%")}
      {/each}
    </ul>
    <p class="muted">{$i18n.t("setupWizardGainCentre")}</p>
  {/if}
</section>

<div>
  <button class="btn" onclick={() => wiz.openTab("adjustments")}>
    {$i18n.t("setupWizardOpenAdjustments")}
  </button>
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
  }

  .card-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 260px;
  }

  h3 {
    margin: 0;
    font-size: 1.05em;
    font-weight: 700;
  }

  //// Choice tiles.

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;

    &.three {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 12px 14px;
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

    &:hover {
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

    i {
      color: var(--color-accent-500);
    }
  }

  .tile-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
  }

  .tag {
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    background-color: var(--color-accent-500);
    color: var(--color-accent-fg);
    font-size: 0.75em;
    font-weight: 600;
  }

  //// Ethos trim buttons guide.

  .guide {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
    padding-left: 1.4em;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 10px 20px;
    }

    img {
      width: 300px;
      max-width: 100%;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-soft);
    }
  }

  .guide-text {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1 1 260px;
    max-width: 60ch;
  }

  .weights {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;

    th,
    td {
      padding: 3px 14px 3px 0;
      text-align: left;
    }

    th {
      font-weight: 600;
      color: var(--color-text-soft);
    }
  }

  .buttons-check {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .button-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 6.5em;
    padding: 6px 10px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed);

    &.lit {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }
  }

  .chip-button {
    font-weight: 700;
  }

  .chip-trim {
    color: var(--color-text-soft);
    font-size: 0.85em;
  }

  //// One row per control.

  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 12px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    transition: border-color var(--animation-speed);

    &.listening {
      border-color: var(--color-accent-500);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }

    &.shared:not(.listening) {
      border-color: var(--color-yellow-500);
    }
  }

  // Full width, under the row's name and channel.
  .shared-text {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-basis: 100%;
    color: var(--color-yellow-500);
    font-size: 0.85em;
    font-weight: 600;
  }

  .row-name {
    min-width: 6em;
    font-weight: 600;
  }

  .row-state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-left: auto;
  }

  .assigned {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-variant-numeric: tabular-nums;
  }

  .value {
    min-width: 5ch;
    padding: 1px 8px;
    border-radius: var(--radius-sm);
    background-color: var(--color-accent-soft);
    color: var(--color-accent-500);
    font-weight: 700;
    text-align: center;
  }

  .prompt {
    font-weight: 600;
    animation: waiting 0.8s ease-in-out infinite alternate;
  }

  @keyframes waiting {
    from {
      opacity: 0.45;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .prompt {
      animation: none;
    }
  }

  .note {
    padding: 10px 14px;
    border: 1px solid var(--color-yellow-500);
    border-radius: var(--radius-sm);
    background-color: color-mix(
      in srgb,
      var(--color-yellow-500) 10%,
      transparent
    );
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
