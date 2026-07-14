<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import { reinitialiseConnection } from "@/js/serial_backend";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import Field from "@/components/Field.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Switch from "@/components/Switch.svelte";

  const ROLE_MASTER = 0;

  let loading = $state(true);
  let initialState;
  let pollerInterval;

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
        <div class="fields">
          <div class="field">
            <span class="label">{$i18n.t("fcLinkRole")}</span>
            <span>
              {isSlave
                ? $i18n.t("fcLinkRoleSlave")
                : $i18n.t("fcLinkRoleMaster")}
            </span>
          </div>

          <div class="field">
            <span class="label">{$i18n.t("fcLinkPeerStatus")}</span>
            <span class="pill" class:active={!FC.FC_LINK_STATUS.peerLost}>
              {FC.FC_LINK_STATUS.peerLost
                ? $i18n.t("fcLinkPeerLost")
                : $i18n.t("fcLinkPeerConnected")}
            </span>
          </div>

          {#if !FC.FC_LINK_STATUS.peerLost}
            <div class="field">
              <span class="label">{$i18n.t("fcLinkPeerArmed")}</span>
              <span>{FC.FC_LINK_STATUS.peerArmed ? "Yes" : "No"}</span>
            </div>
            <div class="field">
              <span class="label">{$i18n.t("fcLinkPeerFailsafe")}</span>
              <span>{FC.FC_LINK_STATUS.peerFailsafeActive ? "Yes" : "No"}</span>
            </div>
            <div class="field">
              <span class="label">{$i18n.t("fcLinkPeerRxSignal")}</span>
              <span
                >{FC.FC_LINK_STATUS.peerRxReceivingSignal ? "Yes" : "No"}</span
              >
            </div>
          {/if}

          <div class="field">
            <span class="label">{$i18n.t("fcLinkHeartbeatSent")}</span>
            <span>{FC.FC_LINK_STATUS.txHeartbeatSent}</span>
          </div>
          <div class="field">
            <span class="label">{$i18n.t("fcLinkBytesReceived")}</span>
            <span>{FC.FC_LINK_STATUS.rxByteTotal}</span>
          </div>
          <div class="field">
            <span class="label">{$i18n.t("fcLinkHeartbeatOk")}</span>
            <span>{FC.FC_LINK_STATUS.heartbeatOk}</span>
          </div>
          <div class="field">
            <span class="label">{$i18n.t("fcLinkHeartbeatChecksumFail")}</span>
            <span>{FC.FC_LINK_STATUS.heartbeatChecksumFail}</span>
          </div>
        </div>
      </Section>

      <Section label="fcLinkSectionSync" summary="fcLinkSectionSyncHelp">
        {#if !isSlave}
          <p>{$i18n.t("fcLinkSyncMasterOnly")}</p>
        {:else}
          <Field id="fc-link-sync-mixer-servos" label="fcLinkSyncMixerServos">
            <Switch
              id="fc-link-sync-mixer-servos"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncMixerServos}
            />
          </Field>
          <Field id="fc-link-sync-pid-rates" label="fcLinkSyncPidRates">
            <Switch
              id="fc-link-sync-pid-rates"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncPidRates}
            />
          </Field>
          <Field id="fc-link-sync-rx" label="fcLinkSyncRx">
            <Switch
              id="fc-link-sync-rx"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncRx}
            />
          </Field>
          <Field id="fc-link-sync-other" label="fcLinkSyncOther">
            <Switch
              id="fc-link-sync-other"
              bind:checked={FC.FC_LINK_SYNC_CONFIG.syncOther}
            />
          </Field>
        {/if}
      </Section>
    </div>
  {/if}
</Page>

<style lang="scss">
  .content {
    display: flex;
    flex-direction: column;
    max-width: 420px;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  .label {
    color: var(--text-secondary, #888);
  }

  .pill {
    color: var(--error-color, #c33);
  }

  .pill.active {
    color: var(--success-color, #3a3);
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
