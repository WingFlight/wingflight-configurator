<script>
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import CheckList from "./CheckList.svelte";
  import StageBadge from "./StageBadge.svelte";
  import { openOverview, openStage, openTab } from "./journey_state.svelte.js";
  import {
    STAGES,
    STAGE_BY_ID,
    STAGE_IDS,
    stageQuestionKey,
    stageTitleKey,
  } from "./stages.js";

  import BoardStage from "./stages/BoardStage.svelte";
  import AirframeStage from "./stages/AirframeStage.svelte";
  import WiringStage from "./stages/WiringStage.svelte";
  import LinkStage from "./stages/LinkStage.svelte";
  import OutputsStage from "./stages/OutputsStage.svelte";
  import SafetyStage from "./stages/SafetyStage.svelte";
  import PowerStage from "./stages/PowerStage.svelte";
  import PreflightStage from "./stages/PreflightStage.svelte";

  // One stage's detail view. The stage never re-implements a tab: the body
  // embeds existing components filtered to what this step needs and links
  // out to the full tab for everything else.
  let { stageId, evaluation, onChanged } = $props();

  let stage = $derived(STAGE_BY_ID[stageId]);
  let profile = $derived(getProfile());
  let index = $derived(STAGE_IDS.indexOf(stageId));
  let prev = $derived(index > 0 ? STAGES[index - 1] : null);
  let next = $derived(index < STAGES.length - 1 ? STAGES[index + 1] : null);

  const BODIES = {
    board: BoardStage,
    airframe: AirframeStage,
    wiring: WiringStage,
    link: LinkStage,
    outputs: OutputsStage,
    safety: SafetyStage,
    power: PowerStage,
    preflight: PreflightStage,
  };
  let Body = $derived(BODIES[stageId]);
</script>

<nav class="crumbs" aria-label="breadcrumb">
  <button class="link" onclick={openOverview}>{$i18n.t("tabJourney")}</button>
  <span class="sep">›</span>
  <span>{stage.number} · {$i18n.t(stageTitleKey(stageId))}</span>
</nav>

<header class="stage-header">
  <div class="heading">
    <h2>{stage.number} · {$i18n.t(stageTitleKey(stageId))}</h2>
    <p class="question">{$i18n.t(stageQuestionKey(stageId))}</p>
  </div>
  {#if evaluation}
    <StageBadge badge={evaluation.badge} />
  {/if}
</header>

<div class="layout">
  <section class="checks">
    <h3>{$i18n.t("journeyChecksTitle")}</h3>
    {#if evaluation}
      <CheckList
        results={evaluation.results}
        uid={profile.board.uid}
        {onChanged}
      />
    {/if}
    {#if stage.tabs.length > 0}
      <div class="links">
        <span class="links-label">{$i18n.t("journeyOpenTab")}</span>
        {#each stage.tabs as tab (tab)}
          <button class="btn" onclick={() => openTab(tab)}
            >{$i18n.t(`journeyTab.${tab}`)}</button
          >
        {/each}
      </div>
    {/if}
  </section>

  <section class="body">
    {#if Body}
      <Body {evaluation} {onChanged} />
    {/if}
  </section>
</div>

<footer class="stage-footer">
  {#if prev}
    <button class="btn" onclick={() => openStage(prev.id)}
      >‹ {prev.number} · {$i18n.t(stageTitleKey(prev.id))}</button
    >
  {:else}
    <span></span>
  {/if}
  {#if next}
    <button class="btn" onclick={() => openStage(next.id)}
      >{next.number} · {$i18n.t(stageTitleKey(next.id))} ›</button
    >
  {:else}
    <button class="btn" onclick={openOverview}
      >{$i18n.t("journeyBackToOverview")}</button
    >
  {/if}
</footer>

<style lang="scss">
  .crumbs {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: var(--section-gap);
    font-size: 0.8rem;
    color: var(--color-text-soft);
  }

  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--color-accent-600);
    cursor: pointer;
    font-size: inherit;

    &:hover {
      text-decoration: underline;
    }
  }

  .stage-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .question {
    margin: 2px 0 0;
    color: var(--color-text-soft);
    font-size: 0.9rem;
  }

  h3 {
    margin: 0;
    padding: 0 8px 6px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(300px, 380px) 1fr;
    gap: var(--section-gap);
    margin-top: var(--section-gap);
    align-items: start;
  }

  .checks {
    @extend %section-shadow;
    padding: 10px 4px;
    background: var(--color-surface);
    position: sticky;
    top: 60px;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 10px 8px 0;
    border-top: 1px solid var(--color-border-soft);
    margin-top: 6px;
  }

  .links-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .body {
    min-width: 0;
  }

  .btn {
    @extend %button;
  }

  .stage-footer {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: var(--section-gap);
  }

  @media only screen and (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .checks {
      position: static;
    }
  }
</style>
