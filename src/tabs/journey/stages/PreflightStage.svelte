<script>
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import Section from "@/components/Section.svelte";

  import { acknowledgmentsForUid } from "../acknowledgments.svelte.js";
  import StageNote from "../StageNote.svelte";
  import { evaluateAllStages } from "../journey_state.svelte.js";
  import { STAGES, stageTitleKey } from "../stages.js";

  // Stage 8 · Pre-flight. Every physical check is acknowledged in the check
  // list on the left; this body explains each one and offers the exportable
  // pre-flight card to take to the field.
  let { evaluation } = $props();

  let profile = $derived(getProfile());

  const GUIDES = [
    "preflight.surfaceDirections",
    "preflight.stabilisationDirection",
    "preflight.centreOfGravity",
    "preflight.controlThrows",
    "preflight.rangeCheck",
  ];

  function statusOf(id) {
    return evaluation?.results?.find((r) => r.id === id)?.status ?? "unknown";
  }

  // Plain-text card: stages with badges, every check with status, and the
  // acknowledgment timestamps. Copied to the clipboard and offered as a
  // download.
  function buildCard() {
    const all = evaluateAllStages();
    const lines = [];
    lines.push(
      `Wingflight pre-flight card — ${profile.board.craftName || "unnamed"}`,
    );
    lines.push(
      `${profile.board.targetName} · ${profile.board.firmwareIdentifier} ${profile.board.firmwareVersion} · uid ${profile.board.uid}`,
    );
    lines.push(
      `Layout ${profile.layout}, ${profile.surfaces.length} surfaces, ${profile.motorCount} motor(s), link ${profile.link.type}${profile.link.providerName ? ` (${profile.link.providerName})` : ""}`,
    );
    lines.push(`Generated ${new Date().toISOString()}`);
    lines.push("");
    for (const stage of STAGES) {
      const e = all[stage.id];
      lines.push(
        `${stage.number}. ${$i18n.t(stageTitleKey(stage.id))} — ${$i18n.t(`journeyBadge.${e.badge}`)}`,
      );
      for (const r of e.results) {
        const mark =
          { pass: "[x]", fail: "[ ]", unknown: "[?]", stale: "[!]", na: "[-]" }[
            r.status
          ] ?? "[?]";
        lines.push(
          `   ${mark} ${$i18n.t(r.titleKey, r.titleValues ?? {})}${r.detail ? ` — ${$i18n.t(r.detail, r.values ?? {})}` : ""}`,
        );
      }
    }
    lines.push("");
    const acks = acknowledgmentsForUid(profile.board.uid);
    if (acks.length) {
      lines.push("Acknowledged:");
      for (const a of acks)
        lines.push(
          `   ${a.checkId} — ${new Date(a.timestamp).toISOString()} (hash ${a.configHash})`,
        );
    }
    return lines.join("\n");
  }

  let copied = $state(false);

  async function copyCard() {
    const text = buildCard();
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      GUI.log(text);
    }
  }

  function downloadCard() {
    const text = buildCard();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preflight_${(profile.board.craftName || profile.board.targetName || "wingflight").replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<Section label="journeyPreflight.guideTitle">
  <div class="pad">
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyPreflight.intro")}
    </StageNote>
    <ol class="guides">
      {#each GUIDES as id (id)}
        <li class={statusOf(id)}>
          <strong>{$i18n.t(`journeyCheck.${id}.title`)}</strong>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p>{@html $i18n.t(`journeyPreflight.${id.split(".")[1]}`)}</p>
        </li>
      {/each}
    </ol>
  </div>
</Section>

<Section label="journeyPreflight.cardTitle">
  <div class="pad">
    <p class="muted">{$i18n.t("journeyPreflight.cardHelp")}</p>
    <div class="actions">
      <button class="btn" onclick={copyCard}
        >{copied
          ? $i18n.t("journeyPreflight.copied")
          : $i18n.t("journeyPreflight.copy")}</button
      >
      <button class="btn" onclick={downloadCard}
        >{$i18n.t("journeyPreflight.download")}</button
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

  .guides {
    margin: 0;
    padding-left: 1.4em;
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 8px;

    p {
      margin: 2px 0 0;
      color: var(--color-text-soft);
    }

    li.pass strong {
      color: var(--color-status-good);
    }

    li.stale strong {
      color: var(--color-status-bad);
    }
  }

  .muted {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    @extend %button;
  }
</style>
