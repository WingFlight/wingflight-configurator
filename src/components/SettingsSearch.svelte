<script>
  import { onMount } from "svelte";

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

  // The results panel is position:fixed and placed from the input's own
  // rectangle: the header bar clips its overflow (so wrapped status boxes
  // cannot spill over the page), and an absolutely positioned dropdown
  // hanging below the bar would be clipped to a few pixels.
  let menuStyle = $state("");

  function positionMenu() {
    if (!inputEl) return;
    const r = inputEl.getBoundingClientRect();
    const width = Math.max(Math.round(r.width), 260);
    const left = Math.min(Math.round(r.left), window.innerWidth - width - 8);
    menuStyle = `left:${Math.max(8, left)}px; top:${Math.round(r.bottom + 4)}px; width:${width}px;`;
  }

  function update() {
    results = search(query);
    active = 0;
    open = results.length > 0;
    if (open) positionMenu();
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

  let rootEl;

  onMount(() => {
    // Ctrl/Cmd+K focuses the search from anywhere; a click anywhere outside
    // the box closes the results.
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputEl?.focus();
      }
    };
    const outside = (e) => {
      if (open && rootEl && !rootEl.contains(e.target)) open = false;
    };
    const reposition = () => {
      if (open) positionMenu();
    };
    window.addEventListener("keydown", handler);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("keydown", handler);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
    };
  });
</script>

<div class="search" role="search" bind:this={rootEl}>
  <span class="icon fas fa-search" aria-hidden="true"></span>
  <input
    bind:this={inputEl}
    bind:value={query}
    type="search"
    placeholder={$i18n.t("settingsSearchLabel")}
    title={$i18n.t("settingsSearchPlaceholder")}
    aria-label={$i18n.t("settingsSearchPlaceholder")}
    oninput={update}
    onfocus={() => query.length >= 2 && update()}
    onblur={() => setTimeout(() => (open = false), 150)}
    onkeydown={onKey}
  />
  {#if open}
    <ul class="results" role="listbox" style={menuStyle}>
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

<style lang="scss">
  .search {
    position: relative;
    flex: 1 1 auto;
    min-width: 90px;
    max-width: 260px;
  }

  .icon {
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    color: var(--chrome-fg-muted);
    pointer-events: none;
  }

  input {
    width: 100%;
    height: 24px;
    font-size: 12px;
    padding: 0 8px 0 24px;
    color: var(--chrome-fg);
    background: var(--chrome-bg-sunken, var(--chrome-bg-raised));
    border: 1px solid var(--chrome-border);
    border-radius: var(--radius-pill);

    &::placeholder {
      color: var(--chrome-fg-muted);
    }
  }

  .results {
    position: fixed;
    z-index: 200;
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: min(360px, calc(100vh - 160px));
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

  // Touch sizing on the phone/tablet header, where the strip gets its own
  // full-width row. Last in the file so it wins over the base rules above.
  @media all and (max-width: 1100px) {
    .search {
      max-width: none;
    }

    input {
      height: 32px;
      font-size: 13px;
    }
  }
</style>
