<script>
  import { onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import AirframeCanvas from "@/components/AirframeCanvas.svelte";
  import Section from "@/components/Section.svelte";
  import SurfaceCard from "@/components/SurfaceCard.svelte";

  import { acknowledge, revoke } from "../acknowledgments.svelte.js";
  import { surfaceDirectionCheckId } from "../checks.js";
  import StageNote from "../StageNote.svelte";
  import { openTab } from "../journey_state.svelte.js";

  // Stage 5 · Outputs. Per-surface direction, centre and travel against the
  // airframe canvas, plus the throttle range walkthrough.
  let { evaluation, onChanged } = $props();

  let profile = $derived(getProfile());
  let selectedId = $state(null);
  let selected = $derived(
    profile.surfaces.find((s) => s.id === selectedId) ??
      profile.surfaces[0] ??
      null,
  );
  let poller;

  onMount(() => {
    // The journey loop already polls MSP_SERVO; add the override state so the
    // Servos tab (if opened) starts in a consistent place.
    poller = setInterval(() => MSP.promise(MSPCodes.MSP_SERVO_OVERRIDE), 500);
  });
  onDestroy(() => clearInterval(poller));

  function directionResult(surface) {
    return (
      evaluation?.results?.find(
        (r) => r.id === surfaceDirectionCheckId(surface),
      ) ?? null
    );
  }

  // Guided direction question: "Roll left. This surface should rise."
  const QUESTIONS = {
    aileron: {
      left: "journeyOutputs.q.aileronLeft",
      right: "journeyOutputs.q.aileronRight",
      both: "journeyOutputs.q.aileronBoth",
    },
    elevon: {
      left: "journeyOutputs.q.elevonLeft",
      right: "journeyOutputs.q.elevonRight",
    },
    elevator: { center: "journeyOutputs.q.elevator" },
    rudder: { center: "journeyOutputs.q.rudder" },
    ruddervator: {
      left: "journeyOutputs.q.ruddervatorLeft",
      right: "journeyOutputs.q.ruddervatorRight",
    },
    flap: {
      left: "journeyOutputs.q.flap",
      right: "journeyOutputs.q.flap",
      center: "journeyOutputs.q.flap",
    },
    thrustVector: { center: "journeyOutputs.q.thrustVector" },
  };

  function question(surface) {
    const q = QUESTIONS[surface.role];
    if (!q) return "journeyOutputs.q.generic";
    return q[surface.side] ?? q.center ?? q.left ?? "journeyOutputs.q.generic";
  }

  function confirmDirection(surface) {
    const r = directionResult(surface);
    if (!r) return;
    acknowledge(r.id, profile.board.uid, r.hash);
    onChanged?.();
  }

  function rejectDirection(surface) {
    const r = directionResult(surface);
    if (!r) return;
    revoke(r.id, profile.board.uid);
    onChanged?.();
  }

  let throttleResult = $derived(
    evaluation?.results?.find((r) => r.id === "outputs.throttleCalibrated") ??
      null,
  );
</script>

<Section label="journeyOutputs.canvasTitle">
  <div class="pad">
    <AirframeCanvas
      {profile}
      live={true}
      selected={selected?.id ?? null}
      onSelect={(s) => (selectedId = s.id)}
    />
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyOutputs.canvasHelp")}
    </StageNote>
  </div>
</Section>

{#if selected}
  {@const r = directionResult(selected)}
  <Section label="journeyOutputs.surfaceTitle">
    <div class="pad two">
      <SurfaceCard surface={selected} {profile} {onChanged} />
      <div class="guided">
        <div class="q">{$i18n.t(question(selected))}</div>
        <div class="q-actions">
          <button
            class="btn primary"
            disabled={!r || !profile.board.uid}
            onclick={() => confirmDirection(selected)}
          >
            {$i18n.t("journeyOutputs.yesMoves")}
          </button>
          <button
            class="btn"
            disabled={!r}
            onclick={() => rejectDirection(selected)}
          >
            {$i18n.t("journeyOutputs.noMoves")}
          </button>
        </div>
        {#if r}
          <div class={["state", r.status]}>
            {$i18n.t(r.detail ?? "journeyDetail.notAcknowledged")}
          </div>
        {/if}
        <p class="hint">{$i18n.t("journeyOutputs.noMovesHint")}</p>
      </div>
    </div>
  </Section>
{/if}

<Section label="journeyOutputs.travelTitle">
  <div class="pad">
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyOutputs.travelHelp")}
    </StageNote>
    <div class="actions">
      <button class="btn" onclick={() => openTab("servos")}
        >{$i18n.t("journeyTab.servos")}</button
      >
    </div>
  </div>
</Section>

{#if profile.hasMotors}
  <Section label="journeyOutputs.throttleTitle">
    <div class="pad">
      <StageNote tone="warning">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html $i18n.t("journeyOutputs.throttleWarning")}
      </StageNote>
      <ol class="steps">
        <li>{$i18n.t("journeyOutputs.throttleStep1")}</li>
        <li>
          {$i18n.t("journeyOutputs.throttleStep2", {
            min: FC.MOTOR_CONFIG.minthrottle,
            max: FC.MOTOR_CONFIG.maxthrottle,
            cmd: FC.MOTOR_CONFIG.mincommand,
          })}
        </li>
        <li>{$i18n.t("journeyOutputs.throttleStep3")}</li>
        <li>{$i18n.t("journeyOutputs.throttleStep4")}</li>
      </ol>
      <div class="actions">
        <button class="btn" onclick={() => openTab("motors")}
          >{$i18n.t("journeyTab.motors")}</button
        >
        {#if throttleResult}
          {#if throttleResult.status === "pass"}
            <button
              class="btn"
              onclick={() => {
                revoke(throttleResult.id, profile.board.uid);
                onChanged?.();
              }}>{$i18n.t("journeyRevoke")}</button
            >
          {:else}
            <button
              class="btn primary"
              disabled={!profile.board.uid}
              onclick={() => {
                acknowledge(
                  throttleResult.id,
                  profile.board.uid,
                  throttleResult.hash,
                );
                onChanged?.();
              }}
            >
              {$i18n.t("journeyOutputs.throttleConfirm")}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </Section>
{:else}
  <Section label="journeyOutputs.throttleTitle">
    <div class="pad">
      <p class="muted">{$i18n.t("journeyOutputs.gliderNoThrottle")}</p>
    </div>
  </Section>
{/if}

<style lang="scss">
  .pad {
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: start;
  }

  .guided {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .q {
    font-size: 1rem;
    font-weight: 600;
  }

  .q-actions,
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .state {
    font-size: 0.8rem;
    color: var(--color-text-soft);

    &.pass {
      color: var(--color-status-good);
    }
    &.stale {
      color: var(--color-status-bad);
    }
  }

  .hint,
  .muted {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .steps {
    margin: 0;
    padding-left: 1.4em;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }

  @media only screen and (max-width: 800px) {
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>
