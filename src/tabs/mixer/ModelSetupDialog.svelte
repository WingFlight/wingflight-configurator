<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { updateTabList } from "@/js/main.js";

  // modelType is passed to open() rather than taken as a prop -- callers
  // that let the user pick *which* type to configure (ModelTypePicker,
  // switching between named types) need it fixed for the lifetime of one
  // open/close cycle, decided at the moment of the click rather than
  // tracking whatever the caller's own reactive state happens to be later.
  let { onApply, onCancel } = $props();

  let dialogEl;
  // Never actually shown before open() runs (dialog starts closed) -- just
  // needs to be a non-null MODEL_TYPES-shaped default so the template can
  // read activeType.* unconditionally.
  let activeType = $state(Mixer.MODEL_TYPES[0]);
  let applied = false;

  let ailerons = $state("independent");
  let tailControl = $state("elevatorRudder");
  let wingYaw = $state("rudder");
  let flaps = $state(false);
  let motors = $state(1);
  let diffThrustYaw = $state(false);
  // Independent per-axis, since a vectored mount might drive any combination
  // (2-axis gimbals are commonly pitch+yaw, but roll+yaw and others exist
  // too; some mounts are single- or full 3-axis).
  let thrustVectorRoll = $state(false);
  let thrustVectorPitch = $state(false);
  let thrustVectorYaw = $state(false);

  export function open(modelType) {
    activeType = modelType;
    applied = false;

    // Always reset to this type's defaults on open -- never tries to infer
    // the choices back out of whatever rules happen to be loaded already.
    ailerons =
      activeType.ailerons?.default ?? activeType.ailerons?.fixed ?? "none";
    tailControl =
      activeType.tailControl?.default ??
      activeType.tailControl?.fixed ??
      "elevatorRudder";
    wingYaw = activeType.wingYaw?.default ?? "none";
    flaps = false;
    motors = 1;
    diffThrustYaw = false;
    thrustVectorRoll = false;
    thrustVectorPitch = false;
    thrustVectorYaw = false;

    dialogEl.showModal();
  }

  async function apply() {
    const options = {
      layout: activeType.layout,
      ailerons: activeType.ailerons?.fixed ?? ailerons,
      tailControl: activeType.tailControl?.fixed ?? tailControl,
      wingYaw,
      flaps,
      motors,
      diffThrustYaw,
      thrustVectorRoll,
      thrustVectorPitch,
      thrustVectorYaw,
    };

    FC.MIXER_RULES = Mixer.buildRuleTableFromOptions(options, FC.MIXER_RULES);

    // The feature flag isn't part of the staged mixer rules, and the Mixer
    // tab's own Save only pushes MIXER_CONFIG/MIXER_INPUTS/MIXER_RULES -- so
    // commit it immediately here rather than leaving it as unsaved FC state
    // that a later tab visit (which re-fetches MSP_FEATURE_CONFIG on mount)
    // could silently discard.
    const thrustVectorEnabled =
      thrustVectorRoll || thrustVectorPitch || thrustVectorYaw;
    if (
      thrustVectorEnabled !==
      FC.FEATURE_CONFIG.features.isEnabled("THRUST_VECTOR")
    ) {
      FC.FEATURE_CONFIG.features.setFeature(
        "THRUST_VECTOR",
        thrustVectorEnabled,
      );
      await MSP.promise(
        MSPCodes.MSP_SET_FEATURE_CONFIG,
        mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG),
      );
      await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
      updateTabList(FC.FEATURE_CONFIG.features);
    }

    applied = true;
    dialogEl.close();
  }

  // Fires on every close path (Apply, Cancel button, Escape, backdrop) so
  // callers get exactly one notification regardless of how the dialog shut.
  function handleClose() {
    if (applied) {
      onApply?.();
    } else {
      onCancel?.();
    }
  }
</script>

