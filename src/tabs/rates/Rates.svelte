<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { RateCurve } from "@/js/RateCurve.js";

  import Page from "@/components/Page.svelte";
  import Select from "@/components/Select.svelte";

  import RatesTable from "./RatesTable.svelte";
  import RateCurveChart from "./RateCurveChart.svelte";
  import Dynamics from "./Dynamics.svelte";
  import RatePreview from "./RatePreview.svelte";

  // Firmware disambiguates "select PID profile N" vs "select rate profile N"
  // via this offset added to the profile index on MSP_SELECT_SETTING.
  const RATE_PROFILE_MASK = 128;
  const RATE_PROFILE_COUNT = 6;

  const RATES_TYPE_WINGFLIGHT = 0;
  const SUPER_EXPO = true;
  const DEADBAND = 0;

  // Wingflight is the only supported rates system.
  const RATES_DEFAULTS = {
    rcRateDef: 250,
    rcRateYawDef: 400,
    rateDef: 12,
    rateYawDef: 12,
    expoDef: 40,
    yawExpoDef: 50,
  };

  const DYNAMICS_DEFAULTS = {
    roll_setpoint_boost_gain: 0,
    pitch_setpoint_boost_gain: 0,
    yaw_setpoint_boost_gain: 0,
    collective_setpoint_boost_gain: 0,
    roll_setpoint_boost_cutoff: 15,
    pitch_setpoint_boost_cutoff: 15,
    yaw_setpoint_boost_cutoff: 90,
    collective_setpoint_boost_cutoff: 15,
    yaw_dynamic_ceiling_gain: 0,
    yaw_dynamic_deadband_gain: 10,
    yaw_dynamic_deadband_filter: 60,
    roll_response_time: 0,
    pitch_response_time: 0,
    yaw_response_time: 0,
    collective_response_time: 0,
    roll_accel_limit: 0,
    pitch_accel_limit: 0,
    yaw_accel_limit: 0,
    collective_accel_limit: 0,
  };

  let loading = $state(true);
  let initialState = $state(null);
  let mountedRateProfile;
  let statusPollerInterval;
  let rcCommandPollerInterval;

  let copyDialogEl;
  let resetDialogEl;
  let profileChangeDialogEl;
  let profileChangeDialogOpen = $state(false);
  let copyDestination = $state(0);

  const rateCurve = new RateCurve();
  let liveSetpoints = $state({ roll: 0, pitch: 0, yaw: 0 });

  function snapshotState() {
    return $state.snapshot({ RC_TUNING: FC.RC_TUNING });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });

  let dirty = $derived(changes.length > 0);
  let showToolbar = $derived(!loading && dirty);

  let rateProfileTabs = $derived(
    Array.from({ length: RATE_PROFILE_COUNT }, (_, i) => i),
  );

  let copyDestinationOptions = $derived(
    rateProfileTabs
      .filter((i) => i !== FC.CONFIG.rateProfile)
      .map((i) => ({ value: i, label: $i18n.t(`rateSetupSubTab${i + 1}`) })),
  );

  // Display-unit mirror of FC.RC_TUNING (wire units *500/*100) -- shared by
  // the curve chart and the max-angular-velocity calculations below. Editing
  // happens directly on FC.RC_TUNING via bind:value getter/setters in
  // RatesTable/Dynamics; this is a read-only projection for drawing.
  let currentRates = $derived({
    roll_rc_rate: FC.RC_TUNING.roll_rc_rate * 500,
    roll_rc_expo: FC.RC_TUNING.roll_rc_expo * 100,
    roll_srate: FC.RC_TUNING.roll_srate * 100,
    pitch_rc_rate: FC.RC_TUNING.pitch_rc_rate * 500,
    pitch_rc_expo: FC.RC_TUNING.pitch_rc_expo * 100,
    pitch_srate: FC.RC_TUNING.pitch_srate * 100,
    yaw_rc_rate: FC.RC_TUNING.yaw_rc_rate * 500,
    yaw_rc_expo: FC.RC_TUNING.yaw_rc_expo * 100,
    yaw_srate: FC.RC_TUNING.yaw_srate * 100,
  });

  function maxAngularVelFor(rate, rcRate, rcExpo) {
    return rateCurve.getMaxAngularVel(
      RATES_TYPE_WINGFLIGHT,
      rate,
      rcRate,
      rcExpo,
      SUPER_EXPO,
      DEADBAND,
      undefined,
    );
  }

  let maxAngularRoll = $derived(
    maxAngularVelFor(
      currentRates.roll_srate,
      currentRates.roll_rc_rate,
      currentRates.roll_rc_expo,
    ),
  );
  let maxAngularPitch = $derived(
    maxAngularVelFor(
      currentRates.pitch_srate,
      currentRates.pitch_rc_rate,
      currentRates.pitch_rc_expo,
    ),
  );
  let maxAngularYaw = $derived(
    maxAngularVelFor(
      currentRates.yaw_srate,
      currentRates.yaw_rc_rate,
      currentRates.yaw_rc_expo,
    ),
  );

  // Rounds up to the nearest multiple of 200°/s so the chart's auto-scale
  // doesn't jitter for small changes near a boundary.
  let maxAngularVel = $derived(
    rateCurve.setMaxAngularVel(
      Math.max(maxAngularRoll, maxAngularPitch, maxAngularYaw),
    ),
  );

  function updateLiveSetpoints() {
    liveSetpoints = {
      roll: rateCurve.rcCommandRawToDegreesPerSecond(
        1500 + FC.RC_COMMAND[0],
        RATES_TYPE_WINGFLIGHT,
        currentRates.roll_srate,
        currentRates.roll_rc_rate,
        currentRates.roll_rc_expo,
        SUPER_EXPO,
        DEADBAND,
      ),
      pitch: rateCurve.rcCommandRawToDegreesPerSecond(
        1500 + FC.RC_COMMAND[1],
        RATES_TYPE_WINGFLIGHT,
        currentRates.pitch_srate,
        currentRates.pitch_rc_rate,
        currentRates.pitch_rc_expo,
        SUPER_EXPO,
        DEADBAND,
      ),
      yaw: rateCurve.rcCommandRawToDegreesPerSecond(
        1500 + FC.RC_COMMAND[2],
        RATES_TYPE_WINGFLIGHT,
        currentRates.yaw_srate,
        currentRates.yaw_rc_rate,
        currentRates.yaw_rc_expo,
        SUPER_EXPO,
        DEADBAND,
      ),
    };
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_RC_TUNING);
    await MSP.promise(MSPCodes.MSP_RC_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);

    mountedRateProfile = FC.CONFIG.rateProfile;
    initialState = snapshotState();
    loading = false;

    updateLiveSetpoints();

    statusPollerInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_STATUS);

      if (FC.CONFIG.rateProfile !== mountedRateProfile) {
        mountedRateProfile = FC.CONFIG.rateProfile;

        if (dirty) {
          if (!profileChangeDialogOpen) {
            profileChangeDialogOpen = true;
            profileChangeDialogEl.showModal();
          }
        } else {
          GUI.tab_switch_reload();
        }
      }
    }, 250);

    rcCommandPollerInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_RC_COMMAND);
      updateLiveSetpoints();
    }, 100);
  });

  onDestroy(() => {
    clearInterval(statusPollerInterval);
    clearInterval(rcCommandPollerInterval);
  });

  function activateRateProfile(index) {
    FC.CONFIG.rateProfile = index;
    MSP.promise(MSPCodes.MSP_SELECT_SETTING, [index + RATE_PROFILE_MASK]).then(
      () => {
        GUI.log($i18n.t("rateSetupActivateProfile", { 1: index + 1 }));
        GUI.tab_switch_reload();
      },
    );
  }

  function onClickProfileTab(index) {
    if (index === FC.CONFIG.rateProfile) {
      return;
    }
    GUI.tab_switch_allowed(() => activateRateProfile(index));
  }

  function onConfirmProfileChange() {
    profileChangeDialogEl.close();
    profileChangeDialogOpen = false;
    GUI.tab_switch_reload();
  }

  function onClickCopyProfile() {
    if (dirty) {
      return;
    }
    copyDestination = copyDestinationOptions[0]?.value ?? 0;
    copyDialogEl.showModal();
  }

  async function onConfirmCopyProfile() {
    FC.COPY_PROFILE.type = 1;
    FC.COPY_PROFILE.dstProfile = copyDestination;
    FC.COPY_PROFILE.srcProfile = FC.CONFIG.rateProfile;

    await MSP.promise(
      MSPCodes.MSP_COPY_PROFILE,
      mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    copyDialogEl.close();
  }

  function onClickResetProfile() {
    resetDialogEl.showModal();
  }

  function onConfirmResetProfile() {
    FC.RC_TUNING.roll_srate = RATES_DEFAULTS.rateDef / 100;
    FC.RC_TUNING.pitch_srate = RATES_DEFAULTS.rateDef / 100;
    FC.RC_TUNING.yaw_srate = RATES_DEFAULTS.rateYawDef / 100;
    FC.RC_TUNING.roll_rc_rate = RATES_DEFAULTS.rcRateDef / 500;
    FC.RC_TUNING.yaw_rc_rate = RATES_DEFAULTS.rcRateYawDef / 500;
    FC.RC_TUNING.pitch_rc_rate = RATES_DEFAULTS.rcRateDef / 500;
    FC.RC_TUNING.roll_rc_expo = RATES_DEFAULTS.expoDef / 100;
    FC.RC_TUNING.yaw_rc_expo = RATES_DEFAULTS.yawExpoDef / 100;
    FC.RC_TUNING.pitch_rc_expo = RATES_DEFAULTS.expoDef / 100;

    Object.assign(FC.RC_TUNING, DYNAMICS_DEFAULTS);

    resetDialogEl.close();
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabRates"), "_system");
  }

  export async function onSave() {
    await MSP.promise(
      MSPCodes.MSP_SET_RC_TUNING,
      mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    initialState = snapshotState();
  }

  export async function onRevert() {
    Object.assign(FC.RC_TUNING, initialState.RC_TUNING);
  }

  export function isDirty() {
    return dirty;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabRates")}</h1>
  <div class="grow"></div>
  <button class="btn" disabled={dirty} onclick={onClickCopyProfile}>
    {$i18n.t("rateSetupCopyRateProfile")}
  </button>
  <button class="btn" onclick={onClickResetProfile}>
    {$i18n.t("profilesResetProfile")}
  </button>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <div class="profile-tabs">
    {#each rateProfileTabs as index (index)}
      <button
        class={["profile-tab", index === FC.CONFIG.rateProfile && "active"]}
        onclick={() => onClickProfileTab(index)}
      >
        {$i18n.t(`rateSetupSubTab${index + 1}`)}
      </button>
    {/each}
  </div>

  <div class="content">
    <div>
      <RatesTable {maxAngularRoll} {maxAngularPitch} {maxAngularYaw} />
      <RateCurveChart
        {currentRates}
        {maxAngularVel}
        {maxAngularRoll}
        {maxAngularPitch}
        {maxAngularYaw}
        {liveSetpoints}
      />
    </div>
    <div>
      {#if CONFIGURATOR.expertMode}
        <Dynamics />
      {/if}
      <RatePreview {liveSetpoints} />
    </div>
  </div>
</Page>

<dialog bind:this={copyDialogEl}>
  <h3>{$i18n.t("dialogCopyProfileTitle")}</h3>
  <div class="content">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("dialogCopyProfileNote")}</p>
    <div class="field-row">
      <span>{$i18n.t("dialogCopyRateProfileText")}</span>
      <Select bind:value={copyDestination} options={copyDestinationOptions} />
    </div>
  </div>
  <div class="buttons">
    <button class="btn" onclick={onConfirmCopyProfile}>
      {$i18n.t("dialogCopyProfileConfirm")}
    </button>
    <button class="btn" onclick={() => copyDialogEl.close()}>
      {$i18n.t("dialogCopyProfileClose")}
    </button>
  </div>
</dialog>

<dialog bind:this={resetDialogEl}>
  <h3>{$i18n.t("dialogResetProfileTitle")}</h3>
  <div class="content">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("dialogResetRateProfileNote")}</p>
  </div>
  <div class="buttons">
    <button class="btn" onclick={onConfirmResetProfile}>
      {$i18n.t("dialogResetProfileConfirm")}
    </button>
    <button class="btn" onclick={() => resetDialogEl.close()}>
      {$i18n.t("dialogResetProfileClose")}
    </button>
  </div>
</dialog>

<dialog
  bind:this={profileChangeDialogEl}
  onclose={() => (profileChangeDialogOpen = false)}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <h3>{@html $i18n.t("dialogProfileChangeTitle")}</h3>
  <div class="content">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("dialogProfileChangeNote")}</p>
  </div>
  <div class="buttons">
    <button class="btn" onclick={onConfirmProfileChange}>
      {$i18n.t("dialogProfileChangeConfirm")}
    </button>
  </div>
</dialog>

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

  .profile-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
  }

  .profile-tab {
    @extend %button;
    padding: 0 14px;

    &.active {
      color: var(--color-text-inverse, #000);
      background-color: var(--color-accent, var(--accent));
    }
  }

  .content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  dialog {
    width: 32em;
    border-radius: 5px;
  }

  dialog .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
  }

  dialog h3 {
    margin-bottom: 0.5em;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  @media only screen and (max-width: 480px) {
    .content {
      grid-template-columns: 1fr;
      row-gap: 0;
    }
  }
</style>
