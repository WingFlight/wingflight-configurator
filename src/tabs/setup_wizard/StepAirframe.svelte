<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import ModelSetupDialog from "@/tabs/mixer/ModelSetupDialog.svelte";

  import AxisIcon from "./AxisIcon.svelte";
  import { AXES } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  // Custom is left to the Mixer tab: the wizard only sets up the named
  // types, whose rules it can generate.
  const TYPES = Mixer.MODEL_TYPES.filter(
    (t) => t.value !== Mixer.MODEL_TYPE_CUSTOM,
  );

  // The setup dialog edits FC.MIXER_RULES in place without sending them, the
  // same as on the Mixer tab. Compare against what was loaded so Save knows
  // whether there is anything to send.
  const initial = JSON.stringify(
    $state.snapshot({
      type: FC.MIXER_CONFIG.model_type,
      rules: FC.MIXER_RULES,
    }),
  );

  let changed = $derived(
    JSON.stringify(
      $state.snapshot({
        type: FC.MIXER_CONFIG.model_type,
        rules: FC.MIXER_RULES,
      }),
    ) !== initial,
  );

  $effect(() => {
    if (changed) wiz.markChanged();
  });

  wiz.setCommit(async () => {
    if (!changed) return;
    await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
  });

  let current = $derived(FC.MIXER_CONFIG.model_type);
  let currentType = $derived(TYPES.find((t) => t.value === current) ?? null);

  // The type only changes once the setup dialog is applied, so cancelling
  // leaves the mix as it was.
  let setupDialogRef;
  let pending = null;

  function configure(type) {
    pending = type;
    setupDialogRef.open(type);
  }

  function onApplied() {
    if (pending) FC.MIXER_CONFIG.model_type = pending.value;
    pending = null;
  }
</script>

<p>{$i18n.t("setupWizardAirframeIntro")}</p>

<div class="types" role="radiogroup">
  {#each TYPES as type (type.value)}
    {@const active = current === type.value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      class={["type", active && "selected"]}
      onclick={() => configure(type)}
    >
      <span class="thumb">
        {#each type.images as name (name)}
          <img
            src="/images/aircraft_shapes/{name}.svg"
            alt=""
            aria-hidden="true"
          />
        {/each}
      </span>
      <span class="type-name">
        {$i18n.t(type.labelKey)}
        {#if active}
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        {/if}
      </span>
    </button>
  {/each}
</div>

{#if currentType}
  <div class="current">
    <span>
      {$i18n.t("setupWizardAirframeCurrent", {
        1: $i18n.t(currentType.labelKey),
      })}
    </span>
    <button class="btn" onclick={() => configure(currentType)}>
      {$i18n.t("setupWizardAirframeOptions")}
    </button>
  </div>
{:else}
  <div class="note">
    <i class="fas fa-info-circle" aria-hidden="true"></i>
    <span>{$i18n.t("setupWizardAirframeCustomNow")}</span>
  </div>
{/if}

<section class="found">
  <strong>{$i18n.t("setupWizardAirframeSurfaces")}</strong>
  {#if wiz.surfaces.length === 0}
    <span class="muted">{$i18n.t("setupWizardAirframeNoSurfaces")}</span>
  {:else}
    <ul class="surfaces">
      {#each wiz.surfaces as surface (surface.servo)}
        <li class="surface">
          <span class="servo">{surface.servo + 1}</span>
          <span class="surface-text">
            <span class="kind"
              >{$i18n.t(`setupWizardSurface_${surface.kind}`)}</span
            >
            <span class="axes">
              {#each AXES.filter((a) => surface.axes[a.key]) as axis (axis.key)}
                <span class="axis">
                  <AxisIcon axis={axis.key} size={18} />
                  {$i18n.t(`setupWizardAxis_${axis.key}`)}
                </span>
              {/each}
            </span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  <span class="muted">{$i18n.t("setupWizardAirframeCustomNote")}</span>
</section>

<ModelSetupDialog
  bind:this={setupDialogRef}
  onApply={onApplied}
  onCancel={() => (pending = null)}
/>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  //// Model type tiles.

  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }

  .type {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px 12px 12px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed),
      box-shadow var(--animation-speed);

    &:hover {
      border-color: var(--color-border);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-focus-ring);
    }

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }
  }

  .thumb {
    position: relative;
    width: 100%;
    max-width: 140px;
    aspect-ratio: 103.58047 / 48.517796;

    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
  }

  .type-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    text-align: center;

    i {
      color: var(--color-accent-500);
    }
  }

  .current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);

    i {
      margin-top: 3px;
      color: var(--color-accent-500);
    }
  }

  //// Surfaces the mix drives, one chip per servo.

  .found {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .surfaces {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .surface {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
  }

  // Servo output number.
  .servo {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    background-color: var(--color-accent-500);
    color: var(--color-accent-fg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .surface-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .kind {
    font-weight: 600;
  }

  .axes {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }

  .axis {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-text-soft);
    font-size: 0.85em;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
