<script>
  import { tick } from "svelte";
  import "rrweb/dist/style.css";

  import { i18n } from "@/js/i18n.js";
  import { serial } from "@/js/serial.js";
  import {
    remote,
    startSession,
    startSharing,
    stopSession,
    startWatching,
    stopWatching,
  } from "@/js/protocols/RemoteView.svelte.js";

  // The remote support panel (desktop configurator only): start or end a
  // session. It doesn't block the configurator: the supporter works with it
  // open. While sharing, the pilot's window shows the supporter's screen
  // instead of their own configurator, which lets go of the flight
  // controller so the supporter can use it. See RemoteSupport.js and
  // RemoteView.svelte.js.
  let dialogEl;
  let viewerEl = $state();
  let viewerOpen = $state(false);
  let joinCode = $state("");
  // Both sides confirm the safety notes before a session can start.
  let shareAcknowledged = $state(false);
  let joinAcknowledged = $state(false);

  // Fixed positioning is relative to the nearest transformed ancestor, and
  // #content carries a (no-op) transform, so live under <body> instead.
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  /** Shows the panel, or hides it if it is already open. */
  export function open() {
    if (dialogEl.open) {
      dialogEl.close();
    } else {
      dialogEl.show();
    }
  }

  function join() {
    if (joinAcknowledged) {
      startSession(joinCode);
    }
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

  async function kill() {
    // A supporter connected to the pilot's board disconnects first, while
    // the link is still up, so the board gets its motors stopped and its
    // overrides released by the normal disconnect. The pilot's side does
    // the same again once the session is gone.
    if (remote.role === "join" && serial.connectionType === "remote") {
      if (GUI.connected_to || GUI.connecting_to) {
        document.querySelector("div#connectbutton a.connect")?.click();
      }
      const deadline = Date.now() + 4000;
      while (
        (GUI.connected_to || GUI.disconnect_in_progress) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    stopSession();
  }

  // Sharing, whether started here or in the remote support tool: give up
  // the flight controller and show the supporter's screen until it ends.
  $effect(() => {
    if (remote.role === "share" && !viewerOpen) {
      if (GUI.connected_to || GUI.connecting_to) {
        document.querySelector("div#connectbutton a.connect")?.click();
      }
      watch();
    } else if (remote.role !== "share" && viewerOpen) {
      stopWatch();
      // Show how the session ended.
      dialogEl.show();
    }
  });

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

<dialog bind:this={dialogEl} use:portal>
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
    {#if remote.role === null}
      {#if remote.message}
        <p class="note" class:error={remote.error}>{remote.message}</p>
      {/if}
      <section>
        <h4>{$i18n.t("remoteSupportShareTitle")}</h4>
        <p>{$i18n.t("remoteSupportShareHint")}</p>
        <div class="safety">
          <p>
            <span class="fas fa-exclamation-triangle"></span>
            {$i18n.t("remoteSupportSafetyPilot")}
          </p>
          <label>
            <input type="checkbox" bind:checked={shareAcknowledged} />
            {$i18n.t("remoteSupportSafetyAck")}
          </label>
        </div>
        <button
          class="btn"
          disabled={!shareAcknowledged}
          onclick={startSharing}
        >
          {$i18n.t("remoteSupportShare")}
        </button>
      </section>
      <section>
        <h4>{$i18n.t("remoteSupportJoinTitle")}</h4>
        <div class="safety">
          <p>
            <span class="fas fa-exclamation-triangle"></span>
            {$i18n.t("remoteSupportSafetySupporter")}
          </p>
          <label>
            <input type="checkbox" bind:checked={joinAcknowledged} />
            {$i18n.t("remoteSupportSafetyAck")}
          </label>
        </div>
        <div class="row">
          <input
            type="text"
            bind:value={joinCode}
            placeholder={$i18n.t("remoteSupportCodePlaceholder")}
            autocomplete="off"
            spellcheck="false"
            onkeydown={(e) => e.key === "Enter" && join()}
          />
          <button class="btn" disabled={!joinAcknowledged} onclick={join}>
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
          <p class="safety">
            <span class="fas fa-exclamation-triangle"></span>
            {$i18n.t("remoteSupportSafetyReminder")}
          </p>
          <p class="note" class:watched={remote.beingWatched}>
            {remote.beingWatched
              ? $i18n.t("remoteSupportBeingWatched")
              : $i18n.t("remoteSupportNotWatched")}
          </p>
        {/if}
        <div class="row">
          <button class="btn danger" onclick={kill}>
            {$i18n.t("remoteSupportKill")}
          </button>
        </div>
      </section>
    {/if}
  </div>
</dialog>

{#if remote.role === "share"}
  <!-- Sharing gives someone else access to this computer's flight
       controller, so it must be impossible to miss. -->
  <div class="session-frame" use:portal>
    <div class="session-badge">
      <span class="fas fa-headset"></span>
      <span>
        {remote.peerConnected
          ? $i18n.t("remoteSupportFrameConnected")
          : $i18n.t("remoteSupportFrameWaiting")}
      </span>
      <button onclick={kill}>{$i18n.t("remoteSupportKill")}</button>
    </div>
  </div>
{/if}

{#if viewerOpen}
  <div class="viewer" use:portal>
    <div class="viewer-bar">
      <span class="fas fa-eye"></span>
      <span class="label">
        {#if !remote.peerConnected}
          {$i18n.t("remoteSupportFrameWaiting")}
        {:else if !remote.hasFrame}
          {$i18n.t("remoteSupportWatchWaiting")}
        {:else}
          {$i18n.t("remoteSupportWatching")}
        {/if}
      </span>
      <span class="reminder">
        <span class="fas fa-exclamation-triangle"></span>
        {$i18n.t("remoteSupportSafetyReminderPilot")}
      </span>
      <button class="btn danger" onclick={kill}>
        {$i18n.t("remoteSupportKill")}
      </button>
    </div>
    <div class="viewer-body">
      <div class="viewer-stage" bind:this={viewerEl}></div>
      {#if !remote.peerConnected || !remote.hasFrame}
        <div class="viewer-placeholder">
          {#if !remote.peerConnected}
            <p>{$i18n.t("remoteSupportViewerCodeHint")}</p>
            <p class="code">{remote.code || "..."}</p>
          {:else}
            <p>{$i18n.t("remoteSupportWatchWaiting")}</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  // A floating panel above the status bar, not a modal: the configurator
  // stays usable while it is open.
  dialog {
    position: fixed;
    inset: auto 12px 32px auto;
    z-index: 9000;
    width: 30em;
    max-width: calc(100vw - 24px);
    margin: 0;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px var(--color-shadow);
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

  // Safety notes: hard to overlook, but not alarming.
  .safety {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-left: 4px solid var(--color-yellow-500);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-yellow-500) 12%, transparent);

    p {
      margin: 0 0 6px;
    }

    label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
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

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .session-frame {
    position: fixed;
    inset: 0;
    z-index: 9500;
    border: 4px solid var(--color-accent-500);
    // The frame only marks the window; everything inside stays usable.
    pointer-events: none;
  }

  .session-badge {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px 5px 12px;
    color: #fff;
    background: var(--color-accent-500);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    font-weight: 600;
    white-space: nowrap;
    pointer-events: auto;

    button {
      padding: 1px 8px;
      color: inherit;
      font: inherit;
      font-weight: 400;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
  }

  // The supporter's screen looks just like the pilot's own configurator, so
  // frame it unmistakably.
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border: 4px solid var(--color-accent-500);
  }

  .viewer-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    color: #fff;
    background: var(--color-accent-500);

    .label {
      flex: 1;
      font-weight: 600;
    }
  }

  .viewer-body {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .viewer-stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
    // Read-only: nothing here can reach the supporter.
    pointer-events: none;
  }

  // Covers the stage until the supporter's screen arrives (or after they
  // left, when it would be stale).
  .viewer-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 1.3em;
    background: var(--color-bg);

    .code {
      font-size: 2.4em;
    }
  }
</style>
