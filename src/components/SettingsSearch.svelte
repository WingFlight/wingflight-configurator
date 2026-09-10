<script>
  import { onMount } from "svelte";

  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { invalidateIndex, jumpTo, search } from "@/js/settings_search.js";

  // Header search box. Finds a field regardless of tier or relevance and
  // jumps to it with the containing tab open.
  let query = $state("");
  let results = $state([]);
  let open = $state(false);
  let active = $state(0);
  let inputEl;

  $effect(() => {
    // Rebuild the index when the language changes.
    $i18n;
    invalidateIndex();
  });

  function update() {
    results = search(query);
    active = 0;
    open = results.length > 0;
  }

  async function pick(entry) {
    open = false;
    query = "";
    await jumpTo(entry);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      open = false;
      inputEl?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) active = (active + 1) % results.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length)
        active = (active - 1 + results.length) % results.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) pick(results[active]);
    }
  }

  onMount(() => {
    // Ctrl/Cmd+K focuses the search from anywhere.
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputEl?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
</script>

{#if CONFIGURATOR.connectionValid}
  <div class="search" role="search">
    <input
      bind:this={inputEl}
      bind:value={query}
      type="search"
      placeholder={$i18n.t("settingsSearchPlaceholder")}
      aria-label={$i18n.t("settingsSearchPlaceholder")}
      oninput={update}
      onfocus={() => query.length >= 2 && update()}
      onblur={() => setTimeout(() => (open = false), 150)}
      onkeydown={onKey}
    />
    {#if open}
      <ul class="results" role="listbox">
        {#each results as r, i (r.id ?? r.key)}
          <li>
            <button
              class={["result", i === active && "active"]}
              role="option"
              aria-selected={i === active}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => pick(r)}
            >
              <span class="label">{r.label}</span>
              <span class="meta">
                {$i18n.t(`journeyTab.${r.tab}`, { defaultValue: r.tab })}
                {#if r.tier && r.tier !== "standard"}
                  · {$i18n.t(
                    `disclosureLevel${r.tier[0].toUpperCase()}${r.tier.slice(1)}`,
                  )}
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style lang="scss">
  .search {
    position: relative;
    width: 220px;
    margin-right: 14px;
  }

  input {
    width: 100%;
    height: 26px;
    font-size: 12px;
    padding: 0 8px;
    color: var(--chrome-fg);
    background: var(--chrome-bg-sunken, var(--chrome-bg-raised));
    border: 1px solid var(--chrome-border);
    border-radius: var(--radius-pill);

    &::placeholder {
      color: var(--chrome-fg-muted);
    }
  }

  .results {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    z-index: 200;
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 360px;
    overflow-y: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    cursor: pointer;
    color: var(--color-text);

    &:hover,
    &.active {
      background: var(--color-hover);
    }
  }

  .label {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .meta {
    font-size: 0.68rem;
    color: var(--color-text-muted);
  }

  @media only screen and (max-width: 1100px) {
    .search {
      width: 150px;
      margin-right: 8px;
    }
  }
</style>
