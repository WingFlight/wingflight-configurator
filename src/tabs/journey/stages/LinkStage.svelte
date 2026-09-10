<script>
  import { onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import Meter from "@/components/Meter.svelte";
  import Section from "@/components/Section.svelte";
  import ChannelAssignment from "@/tabs/receiver/ChannelAssignment/ChannelAssignment.svelte";

  import StageNote from "../StageNote.svelte";
  import {
    getObserved,
    openTab,
    resetObserved,
  } from "../journey_state.svelte.js";

  // Stage 4 · Link. Embeds the receiver tab's channel bars / channel map and
  // watches the four primaries move. The observation feeds the two observed
  // checks of this stage and is never stored.
  let { onChanged } = $props();

  let profile = $derived(getProfile());
  let observed = $derived(getObserved());
  let saving = $state(false);
  let initialMap = $state(null);
  let poller;

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
    await MSP.promise(MSPCodes.MSP_RX_CHANNELS);
    await MSP.promise(MSPCodes.MSP_RC_COMMAND);
    await MSP.promise(MSPCodes.MSP2_WING_RX_INPUT_BACKUP_STATUS);
    initialMap = JSON.stringify($state.snapshot(FC.RC_MAP));
    // ChannelBar reads RX_CHANNELS / RC_COMMAND -- poll them like the tab does.
    poller = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_RX_CHANNELS);
      await MSP.promise(MSPCodes.MSP_RC_COMMAND);
      await MSP.promise(MSPCodes.MSP_ANALOG);
    }, 50);
  });

  onDestroy(() => clearInterval(poller));

  let mapDirty = $derived(
    initialMap !== null &&
      initialMap !== JSON.stringify($state.snapshot(FC.RC_MAP)),
  );

  async function saveMap() {
    saving = true;
    await MSP.promise(
      MSPCodes.MSP_SET_RX_MAP,
      mspHelper.crunch(MSPCodes.MSP_SET_RX_MAP),
    );
    await MSP.promise(
      MSPCodes.MSP_SET_RSSI_CONFIG,
      mspHelper.crunch(MSPCodes.MSP_SET_RSSI_CONFIG),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    initialMap = JSON.stringify($state.snapshot(FC.RC_MAP));
    saving = false;
    onChanged?.();
  }

  const PRIMARIES = ["roll", "pitch", "yaw", "throttle"];

  function rangeFor(fn) {
    const channel = FC.RC_MAP[fn];
    const min = observed.min[channel];
    const max = observed.max[channel];
    if (min === undefined || max === undefined) return null;
    return { channel, min, max, span: max - min };
  }
</script>

<Section label="journeyLink.protocolTitle">
  <div class="pad">
    <p class="fact">
      {#if profile.link.type === "serial"}
        {$i18n.t("journeyLink.serialSummary", {
          protocol: profile.link.providerName,
          port: profile.link.portIdentifier ?? "–",
        })}
      {:else}
        {$i18n.t("journeyLink.typeSummary", {
          type: profile.link.type.toUpperCase(),
        })}
      {/if}
      <span class="muted"
        >· {$i18n.t("journeyLink.channels", {
          count: FC.RC.active_channels,
        })}</span
      >
    </p>
    <div class="actions">
      <button class="btn" onclick={() => openTab("receiver")}
        >{$i18n.t("journeyLink.openReceiver")}</button
      >
    </div>
  </div>
</Section>

<Section label="journeyLink.observedTitle">
  <div class="pad">
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyLink.observedHelp")}
    </StageNote>
    <div class="observed">
      {#each PRIMARIES as fn, i (fn)}
        {@const r = rangeFor(i)}
        <div class="row">
          <span class="axis">{$i18n.t(`journeyAxis.${fn}`)}</span>
          <span class="ch mono">{r ? `CH${r.channel + 1}` : "–"}</span>
          {#if r}
            <Meter
              --fill-hue={String(i * 40)}
              leftLabel={String(r.min)}
              rightLabel={String(r.max)}
              value={((r.span / 1250) * 100).clamp(0, 100)}
            />
          {:else}
            <span class="muted">{$i18n.t("journeyDetail.notObserved")}</span>
          {/if}
        </div>
      {/each}
    </div>
    <div class="actions">
      <button
        class="btn"
        onclick={() => {
          resetObserved();
          onChanged?.();
        }}>{$i18n.t("journeyLink.resetObserved")}</button
      >
      <span class="muted"
        >{$i18n.t("journeyLink.window", {
          lo: profile.link.pulseMin || 885,
          hi: profile.link.pulseMax || 2115,
        })}</span
      >
    </div>
  </div>
</Section>

<ChannelAssignment />
<div class="save">
  <button class="btn primary" disabled={!mapDirty || saving} onclick={saveMap}
    >{$i18n.t("buttonSave")}</button
  >
  {#if mapDirty}
    <span class="muted">{$i18n.t("journeyUnsavedHint")}</span>
  {/if}
</div>

<Section label="journeyLink.armTitle">
  <div class="pad">
    <p class="fact">
      {#if profile.armSwitch.bound}
        {$i18n.t("journeyDetail.armSwitchBound", profile.armSwitch)}
      {:else}
        {$i18n.t("journeyDetail.armSwitchUnbound")}
      {/if}
    </p>
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyLink.armHelp")}
    </StageNote>
    <div class="actions">
      <button class="btn" onclick={() => openTab("auxiliary")}
        >{$i18n.t("journeyTab.auxiliary")}</button
      >
    </div>
  </div>
</Section>

<style lang="scss">
  .pad {
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fact {
    margin: 0;
    font-size: 0.9rem;
  }

  .muted {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .actions,
  .save {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .save {
    padding: 8px;
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }

  .observed {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    display: grid;
    grid-template-columns: 80px 48px 1fr;
    gap: 10px;
    align-items: center;
    font-size: 0.85rem;
  }
</style>
