<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";

  import { acknowledge, revoke } from "../acknowledgments.svelte.js";
  import StageNote from "../StageNote.svelte";
  import { openTab } from "../journey_state.svelte.js";

  // Stage 7 · Power. Voltage scale against a measured pack, current scale or
  // explicit disable, warning thresholds. The calibration maths mirrors the
  // Power tab; the acknowledgment records that a real pack was measured.
  let { evaluation, onChanged } = $props();

  let profile = $derived(getProfile());
  let measuredVolts = $state(0);
  let measuredAmps = $state(0);
  let busy = $state(false);

  let voltage = $derived(
    FC.VOLTAGE_METERS?.[0]?.voltage ?? FC.BATTERY_STATE.voltage ?? 0,
  );
  let amperage = $derived(
    FC.CURRENT_METERS?.[0]?.amperage ?? FC.BATTERY_STATE.amperage ?? 0,
  );
  let voltageResult = $derived(
    evaluation?.results?.find((r) => r.id === "power.voltageCalibrated") ??
      null,
  );
  let currentResult = $derived(
    evaluation?.results?.find((r) => r.id === "power.currentCalibrated") ??
      null,
  );

  async function applyVoltage() {
    if (!measuredVolts || !voltage || !FC.VOLTAGE_METER_CONFIGS?.[0]) return;
    busy = true;
    const cfg = FC.VOLTAGE_METER_CONFIGS[0];
    cfg.vbatscale = Math.round(cfg.vbatscale * (measuredVolts / voltage));
    await MSP.promise(
      MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG,
      mspHelper.crunch(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    await MSP.promise(MSPCodes.MSP_VOLTAGE_METER_CONFIG);
    GUI.log($i18n.t("eepromSaved"));
    busy = false;
    onChanged?.();
  }

  async function applyCurrent() {
    if (!measuredAmps || !amperage || !FC.CURRENT_METER_CONFIGS?.[0]) return;
    busy = true;
    const cfg = FC.CURRENT_METER_CONFIGS[0];
    const offset = (cfg.offset ?? 0) / 1000;
    if (amperage !== offset && measuredAmps !== offset) {
      cfg.scale = Math.round(
        cfg.scale * ((amperage - offset) / (measuredAmps - offset)),
      );
    }
    await MSP.promise(
      MSPCodes.MSP_SET_CURRENT_METER_CONFIG,
      mspHelper.crunch(MSPCodes.MSP_SET_CURRENT_METER_CONFIG),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    await MSP.promise(MSPCodes.MSP_CURRENT_METER_CONFIG);
    GUI.log($i18n.t("eepromSaved"));
    busy = false;
    onChanged?.();
  }

  function ackButton(result, key) {
    return { result, key };
  }
</script>

<Section label="journeyPower.voltageTitle">
  <div class="pad">
    {#if !profile.peripherals.voltageSensor}
      <p class="muted">{$i18n.t("journeyDetail.noVoltageSensor")}</p>
    {:else}
      <p class="fact">
        {$i18n.t("journeyPower.reading", {
          volts: voltage.toFixed(2),
          cells: FC.BATTERY_STATE.cellCount,
        })}
      </p>
      <StageNote>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html $i18n.t("journeyPower.voltageHelp")}
      </StageNote>
      <div class="row">
        <label for="journey-measured-volts"
          >{$i18n.t("journeyPower.measuredVolts")}</label
        >
        <NumberInput
          id="journey-measured-volts"
          bind:value={measuredVolts}
          min={0}
          max={60}
          step={0.01}
        />
        <button
          class="btn"
          disabled={busy || !measuredVolts || !voltage}
          onclick={applyVoltage}>{$i18n.t("journeyPower.applyScale")}</button
        >
      </div>
      {#if voltageResult}
        {@const a = ackButton(voltageResult, "journeyPower.voltageConfirm")}
        <div class="row">
          {#if a.result.status === "pass"}
            <span class="ok">{$i18n.t("journeyDetail.acknowledged")}</span>
            <button
              class="btn"
              onclick={() => {
                revoke(a.result.id, profile.board.uid);
                onChanged?.();
              }}>{$i18n.t("journeyRevoke")}</button
            >
          {:else}
            <button
              class="btn primary"
              disabled={!profile.board.uid}
              onclick={() => {
                acknowledge(a.result.id, profile.board.uid, a.result.hash);
                onChanged?.();
              }}>{$i18n.t(a.key)}</button
            >
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</Section>

<Section label="journeyPower.currentTitle">
  <div class="pad">
    {#if !profile.peripherals.currentSensor}
      <p class="muted">{$i18n.t("journeyDetail.currentSensorDisabled")}</p>
    {:else}
      <p class="fact">
        {$i18n.t("journeyPower.currentReading", { amps: amperage.toFixed(2) })}
      </p>
      <StageNote>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html $i18n.t("journeyPower.currentHelp")}
      </StageNote>
      <div class="row">
        <label for="journey-measured-amps"
          >{$i18n.t("journeyPower.measuredAmps")}</label
        >
        <NumberInput
          id="journey-measured-amps"
          bind:value={measuredAmps}
          min={0}
          max={500}
          step={0.1}
        />
        <button
          class="btn"
          disabled={busy || !measuredAmps || !amperage}
          onclick={applyCurrent}>{$i18n.t("journeyPower.applyScale")}</button
        >
      </div>
      {#if currentResult && currentResult.status !== "na"}
        <div class="row">
          {#if currentResult.status === "pass"}
            <span class="ok">{$i18n.t("journeyDetail.acknowledged")}</span>
            <button
              class="btn"
              onclick={() => {
                revoke(currentResult.id, profile.board.uid);
                onChanged?.();
              }}>{$i18n.t("journeyRevoke")}</button
            >
          {:else}
            <button
              class="btn primary"
              disabled={!profile.board.uid}
              onclick={() => {
                acknowledge(
                  currentResult.id,
                  profile.board.uid,
                  currentResult.hash,
                );
                onChanged?.();
              }}>{$i18n.t("journeyPower.currentConfirm")}</button
            >
          {/if}
        </div>
      {/if}
    {/if}
    <div class="row">
      <button class="btn" onclick={() => openTab("power")}
        >{$i18n.t("journeyTab.power")}</button
      >
    </div>
  </div>
</Section>

<Section label="journeyPower.thresholdsTitle">
  <div class="pad">
    <dl class="facts">
      <dt>{$i18n.t("journeyPower.minCell")}</dt>
      <dd>{(FC.BATTERY_CONFIG.vbatmincellvoltage / 100).toFixed(2)} V</dd>
      <dt>{$i18n.t("journeyPower.warnCell")}</dt>
      <dd>{(FC.BATTERY_CONFIG.vbatwarningcellvoltage / 100).toFixed(2)} V</dd>
      <dt>{$i18n.t("journeyPower.maxCell")}</dt>
      <dd>{(FC.BATTERY_CONFIG.vbatmaxcellvoltage / 100).toFixed(2)} V</dd>
    </dl>
    <StageNote>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html $i18n.t("journeyPower.thresholdsHelp")}
    </StageNote>
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

  .muted {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 0.85rem;
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

  .ok {
    color: var(--color-status-good);
  }

  .btn {
    @extend %button;
  }

  .primary {
    @extend %button-primary;
  }
</style>
