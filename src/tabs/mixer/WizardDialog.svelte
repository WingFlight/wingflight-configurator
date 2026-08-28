<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  let { onApply } = $props();

  let dialogEl;

  let layout = $state("conventional");
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

  function reset() {
    layout = "conventional";
    ailerons = "independent";
    tailControl = "elevatorRudder";
    wingYaw = "rudder";
    flaps = false;
    motors = 1;
    diffThrustYaw = false;
    thrustVectorRoll = false;
    thrustVectorPitch = false;
    thrustVectorYaw = false;
  }

  export function open() {
    reset();
    dialogEl.showModal();
  }

  // All aircraft_shapes SVGs share the same viewBox and are layered in
  // z-order -- shape first, then control surfaces on top.
  let previewLayers = $derived.by(() => {
    const layers = [];

    if (layout === "flyingWing") {
      layers.push("flying_wing_shape");
      layers.push("flying_wing_aileron");

      if (wingYaw === "rudder") layers.push("flying_wing_rudder");
      if (flaps) layers.push("flying_wing_flaps");
      if (motors === 1) layers.push("flying_wing_one_motor");
      else if (motors === 2) layers.push("flying_wing_two_motor");
    } else {
      layers.push("conventional_shape");

      if (ailerons !== "none") layers.push("conventional_aileron");
      if (tailControl === "elevatorOnly")
        layers.push("conventional_normal_tail_no_rudder");
      else if (tailControl === "elevatorRudder")
        layers.push("conventional_normal_tail");
      else if (tailControl === "vtail") layers.push("conventional_v_tail");

      if (flaps) layers.push("conventional_flaps");
      if (motors === 1) layers.push("conventional_one_motor");
      else if (motors === 2) layers.push("conventional_dual_motor");
    }

    return layers;
  });

  function apply() {
    dialogEl.close();
    onApply?.({
      layout,
      ailerons,
      tailControl,
      wingYaw,
      flaps,
      motors,
      diffThrustYaw,
      thrustVectorRoll,
      thrustVectorPitch,
      thrustVectorYaw,
    });
  }
</script>

<dialog bind:this={dialogEl}>
  <h3>{$i18n.t("mixerWizardTitle")}</h3>
  <div class="wizardBody">
    <div class="content">
      <div class="wizardSection">
        <div class="wizardSectionTitle">
          {$i18n.t("mixerWizardLayoutTitle")}
        </div>
        <label class="wizardOption">
          <input type="radio" bind:group={layout} value="conventional" />
          <span>{$i18n.t("mixerWizardLayoutConventional")}</span>
        </label>
        <label class="wizardOption">
          <input type="radio" bind:group={layout} value="flyingWing" />
          <span>{$i18n.t("mixerWizardLayoutFlyingWing")}</span>
        </label>
      </div>

      {#if layout === "conventional"}
        <div class="wizardSection">
          <div class="wizardSectionTitle">
            {$i18n.t("mixerWizardAileronsTitle")}
          </div>
          <label class="wizardOption">
            <input type="radio" bind:group={ailerons} value="none" />
            <span>{$i18n.t("mixerWizardAileronsNone")}</span>
          </label>
          <label class="wizardOption">
            <input type="radio" bind:group={ailerons} value="single" />
            <span>{$i18n.t("mixerWizardAileronsSingle")}</span>
          </label>
          <label class="wizardOption">
            <input type="radio" bind:group={ailerons} value="independent" />
            <span>{$i18n.t("mixerWizardAileronsIndependent")}</span>
          </label>
        </div>

        <div class="wizardSection">
          <div class="wizardSectionTitle">
            {$i18n.t("mixerWizardTailTitle")}
          </div>
          <label class="wizardOption">
            <input type="radio" bind:group={tailControl} value="elevatorOnly" />
            <span>{$i18n.t("mixerWizardTailElevatorOnly")}</span>
          </label>
          <label class="wizardOption">
            <input
              type="radio"
              bind:group={tailControl}
              value="elevatorRudder"
            />
            <span>{$i18n.t("mixerWizardTailElevatorRudder")}</span>
          </label>
          <label class="wizardOption">
            <input type="radio" bind:group={tailControl} value="vtail" />
            <span>{$i18n.t("mixerWizardTailVTail")}</span>
          </label>
        </div>
      {/if}

      {#if layout === "flyingWing"}
        <div class="wizardSection">
          <div class="wizardSectionTitle">
            {$i18n.t("mixerWizardWingYawTitle")}
          </div>
          <label class="wizardOption">
            <input type="radio" bind:group={wingYaw} value="none" />
            <span>{$i18n.t("mixerWizardWingYawNone")}</span>
          </label>
          <label class="wizardOption">
            <input type="radio" bind:group={wingYaw} value="rudder" />
            <span>{$i18n.t("mixerWizardWingYawRudder")}</span>
          </label>
        </div>
      {/if}

      <div class="wizardSection">
        <div class="wizardSectionTitle">
          {$i18n.t("mixerWizardFlapsTitle")}
        </div>
        <label class="wizardOption">
          <input type="checkbox" bind:checked={flaps} />
          <span>{$i18n.t("mixerWizardFlapsEnable")}</span>
        </label>
      </div>

      <div class="wizardSection">
        <div class="wizardSectionTitle">
          {$i18n.t("mixerWizardMotorsTitle")}
        </div>
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

      {#if motors >= 1 && FC.FEATURE_CONFIG.features.isEnabled("THRUST_VECTOR")}
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

    <div class="wizardPreview">
      <div class="wizardPreviewLayers">
        {#each previewLayers as name (name)}
          <img
            src="/images/aircraft_shapes/{name}.svg"
            alt=""
            aria-hidden="true"
          />
        {/each}
      </div>
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
    width: 54em;
    max-width: calc(100vw - 2em);
    border-radius: 5px;
  }

  h3 {
    margin-bottom: 0.5em;
  }

  .wizardBody {
    display: flex;
    gap: 24px;
    align-items: flex-start;
  }

  .content {
    flex: 1;
    min-width: 0;
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

  .wizardPreview {
    width: 340px;
    flex-shrink: 0;
  }

  // All aircraft_shapes SVGs share the same viewBox (103.58 x 48.52 mm)
  .wizardPreviewLayers {
    position: relative;
    width: 100%;
    aspect-ratio: 103.58047 / 48.517796;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
    padding: 10px;
    box-sizing: border-box;
    background: var(--color-surface-float, var(--color-surface));

    img {
      position: absolute;
      top: 10px;
      left: 10px;
      width: calc(100% - 20px);
      height: calc(100% - 20px);
      display: block;
    }
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

    .wizardBody {
      flex-direction: column;
    }

    .wizardPreview {
      width: 100%;
    }
  }
</style>
