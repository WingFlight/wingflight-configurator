<script>
  import { mount, unmount } from "svelte";
  import { slide } from "svelte/transition";

  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import Switch from "@/components/Switch.svelte";
  import Field from "@/components/Field.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Section from "@/components/Section.svelte";
  import RxWiringDetectWizard from "./RxWiringDetectWizard.svelte";
  import { RX_PROTOCOLS } from "./protocols.js";

  let {
    rxProtoIndex,
    hasSerialRxPort,
    setRxProto,
    mainLinkUp,
    hasBackupRxPort,
    backupActive,
    onSaveRequested,
  } = $props();

  let wizardDisabled = $state(false);
  let wizardInstance = null;

  function closeWizard() {
    if (!wizardInstance) return;
    const instance = wizardInstance;
    wizardInstance = null;
    unmount(instance);
  }

  function onClickDetectWiring() {
    closeWizard();
    // Mounted to <body>, not nested here, for the same reason as
    // BoardAlignment.svelte's wizards: a native <dialog>'s built-in
    // centering resolves against the nearest ancestor with a transform, and
    // #content has a (no-op) transform applied as a long-standing Mac
    // freeze fix.
    wizardInstance = mount(RxWiringDetectWizard, {
      target: document.body,
      props: {
        mspCode: MSPCodes.MSP2_WING_RX_SERIAL_TRIAL,
        onDetected: (inverted, halfDuplex, pinSwap) => {
          FC.RX_CONFIG.serialrx_inverted = inverted;
          FC.RX_CONFIG.serialrx_halfduplex = halfDuplex;
          FC.RX_CONFIG.serialrx_pinswap = pinSwap;
        },
        onButtonDisabled: (v) => (wizardDisabled = v),
        onClose: closeWizard,
        onSaveRequested,
      },
    });
  }

  // Called by Receiver.svelte on unmount/revert, same as
  // BoardAlignment.svelte's cleanup() - the wizard lives outside this
  // component's own tree (mounted to <body>), so it isn't torn down
  // automatically when this component is.
  export function cleanup() {
    wizardInstance?.stop();
    closeWizard();
  }
</script>

{#snippet header()}
  <div class="section-header">
    <span class="title">{$i18n.t("receiverSelection")}</span>
    <div class="grow"></div>
    {#if RX_PROTOCOLS[rxProtoIndex]?.feature === "RX_SERIAL"}
      <div class="wiring-detect">
        <button
          class="btn"
          disabled={wizardDisabled || !hasSerialRxPort}
          onclick={onClickDetectWiring}
        >
          {$i18n.t("receiverWiringDetectButton")}
        </button>
        <HelpIcon>{$i18n.t("receiverWiringDetectHelp")}</HelpIcon>
      </div>
    {/if}
    {#if mainLinkUp !== null}
      <span class="badge" class:up={mainLinkUp} class:down={!mainLinkUp}>
        {mainLinkUp
          ? $i18n.t("rxInputBackupStatusLinkUp")
          : $i18n.t("rxInputBackupStatusLinkDown")}
      </span>
      {#if hasBackupRxPort}
        <span class="badge" class:active={backupActive}>
          {backupActive
            ? $i18n.t("rxInputBackupStatusActiveBackup")
            : $i18n.t("rxInputBackupStatusActiveMain")}
        </span>
      {/if}
    {/if}
  </div>
{/snippet}

<Section {header}>
  <SubSection>
    <Field id="receiver-protocol" label="receiverProtocol">
      <select
        id="receiver-protocol"
        bind:value={() => rxProtoIndex, setRxProto}
      >
        {#each RX_PROTOCOLS as proto, i (proto.name)}
          <!-- always show selected protocol -->
          {#if !proto.hide || rxProtoIndex === i}
            <option
              value={i}
              disabled={proto.feature === "RX_SERIAL" && !hasSerialRxPort}
            >
              {proto.name}
            </option>
          {/if}
        {/each}
      </select>
    </Field>
  </SubSection>
  {#if RX_PROTOCOLS[rxProtoIndex]?.feature === "RX_SERIAL"}
    <div transition:slide>
      <SubSection label="receiverSelectionSectionSignaling">
        <Field id="receiver-serialrx-inverted" label="receiverSerialInverted">
          {#snippet tooltip()}
            <Tooltip help="receiverSerialInvertedHelp" />
          {/snippet}
          <Switch
            id="receiver-serialrx-inverted"
            bind:checked={FC.RX_CONFIG.serialrx_inverted}
          />
        </Field>
        <Field
          id="receiver-serialrx-halfduplex"
          label="receiverSerialHalfDuplex"
        >
          {#snippet tooltip()}
            <Tooltip help="receiverSerialHalfDuplexHelp" />
          {/snippet}
          <Switch
            id="receiver-serialrx-halfduplex"
            bind:checked={FC.RX_CONFIG.serialrx_halfduplex}
          />
        </Field>
        <Field id="receiver-serialrx-pinswap" label="receiverSerialPinSwap">
          {#snippet tooltip()}
            <Tooltip help="receiverSerialPinSwapHelp" />
          {/snippet}
          <Switch
            id="receiver-serialrx-pinswap"
            bind:checked={FC.RX_CONFIG.serialrx_pinswap}
          />
        </Field>
      </SubSection>
    </div>
  {/if}
</Section>

<style lang="scss">
  select {
    min-width: 180px;
  }

  .wiring-detect {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn {
    @extend %button;

    padding: 4px 8px;
  }

  // Custom Section header (badges live here, not in the body) - replicates
  // %section-header (_global.scss) plus a right-aligned badge row, kept
  // compact rather than adding a separate summary line below the title.
  .section-header {
    @extend %section-header;

    padding-right: 8px;
    gap: 8px;
  }

  .title {
    padding-left: 8px;
  }

  .grow {
    flex-grow: 1;
  }

  .badge {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
  }

  .badge.up {
    color: var(--color-border-accent);
    border-color: var(--color-border-accent);
  }

  // "active" here means the backup link has taken over (main link down) -
  // worth flagging with the same warning color as "down", even in this
  // (the main RX's own) box, mirroring Receiver.svelte's identical badges.
  .badge.down,
  .badge.active {
    color: var(--color-danger, var(--color-border-accent));
    border-color: var(--color-danger, var(--color-border-accent));
  }
</style>
