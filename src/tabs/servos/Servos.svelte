<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";
  import semver from "semver";

  import { API_VERSION_22_5 } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";
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

  const PWM_SERVO_SLOTS = 8;
  const BUS_SERVO_OFFSET = 8;
  // Firmware BUS_SERVO_CHANNELS: 24 from API 22.5, 18 before
  const BUS_SERVO_CHANNELS = Mixer.busServoChannels();
  const MAX_SERVOS = PWM_SERVO_SLOTS + BUS_SERVO_CHANNELS;
  const OVERRIDE_OFF = 2001;

  // Bus output channel counts (API 22.5): wingflight-firmware's
  // sbus_out_channels / fbus_master_channels, carried in MSP_MIXER_CONFIG.
  const hasBusOutChannels = semver.gte(FC.CONFIG.apiVersion, API_VERSION_22_5);
  const SBUS_OUT_CHANNEL_OPTIONS = [8, 12, 16];
  const FBUS_OUT_CHANNEL_OPTIONS = [8, 12, 16, 24];

  let loading = $state(true);
  let needReboot = $state(false);
  let initialConfig = $state(null);
  // bus_servo_clone_pwm lives on FC.MIXER_CONFIG, not FC.SERVO_CONFIG, so it
  // falls outside the diff below -- tracked separately so it participates in
  // the same dirty/Save/Revert cycle as everything else on this tab instead
  // of silently self-committing with no toolbar feedback.
  let initialBusClonePwm = $state(null);
  // Same idea for the bus output channel counts (also on FC.MIXER_CONFIG).
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

    return diff(initialConfig, $state.snapshot(FC.SERVO_CONFIG));
  });

  let busCloneDirty = $derived(
    initialBusClonePwm !== null &&
      FC.MIXER_CONFIG.bus_servo_clone_pwm !== initialBusClonePwm,
  );

  let busOutChannelsDirty = $derived(
    initialBusOutChannels !== null &&
      (FC.MIXER_CONFIG.sbus_out_channels !== initialBusOutChannels.sbus ||
        FC.MIXER_CONFIG.fbus_master_channels !== initialBusOutChannels.fbus),
  );

  // Firmware with saved trims keeps every kind of trim apart from Mid.
  let savedTrimSupported = $derived(Array.isArray(FC.SERVO_SAVED_TRIM));

  let trimsDirty = $derived(
    initialTrims !== null &&
      savedTrimSupported &&
      FC.SERVO_SAVED_TRIM.some((trim, i) => trim !== initialTrims[i]),
  );

  let dirty = $derived(
    changes.length > 0 || busCloneDirty || busOutChannelsDirty || trimsDirty,
  );

  let hasSbusOut = $derived(
    FC.SERIAL_CONFIG.ports.some((port) => port.functions.includes("SBUS_OUT")),
  );
  let hasFbusOut = $derived(
    FC.SERIAL_CONFIG.ports.some((port) => port.functions.includes("FBUS_OUT")),
  );
  let hasFbusOrSbus = $derived(hasSbusOut || hasFbusOut);

  // Bus servos the configured outputs drive. SBUS and F.Bus output can run
  // at the same time, and bus servo N is channel N on both, so it's the
  // larger of the two - as in the firmware's getBusServoOutputCount().
  // Follows the selectors below straight away; 16 on firmware without the
  // setting.
  let busOutputCount = $derived.by(() => {
    if (!hasBusOutChannels) {
      return 16;
    }
    let count = 0;
    if (hasFbusOut) {
      count = Math.max(count, FC.MIXER_CONFIG.fbus_master_channels);
    }
    if (hasSbusOut) {
      count = Math.max(count, Math.min(FC.MIXER_CONFIG.sbus_out_channels, 16));
    }
    return count || 16;
  });
  let maxServos = MAX_SERVOS;
  let busActive = $derived(hasFbusOrSbus);

  // FC.CONFIG.servoCount includes bus servos once FBUS/SBUS is active, so it
  // can't be used directly to bound "PWM-only" logic (unusual-value
  // warnings, the legacy servoCount-based consistency checks) -- this is the
  // actual PWM servo count either way.
  let pwmServoCount = $derived(
    busActive
      ? Math.max(0, FC.SERVO_CONFIG.length - BUS_SERVO_CHANNELS)
      : Math.min(FC.CONFIG.servoCount, maxServos),
  );

  let pwmServos = $derived.by(() => {
    const list = [];
    for (let index = 0; index < pwmServoCount; index++) {
      list.push({
        index,
        isBusServo: false,
        label: `${index + 1}`,
        mspIndex: index,
      });
    }
    return list;
  });

  let busServos = $derived.by(() => {
    if (!busActive) {
      return [];
    }

    const displayCount = Math.min(busOutputCount, BUS_SERVO_CHANNELS);
    const list = [];
    for (let i = 0; i < displayCount; i++) {
      const index = pwmServoCount + i;
      list.push({
        index,
        isBusServo: true,
        label: `${i + 1}`,
        mspIndex: BUS_SERVO_OFFSET + i,
      });
    }
    return list;
  });

  let allServos = $derived([...pwmServos, ...busServos]);

  // Unusual-value warnings, computed across PWM servos only -- these
  // thresholds are calibrated for analog PWM pulse-width ranges (mirrors
  // process_warnings() in the legacy tab) and don't mean anything for bus/
  // digital servos, which use a completely different scale (rneg/rpos
  // default to 1000, well outside any of these PWM-oriented bounds). The
  // 2-/3-servo consistency check is a heli swashplate assumption (fixed-
  // pitch/collective-pitch) that doesn't generalize to a bus servo bank
  // either, so it stays PWM-only too.
  let warnings = $derived.by(() => {
    let unusualScale = false;
    let unusualRate = false;
    let unusualLimit = false;

    const SERVOS = FC.SERVO_CONFIG;

    for (let index = 0; index < pwmServoCount; index++) {
      const servo = SERVOS[index];
      if (!servo) continue;

      if (servo.mid > 860) {
        if (servo.rate > 433) unusualRate = true;
        if (
          servo.min < -750 ||
          servo.min > -300 ||
          servo.max > 750 ||
          servo.max < 300
        )
          unusualLimit = true;
        if (
          servo.rneg < 300 ||
          servo.rneg > 750 ||
          servo.rpos < 300 ||
          servo.rpos > 750
        )
          unusualScale = true;
      } else {
        if (servo.rate > 600) unusualRate = true;
        if (
          servo.min < -375 ||
          servo.min > -150 ||
          servo.max > 375 ||
          servo.max < 150
        )
          unusualLimit = true;
        const scaleMin = 50;
        if (
          servo.rneg < scaleMin ||
          servo.rneg > 375 ||
          servo.rpos < scaleMin ||
          servo.rpos > 375
        )
          unusualScale = true;
      }
    }

    if (pwmServoCount === 2 && SERVOS[0] && SERVOS[1]) {
      if (SERVOS[0].rate !== SERVOS[1].rate) unusualRate = true;
    } else if (pwmServoCount >= 3 && SERVOS[0] && SERVOS[1] && SERVOS[2]) {
      if (
        SERVOS[0].rate !== SERVOS[1].rate ||
        SERVOS[1].rate !== SERVOS[2].rate ||
        SERVOS[0].rate !== SERVOS[2].rate
      )
        unusualRate = true;
    }

    return { unusualScale, unusualRate, unusualLimit };
  });

  // Servos whose Min/Max the output can't fully use at their center, because
  // center + travel would leave the signal range.
  function travelLimitNotes(servos) {
    return servos.flatMap((servo) => {
      const config = FC.SERVO_CONFIG[servo.index];
      if (!config) return [];
      const limited = servoTravelLimited(config, servo.isBusServo);
      const usable = servoUsableTravel(config, servo.isBusServo);
      const signal = servoSignalRange(servo.isBusServo);
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

  let pwmLimitNotes = $derived(travelLimitNotes(pwmServos));
  let busLimitNotes = $derived(travelLimitNotes(busServos));

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
    await pollRuntimeTrim();
    // Read-only here (edited on the Curves tab) - just for the balance
    // curve indicator badge in ServoConfigTable. Not guaranteed populated
    // otherwise if this tab is visited before Curves.
    await MSP.promise(MSPCodes.MSP_SERVO_CURVES);
    await MSP.promise(MSPCodes.MSP_SERVO_OVERRIDE);
    await MSP.promise(MSPCodes.MSP_SERVO);

    initialConfig = $state.snapshot(FC.SERVO_CONFIG);
    initialBusClonePwm = FC.MIXER_CONFIG.bus_servo_clone_pwm;
    initialBusOutChannels = snapshotBusOutChannels();
    initialTrims = snapshotTrims();
    overrideEnabled = allServos.some((servo) => {
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

  // A bus channel cloned from its PWM servo sends that servo's output, trim
  // included, and ignores its own (sbusOutGetValueMixer(),
  // drivers/sbus_output.c), so the trim actions leave it alone.
  function isClonedBusServo(servo) {
    return (
      servo.isBusServo &&
      FC.MIXER_CONFIG.bus_servo_clone_pwm === 1 &&
      servo.mspIndex - BUS_SERVO_OFFSET < pwmServoCount
    );
  }

  function trimmableServos(servos) {
    return servos.filter((servo) => !isClonedBusServo(servo));
  }

  function hasTrims(servos) {
    return trimmableServos(servos).some(
      (servo) => FC.SERVO_SAVED_TRIM?.[servo.index],
    );
  }

  async function clearTrims(servos) {
    for (const servo of trimmableServos(servos)) {
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
    for (const servo of trimmableServos(servos)) {
      const trim = FC.SERVO_SAVED_TRIM[servo.index];
      const config = FC.SERVO_CONFIG[servo.index];
      if (!trim || !config) continue;

      const mid = config.mid;
      config.mid += trim;
      clampServoConfig(config, servo.isBusServo);
      FC.SERVO_SAVED_TRIM[servo.index] = trim - (config.mid - mid);

      await new Promise((resolve) =>
        mspHelper.sendServoConfig(servo.index, resolve),
      );
      await mspHelper.sendServoTrim(servo.index);
    }
  }

  function onRateChange(index) {
    needReboot = true;
    onFieldChange(index);
  }

  function onToggleOverrideEnabled(checked) {
    overrideEnabled = checked;
    for (const servo of allServos) {
      FC.SERVO_OVERRIDE[servo.mspIndex] = checked ? 0 : OVERRIDE_OFF;
      mspHelper.sendServoOverride(servo.mspIndex);
    }
  }

  // Mirrors onFieldChange: push the new value to the FC live (so it's
  // immediately testable) but don't touch EEPROM here -- that only happens
  // via the shared onSave() below, once this shows up as a dirty change on
  // the toolbar like every other field on this tab.
  function onToggleBusClone(checked) {
    FC.MIXER_CONFIG.bus_servo_clone_pwm = checked ? 1 : 0;
    mspHelper.sendMixerConfig();
  }

  // Same live-push as onToggleBusClone; the firmware uses the new count from
  // its next frame.
  function onBusOutChannelsChange() {
    mspHelper.sendMixerConfig();
  }

  function snapshotBusOutChannels() {
    return {
      sbus: FC.MIXER_CONFIG.sbus_out_channels,
      fbus: FC.MIXER_CONFIG.fbus_master_channels,
    };
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabServos"), "_system");
  }

  export async function onSave() {
    await new Promise((resolve) => mspHelper.sendServoConfigurations(resolve));
    // Already pushed live by onToggleBusClone / onBusOutChannelsChange when
    // changed -- EEPROM_WRITE below persists them along with everything else,
    // no need to resend.
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    if (needReboot) {
      MSP.send_message(MSPCodes.MSP_SET_REBOOT);
      GUI.log($i18n.t("deviceRebooting"));
      reinitialiseConnection();
    }

    needReboot = false;
    initialConfig = $state.snapshot(FC.SERVO_CONFIG);
    initialBusClonePwm = FC.MIXER_CONFIG.bus_servo_clone_pwm;
    initialBusOutChannels = snapshotBusOutChannels();
    initialTrims = snapshotTrims();
  }

  export async function onRevert() {
    FC.SERVO_CONFIG = initialConfig;
    await new Promise((resolve) => mspHelper.sendServoConfigurations(resolve));

    if (trimsDirty) {
      for (let i = 0; i < initialTrims.length; i++) {
        if (FC.SERVO_SAVED_TRIM[i] !== initialTrims[i]) {
          FC.SERVO_SAVED_TRIM[i] = initialTrims[i];
          await mspHelper.sendServoTrim(i);
        }
      }
    }

    if (busCloneDirty || busOutChannelsDirty) {
      FC.MIXER_CONFIG.bus_servo_clone_pwm = initialBusClonePwm;
      FC.MIXER_CONFIG.sbus_out_channels = initialBusOutChannels.sbus;
      FC.MIXER_CONFIG.fbus_master_channels = initialBusOutChannels.fbus;
      await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    }

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
  <Section label="servoConfigurationPwm">
    {#if warnings.unusualLimit || warnings.unusualScale || warnings.unusualRate}
      <div class="note">
        {#if warnings.unusualLimit}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p>{@html $i18n.t("servoUnusualLimitsWarning")}</p>
        {/if}
        {#if warnings.unusualScale}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p>{@html $i18n.t("servoUnusualScalesWarning")}</p>
        {/if}
        {#if warnings.unusualRate}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p>{@html $i18n.t("servoUnusualRatesWarning")}</p>
        {/if}
      </div>
    {/if}

    {#if pwmLimitNotes.length > 0}
      <div class="note">
        {#each pwmLimitNotes as note (note)}
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

    {@render trimActions(pwmServos)}

    <div class="table-scroll">
      <ServoConfigTable
        servos={pwmServos}
        {onFieldChange}
        {onRateChange}
        {onTrimChange}
        {pwmServoCount}
      />
    </div>
  </Section>

  {#if busActive}
    <Section label="servoConfigurationBus">
      <div class="bus-options">
        <Switch
          id="servo-bus-clone-enable"
          bind:checked={
            () => FC.MIXER_CONFIG.bus_servo_clone_pwm === 1, onToggleBusClone
          }
        />
        <label for="servo-bus-clone-enable">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html $i18n.t("servoBusCloneLabel")}
        </label>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span class="description">{@html $i18n.t("servoBusCloneText")}</span>

        {#if hasBusOutChannels && hasFbusOut}
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
        {#if hasBusOutChannels && hasSbusOut}
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

      {#if busLimitNotes.length > 0}
        <div class="note">
          {#each busLimitNotes as note (note)}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <p>{@html note}</p>
          {/each}
        </div>
      {/if}

      {@render trimActions(busServos)}

      <div class="table-scroll">
        <ServoConfigTable
          servos={busServos}
          {onFieldChange}
          {onRateChange}
          {onTrimChange}
          {pwmServoCount}
        />
      </div>
    </Section>
  {/if}

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
    <Section label="servoOverridePwm">
      <ServoOverrideTable servos={pwmServos} />
    </Section>

    {#if busActive}
      <Section label="servoOverrideBus">
        <ServoOverrideTable servos={busServos} />
      </Section>
    {/if}
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

  // Control | label | description, one row per bus option, so the switch and
  // the channel selectors line up and every description starts in the same
  // column.
  .bus-options {
    display: grid;
    grid-template-columns: 5rem max-content 1fr;
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
