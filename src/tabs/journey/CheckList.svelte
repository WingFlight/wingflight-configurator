<script>
  import { i18n } from "@/js/i18n.js";

  import { acknowledge, revoke } from "./acknowledgments.svelte.js";

  // One stage's checks with their current status. Acknowledged checks carry
  // Confirm / Re-confirm / Revoke actions; derived and observed checks are
  // read-only because they are recomputed on every refresh.
  let { results = [], uid, onChanged, children } = $props();

  const ICON = { pass: "✓", fail: "✕", unknown: "?", na: "–", stale: "!" };

  function title(r) {
    return $i18n.t(r.titleKey, r.titleValues ?? {});
  }

  function detail(r) {
    if (!r.detail) return "";
    return $i18n.t(r.detail, r.values ?? {});
  }

  function confirm(r) {
    acknowledge(r.id, uid, r.hash);
    onChanged?.();
  }

  function unconfirm(r) {
    revoke(r.id, uid);
    onChanged?.();
  }
</script>

<ul class="checks">
  {#each results as r (r.id)}
    <li class={["check", r.status]}>
      <span class={["status", r.status]} aria-hidden="true"
        >{ICON[r.status] ?? "?"}</span
      >
      <div class="text">
        <div class="title">
          {title(r)}
          <span class="kind">{$i18n.t(`journeyKind.${r.kind}`)}</span>
        </div>
        {#if r.detail}
          <div class="detail">{detail(r)}</div>
        {/if}
        {@render children?.(r)}
      </div>
      {#if r.kind === "acknowledged" && r.status !== "na"}
        <div class="actions">
          {#if r.status === "pass"}
            <button class="btn" onclick={() => unconfirm(r)}
              >{$i18n.t("journeyRevoke")}</button
            >
          {:else if r.status === "stale"}
            <button class="btn primary" onclick={() => confirm(r)}
              >{$i18n.t("journeyReconfirm")}</button
            >
          {:else}
            <button
              class="btn primary"
              onclick={() => confirm(r)}
              disabled={!uid}>{$i18n.t("journeyConfirm")}</button
            >
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>

<style lang="scss">
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .check {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 10px;
    align-items: start;
    padding: 10px 8px;
    border-bottom: 1px dotted var(--color-border);

    &:last-child {
      border-bottom: none;
    }
  }

  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 700;
    background: var(--color-neutral-300);
    color: var(--color-neutral-900);

    &.pass {
      background: var(--color-status-good);
      color: white;
    }
    &.fail,
    &.stale {
      background: var(--color-status-bad);
      color: white;
    }
    &.na {
      opacity: 0.5;
    }
  }

  .title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .kind {
    margin-left: 8px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .detail {
    margin-top: 2px;
    font-size: 0.8rem;
    color: var(--color-text-soft);
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }

  @media only screen and (max-width: 575px) {
    .check {
      grid-template-columns: 28px 1fr;
    }
    .actions {
      grid-column: 2;
    }
  }
</style>
