<script>
  import { onDestroy, onMount } from "svelte";

  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import Page from "@/components/Page.svelte";

  import Stage from "./Stage.svelte";
  import StageBadge from "./StageBadge.svelte";
  import Tuning from "./Tuning.svelte";
  import {
    evaluateAllStages,
    journey,
    openStage,
    openTab,
    pollLiveData,
    refreshJourneyData,
    syncObservedToBoard,
  } from "./journey_state.svelte.js";
  import {
    STAGES,
    STAGE_IDS,
    stageQuestionKey,
    stageTitleKey,
  } from "./stages.js";
  import { allStagesVerified, nextStageId } from "./status.js";

  let loading = $state(true);
  let tick = $state(0);
  let poller;
  let polling = false;

  let profile = $derived(getProfile());

  // Re-evaluated on every live tick (and whenever the profile changes).
  let evaluation = $derived.by(() => {
    tick;
    return loading ? {} : evaluateAllStages();
  });
  let badges = $derived(
    Object.fromEntries(
      Object.entries(evaluation).map(([id, e]) => [id, e.badge]),
    ),
  );
  let next = $derived(nextStageId(badges, STAGE_IDS));
  let complete = $derived(!loading && allStagesVerified(badges, STAGE_IDS));

  onMount(async () => {
    await refreshJourneyData();
    syncObservedToBoard(getProfile().board.uid);
    loading = false;

    poller = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        await pollLiveData();
        tick += 1;
      } finally {
        polling = false;
      }
    }, 100);
  });

  onDestroy(() => {
    clearInterval(poller);
  });

  function refresh() {
    tick += 1;
  }

  let boardLabel = $derived(
    [
      profile.board.craftName,
      profile.board.targetName,
      profile.board.firmwareVersion ? `v${profile.board.firmwareVersion}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
</script>

{#snippet header()}
  <h1>{$i18n.t("tabJourney")}</h1>
  {#if !loading && boardLabel}
    <span class="board">{boardLabel}</span>
  {/if}
  <div class="grow"></div>
  <button class="btn" onclick={() => openTab("status")}
    >{$i18n.t("journeyAllSettings")}</button
  >
{/snippet}

<Page {header} {loading}>
  {#if journey.activeStage}
    <Stage
      stageId={journey.activeStage}
      evaluation={evaluation[journey.activeStage]}
      onChanged={refresh}
    />
  {:else}
    <p class="intro">{$i18n.t("journeyIntro")}</p>

    {#if complete}
      <div class="complete">
        <strong>{$i18n.t("journeyCompleteTitle")}</strong>
        <span>{$i18n.t("journeyCompleteText")}</span>
      </div>
    {/if}

    <ol class="stages">
      {#each STAGES as stage (stage.id)}
        {@const e = evaluation[stage.id]}
        <li>
          <button
            class={["stage", e?.badge, next === stage.id && "next"]}
            onclick={() => openStage(stage.id)}
            aria-label={`${stage.number} ${$i18n.t(stageTitleKey(stage.id))}`}
          >
            <span class="number">{stage.number}</span>
            <span class="body">
              <span class="title">{$i18n.t(stageTitleKey(stage.id))}</span>
              <span class="question">{$i18n.t(stageQuestionKey(stage.id))}</span
              >
              {#if e && e.badge !== "notApplicable"}
                <span class="progress">
                  {$i18n.t("journeyProgress", {
                    passed: e.progress.passed,
                    total: e.progress.total,
                  })}
                </span>
              {/if}
            </span>
            <span class="badge-slot">
              {#if e}
                <StageBadge badge={e.badge} />
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ol>

    <Tuning {badges} {complete} />

    {#if CONFIGURATOR.virtualMode}
      <p class="note">{$i18n.t("journeyVirtualNote")}</p>
    {/if}
    {#if !FC.CONFIG.uid?.some((v) => v !== 0)}
      <p class="note">{$i18n.t("journeyNoUidNote")}</p>
    {/if}
  {/if}
</Page>

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .board {
    font-weight: 400;
    font-size: 0.8rem;
    color: var(--color-text-soft);
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .intro {
    margin: var(--section-gap) 4px 0;
    color: var(--color-text-soft);
    font-size: 0.85rem;
    max-width: 70ch;
  }

  .complete {
    margin: var(--section-gap) 0 0;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    border: 1px solid
      color-mix(in srgb, var(--color-status-good) 40%, transparent);
    background: color-mix(
      in srgb,
      var(--color-status-good) 8%,
      var(--color-surface)
    );
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
  }

  .stages {
    list-style: none;
    margin: var(--section-gap) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .stage {
    @extend %section-shadow;
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: 12px;
    align-items: start;
    width: 100%;
    padding: 12px;
    text-align: left;
    cursor: pointer;
    color: var(--color-text);
    background: var(--color-surface);
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed);

    &:hover {
      background: var(--color-hover);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-focus-ring);
    }

    &.next {
      border-color: var(--color-accent-500);
    }
  }

  .number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-weight: 700;
    background: var(--color-header-bg);
    color: var(--color-header-fg);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .question {
    font-size: 0.8rem;
    color: var(--color-text-soft);
  }

  .progress {
    margin-top: 4px;
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .badge-slot {
    align-self: start;
  }

  .note {
    margin-top: var(--section-gap);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
