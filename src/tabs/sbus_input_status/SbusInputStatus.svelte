<script>
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";

  import Page from "@/components/Page.svelte";
  import Meter from "@/components/Meter.svelte";

  // Live channel/link readout for the SBUS-In Fallback receiver -- this tab
  // only appears in the sidebar once a port has that function assigned (see
  // updateTabList() in js/main.js), so a fast poll here is meant to look
  // live during a bench test, not passive background telemetry.
  const POLL_INTERVAL_MS = 200;
  const METER_MIN = 750;
  const METER_MAX = 2250;

  let loading = $state(true);

  let status = $derived(
    FC.SBUS_INPUT_STATUS ?? {
      enabled: false,
      linkUp: false,
      activeSource: "main",
      channels: [],
    },
  );

  let pollerInterval;

  function channelWidth(value) {
    return ((100 * (value - METER_MIN)) / (METER_MAX - METER_MIN)).clamp(
      0,
      100,
    );
  }

  async function refresh() {
    await MSP.promise(MSPCodes.MSP2_WING_SBUS_INPUT_STATUS);
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabSbusInputStatus"), "_system");
  }

  onMount(async () => {
    await refresh();
    loading = false;

    pollerInterval = setInterval(refresh, POLL_INTERVAL_MS);
  });

  onDestroy(() => {
    clearInterval(pollerInterval);
  });
</script>

{#snippet header()}
  <h1>{$i18n.t("tabSbusInputStatus")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

<Page {header} {loading}>
  <p class="description">
    {$i18n.t("sbusInputStatusDescription")}
    <a class="learn-more" href={getTabHelpURL("tabSbusInputStatus")} target="_system">
      {$i18n.t("fbusSensorsLearnMore")}
    </a>
  </p>

  <div class="status-row">
    <span
      class="badge"
      class:up={status.linkUp}
      class:down={!status.linkUp}
    >
      {status.linkUp
        ? $i18n.t("sbusInputStatusLinkUp")
        : $i18n.t("sbusInputStatusLinkDown")}
    </span>
    <span class="badge" class:active={status.activeSource === "fallback"}>
      {status.activeSource === "fallback"
        ? $i18n.t("sbusInputStatusActiveFallback")
        : $i18n.t("sbusInputStatusActiveMain")}
    </span>
  </div>

  {#if status.channels.length === 0}
    <p class="note">{$i18n.t("sbusInputStatusEmpty")}</p>
  {:else}
    <div class="channels">
      {#each status.channels as value, index (index)}
        <Meter
          --fill-hue={(index * 20).toString()}
          title={`CH${index + 1}`}
          leftLabel={value}
          value={channelWidth(value)}
        />
      {/each}
    </div>
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
    min-width: 60px;
  }

  .description {
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
    padding: 8px 12px;
    border-radius: 4px;

    color: var(--color-text-soft);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .learn-more {
    color: var(--color-border-accent);
    white-space: nowrap;

    &:hover {
      text-decoration: none;
    }
  }

  .note {
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
    padding: 8px 12px;
    border-radius: 4px;

    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);
  }

  .status-row {
    display: flex;
    gap: 8px;
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
  }

  .badge {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .badge.up {
    color: var(--color-border-accent);
    border-color: var(--color-border-accent);
  }

  // "active" here means the SBUS-in link is the one currently driving the
  // aircraft (main link down) -- worth calling out the same way "down" is.
  .badge.down,
  .badge.active {
    color: var(--color-danger, var(--color-border-accent));
    border-color: var(--color-danger, var(--color-border-accent));
  }

  .channels {
    display: grid;
    gap: 6px;
    margin-bottom: var(--section-gap);
  }
</style>
