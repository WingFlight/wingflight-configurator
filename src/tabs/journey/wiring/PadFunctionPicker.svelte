<script>
  /**
   * File: src/tabs/journey/wiring/PadFunctionPicker.svelte
   * For one selected pad: shows silkscreen + pin + current resource, a
   * Select of only the functions that pin's own timers (or its fixed
   * default) allow, and a revert-to-default button. Every choice only
   * calls session.plan()/planRevertPad() -- nothing is written here.
   */
  import Select from "@/components/Select.svelte";
  import { i18n } from "@/js/i18n.js";
  import { classifyCriticality } from "@/js/remap_fc/feature_classifier.js";
  import {
    canonicalResourceName,
    expandOptionName,
  } from "@/js/remap_fc/reference_design_labels.js";

  const NONE_VALUE = "__none__";

  /**
   * @typedef {Object} Props
   * @property {ReturnType<typeof import("@/js/remap_fc/wiring_session.svelte.js").getWiringSession>} session
   * @property {?string} pin
   */
  let { session, pin = null } = $props();

  let currentKey = $derived(pin ? session.currentKeyFor(pin) : null);
  let defaultKeys = $derived(pin ? session.defaultKeysFor(pin) : []);
  let silkscreen = $derived(
    pin
      ? (session.profile?.pads?.find((pad) => pad.pin === pin)?.silkscreen ??
          null)
      : null,
  );
  let legal = $derived(pin ? session.legalOptionsFor(pin) : []);
  let isDefault = $derived(
    defaultKeys.length === 0
      ? currentKey === null
      : defaultKeys.includes(currentKey),
  );
  let criticality = $derived(
    currentKey ? classifyCriticality(currentKey, session.surfaceRoles) : null,
  );

  let options = $derived([
    { value: NONE_VALUE, label: $i18n.t("wiringPickerNone") },
    ...legal.map((option) => ({
      value: option.key,
      label: `${option.key} — ${expandOptionName(option.key)}`,
    })),
  ]);

  // The Select's bound value follows the pad's current function whenever
  // the pad (or the map) changes; a writable $derived so the user's pick
  // overrides it until the next change.
  let choice = $derived(currentKey ?? NONE_VALUE);

  let disabled = $derived(session.status !== "ready" || !pin);

  function onChoice() {
    if (!pin) return;
    session.plan(pin, choice === NONE_VALUE ? null : choice);
  }

  function onRevert() {
    if (!pin) return;
    session.planRevertPad(pin);
  }
</script>

<div class="picker">
  {#if !pin}
    <p class="hint">{$i18n.t("wiringPadSelectPrompt")}</p>
  {:else}
    <header class="head">
      {#if silkscreen}
        <span class="silk">{silkscreen}</span>
        <span class="sep">·</span>
      {/if}
      <span class="pin">{pin}</span>
      <span class="sep">·</span>
      <span class="res">
        {currentKey
          ? canonicalResourceName(currentKey)
          : $i18n.t("wiringPadUnassigned")}
      </span>
      {#if criticality}
        <span class="crit crit-{criticality}">
          {$i18n.t(`wiringCriticality_${criticality}`)}
        </span>
      {/if}
    </header>

    <div class="row">
      <label for="pad-function-{pin}">{$i18n.t("wiringPickerFunction")}</label>
      {#if legal.length === 0 && !currentKey}
        <span class="hint">{$i18n.t("wiringPickerNoOptions")}</span>
      {:else}
        <Select
          id="pad-function-{pin}"
          bind:value={choice}
          {options}
          {disabled}
          onchange={onChoice}
        />
      {/if}
    </div>

    <div class="row meta">
      <span class="label">{$i18n.t("wiringPickerDefault")}</span>
      <span>
        {defaultKeys.length
          ? defaultKeys
              .map((key) => `${key} — ${expandOptionName(key)}`)
              .join(", ")
          : $i18n.t("wiringPadUnassigned")}
      </span>
    </div>

    <div class="actions">
      <button class="btn" onclick={onRevert} disabled={disabled || isDefault}>
        {$i18n.t("wiringPickerRevert")}
      </button>
    </div>
  {/if}
</div>

<style lang="scss">
  .picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    font-size: 0.9rem;

    .silk {
      font-weight: 700;
    }

    .pin {
      font-family: monospace;
      color: var(--color-text-alt);
    }

    .res {
      font-family: monospace;
      color: var(--color-text-muted);
    }

    .sep {
      color: var(--color-text-disabled);
    }
  }

  .crit {
    margin-left: auto;
    padding: 1px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);

    &.crit-critical {
      color: var(--color-red-500);
      border: 1px solid var(--color-red-500);
    }

    &.crit-important {
      color: var(--color-yellow-900);
      background: var(--color-yellow-100);
    }
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.82rem;

    label,
    .label {
      min-width: 6.5em;
      color: var(--color-text-muted);
    }
  }

  .meta {
    color: var(--color-text-alt);
  }

  .hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    @extend %button;
  }
</style>
