<script>
  import {
    CONFIGURATOR,
    setDisclosureLevel,
  } from "@/js/configurator.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    openOverview,
    openStage,
  } from "@/tabs/journey/journey_state.svelte.js";
  import {
    STAGE_BY_ID,
    stageForTab,
    stageTitleKey,
  } from "@/tabs/journey/stages.js";

  let { children, loading = false, header, toolbar } = $props();

  // A tab whose every field is folded away at the current detail level would
  // otherwise render as a blank page with no explanation. Measure the content
  // box (the note itself sits outside it, so this cannot feed back) and say
  // what happened, with a way out.
  let contentEl = $state(null);
  let contentEmpty = $state(false);

  $effect(() => {
    if (!contentEl) {
      contentEmpty = false;
      return;
    }
    const measure = () => {
      contentEmpty = contentEl.getBoundingClientRect().height < 4;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(contentEl);
    measure();
    return () => observer.disconnect();
  });

  // Only when folding is actually the cause: at Expert nothing is hidden, so
  // an empty tab there is empty for its own reasons.
  let foldedAway = $derived(
    contentEmpty &&
      !loading &&
      CONFIGURATOR.connectionValid &&
      CONFIGURATOR.disclosureLevel !== "expert",
  );

  function showEverything() {
    setDisclosureLevel("expert");
  }

  // Breadcrumb from a settings tab back to the journey stage that owns it.
  // GUI.active_tab is set before the tab component mounts, so reading it once
  // here is enough; Page is mounted fresh on every tab switch.
  const activeTab = globalThis.GUI?.active_tab ?? null;
  const owner =
    activeTab && activeTab !== "journey" ? stageForTab(activeTab) : null;
  const ownerStage = owner && owner !== "tuning" ? STAGE_BY_ID[owner] : null;
</script>

<div class="container">
  <div class="wrapper">
    <header class="header">
      {#if CONFIGURATOR.connectionValid && owner}
        <nav class="crumb" aria-label="breadcrumb">
          <button class="crumb-link" onclick={openOverview}
            >{$i18n.t("tabJourney")}</button
          >
          {#if ownerStage}
            <span class="crumb-sep">›</span>
            <button class="crumb-link" onclick={() => openStage(ownerStage.id)}>
              {ownerStage.number} · {$i18n.t(stageTitleKey(ownerStage.id))}
            </button>
          {:else}
            <span class="crumb-sep">›</span>
            <span class="crumb-text">{$i18n.t("journeyTuning.title")}</span>
          {/if}
        </nav>
      {/if}
      {@render header?.()}
    </header>
    <main>
      {#if loading}
        <div class="loading">
          <div class="spinner"></div>
          <p>Waiting for data...</p>
        </div>
      {:else}
        <div class="content" bind:this={contentEl}>
          {@render children?.()}
        </div>
        {#if foldedAway}
          <div class="folded">
            <p>{$i18n.t("disclosureNothingHere")}</p>
            <button class="btn" onclick={showEverything}>
              {$i18n.t("disclosureShowEverything")}
            </button>
          </div>
        {/if}
      {/if}
    </main>
  </div>
  {#if toolbar}
    <div class="toolbar">
      {@render toolbar?.()}
    </div>
  {/if}
</div>

<style lang="scss">
  .container {
    display: grid;
    grid-template-rows: 1fr auto;
    height: 100%;

    color: var(--color-text);
    background-color: var(--color-bg);
  }

  .wrapper {
    display: grid;
    grid-template-rows: auto 1fr;
    overflow-y: auto;
    // Setting only overflow-y forces overflow-x to compute as "auto" too
    // (that's the CSS spec's rule for mismatched axes) - without this,
    // .wrapper silently becomes a horizontal scroll container for the
    // *whole* tab body (header included) whenever anything inside main
    // is wide, instead of staying vertical-only as intended.
    overflow-x: hidden;
  }

  .content {
    margin: 0 var(--section-gap) var(--section-gap);
  }

  main {
    // A grid item with the default overflow:visible sizes itself to fit
    // its widest descendant (e.g. a tab's wide table), which inflates
    // main - and drags .wrapper/.container along with it - instead of
    // letting that descendant's own overflow-x:auto box scroll locally.
    // min-width: 0 lets main shrink to the space it's actually given.
    min-width: 0;
  }

  .header {
    // Sticky so the tab title/controls stay put while the (often long)
    // body scrolls underneath - the header lives inside .wrapper, which
    // is the scroll container, so this costs nothing structurally.
    position: sticky;
    top: 0;
    z-index: 20;
    padding: 10px var(--section-gap);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    border-bottom: 1px solid var(--color-border-soft);

    color: var(--color-text);
    background-color: var(--color-surface);

    :global(html[data-theme="light"]) & {
      box-shadow: var(--shadow-xs);
    }

    :global(html[data-theme="dark"]) & {
      border-bottom-color: var(--color-neutral-800);
    }
  }

  // The one bit of brand colour in the tab chrome: a hairline accent rule
  // under the header instead of the old full-weight red border, which
  // read as a warning stripe rather than as structure.
  .header::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background: linear-gradient(
      90deg,
      var(--color-accent-500),
      transparent 55%
    );
    pointer-events: none;
  }

  .crumb {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: -4px;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .crumb-link {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--color-accent-600);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  .crumb-sep,
  .crumb-text {
    color: var(--color-text-muted);
  }

  .folded {
    margin: var(--section-gap);
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-soft);
    font-size: 0.85rem;
    max-width: 60ch;

    p {
      margin: 0;
    }
  }

  .folded .btn {
    @extend %button;
  }

  .loading {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .loading p {
    color: var(--color-text-muted);
  }

  .spinner {
    margin: 12px;
    height: 64px;
    width: 64px;
    background-image: url("/images/loading-spin.svg");
    background-repeat: no-repeat;
    background-position: center center;
  }

  .toolbar {
    display: flex;
    // Wrap instead of forcing every toolbar button into one row: on wide
    // screens there's always enough room so nothing wraps, but tabs with
    // several buttons (e.g. firmware flasher) would otherwise get squeezed
    // below their readable width - or push the whole page into horizontal
    // scroll - on narrow/mobile viewports.
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    justify-content: end;
    bottom: 0;
    left: 0;
    width: 100%;
    box-sizing: border-box;
    z-index: 1000;

    :global(html[data-theme="light"]) & {
      background: var(--color-surface);
      border-top: 1px solid var(--color-border-soft);
      box-shadow: 0 -2px 10px -4px var(--color-shadow);
    }

    :global(html[data-theme="dark"]) & {
      background: var(--color-surface);
      border-top: 1px solid var(--color-neutral-800);
    }
  }

  @media only screen and (max-width: 480px) {
    .content {
      margin: 0;
    }

    .header {
      margin-bottom: 8px;
    }

    .toolbar {
      justify-content: center;
    }
  }
</style>
