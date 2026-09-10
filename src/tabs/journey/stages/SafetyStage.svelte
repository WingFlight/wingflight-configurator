<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import Section from "@/components/Section.svelte";

  import { acknowledge, revoke } from "../acknowledgments.svelte.js";
  import StageNote from "../StageNote.svelte";
  import { openTab } from "../journey_state.svelte.js";

  // Stage 6 · Safety. Arm mode binding, failsafe procedure and timings, and
  // the failsafe verification walkthrough (motor disconnected first).
  let { evaluation, onChanged } = $props();

  let profile = $derived(getProfile());
  let fs = $derived(FC.FAILSAFE_CONFIG);
  let verify = $derived(
    evaluation?.results?.find((r) => r.id === "safety.failsafeVerified") ??
      null,
  );

  const PROCEDURES = {
    0: "journeySafety.procedureLand",
    1: "journeySafety.procedureDrop",
    2: "journeySafety.procedureGpsRescue",
  };
</script>

<Section label="journeySafety.armTitle">
  <div class="pad">
    <p class="fact">
      {#if profile.armSwitch.bound}
        {$i18n.t("journeyDetail.armSwitchBound", profile.armSwitch)}
      {:else}
        {$i18n.t("journeyDetail.armSwitchUnbound")}
      {/if}
    </p>
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeySafety.armHelp")}
    </StageNote>
    <div class="actions">
      <button class="btn" onclick={() => openTab("auxiliary")}
        >{$i18n.t("journeyTab.auxiliary")}</button
      >
    </div>
  </div>
</Section>

<Section label="journeySafety.failsafeTitle">
  <div class="pad">
    <dl class="facts">
      <dt>{$i18n.t("journeySafety.procedure")}</dt>
      <dd>
        {$i18n.t(
          PROCEDURES[fs.failsafe_procedure] ?? "journeySafety.procedureUnknown",
        )}
      </dd>
      <dt>{$i18n.t("journeySafety.stage1Delay")}</dt>
      <dd>{(fs.failsafe_delay / 10).toFixed(1)} s</dd>
      <dt>{$i18n.t("journeySafety.stage2Delay")}</dt>
      <dd>{(fs.failsafe_off_delay / 10).toFixed(1)} s</dd>
      <dt>{$i18n.t("journeySafety.throttle")}</dt>
      <dd>{fs.failsafe_throttle} µs</dd>
      <dt>{$i18n.t("journeySafety.pulseRange")}</dt>
      <dd>{FC.RX_CONFIG.rx_pulse_min} – {FC.RX_CONFIG.rx_pulse_max} µs</dd>
    </dl>
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeySafety.failsafeHelp")}
    </StageNote>
    <div class="actions">
      <button class="btn" onclick={() => openTab("failsafe")}
        >{$i18n.t("journeyTab.failsafe")}</button
      >
    </div>
  </div>
</Section>

<Section label="journeySafety.verifyTitle">
  <div class="pad">
    <StageNote tone="warning">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeySafety.verifyWarning")}
    </StageNote>
    <ol class="steps">
      <li>{$i18n.t("journeySafety.verifyStep1")}</li>
      <li>{$i18n.t("journeySafety.verifyStep2")}</li>
      <li>{$i18n.t("journeySafety.verifyStep3")}</li>
      <li>
        {$i18n.t("journeySafety.verifyStep4", {
          delay: (fs.failsafe_delay / 10).toFixed(1),
        })}
      </li>
      <li>{$i18n.t("journeySafety.verifyStep5")}</li>
    </ol>
    {#if verify}
      <div class="actions">
        {#if verify.status === "pass"}
          <span class="ok">{$i18n.t("journeyDetail.acknowledged")}</span>
          <button
            class="btn"
            onclick={() => {
              revoke(verify.id, profile.board.uid);
              onChanged?.();
            }}>{$i18n.t("journeyRevoke")}</button
          >
        {:else}
          {#if verify.status === "stale"}
            <span class="bad">{$i18n.t("journeyDetail.stale")}</span>
          {/if}
          <button
            class="btn primary"
            disabled={!profile.board.uid}
            onclick={() => {
              acknowledge(verify.id, profile.board.uid, verify.hash);
              onChanged?.();
            }}
          >
            {$i18n.t("journeySafety.verifyConfirm")}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</Section>

<style lang="scss">
  .pad {
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fact {
    margin: 0;
    font-size: 0.9rem;
  }

  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0;
    font-size: 0.85rem;

    dt {
      color: var(--color-text-muted);
    }
    dd {
      margin: 0;
    }
  }

  .steps {
    margin: 0;
    padding-left: 1.4em;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .ok {
    color: var(--color-status-good);
    font-size: 0.85rem;
  }

  .bad {
    color: var(--color-status-bad);
    font-size: 0.85rem;
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }
</style>
