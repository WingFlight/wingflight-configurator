<script>
  import { onDestroy } from "svelte";

  import { resolveBoardView } from "@/js/boardview/board_views.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { getProfile, setProfileExtras } from "@/js/profile.svelte.js";
  import { getWiringSession } from "@/js/remap_fc/wiring_session.svelte.js";

  import PortMap from "@/components/boardview/PortMap.svelte";

  import StageNote from "../StageNote.svelte";
  import ConflictDiff from "./ConflictDiff.svelte";
  import PadFunctionPicker from "./PadFunctionPicker.svelte";
  import RemapTable from "./RemapTable.svelte";
  import WiringRibbon from "./WiringRibbon.svelte";

  // Stage 3's engine (Rotorflight PR #433, reframed): read the pin / timer /
  // DMA tables through a headless CLI session, draw the board, let the user
  // say what is soldered where, show the reconciled diff, and only then
  // write. `mode="table"` renders the raw remap table for the Expert drawer.
  let { mode = "canvas", onChanged } = $props();

  const session = getWiringSession();
  let profile = $derived(getProfile());
  let selectedPin = $state(null);

  // The drawing: the matched board profile when one exists, and
  // otherwise a schematic built from the pins the board just reported,
  // so an undrawn board still gets a picture. This is deliberately not
  // `session.profile` -- that one stays null for an unrecognised board,
  // which is what stops the tool writing pin changes to it.
  let boardView = $derived(
    resolveBoardView({
      matched: session.profile,
      config: FC.CONFIG,
      hardwareMap: session.hardwareMap,
      serialPorts: FC.SERIAL_CONFIG?.ports ?? [],
    }),
  );

  // Everything the rest of the app reads about wiring flows through the
  // profile: pads in use, conflicts and the matched board profile.
  // Both effects below compare by content before writing: the profile is a
  // fresh object on every recompute and the session's derived arrays are
  // fresh too, so writing unconditionally would make the two chase each
  // other for ever (extras -> profile -> roles -> padsInUse -> extras ...).
  let lastExtras = "";
  $effect(() => {
    if (session.status !== "ready") return;
    const extras = {
      padsInUse: $state.snapshot(session.padsInUse),
      conflicts: $state.snapshot(session.conflicts),
      boardProfile: $state.snapshot(session.profile),
    };
    const key = JSON.stringify(extras);
    if (key === lastExtras) return;
    lastExtras = key;
    setProfileExtras(extras);
  });

  // Criticality follows the airframe: a pad driving an aileron is critical,
  // one driving a camera tilt is not.
  let lastRoles = "";
  $effect(() => {
    const roles = {};
    for (const o of profile.outputs) roles[o.label] = o.role;
    const key = JSON.stringify(roles);
    if (key === lastRoles) return;
    lastRoles = key;
    session.setSurfaceRoles(roles);
  });

  onDestroy(() => {
    // Leaving the stage ends the CLI session (the firmware reboots on exit;
    // the normal reconnect path handles it). The table instance shares the
    // session and must not close it out from under the canvas.
    if (mode === "canvas") session.close();
  });

  let surfaces = $derived([
    ...profile.surfaces.map((s) => ({
      id: s.id,
      label: `${$i18n.t(`journeyRole.${s.role}`)}${s.side && s.side !== "center" && s.side !== "both" ? ` (${$i18n.t(`journeySide.${s.side}`)})` : ""}`,
      output: s.output,
      kind: "servo",
    })),
    ...profile.motors.map((m) => ({
      id: m.label,
      label: $i18n.t(`journeyRole.${m.role}`),
      output: m.index,
      kind: "motor",
    })),
  ]);

  function read() {
    selectedPin = null;
    session.read();
  }
</script>

{#if mode === "table"}
  {#if session.status === "ready"}
    <RemapTable {session} />
  {:else}
    <p class="muted">{$i18n.t("journeyWiring.tableNeedsRead")}</p>
  {/if}
{:else}
  <div class="board">
    <div class="toolbar">
      <button
        class="btn primary"
        disabled={session.status === "reading" || session.status === "writing"}
        onclick={read}
      >
        {#if session.status === "reading"}
          {$i18n.t("journeyWiring.reading")}
        {:else if session.status === "ready"}
          {$i18n.t("journeyWiring.reread")}
        {:else}
          {$i18n.t("journeyWiring.readBoard")}
        {/if}
      </button>
      {#if session.status === "ready"}
        <button
          class="btn"
          disabled={!session.recognised || session.status !== "ready"}
          onclick={() => session.planRevertAll()}
        >
          {$i18n.t("journeyWiring.revertAll")}
        </button>
        <span class="muted">
          {session.profile
            ? session.profile.display
            : $i18n.t("journeyWiring.unrecognised", {
                target: profile.board.targetName,
              })}
          · {$i18n.t("journeyWiring.padCount", {
            count: session.padsInUse.length,
            conflicts: session.conflicts.length,
          })}
        </span>
      {/if}
      {#if session.progress}
        <span class="muted">{session.progress}</span>
      {/if}
    </div>

    {#if session.error}
      <StageNote tone="warning"><p>{session.error}</p></StageNote>
    {/if}

    {#if session.status === "idle" || session.status === "error"}
      <StageNote>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html $i18n.t("journeyWiring.readHelp")}
      </StageNote>
    {:else if session.status === "ready"}
      {#if !session.recognised}
        <StageNote tone="warning">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html $i18n.t("journeyWiring.unrecognisedHelp", {
            target: profile.board.targetName || "?",
          })}
        </StageNote>
      {/if}
      {#if session.needsReread}
        <StageNote tone="warning"
          ><p>{$i18n.t("journeyWiring.needsReread")}</p></StageNote
        >
      {/if}
      {#if session.cliOpen && !session.virtual}
        <p class="muted">{$i18n.t("journeyWiring.cliOpenNote")}</p>
      {/if}

      <div class="canvas-row">
        <div class="canvas">
          <PortMap
            profile={boardView}
            hardwareMap={session.hardwareMap}
            padsInUse={session.padsInUse}
            conflicts={session.conflicts}
            {selectedPin}
            onSelectPad={(pin) => (selectedPin = pin)}
          />
        </div>
        <div class="side">
          {#if selectedPin}
            <PadFunctionPicker {session} pin={selectedPin} />
          {:else}
            <p class="muted">{$i18n.t("journeyWiring.selectPadHint")}</p>
          {/if}
        </div>
      </div>

      {#if session.pendingPlan}
        <ConflictDiff {session} onApplied={() => onChanged?.()} />
      {/if}

      <h4>{$i18n.t("journeyWiring.ribbonTitle")}</h4>
      <WiringRibbon padsInUse={session.padsInUse} {surfaces} />
    {/if}
  </div>
{/if}

<style lang="scss">
  .board {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .canvas-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
    gap: 12px;
    align-items: start;
  }

  .canvas {
    min-width: 0;
  }

  h4 {
    margin: 6px 0 0;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .muted {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }

  @media only screen and (max-width: 800px) {
    .canvas-row {
      grid-template-columns: 1fr;
    }
  }
</style>
