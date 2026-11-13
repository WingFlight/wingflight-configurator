<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { reinitialiseConnection } from "@/js/serial_backend";
  import {
    clampServoConfig,
    servoSignalRange,
    servoTravelLimited,
    servoUsableTravel,
  } from "@/js/servoLimits.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Switch from "@/components/Switch.svelte";

  import ServoConfigTable from "./ServoConfigTable.svelte";
  import ServoOverrideTable from "./ServoOverrideTable.svelte";

  // A servo is a servo: servo N is sent on PWM output N where the board has
  // one, and on channel N of a bus output (SBUS, F.Bus) when one is set up.
  // The FC lists the servos in use, the larger of the two counts.

  // Bus output channel counts: wingflight-firmware's sbus_out_channels /
  // fbus_master_channels, carried in MSP_MIXER_CONFIG.
  const SBUS_OUT_CHANNEL_OPTIONS = [8, 12, 16];
  const FBUS_OUT_CHANNEL_OPTIONS = [8, 12, 16, 24];

  let loading = $state(true);
  let needReboot = $state(false);
  let initialConfig = $state(null);
  // The output options (PWM rate, bus output channel counts) live on
  // FC.MIXER_CONFIG, not FC.SERVO_CONFIG, so they fall outside the diff
  // below -- tracked separately so they take part in the same
  // dirty/Save/Revert cycle as everything else on this tab.
  let initialBusOutChannels = $state(null);
  // Saved trims (FC.SERVO_SAVED_TRIM) are also outside FC.SERVO_CONFIG, and
  // can change from the FC side too (a Stepped ServoTrim adjustment on the
  // bench), so they get the same dirty/Save/Revert treatment.
  let initialTrims = $state(null);
  let poller;
  let adjustmentPoller;

  let overrideEnabled = $state(false);

  // Diff-based (mirrors Profiles.svelte) rather than a manual dirty=true
  // flag, so Save also enables when a change comes from the FC side (on
  // firmware without saved trims, a Stepped ServoTrim adjustment moves Mid)
  // -- not just on direct edits.
  let changes = $derived.by(() => {
    if (!initialConfig) {
      return [];
    }

    // initialConfig can hold more servos than are in use now, after a bus
    // channel count was lowered (see reloadServoLists()).
    return diff(
      initialConfig.slice(0, FC.SERVO_CONFIG.length),
      $state.snapshot(FC.SERVO_CONFIG),
    );
  });

  let busOutChannelsDirty = $derived(
    initialBusOutChannels !== null &&
      (FC.MIXER_CONFIG.sbus_out_channels !== initialBusOutChannels.sbus ||
        FC.MIXER_CONFIG.fbus_master_channels !== initialBusOutChannels.fbus ||
        FC.MIXER_CONFIG.servo_pwm_rate !== initialBusOutChannels.pwmRate),
  );

  // Firmware with saved trims keeps every kind of trim apart from Mid.
  let savedTrimSupported = $derived(Array.isArray(FC.SERVO_SAVED_TRIM));

  let trimsDirty = $derived(
    initialTrims !== null &&
      savedTrimSupported &&
      FC.SERVO_SAVED_TRIM.some((trim, i) => trim !== initialTrims[i]),
  );

  let dirty = $derived(changes.length > 0 || busOutChannelsDirty || trimsDirty);

  let hasSbusOut = $derived(
    FC.SERIAL_CONFIG.ports.some((port) => port.functions.includes("SBUS_OUT")),
  );
  let hasFbusOut = $derived(
    FC.SERIAL_CONFIG.ports.some((port) => port.functions.includes("FBUS_OUT")),
  );
  let hasFbusOrSbus = $derived(hasSbusOut || hasFbusOut);

  // Servos the configured bus outputs send. SBUS and F.Bus output can run at
  // the same time, and servo N is channel N on both, so it's the larger of
  // the two. A 16-channel frame also has two digital channels, taken from
  // servos 17 and 18 (busOutServoCount() in the firmware's pg/bus_servo.c).
  let busServoCount = $derived.by(() => {
    let count = 0;
    if (hasFbusOut) {
      count = Math.max(count, FC.MIXER_CONFIG.fbus_master_channels);
    }
    if (hasSbusOut) {
      count = Math.max(count, Math.min(FC.MIXER_CONFIG.sbus_out_channels, 16));
    }
    return count === 16 ? 18 : count;
  });
  let busActive = $derived(hasFbusOrSbus);

  // Servos with a PWM output on this board, servo 1 up to this: the count in
  // MSP2_WING_SERVO_TIMING.
  let pwmServoCount = $derived((FC.SERVO_TIMING ?? []).length);

  // The lists are read one after another, so while the number of servos in
  // use is changing they differ in length for a moment. A servo is listed
  // once every list has it: its Trim field can't bind to a value that hasn't
  // arrived yet.
  let listedServoCount = $derived(
    Math.min(
      FC.SERVO_CONFIG.length,
      savedTrimSupported ? FC.SERVO_SAVED_TRIM.length : Infinity,
    ),
  );

  let servos = $derived.by(() => {
    const list = [];
    for (let index = 0; index < listedServoCount; index++) {
      const hasPwm = index < pwmServoCount;
      list.push({
        index,
        hasPwm,
        hasBus: busActive && index < busServoCount,
        label: `${index + 1}`,
        mspIndex: index,
      });
    }
    return list;
  });

  // Where the servos come out, when a bus output is in use: the bus sends
  // every servo up to its channel count, and the first ones are on the PWM
  // outputs as well. (A board has at most 8 PWM outputs and a bus at least 8
  // channels, so no servo is on a PWM output only.)
  let outputNotes = $derived.by(() => {
    if (!busActive || servos.length === 0) {
      return [];
    }
    const busChannels = busServoCount === 18 ? 16 : busServoCount;
    const notes = [$i18n.t("servoOutputsBus", { 1: busChannels })];
    if (pwmServoCount > 0) {
      notes.push($i18n.t("servoOutputsPwm", { 1: pwmServoCount }));
    }
    if (busServoCount === 18) {
      notes.push($i18n.t("servoOutputsBusDigital"));
    }
    return notes;
  });

  // Unusual-value warning for Scale. Min/Max aren't judged here: they are
  // hard stops found on the model (the setup wizard's Limits step), and
  // travelLimitNotes() covers travel the signal range cuts short.
  const SCALE_USUAL = { min: 300, max: 750, usual: 500 };

  function servoTypeNotes(servo, label) {
    const scale = SCALE_USUAL;
    if (
      servo.rneg >= scale.min &&
      servo.rneg <= scale.max &&
      servo.rpos >= scale.min &&
      servo.rpos <= scale.max
    ) {
      return [];
    }
    return [
      $i18n.t("servoScaleUnusualWarning", {
        1: label,
        4: servo.rneg,
        5: servo.rpos,
        6: scale.usual,
      }),
    ];
  }

  let typeNotes = $derived.by(() => {
    const notes = [];
    for (let index = 0; index < FC.SERVO_CONFIG.length; index++) {
      const servo = FC.SERVO_CONFIG[index];
      if (!servo) continue;
      notes.push(...servoTypeNotes(servo, `${index + 1}`));
    }
    return notes;
  });

  // Servos whose Min/Max the output can't fully use at their center, because
  // center + travel would leave the signal range.
  function travelLimitNotes(servos) {
    return servos.flatMap((servo) => {
      const config = FC.SERVO_CONFIG[servo.index];
      if (!config) return [];
      const limited = servoTravelLimited(config);
      const usable = servoUsableTravel(config);
      const signal = servoSignalRange();
      const notes = [];
      if (limited.max) {
        notes.push(
          $i18n.t("servoTravelLimitedMaxWarning", {
            1: servo.label,
            2: config.mid,
            3: usable.max,
            4: signal.max,
          }),
        );
      }
      if (limited.min) {
        notes.push(
          $i18n.t("servoTravelLimitedMinWarning", {
            1: servo.label,
            2: config.mid,
            3: usable.min,
            4: signal.min,
          }),
        );
      }
      return notes;
    });
  }

  let limitNotes = $derived(travelLimitNotes(servos));

  let showToolbar = $derived(!loading && dirty);

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG);
    await MSP.promise(MSPCodes.MSP_RC);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_RULES);
    // Axis Throw, for the full-stick travel shown in the Signal column.
    await MSP.promise(MSPCodes.MSP_MIXER_INPUTS);
    await MSP.promise(MSPCodes.MSP_ADJUSTMENT_RANGES);
    await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
    // Firmware without it answers "unsupported" and leaves this null; the
    // rates are then shown as set, with no timer grouping.
    FC.SERVO_TIMING = null;
    await MSP.promise(MSPCodes.MSP2_WING_SERVO_TIMING);
    await pollRuntimeTrim();
    // Read-only here (edited on the Curves tab) - just for the balance
    // curve indicator badge in ServoConfigTable. Not guaranteed populated
    // otherwise if this tab is visited before Curves.
    await MSP.promise(MSPCodes.MSP_SERVO_CURVES);
    await MSP.promise(MSPCodes.MSP_SERVO_OVERRIDE);
    await MSP.promise(MSPCodes.MSP_SERVO);

    initialConfig = $state.snapshot(FC.SERVO_CONFIG);
    initialBusOutChannels = snapshotBusOutChannels();
    initialTrims = snapshotTrims();
    overrideEnabled = servos.some((servo) => {
      const raw = FC.SERVO_OVERRIDE[servo.mspIndex];
      return raw >= -2000 && raw <= 2000;
    });
    loading = false;

    poller = setInterval(() => {
      MSP.send_message(MSPCodes.MSP_SERVO);
    }, 100);

    // Keeps AUX channel positions and the trims fresh, same 250ms cadence as
    // Profiles.svelte's adjustment poller. On firmware without saved trims a
    // Stepped ServoTrim adjustment moves Mid instead, so the servo configs
    // are polled too.
    adjustmentPoller = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_RC);
      if (!savedTrimSupported) {
        await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
      }
      await pollRuntimeTrim();
    }, 250);
  });

  onDestroy(() => {
    clearInterval(poller);
    clearInterval(adjustmentPoller);
  });

  // Live trim from Mapped ServoTrim adjustments: runtime-only on the FC, so it
  // isn't in the servo config. The API version isn't bumped for this message, so
  // support is found by asking once: firmware without it answers "unsupported",
  // which leaves FC.SERVO_RUNTIME_TRIM null, and then it isn't asked again.
  let runtimeTrimSupported;

  async function pollRuntimeTrim() {
    if (runtimeTrimSupported === false) {
      return;
    }

    await MSP.promise(MSPCodes.MSP_SERVO_TRIM);
    runtimeTrimSupported = Array.isArray(FC.SERVO_RUNTIME_TRIM);
  }

  function onFieldChange(index) {
    mspHelper.sendServoConfig(index);
  }

  // Pushed live like onFieldChange; saved to EEPROM by onSave(). The FC
  // limits the trim, and the next poll shows the value it kept.
  function onTrimChange(index) {
    mspHelper.sendServoTrim(index);
  }

  function snapshotTrims() {
    return savedTrimSupported ? [...FC.SERVO_SAVED_TRIM] : null;
  }

  function hasTrims(servos) {
    return servos.some((servo) => FC.SERVO_SAVED_TRIM?.[servo.index]);
  }

  async function clearTrims(servos) {
    for (const servo of servos) {
      if (FC.SERVO_SAVED_TRIM[servo.index]) {
        FC.SERVO_SAVED_TRIM[servo.index] = 0;
        await mspHelper.sendServoTrim(servo.index);
      }
    }
  }

  // The servo stays where it is: the trim becomes part of Center (as far as
  // the signal range lets Center go) and what moved is taken off the trim.
  // Min/Max are offsets from Center, so the end stops move with it.
  async function trimsToCenter(servos) {
    for (const servo of servos) {
      const trim = FC.SERVO_SAVED_TRIM[servo.index];
      const config = FC.SERVO_CONFIG[servo.index];
      if (!trim || !config) continue;

      const mid = config.mid;
      config.mid += trim;
      clampServoConfig(config);
      FC.SERVO_SAVED_TRIM[servo.index] = trim - (config.mid - mid);

      await new Promise((resolve) =>
        mspHelper.sendServoConfig(servo.index, resolve),
      );
      await mspHelper.sendServoTrim(servo.index);
    }
  }

  // PWM update rate: one setting for every PWM servo output
  // (servo_pwm_rate), which the FC applies at boot. Offered as two choices;
  // a rate set to something else (from the CLI) is listed as it is.
  const PWM_RATE_STANDARD = 50;
  const PWM_RATE_HIGH_SPEED = 333;

  let pwmRateOptions = $derived.by(() => {
    const options = [
      { value: PWM_RATE_STANDARD, label: $i18n.t("servoPwmRateStandard") },
      { value: PWM_RATE_HIGH_SPEED, label: $i18n.t("servoPwmRateHighSpeed") },
    ];
    const rate = FC.MIXER_CONFIG.servo_pwm_rate;
    if (!options.some((option) => option.value === rate)) {
      options.push({
        value: rate,
        label: $i18n.t("servoPwmRateCustom", { 1: rate }),
      });
    }
    return options;
  });

  // Pushed to the FC live like the other fields, and saved by onSave().
  function onPwmRateChange() {
    // Back at the rate the FC booted with, there is nothing to reboot for.
    needReboot =
      FC.MIXER_CONFIG.servo_pwm_rate !== initialBusOutChannels?.pwmRate;
    mspHelper.sendMixerConfig();
  }

  function onToggleOverrideEnabled(checked) {
    overrideEnabled = checked;
    if (!checked) {
      // Every servo the FC has, not only the ones listed: an override left
      // on a servo that has dropped off the list would come back with it.
      mspHelper.resetServoOverrides();
      return;
    }
    for (const servo of servos) {
      FC.SERVO_OVERRIDE[servo.mspIndex] = 0;
      mspHelper.sendServoOverride(servo.mspIndex);
    }
  }

  // Pushed to the FC live like onFieldChange, and saved to EEPROM by
  // onSave(). The FC uses the new count from its next frame, and the servos
  // in use change with it, so the lists are read again.
  async function onBusOutChannelsChange() {
    await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    await reloadServoLists();
  }

  // Reads the servo lists again after the number of servos in use changed.
  // A servo that wasn't listed before starts from what the FC holds for it;
  // the ones already known keep their Revert values.
  async function reloadServoLists() {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
    await pollRuntimeTrim();
    await MSP.promise(MSPCodes.MSP_SERVO_CURVES);
    await MSP.promise(MSPCodes.MSP_SERVO_OVERRIDE);

    const config = $state.snapshot(FC.SERVO_CONFIG);
    if (initialConfig && config.length > initialConfig.length) {
      initialConfig = [...initialConfig, ...config.slice(initialConfig.length)];
    }
    const trims = snapshotTrims();
    if (initialTrims && trims && trims.length > initialTrims.length) {
      initialTrims = [...initialTrims, ...trims.slice(initialTrims.length)];
    }
  }

  function snapshotBusOutChannels() {
    return {
      sbus: FC.MIXER_CONFIG.sbus_out_channels,
      fbus: FC.MIXER_CONFIG.fbus_master_channels,
      pwmRate: FC.MIXER_CONFIG.servo_pwm_rate,
    };
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabServos"), "_system");
  }

  export async function onSave() {
    await new Promise((resolve) => mspHelper.sendServoConfigurations(resolve));
    // The bus channel counts were already pushed live by
    // onBusOutChannelsChange -- EEPROM_WRITE below persists them along with
    // everything else, no need to resend.
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    if (needReboot) {
      MSP.send_message(MSPCodes.MSP_SET_REBOOT);
      GUI.log($i18n.t("deviceRebooting"));
      reinitialiseConnection();
    }

    needReboot = false;
    initialConfig = $state.snapshot(FC.SERVO_CONFIG);
    initialBusOutChannels = snapshotBusOutChannels();
    initialTrims = snapshotTrims();
  }

  export async function onRevert() {
    const channelsChanged = busOutChannelsDirty;
    if (channelsChanged) {
      FC.MIXER_CONFIG.sbus_out_channels = initialBusOutChannels.sbus;
      FC.MIXER_CONFIG.fbus_master_channels = initialBusOutChannels.fbus;
      FC.MIXER_CONFIG.servo_pwm_rate = initialBusOutChannels.pwmRate;
      await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    }

    // Every servo this tab has shown, in use now or not: the FC takes a
    // setting for any of them.
    FC.SERVO_CONFIG = $state.snapshot(initialConfig);
    await new Promise((resolve) => mspHelper.sendServoConfigurations(resolve));

    if (initialTrims !== null && savedTrimSupported) {
      for (let i = 0; i < initialTrims.length; i++) {
        if (FC.SERVO_SAVED_TRIM[i] !== initialTrims[i]) {
          FC.SERVO_SAVED_TRIM[i] = initialTrims[i];
          await mspHelper.sendServoTrim(i);
        }
      }
    }

    // Back to the servos the FC has in use.
    await reloadServoLists();

    needReboot = false;
  }

  export function isDirty() {
    return dirty;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabServos")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet trimActions(servos)}
  {#if savedTrimSupported}
    <div class="trim-actions">
      <button
        class="btn"
        disabled={!hasTrims(servos)}
        onclick={() => clearTrims(servos)}
      >
        {$i18n.t("servoTrimClear")}
      </button>
      <button
        class="btn"
        disabled={!hasTrims(servos)}
        onclick={() => trimsToCenter(servos)}
      >
        {$i18n.t("servoTrimToCenter")}
      </button>
      <HelpIcon>{$i18n.t("servoTrimActionsHelp")}</HelpIcon>
    </div>
  {/if}
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>
    {needReboot ? $i18n.t("buttonSaveReboot") : $i18n.t("buttonSave")}
  </button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <Section label="servoConfiguration">
    {#if busActive || pwmServoCount > 0}
      <div class="bus-options">
        {#if pwmServoCount > 0}
          <select
            id="servo-pwm-rate"
            bind:value={FC.MIXER_CONFIG.servo_pwm_rate}
            onchange={onPwmRateChange}
          >
            {#each pwmRateOptions as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
          <label for="servo-pwm-rate">
            <strong>{$i18n.t("servoPwmRate")}</strong>
          </label>
          <span class="description">{$i18n.t("servoPwmRateHelp")}</span>
        {/if}
        {#if hasFbusOut}
          <select
            id="servo-fbus-out-channels"
            bind:value={FC.MIXER_CONFIG.fbus_master_channels}
            onchange={onBusOutChannelsChange}
          >
            {#each FBUS_OUT_CHANNEL_OPTIONS as count (count)}
              <option value={count}>{count}</option>
            {/each}
          </select>
          <label for="servo-fbus-out-channels">
            <strong>{$i18n.t("servoFbusOutChannels")}</strong>
          </label>
          <span class="description">{$i18n.t("servoFbusOutChannelsHelp")}</span>
        {/if}
        {#if hasSbusOut}
          <select
            id="servo-sbus-out-channels"
            bind:value={FC.MIXER_CONFIG.sbus_out_channels}
            onchange={onBusOutChannelsChange}
          >
            {#each SBUS_OUT_CHANNEL_OPTIONS as count (count)}
              <option value={count}>{count}</option>
            {/each}
          </select>
          <label for="servo-sbus-out-channels">
            <strong>{$i18n.t("servoSbusOutChannels")}</strong>
          </label>
          <span class="description">{$i18n.t("servoSbusOutChannelsHelp")}</span>
        {/if}
      </div>
    {/if}

    {#if outputNotes.length > 0}
      <div class="note">
        {#each outputNotes as note (note)}
          <p>{note}</p>
        {/each}
      </div>
    {/if}

    {#if typeNotes.length > 0}
      <div class="note">
        {#each typeNotes as note (note)}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p>{@html note}</p>
        {/each}
      </div>
    {/if}

    {#if limitNotes.length > 0}
      <div class="note">
        {#each limitNotes as note (note)}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p>{@html note}</p>
        {/each}
      </div>
    {/if}

    {#if needReboot}
      <div class="note">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <p>{@html $i18n.t("servoRateRebootNote")}</p>
      </div>
    {/if}

    {@render trimActions(servos)}

    <div class="table-scroll">
      <ServoConfigTable {servos} {onFieldChange} {onTrimChange} />
    </div>
  </Section>

  <Section label="servoOverride" summary="servoOverrideHelp">
    <div class="override-toggle">
      <Switch
        id="servo-override-enable"
        bind:checked={() => overrideEnabled, onToggleOverrideEnabled}
      />
      <label for="servo-override-enable">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span>{@html $i18n.t("servoEnableOverrideLabel")}</span>
      </label>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <span class="description">{@html $i18n.t("servoEnableOverrideText")}</span
      >
    </div>
  </Section>

  {#if overrideEnabled}
    <Section label="servoOverrideServos">
      <ServoOverrideTable {servos} />
    </Section>
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
    padding: 4px 8px;
    min-width: 60px;
  }

  .table-scroll {
    overflow-x: auto;
    overflow-y: visible;
  }

  .note {
    margin: 8px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);

    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);
  }

  .note p {
    margin: 0;
  }

  .note p + p {
    margin-top: 6px;
  }

  .trim-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px;

    .btn {
      padding: 4px 8px;
    }
  }

  .override-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
  }

  // Control | label | description, one row per output option, so the
  // selectors line up and every description starts in the same column.
  .bus-options {
    display: grid;
    grid-template-columns: 11rem max-content 1fr;
    align-items: center;
    column-gap: 12px;
    row-gap: 12px;
    padding: 8px;

    label {
      white-space: nowrap;
    }

    // Overrides the global select min-width (120px) so a two-digit count
    // fits the control column instead of spilling into the label.
    select {
      width: 100%;
      min-width: 0;
    }
  }

  .description {
    color: var(--color-text-soft);
    font-size: 0.85rem;
  }
</style>
