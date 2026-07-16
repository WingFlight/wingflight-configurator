<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";

  import Page from "@/components/Page.svelte";
  import Select from "@/components/Select.svelte";

  import PidGains from "./PidGains.svelte";
  import PidSettings from "./PidSettings.svelte";
  import PidBandwidth from "./PidBandwidth.svelte";
  import LevelingSettings from "./LevelingSettings.svelte";
  import profilesState from "./state.svelte.js";

  let loading = $state(true);
  let initialState = $state(null);
  let mountedProfile;
  let pollerInterval;

  let copyDialogEl;
  let resetDialogEl;
  let profileChangeDialogEl;
  let profileChangeDialogOpen = $state(false);
  let copyDestination = $state(0);

  function snapshotState() {
    return $state.snapshot({ PIDS: FC.PIDS, PID_PROFILE: FC.PID_PROFILE });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });

  let profileSwitched = $derived(
    profilesState.savedProfile !== undefined &&
      FC.CONFIG.profile !== profilesState.savedProfile,
  );

  let dirty = $derived(changes.length > 0 || profileSwitched);
  let showToolbar = $derived(!loading && dirty);

  let pidWarning = $derived.by(() => {
    if (FC.PID_PROFILE.pid_mode === 0) {
      return "profilesPIDModeZeroWarning";
    }
    if (FC.PID_PROFILE.pid_mode !== 1) {
      return "profilesPIDModeCustomWarning";
    }
    return null;
  });

  let showPidBoxes = $derived(FC.PID_PROFILE.pid_mode === 1);

  let profileTabs = $derived(
    Array.from({ length: FC.CONFIG.numProfiles }, (_, i) => i),
  );

  let copyDestinationOptions = $derived(
    profileTabs
      .filter((i) => i !== FC.CONFIG.profile)
      .map((i) => ({ value: i, label: $i18n.t(`profilesSubTab${i + 1}`) })),
  );

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_PID_TUNING);
    await MSP.promise(MSPCodes.MSP_PID_PROFILE);
    await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);
    await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);

    if (profilesState.savedProfile === undefined) {
      profilesState.savedProfile = FC.CONFIG.profile;
    }

    mountedProfile = FC.CONFIG.profile;
    initialState = snapshotState();
    loading = false;

    pollerInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_STATUS);

      if (FC.CONFIG.profile !== mountedProfile) {
        mountedProfile = FC.CONFIG.profile;

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
  });

  onDestroy(() => {
    clearInterval(pollerInterval);
  });

  function activateProfile(index) {
    FC.CONFIG.profile = index;
    MSP.promise(MSPCodes.MSP_SELECT_SETTING, [index]).then(() => {
      GUI.log($i18n.t("profilesActivateProfile", { 1: index + 1 }));
      GUI.tab_switch_reload();
    });
  }

  function onClickProfileTab(index) {
    if (index === FC.CONFIG.profile) {
      return;
    }
    GUI.tab_switch_allowed(() => activateProfile(index));
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
    FC.COPY_PROFILE.type = 0;
    FC.COPY_PROFILE.dstProfile = copyDestination;
    FC.COPY_PROFILE.srcProfile = FC.CONFIG.profile;

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

  async function onConfirmResetProfile() {
    await MSP.promise(MSPCodes.MSP_SET_RESET_CURR_PID);
    GUI.log($i18n.t("profilesResetProfile"));
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    resetDialogEl.close();
    GUI.tab_switch_reload();
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabProfiles"), "_system");
  }

  export async function onSave() {
    await MSP.promise(
      MSPCodes.MSP_SET_PID_TUNING,
      mspHelper.crunch(MSPCodes.MSP_SET_PID_TUNING),
    );
    await MSP.promise(
      MSPCodes.MSP_SET_PID_PROFILE,
      mspHelper.crunch(MSPCodes.MSP_SET_PID_PROFILE),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    profilesState.savedProfile = FC.CONFIG.profile;
    initialState = snapshotState();
  }

  export async function onRevert() {
    if (FC.CONFIG.profile !== profilesState.savedProfile) {
      const target = profilesState.savedProfile;
      await MSP.promise(MSPCodes.MSP_SELECT_SETTING, [target]);
      GUI.log($i18n.t("profilesActivateProfile", { 1: target + 1 }));
      GUI.tab_switch_reload();
      return;
    }

    FC.PIDS.forEach((axis, i) => Object.assign(axis, initialState.PIDS[i]));
    Object.assign(FC.PID_PROFILE, initialState.PID_PROFILE);
  }

  export function isDirty() {
    return dirty;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabProfiles")}</h1>
  <div class="grow"></div>
  <button class="btn" disabled={dirty} onclick={onClickCopyProfile}>
    {$i18n.t("profilesCopyProfile")}
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
    {#each profileTabs as index (index)}
      <button
        class={["profile-tab", index === FC.CONFIG.profile && "active"]}
        onclick={() => onClickProfileTab(index)}
      >
        {$i18n.t(`profilesSubTab${index + 1}`)}
      </button>
    {/each}
  </div>

  {#if pidWarning}
    <div class="note">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <p>{@html $i18n.t(pidWarning)}</p>
    </div>
  {/if}

  <div class="content">
    <div>
      {#if showPidBoxes}
        <PidGains />
      {/if}
      {#if CONFIGURATOR.expertMode}
        <LevelingSettings />
      {/if}
    </div>
    <div>
      {#if showPidBoxes}
        <PidSettings />
        {#if CONFIGURATOR.expertMode}
          <PidBandwidth />
        {/if}
      {/if}
    </div>
  </div>
</Page>

<dialog bind:this={copyDialogEl}>
  <h3>{$i18n.t("dialogCopyProfileTitle")}</h3>
  <div class="content">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("dialogCopyProfileNote")}</p>
    <div class="field-row">
      <span>{$i18n.t("dialogCopyProfileText")}</span>
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
    <p>{@html $i18n.t("dialogResetProfileNote")}</p>
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

  .note {
    margin-bottom: var(--section-gap);
    padding: 8px 12px;
    border-radius: 4px;

    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);
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
