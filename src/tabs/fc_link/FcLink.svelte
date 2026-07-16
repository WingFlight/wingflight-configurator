<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import { getTabHelpURL } from "@/js/help";
  import { reinitialiseConnection } from "@/js/serial_backend";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import Field from "@/components/Field.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import InfoNote from "@/components/notes/InfoNote.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";

  const ROLE_MASTER = 0;

  let loading = $state(true);
  let initialState = $state();
  let pollerInterval;
  let triggeringSync = $state(false);

  let isSlave = $derived(FC.FC_LINK_STATUS.role !== ROLE_MASTER);

  function snapshotState() {
    return $state.snapshot({
      FC_LINK_SYNC_CONFIG: FC.FC_LINK_SYNC_CONFIG,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });
  let showToolbar = $derived(!loading && changes.length > 0);

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP2_WING_FC_LINK_STATUS);
    await MSP.promise(MSPCodes.MSP2_WING_FC_LINK_SYNC_CONFIG);

    initialState = snapshotState();
    loading = false;

    pollerInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP2_WING_FC_LINK_STATUS);
    }, 500);
  });

  onDestroy(() => {
    clearInterval(pollerInterval);
  });

  function onClickHelp() {
    window.open(getTabHelpURL("tabFcLink"), "_system");
  }

  async function onTriggerSync() {
    triggeringSync = true;
    try {
      const { data } = await MSP.promise(
        MSPCodes.MSP2_WING_TRIGGER_FC_LINK_SYNC,
      );
      const accepted = !!data.readU8();
      GUI.log(
        $i18n.t(accepted ? "fcLinkSyncTriggered" : "fcLinkSyncTriggerRefused"),
      );
    } finally {
      triggeringSync = false;
    }
  }

  export async function onSave() {
    function save(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }

    await save(MSPCodes.MSP2_WING_SET_FC_LINK_SYNC_CONFIG);

    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    reinitialiseConnection();
  }

  export async function onRevert() {
    Object.assign(FC.FC_LINK_SYNC_CONFIG, initialState.FC_LINK_SYNC_CONFIG);
  }

  export function isDirty() {
    return changes.length > 0;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabFcLink")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>
    {$i18n.t("buttonRevert")}
  </button>
  <button class="btn" onclick={onSave}>
    {$i18n.t("buttonSaveReboot")}
  </button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  {#if !FC.FC_LINK_STATUS.enabled}
    <p>{$i18n.t("fcLinkNotEnabled")}</p>
  {:else}
    <div class="content">
      <Section label="fcLinkSectionStatus">
        <Field id="fc-link-role" label="fcLinkRole">
          <span>
            {isSlave ? $i18n.t("fcLinkRoleSlave") : $i18n.t("fcLinkRoleMaster")}
          </span>
        </Field>

        <Field id="fc-link-peer-status" label="fcLinkPeerStatus">
          <span class="pill" class:active={!FC.FC_LINK_STATUS.peerLost}>
            {FC.FC_LINK_STATUS.peerLost
              ? $i18n.t("fcLinkPeerLost")
              : $i18n.t("fcLinkPeerConnected")}
          </span>
        </Field>

        {#if !FC.FC_LINK_STATUS.peerLost}
          <Field id="fc-link-peer-armed" label="fcLinkPeerArmed">
            <span>{FC.FC_LINK_STATUS.peerArmed ? "Yes" : "No"}</span>
          </Field>
          <Field id="fc-link-peer-failsafe" label="fcLinkPeerFailsafe">
            <span>{FC.FC_LINK_STATUS.peerFailsafeActive ? "Yes" : "No"}</span>
          </Field>
          <Field id="fc-link-peer-rx" label="fcLinkPeerRxSignal">
            <span>{FC.FC_LINK_STATUS.peerRxReceivingSignal ? "Yes" : "No"}</span
            >
          </Field>
        {/if}

        <SubSection label="fcLinkSectionStats">
          <Field id="fc-link-heartbeats-sent" label="fcLinkHeartbeatSent">
            <span>{FC.FC_LINK_STATUS.txHeartbeatSent}</span>
          </Field>
          <Field id="fc-link-bytes-received" label="fcLinkBytesReceived">
            <span>{FC.FC_LINK_STATUS.rxByteTotal}</span>
          </Field>
          <Field id="fc-link-heartbeats-ok" label="fcLinkHeartbeatOk">
            <span>{FC.FC_LINK_STATUS.heartbeatOk}</span>
          </Field>
          <Field id="fc-link-checksum-fail" label="fcLinkHeartbeatChecksumFail">
            <span>{FC.FC_LINK_STATUS.heartbeatChecksumFail}</span>
          </Field>
        </SubSection>
      </Section>

      <Section label="fcLinkSectionSync" summary="fcLinkSectionSyncHelp">
        {#if !isSlave}
          <p>{$i18n.t("fcLinkSyncMasterOnly")}</p>
        {:else}
          <Field id="fc-link-sync-mixer-servos">
            {#snippet label()}
              {$i18n.t("fcLinkSyncMixerServos")}
              <HelpIcon>{$i18n.t("fcLinkSyncMixerServosHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-mixer-servos"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncMixerServos}
            />
          </Field>
          <Field id="fc-link-sync-pid-rates">
            {#snippet label()}
              {$i18n.t("fcLinkSyncPidRates")}
              <HelpIcon>{$i18n.t("fcLinkSyncPidRatesHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-pid-rates"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncPidRates}
            />
          </Field>
          <Field id="fc-link-sync-rx">
            {#snippet label()}
              {$i18n.t("fcLinkSyncRx")}
              <HelpIcon>{$i18n.t("fcLinkSyncRxHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-rx"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncRx}
            />
          </Field>
          <Field id="fc-link-sync-motor">
            {#snippet label()}
              {$i18n.t("fcLinkSyncMotor")}
              <HelpIcon>{$i18n.t("fcLinkSyncMotorHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-motor"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncMotor}
            />
          </Field>
          <Field id="fc-link-sync-telemetry">
            {#snippet label()}
              {$i18n.t("fcLinkSyncTelemetry")}
              <HelpIcon>{$i18n.t("fcLinkSyncTelemetryHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-telemetry"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncTelemetry}
            />
          </Field>
          <Field id="fc-link-sync-modes-adjustments">
            {#snippet label()}
              {$i18n.t("fcLinkSyncModesAdjustments")}
              <HelpIcon>{$i18n.t("fcLinkSyncModesAdjustmentsHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-modes-adjustments"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncModesAdjustments}
            />
          </Field>
          <Field id="fc-link-sync-gps">
            {#snippet label()}
              {$i18n.t("fcLinkSyncGps")}
              <HelpIcon>{$i18n.t("fcLinkSyncGpsHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-gps"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncGps}
            />
          </Field>
          <Field id="fc-link-sync-osd">
            {#snippet label()}
              {$i18n.t("fcLinkSyncOsd")}
              <HelpIcon>{$i18n.t("fcLinkSyncOsdHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-osd"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncOsd}
            />
          </Field>
          <Field id="fc-link-sync-vtx">
            {#snippet label()}
              {$i18n.t("fcLinkSyncVtx")}
              <HelpIcon>{$i18n.t("fcLinkSyncVtxHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-vtx"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncVtx}
            />
          </Field>
          <Field id="fc-link-sync-other">
            {#snippet label()}
              {$i18n.t("fcLinkSyncOther")}
              <HelpIcon>{$i18n.t("fcLinkSyncOtherHelp")}</HelpIcon>
            {/snippet}
            <Switch
              id="fc-link-sync-other"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncOther}
            />
          </Field>

          <div class="sync-now">
            <button
              class="btn"
              onclick={onTriggerSync}
              disabled={triggeringSync || FC.FC_LINK_STATUS.peerLost}
            >
              {$i18n.t("fcLinkSyncNow")}
            </button>
          </div>

          <div class="note-wrap">
            <InfoNote message="fcLinkSyncNeverSyncedNote" />
          </div>
        {/if}
      </Section>
    </div>
  {/if}
</Page>

<style lang="scss">
  .content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  .pill {
    font-weight: 600;

    color: var(--error-color, #c33);
  }

  .pill.active {
    color: var(--success-color, #3a3);
  }

  .sync-now {
    display: flex;
    justify-content: flex-end;
    padding: 8px 4px;
  }

  .note-wrap {
    padding-bottom: 8px;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }
</style>
