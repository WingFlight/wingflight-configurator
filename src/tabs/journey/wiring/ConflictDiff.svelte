<script>
  /**
   * File: src/tabs/journey/wiring/ConflictDiff.svelte
   * Shows the session's pending plan as a before/after table of CLI
   * lines, the reconciler's verdict (with one-click swap/move
   * suggestions when a clash can't be resolved on the chosen pins), a
   * clear note that a full backup is saved first, and the "Save and
   * Reboot" button that is the one and only path to session.apply().
   */
  import ErrorNote from "@/components/notes/ErrorNote.svelte";
  import InfoNote from "@/components/notes/InfoNote.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";
  import { i18n } from "@/js/i18n.js";

  /**
   * @typedef {Object} Props
   * @property {ReturnType<typeof import("@/js/remap_fc/wiring_session.svelte.js").getWiringSession>} session
   * @property {() => void} [onApplied] called after a successful apply
   */
  let { session, onApplied } = $props();

  let plan = $derived(session.pendingPlan);
  let writing = $derived(session.status === "writing");
  let blocked = $derived(
    !session.recognised || (plan?.unresolved?.length ?? 0) > 0,
  );
  let canApply = $derived(
    Boolean(plan) && !plan.empty && !blocked && session.status === "ready",
  );

  let title = $derived.by(() => {
    if (!plan) return "";
    switch (plan.kind) {
      case "revertAll":
        return $i18n.t("wiringDiffTitleRevertAll");
      case "revertPad":
        return $i18n.t("wiringDiffTitleRevertPad", {
          pad: plan.silkscreen ?? plan.pin,
          pin: plan.pin,
        });
      case "free":
        return $i18n.t("wiringDiffTitleFree", {
          pad: plan.silkscreen ?? plan.pin,
          pin: plan.pin,
        });
      default:
        return $i18n.t("wiringDiffTitleAssign", {
          option: plan.optionLabel,
          pad: plan.silkscreen ?? plan.pin,
          pin: plan.pin,
        });
    }
  });

  async function onApply() {
    try {
      await session.apply();
      onApplied?.();
    } catch {
      // session.error carries the message; shown below.
    }
  }

  function onCancel() {
    session.clearPlan();
  }
</script>

{#if plan}
  <section class="diff" aria-live="polite">
    <header class="head">
      <h3>{title}</h3>
      {#if plan.displaced}
        <p class="displaced">
          {$i18n.t("wiringDiffDisplaced", { option: plan.displacedLabel })}
        </p>
      {/if}
    </header>

    {#if plan.empty}
      <p class="muted">{$i18n.t("wiringDiffNoChanges")}</p>
    {:else}
      <div class="table-wrap">
        <table class="changes">
          <thead>
            <tr>
              <th>{$i18n.t("wiringDiffWhat")}</th>
              <th>{$i18n.t("wiringDiffBefore")}</th>
              <th>{$i18n.t("wiringDiffAfter")}</th>
            </tr>
          </thead>
          <tbody>
            {#each plan.changes as change (change.kind + change.key)}
              <tr class="kind-{change.kind}">
                <td class="what">
                  <span class="key">{change.key}</span>
                  {#if change.label}
                    <span class="label">{change.label}</span>
                  {/if}
                </td>
                <td class="before"><code>{change.before}</code></td>
                <td class="after"><code>{change.after}</code></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <details class="commands">
        <summary>
          {$i18n.t("wiringDiffCommands", { count: plan.commands.length })}
        </summary>
        <pre>{plan.commands.join("\n")}
save</pre>
      </details>
    {/if}

    {#if plan.unresolved.length > 0}
      <WarningNote>
        <p>
          {$i18n.t("wiringDiffUnresolved", {
            features: plan.unresolvedLabels.join(", "),
          })}
        </p>
        {#if plan.suggestions.length > 0}
          <p class="suggestions-title">
            {$i18n.t("wiringDiffSuggestionsTitle")}
          </p>
          <ul class="suggestions">
            {#each plan.suggestions as suggestion, index (index)}
              <li>
                <span>
                  {suggestion.type === "swap"
                    ? $i18n.t("wiringDiffSuggestionSwap", {
                        feature: suggestion.featureLabel,
                        otherFeature: suggestion.otherFeatureLabel,
                        target: suggestion.targetLabel,
                      })
                    : $i18n.t("wiringDiffSuggestionMove", {
                        feature: suggestion.featureLabel,
                        target: suggestion.targetLabel,
                      })}
                </span>
                <button
                  class="btn small"
                  onclick={() => session.acceptSuggestion(index)}
                >
                  {$i18n.t("wiringDiffUseSuggestion")}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p>{$i18n.t("wiringDiffNoSuggestion")}</p>
        {/if}
      </WarningNote>
    {/if}

    {#if !session.recognised}
      <WarningNote>
        <p>{$i18n.t("wiringDiffNotRecognised")}</p>
      </WarningNote>
    {:else}
      <InfoNote>
        <p>{$i18n.t("wiringDiffBackupNote")}</p>
        {#if session.virtual}
          <p>{$i18n.t("wiringVirtualNote")}</p>
        {/if}
      </InfoNote>
    {/if}

    {#if session.error}
      <ErrorNote>
        <p>{session.error}</p>
      </ErrorNote>
    {/if}

    {#if session.lastBackup && session.backupTaken}
      <p class="muted">
        {$i18n.t("wiringDiffBackupSaved", {
          filename: session.lastBackup.filename,
        })}
      </p>
    {/if}

    <footer class="actions">
      <button class="btn" onclick={onCancel} disabled={writing}>
        {$i18n.t("cancel")}
      </button>
      <button
        class="btn primary"
        onclick={onApply}
        disabled={!canApply || writing}
        title={!session.recognised ? $i18n.t("wiringDiffNotRecognised") : ""}
      >
        {writing
          ? $i18n.t("wiringDiffApplying", { command: session.progress ?? "" })
          : $i18n.t("buttonSaveReboot")}
      </button>
    </footer>
  </section>
{/if}

<style lang="scss">
  .diff {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .head h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .displaced {
    margin: 4px 0 0;
    font-size: 0.82rem;
    color: var(--color-yellow-900);
  }

  .table-wrap {
    overflow-x: auto;
  }

  .changes {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;

    th,
    td {
      padding: 4px 8px;
      text-align: left;
      border-bottom: 1px solid var(--color-border-soft);
      vertical-align: top;
    }

    th {
      color: var(--color-text-muted);
      font-weight: 600;
    }

    code {
      font-family: monospace;
      white-space: nowrap;
    }

    .before code {
      color: var(--color-text-muted);
      text-decoration: line-through;
    }

    .after code {
      color: var(--color-text);
      font-weight: 600;
    }

    .key {
      font-weight: 600;
      margin-right: 6px;
    }

    .label {
      color: var(--color-text-muted);
    }
  }

  .commands {
    font-size: 0.78rem;

    summary {
      cursor: pointer;
      color: var(--color-text-muted);
    }

    pre {
      margin: 6px 0 0;
      padding: 8px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-sunken);
      overflow-x: auto;
    }
  }

  .suggestions {
    margin: 4px 0 0;
    padding-left: 18px;

    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 4px 0;
    }
  }

  .suggestions-title {
    margin: 8px 0 0;
    font-weight: 600;
  }

  .muted {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    @extend %button;

    &.primary {
      @extend %button-primary;
    }

    &.small {
      height: 1.3rem;
      line-height: 1.3rem;
      padding: 0 8px;
      font-size: 0.72rem;
    }
  }
</style>
