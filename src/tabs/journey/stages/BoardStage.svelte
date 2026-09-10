<script>
  import { onDestroy, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getProfile } from "@/js/profile.svelte.js";
  import { reinitialiseConnection } from "@/js/serial_backend.js";

  import Model from "@/components/Model.svelte";
  import Section from "@/components/Section.svelte";
  import BoardAlignment from "@/tabs/configuration/BoardAlignment.svelte";

  import StageNote from "../StageNote.svelte";

  // Stage 1 · Board. Embeds the accelerometer calibration from the Setup
  // tab, the 3D model and board alignment from the Configuration tab.
  let { onChanged } = $props();

  const DEG2RAD = 0.017453292519943295;

  let profile = $derived(getProfile());
  let modelRef;
  let boardAlignmentRef;
  let modelPollingPaused = $state(false);
  let renderInterval;
  let calibrating = $state(false);
  let calibTimeout;
  let alignmentDirty = $state(false);
  let saving = $state(false);
  let yawFix = $state(0);

  function renderModel() {
    if (modelPollingPaused) return;
    const x = FC.SENSOR_DATA.kinematics[1] * -1.0 * DEG2RAD;
    const y = (FC.SENSOR_DATA.kinematics[2] * -1.0 - yawFix) * DEG2RAD;
    const z = FC.SENSOR_DATA.kinematics[0] * -1.0 * DEG2RAD;
    modelRef?.rotateTo(x, y, z);
  }

  onMount(() => {
    // Attitude itself is polled by the journey's live loop; we only render.
    renderInterval = setInterval(renderModel, 50);
  });

  onDestroy(() => {
    clearInterval(renderInterval);
    clearTimeout(calibTimeout);
    boardAlignmentRef?.cleanup();
  });

  function calibrateAccel() {
    if (calibrating) return;
    calibrating = true;
    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
      GUI.log($i18n.t("initialSetupAccelCalibStarted"));
    });
    calibTimeout = setTimeout(async () => {
      GUI.log($i18n.t("initialSetupAccelCalibEnded"));
      calibrating = false;
      await MSP.promise(MSPCodes.MSP_STATUS);
      onChanged?.();
    }, 2000);
  }

  async function saveAlignment() {
    saving = true;
    const save = (code) => MSP.promise(code, mspHelper.crunch(code));
    await save(MSPCodes.MSP_SET_SENSOR_ALIGNMENT);
    await save(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG);
    await save(MSPCodes.MSP2_WING_SET_BOARD_MOUNT_TRIM);
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    reinitialiseConnection();
  }

  let attitude = $derived({
    roll: FC.SENSOR_DATA.kinematics[0].toFixed(1),
    pitch: FC.SENSOR_DATA.kinematics[1].toFixed(1),
    yaw: Math.round(FC.SENSOR_DATA.kinematics[2]),
  });
</script>

<Section label="journeyBoard.identityTitle">
  <dl class="facts">
    <dt>{$i18n.t("journeyBoard.target")}</dt>
    <dd>
      {profile.board.targetName || "–"}
      <span class="muted">{profile.board.boardDesign}</span>
    </dd>
    <dt>{$i18n.t("journeyBoard.firmware")}</dt>
    <dd>
      {profile.board.firmwareIdentifier}
      {profile.board.firmwareVersion}
      <span class="muted">API {profile.board.apiVersion}</span>
    </dd>
    <dt>{$i18n.t("journeyBoard.uid")}</dt>
    <dd class="mono">{profile.board.uid || "–"}</dd>
    <dt>{$i18n.t("journeyBoard.pads")}</dt>
    <dd>
      {$i18n.t("journeyBoard.padCounts", {
        servos: profile.board.servoPads,
        motors: profile.board.motorPads,
      })}
    </dd>
  </dl>
</Section>

<Section label="journeyBoard.orientationTitle">
  <div class="orientation">
    <div class="model">
      <div class="model-box">
        <Model bind:this={modelRef} />
      </div>
      <div class="attitude">
        <span
          >{$i18n.t("journeyBoard.roll")}
          <strong>{attitude.roll}°</strong></span
        >
        <span
          >{$i18n.t("journeyBoard.pitch")}
          <strong>{attitude.pitch}°</strong></span
        >
        <span
          >{$i18n.t("journeyBoard.heading")}
          <strong>{attitude.yaw}°</strong></span
        >
        <button
          class="btn small"
          onclick={() => (yawFix = FC.SENSOR_DATA.kinematics[2] * -1.0)}
        >
          {$i18n.t("journeyBoard.resetHeading")}
        </button>
      </div>
    </div>
    <div class="steps">
      <StageNote>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html $i18n.t("journeyBoard.orientationHelp")}
      </StageNote>
      <div class="actions">
        <button
          class="btn"
          disabled={!profile.peripherals.accelerometer || calibrating}
          onclick={calibrateAccel}
        >
          {calibrating
            ? $i18n.t("initialSetupButtonCalibratingText")
            : $i18n.t("initialSetupButtonCalibrateAccel")}
        </button>
      </div>
    </div>
  </div>
</Section>

<Section label="journeyBoard.alignmentTitle">
  <BoardAlignment
    bind:this={boardAlignmentRef}
    magHardwareEnabled={FC.SENSOR_CONFIG.mag_hardware !== 1}
    onDirty={() => (alignmentDirty = true)}
    onModelPollingPausedChange={(paused) => (modelPollingPaused = paused)}
  />
  <div class="save">
    <button class="btn primary" disabled={saving} onclick={saveAlignment}
      >{$i18n.t("buttonSaveReboot")}</button
    >
    {#if alignmentDirty}
      <span class="muted">{$i18n.t("journeyUnsavedHint")}</span>
    {/if}
  </div>
</Section>

<style lang="scss">
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0;
    padding: 4px 8px;
    font-size: 0.85rem;

    dt {
      color: var(--color-text-muted);
    }
    dd {
      margin: 0;
    }
  }

  .mono {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .muted {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  .orientation {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 4px 8px;
  }

  .model {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  // Definite height on purpose: <Model> sizes its canvas from this box's
  // measured height, so an indefinite one makes it grow every frame.
  .model-box {
    position: relative;
    height: 260px;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .attitude {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    font-size: 0.8rem;
    color: var(--color-text-soft);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .actions,
  .save {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }

  .small {
    height: 1.3rem;
    line-height: 1.3rem;
    font-size: 0.7rem;
  }

  @media only screen and (max-width: 700px) {
    .orientation {
      grid-template-columns: 1fr;
    }
  }
</style>