<dialog bind:this={dialogEl} onclose={handleClose}>
  <h3>{$i18n.t("mixerEditConfigurationTitle")}</h3>
  <div class="wizardBody">
    {#if activeType.ailerons?.options}
      <div class="wizardSection">
        <div class="wizardSectionTitle">
          {$i18n.t("mixerWizardAileronsTitle")}
        </div>
        {#each activeType.ailerons.options as value (value)}
          <label class="wizardOption">
            <input type="radio" bind:group={ailerons} {value} />
            <span>
              {$i18n.t(
                {
                  none: "mixerWizardAileronsNone",
                  single: "mixerWizardAileronsSingle",
                  independent: "mixerWizardAileronsIndependent",
                }[value],
              )}
            </span>
          </label>
        {/each}
      </div>
    {/if}

    {#if activeType.tailControl?.options}
      <div class="wizardSection">
        <div class="wizardSectionTitle">{$i18n.t("mixerWizardTailTitle")}</div>
        {#each activeType.tailControl.options as value (value)}
          <label class="wizardOption">
            <input type="radio" bind:group={tailControl} {value} />
            <span>
              {$i18n.t(
                {
                  elevatorOnly: "mixerWizardTailElevatorOnly",
                  elevatorRudder: "mixerWizardTailElevatorRudder",
                }[value],
              )}
            </span>
          </label>
        {/each}
      </div>
    {/if}

    {#if activeType.wingYaw?.options}
      <div class="wizardSection">
        <div class="wizardSectionTitle">
          {$i18n.t("mixerWizardWingYawTitle")}
        </div>
        {#each activeType.wingYaw.options as value (value)}
          <label class="wizardOption">
            <input type="radio" bind:group={wingYaw} {value} />
            <span>
              {$i18n.t(
                {
                  none: "mixerWizardWingYawNone",
                  rudder: "mixerWizardWingYawRudder",
                }[value],
              )}
            </span>
          </label>
        {/each}
      </div>
    {/if}

    <div class="wizardSection">
      <div class="wizardSectionTitle">{$i18n.t("mixerWizardFlapsTitle")}</div>
      <label class="wizardOption">
        <input type="checkbox" bind:checked={flaps} />
        <span>{$i18n.t("mixerWizardFlapsEnable")}</span>
      </label>
    </div>

    <div class="wizardSection">
      <div class="wizardSectionTitle">{$i18n.t("mixerWizardMotorsTitle")}</div>
      <label class="wizardOption">
        <input type="radio" bind:group={motors} value={0} />
        <span>{$i18n.t("mixerWizardMotors0")}</span>
      </label>
      <label class="wizardOption">
        <input type="radio" bind:group={motors} value={1} />
        <span>{$i18n.t("mixerWizardMotors1")}</span>
      </label>
      <label class="wizardOption">
        <input type="radio" bind:group={motors} value={2} />
        <span>{$i18n.t("mixerWizardMotors2")}</span>
      </label>
    </div>

    {#if motors === 2}
      <div class="wizardSection">
        <label class="wizardOption">
          <input type="checkbox" bind:checked={diffThrustYaw} />
          <span>{$i18n.t("mixerWizardDiffThrust")}</span>
        </label>
        <div class="wizardHint">{$i18n.t("mixerWizardDiffThrustHint")}</div>
      </div>
    {/if}

    {#if motors >= 1}
      <div class="wizardSection">
        <div class="wizardSectionTitle">
          {$i18n.t("mixerWizardThrustVectorTitle")}
        </div>
        <label class="wizardOption">
          <input type="checkbox" bind:checked={thrustVectorRoll} />
          <span>{$i18n.t("mixerWizardThrustVectorRoll")}</span>
        </label>
        <label class="wizardOption">
          <input type="checkbox" bind:checked={thrustVectorPitch} />
          <span>{$i18n.t("mixerWizardThrustVectorPitch")}</span>
        </label>
        <label class="wizardOption">
          <input type="checkbox" bind:checked={thrustVectorYaw} />
          <span>{$i18n.t("mixerWizardThrustVectorYaw")}</span>
        </label>
        <div class="wizardHint">{$i18n.t("mixerWizardThrustVectorHint")}</div>
      </div>
    {/if}

    <div class="note">
      <p>{$i18n.t("mixerWizardOverwriteWarning")}</p>
    </div>
  </div>

  <div class="buttons">
    <button class="btn" onclick={() => dialogEl.close()}>
      {$i18n.t("mixerWizardCancel")}
    </button>
    <button class="btn" onclick={apply}>
      {$i18n.t("mixerWizardApply")}
    </button>
  </div>
</dialog>

<style lang="scss">
  dialog {
    width: 36em;
    max-width: calc(100vw - 2em);
    border-radius: 5px;
  }

  h3 {
    margin-bottom: 0.5em;
  }

  .wizardSection {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface-float, var(--color-surface));
  }

  .wizardSectionTitle {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .wizardOption {
    display: block;
    margin: 4px 0;
    font-weight: normal;

    input {
      display: inline-block;
      width: auto;
      margin-right: 6px;
      vertical-align: middle;
    }
  }

  .wizardHint {
    color: var(--color-text-soft);
    font-size: 0.7rem;
    margin-top: 4px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
  }

  .btn {
    @extend %button;
  }

  @media only screen and (max-width: 575px) {
    dialog {
      width: calc(100% - 2em);
    }
  }
</style>
