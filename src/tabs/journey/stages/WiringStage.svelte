<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import Section from "@/components/Section.svelte";
  import Tier from "@/components/Tier.svelte";

  import StageNote from "../StageNote.svelte";
  import { openTab } from "../journey_state.svelte.js";
  import WiringBoard from "../wiring/WiringBoard.svelte";

  // Stage 3 · Wiring. The board canvas and pin mapping (P3) live in
  // WiringBoard; this file frames them with the output table and RX port
  // summary that work without a CLI read.
  let { onChanged } = $props();

  let profile = $derived(getProfile());

  function padFor(output) {
    if (Array.isArray(profile.padsInUse)) {
      const pad = profile.padsInUse.find((p) => p.key === output.label);
      return pad ? `${pad.silkscreen ?? "?"} · ${pad.pin}` : null;
    }
    const limit =
      output.kind === "servo"
        ? profile.board.servoPads
        : profile.board.motorPads;
    return output.index <= limit
      ? $i18n.t("journeyWiring.padByIndex", { label: output.label })
      : null;
  }

  let rxPort = $derived.by(() => {
    const link = profile.link;
    if (link.type !== "serial") return null;
    return (
      (FC.SERIAL_CONFIG.ports ?? []).find((p) =>
        p.functions.includes("RX_SERIAL"),
      ) ?? null
    );
  });
</script>

<Section label="journeyWiring.boardTitle">
  <div class="pad">
    <WiringBoard {onChanged} />
  </div>
</Section>

<Section label="journeyWiring.outputsTitle">
  <table class="outputs">
    <thead>
      <tr>
        <th>{$i18n.t("journeyWiring.output")}</th>
        <th>{$i18n.t("journeyWiring.drives")}</th>
        <th>{$i18n.t("journeyWiring.pad")}</th>
      </tr>
    </thead>
    <tbody>
      {#each profile.outputs as o (o.dst)}
        {@const pad = padFor(o)}
        <tr class:missing={!pad}>
          <td class="mono">{o.label}</td>
          <td
            >{$i18n.t(`journeyRole.${o.role}`)}{o.side &&
            o.side !== "center" &&
            o.side !== "both"
              ? ` (${$i18n.t(`journeySide.${o.side}`)})`
              : ""}</td
          >
          <td>{pad ?? $i18n.t("journeyWiring.noPad")}</td>
        </tr>
      {/each}
      {#if profile.outputs.length === 0}
        <tr
          ><td colspan="3" class="muted">{$i18n.t("journeyDetail.noRules")}</td
          ></tr
        >
      {/if}
    </tbody>
  </table>
</Section>

<Section label="journeyWiring.receiverTitle">
  <div class="pad">
    <p class="fact">
      {#if profile.link.type === "serial"}
        {$i18n.t("journeyWiring.serialSummary", {
          protocol: profile.link.providerName,
          port: rxPort ? rxPort.identifier : "–",
        })}
      {:else if profile.link.type === "none"}
        {$i18n.t("journeyDetail.noReceiverType")}
      {:else}
        {$i18n.t("journeyDetail.rxType", {
          type: profile.link.type.toUpperCase(),
        })}
      {/if}
    </p>
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyWiring.receiverHelp")}
    </StageNote>
    <div class="actions">
      <button class="btn" onclick={() => openTab("configuration")}
        >{$i18n.t("journeyWiring.openPorts")}</button
      >
      <button class="btn" onclick={() => openTab("receiver")}
        >{$i18n.t("journeyTab.receiver")}</button
      >
    </div>
  </div>
</Section>

<Tier level="expert">
  <Section label="journeyWiring.remapTitle">
    <div class="pad">
      <WiringBoard {onChanged} mode="table" />
    </div>
  </Section>
</Tier>

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

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    @extend %button;
  }

  .outputs {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;

    th,
    td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px dotted var(--color-border);
    }

    th {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
    }
  }

  .mono {
    font-family: var(--font-mono);
  }

  .missing td {
    color: var(--color-status-bad);
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
