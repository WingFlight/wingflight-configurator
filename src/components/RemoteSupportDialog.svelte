<script>
  import { tick } from "svelte";
  import "rrweb/dist/style.css";

  import { i18n } from "@/js/i18n.js";
  import {
    remote,
    startSession,
    startSharing,
    stopSession,
    startWatching,
    stopWatching,
  } from "@/js/protocols/RemoteView.svelte.js";

  // The remote support dialog (desktop configurator only): start or end a
  // session through the remote support tool running on this computer, and,
  // as the pilot, watch the supporter's screen. See RemoteView.js.
  let dialogEl;
  let viewerEl = $state();
  let viewerOpen = $state(false);
  let joinCode = $state("");

  // A native <dialog> centers against the nearest transformed ancestor, and
  // #content carries a (no-op) transform, so live under <body> instead.
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  export function open() {
    dialogEl.showModal();
  }

  function onDialogClick(e) {
    if (e.target === dialogEl) dialogEl.close();
  }

  function join() {
    startSession(joinCode);
  }

  async function watch() {
    dialogEl.close();
    viewerOpen = true;
    await tick();
    startWatching(viewerEl);
  }

  function stopWatch() {
    stopWatching();
    viewerOpen = false;
  }

  function kill() {
    stopWatch();
    stopSession();
  }

  let status = $derived.by(() => {
    if (remote.role === "share") {
      return remote.peerConnected
        ? $i18n.t("remoteSupportSupporterConnected")
        : $i18n.t("remoteSupportWaitingSupporter");
    }
    if (remote.role === "join") {
      return $i18n.t("remoteSupportConnectedPilot");
    }
    return "";
  });
</script>

<dialog bind:this={dialogEl} use:portal onclick={onDialogClick}>
  <div class="head">
    <h3>{$i18n.t("remoteSupportTitle")}</h3>
    <button
      class="close"
      onclick={() => dialogEl.close()}
      aria-label={$i18n.t("close")}
    >
      <span class="fas fa-times"></span>
    </button>
  </div>

  <div class="body">
    {#if !remote.toolRunning}
      <p class="note">{$i18n.t("remoteSupportToolMissing")}</p>
    {:else if remote.role === null}
      {#if remote.message}
        <p class="note" class:error={remote.error}>{remote.message}</p>
      {/if}
      <section>
        <h4>{$i18n.t("remoteSupportShareTitle")}</h4>
        <p>{$i18n.t("remoteSupportShareHint")}</p>
        <button class="btn" onclick={startSharing}>
          {$i18n.t("remoteSupportShare")}
        </button>
      </section>
      <section>
        <h4>{$i18n.t("remoteSupportJoinTitle")}</h4>
        <div class="row">
          <input
            type="text"
            bind:value={joinCode}
            placeholder={$i18n.t("remoteSupportCodePlaceholder")}
            autocomplete="off"
            spellcheck="false"
            onkeydown={(e) => e.key === "Enter" && join()}
          />
          <button class="btn" onclick={join}>
            {$i18n.t("remoteSupportJoin")}
          </button>
        </div>
      </section>
    {:else}
      <section>
        {#if remote.role === "share"}
          <h4>{$i18n.t("remoteSupportCode")}</h4>
          <p class="code">{remote.code || "..."}</p>
        {/if}
        <p>{status}</p>
        {#if remote.device}
          <p>{$i18n.t("remoteSupportDevice", [remote.device])}</p>
        {/if}
        {#if remote.role === "join"}
          <p class="note" class:watched={remote.beingWatched}>
            {remote.beingWatched
              ? $i18n.t("remoteSupportBeingWatched")
              : $i18n.t("remoteSupportNotWatched")}
          </p>
        {/if}
        <div class="row">
          {#if remote.role === "share" && remote.peerConnected && !viewerOpen}
            <button class="btn" onclick={watch}>
              {$i18n.t("remoteSupportWatch")}
            </button>
          {/if}
          <button class="btn danger" onclick={kill}>
            {$i18n.t("remoteSupportKill")}
          </button>
        </div>
      </section>
    {/if}
  </div>
</dialog>

{#if viewerOpen}
  <div class="viewer" use:portal>
    <div class="viewer-bar">
      <span>
        {remote.hasFrame
          ? $i18n.t("remoteSupportWatching")
          : $i18n.t("remoteSupportWatchWaiting")}
      </span>
      <button class="btn" onclick={stopWatch}>
        {$i18n.t("remoteSupportStopWatch")}
      </button>
      <button class="btn danger" onclick={kill}>
        {$i18n.t("remoteSupportKill")}
      </button>
    </div>
    <div class="viewer-stage" bind:this={viewerEl}></div>
  </div>
{/if}

<style lang="scss">
  dialog {
    width: 34em;
    max-width: calc(100vw - 2em);
    padding: 0;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border-soft);

    h3 {
      flex: 1;
      margin: 0;
    }
  }

  .close {
    background: none;
    border: 0;
    cursor: pointer;
    color: inherit;
  }

  .body {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  section h4 {
    margin: 0 0 6px;
  }

  p {
    margin: 0 0 8px;
  }

  .row {
    display: flex;
    gap: 8px;

    input {
      flex: 1;
    }
  }

  .code {
    font-size: 1.6em;
    font-variant-numeric: tabular-nums;
    user-select: all;
  }

  .note.error {
    color: var(--color-status-bad);
  }

  .note.watched {
    color: var(--color-status-good);
  }

  .danger {
    margin-left: auto;
  }

  .viewer {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
  }

  .viewer-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border-soft);

    span {
      flex: 1;
    }
  }

  .viewer-stage {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    // Read-only: nothing here can reach the supporter.
    pointer-events: none;
  }
</style>
