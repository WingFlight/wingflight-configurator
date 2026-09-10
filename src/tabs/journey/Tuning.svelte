<script>
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import { openStage, openTab } from "./journey_state.svelte.js";

  // The tuning board (concept §7): what is left after setup, in order, with
  // the symptom that says a tune is needed and where it happens. Reachable
  // once stage 8 is verified; shown folded before that. Each card names the
  // safety checks its changes would invalidate and shows their state now.
  let { badges = {}, complete = false } = $props();

  let profile = $derived(getProfile());
  let open = $state(false);

  // Cards: tabs to link into, and which stage's checks the change touches.
  const CARDS = [
    {
      id: "mechanicalTrim",
      tabs: ["servos"],
      invalidates: ["outputs", "preflight"],
      where: "bench",
      when: "beforeFlight1",
    },
    {
      id: "subTrimTravel",
      tabs: ["servos"],
      invalidates: ["outputs", "preflight"],
      where: "bench",
      when: "beforeFlight1",
    },
    {
      id: "ratesExpo",
      tabs: ["rates"],
      invalidates: ["preflight"],
      where: "field",
      when: "flight1",
    },
    {
      id: "rollPitchGains",
      tabs: ["profiles"],
      invalidates: ["safety"],
      where: "field",
      when: "flights2to4",
    },
    {
      id: "yawCoordination",
      tabs: ["profiles"],
      invalidates: ["safety"],
      where: "field",
      when: "flights2to4",
    },
    {
      id: "filters",
      tabs: ["gyro", "blackbox"],
      invalidates: ["safety"],
      where: "field",
      when: "afterLog",
    },
    {
      id: "reverifyFailsafe",
      tabs: ["failsafe"],
      invalidates: [],
      where: "bench",
      when: "afterAnyChange",
    },
  ];

  function tabsFor(card) {
    // Filter links by the profile: no gyro/blackbox link when there is no
    // blackbox device configured, no yaw card links on a rudderless wing.
    return card.tabs.filter((t) => {
      if (t === "blackbox") return profile.peripherals.blackbox;
      return true;
    });
  }

  function relevant(card) {
    if (card.id === "yawCoordination")
      return (
        profile.hasRudder ||
        profile.differentialThrust ||
        profile.thrustVectorAxes.includes("tvYaw")
      );
    return true;
  }
</script>

<section class="tuning">
  <button
    class="head"
    onclick={() => (open = !open)}
    aria-expanded={open || complete}
  >
    <span class="title">{$i18n.t("journeyTuning.title")}</span>
    <span class="sub">
      {complete
        ? $i18n.t("journeyTuning.unlocked")
        : $i18n.t("journeyTuning.locked")}
    </span>
    <span class="chev">{open || complete ? "▾" : "▸"}</span>
  </button>

  {#if open || complete}
    <p class="intro">{$i18n.t("journeyTuning.intro")}</p>
    <ol class="cards">
      {#each CARDS.filter(relevant) as card, i (card.id)}
        <li class="card">
          <div class="num">{i + 1}</div>
          <div class="body">
            <div class="row">
              <strong>{$i18n.t(`journeyTuning.${card.id}.title`)}</strong>
              <span class={["where", card.where]}
                >{$i18n.t(`journeyTuning.where.${card.where}`)}</span
              >
              <span class="when"
                >{$i18n.t(`journeyTuning.when.${card.when}`)}</span
              >
            </div>
            <p class="symptom">
              <em>{$i18n.t("journeyTuning.symptom")}</em>
              {$i18n.t(`journeyTuning.${card.id}.symptom`)}
            </p>
            <div class="row links">
              {#each tabsFor(card) as tab (tab)}
                <button
                  class="btn"
                  disabled={!complete}
                  onclick={() => openTab(tab)}
                  >{$i18n.t(`journeyTab.${tab}`)}</button
                >
              {/each}
              {#each card.invalidates as stageId (stageId)}
                <button
                  class={["inv", badges[stageId]]}
                  onclick={() => openStage(stageId)}
                  title={$i18n.t("journeyTuning.invalidatesHelp")}
                >
                  {$i18n.t("journeyTuning.invalidates", {
                    stage: $i18n.t(`journeyStage.${stageId}.title`),
                  })} · {$i18n.t(
                    `journeyBadge.${badges[stageId] ?? "notStarted"}`,
                  )}
                </button>
              {/each}
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style lang="scss">
  .tuning {
    @extend %section-shadow;
    margin-top: var(--section-gap);
    background: var(--color-surface);
  }

  .head {
    @extend %section-header;
    width: 100%;
    gap: 10px;
    padding: 0 12px;
    cursor: pointer;
    border: none;
    text-align: left;
  }

  .title {
    font-weight: 600;
  }

  .sub {
    flex-grow: 1;
    font-weight: 400;
    font-size: 0.75rem;
    opacity: 0.85;
  }

  .intro {
    margin: 10px 12px 0;
    font-size: 0.85rem;
    color: var(--color-text-soft);
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .card {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-sm);
    background: var(--color-surface-float, var(--color-surface));
    font-size: 0.85rem;
  }

  .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-weight: 700;
    background: var(--color-header-bg);
    color: var(--color-header-fg);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .where,
  .when {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border-soft);
    color: var(--color-text-muted);
  }

  .where.field {
    color: var(--color-accent-700);
    border-color: color-mix(in srgb, var(--color-accent-500) 50%, transparent);
  }

  .symptom {
    margin: 0;
    color: var(--color-text-soft);
  }

  .btn {
    @extend %button;
  }

  .inv {
    border: 1px solid var(--color-border-soft);
    background: none;
    border-radius: var(--radius-pill);
    padding: 1px 8px;
    font-size: 0.72rem;
    cursor: pointer;
    color: var(--color-text-soft);

    &.verified {
      color: var(--color-status-good);
    }
    &.needsAttention {
      color: var(--color-status-bad);
      border-color: var(--color-status-bad);
    }
  }
</style>
