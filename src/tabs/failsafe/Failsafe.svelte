<script>
  import diff from "microdiff";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";

  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import { reinitialiseConnection } from "@/js/serial_backend";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import Expert from "@/components/Expert.svelte";
  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Tooltip from "@/components/Tooltip.svelte";

  let loading = $state(true);
  let initialState;

  function snapshotState() {
    return $state.snapshot({
      RX_CONFIG: FC.RX_CONFIG,
      RXFAIL_CONFIG: FC.RXFAIL_CONFIG,
      FAILSAFE_CONFIG: FC.FAILSAFE_CONFIG,
      GPS_NAV_CONFIG: FC.GPS_NAV_CONFIG,
      features: FC.FEATURE_CONFIG.features.bitfield,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });
  let showToolbar = $derived(!loading && changes.length > 0);

  const channelNames = [
    "controlAxisRoll",
    "controlAxisPitch",
    "controlAxisYaw",
    "controlAxisThrottle",
  ];

  // failsafe_procedure values match TABLE_FAILSAFE in src/main/cli/settings.c
  // (AUTO-LAND, DROP, GPS-RESCUE), 0-indexed. Key numbering (1, 2, 4) is
  // inherited from upstream and does not correspond to these values.
  let procedureOptions = $derived([
    { value: 0, label: $i18n.t("failsafeProcedureItemSelect1") },
    { value: 1, label: $i18n.t("failsafeProcedureItemSelect2") },
    { value: 2, label: $i18n.t("failsafeProcedureItemSelect4") },
  ]);

  // failsafe_switch_mode values match TABLE_FAILSAFE_SWITCH_MODE (STAGE1, KILL, STAGE2).
  let switchModeOptions = $derived([
    { value: 0, label: $i18n.t("failsafeSwitchOptionStage1") },
    { value: 1, label: $i18n.t("failsafeSwitchOptionKill") },
    { value: 2, label: $i18n.t("failsafeSwitchOptionStage2") },
  ]);

  // nav_loiter_direction values match TABLE_NAV_LOITER_DIRECTION (CW, CCW).
  let loiterDirectionOptions = $derived([
    { value: 0, label: $i18n.t("gpsNavLoiterDirectionCw") },
    { value: 1, label: $i18n.t("gpsNavLoiterDirectionCcw") },
  ]);

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_RXFAIL_CONFIG);
    await MSP.promise(MSPCodes.MSP_RX_CONFIG);
    await MSP.promise(MSPCodes.MSP_FAILSAFE_CONFIG);
    await MSP.promise(MSPCodes.MSP2_WING_GPS_NAV_CONFIG);

    initialState = snapshotState();
    loading = false;
  });

  export async function onSave() {
    function save(code) {
      return MSP.promise(code, mspHelper.crunch(code));
    }

    await mspHelper.sendRxFailConfig();
    await save(MSPCodes.MSP_SET_RX_CONFIG);
    await save(MSPCodes.MSP_SET_FAILSAFE_CONFIG);
    await save(MSPCodes.MSP2_WING_SET_GPS_NAV_CONFIG);

    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    reinitialiseConnection();
  }

  export function onRevert() {
    Object.assign(FC.RX_CONFIG, initialState.RX_CONFIG);
    Object.assign(FC.RXFAIL_CONFIG, initialState.RXFAIL_CONFIG);
    Object.assign(FC.FAILSAFE_CONFIG, initialState.FAILSAFE_CONFIG);
    Object.assign(FC.GPS_NAV_CONFIG, initialState.GPS_NAV_CONFIG);
    FC.FEATURE_CONFIG.features.bitfield = initialState.features;
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabFailsafe"), "_system");
  }

  export function isDirty() {
    return changes.length > 0;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabFailsafe")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>
    {$i18n.t("buttonSaveReboot")}
  </button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <div class="content">
    <div>
      <Expert>
        <div transition:slide>
          <Section
            label="failsafePulsrangeTitle"
            summary="failsafePulsrangeHelp"
          >
            <SubSection>
              <Field id="rx-pulse-min" label="failsafeRxMinUsecItem" unit="μs">
                {#snippet tooltip()}
                  <Tooltip
                    attrs={[
                      { name: "genericDefault", value: "885μs" },
                      { name: "genericRange", value: "750μs - 2250μs " },
                    ]}
                  />
                {/snippet}
                <NumberInput
                  id="rx-pulse-min"
                  min="750"
                  max="2250"
                  bind:value={FC.RX_CONFIG.rx_pulse_min}
                />
              </Field>
              <Field id="rx-pulse-max" label="failsafeRxMaxUsecItem" unit="μs">
                {#snippet tooltip()}
                  <Tooltip
                    attrs={[
                      { name: "genericDefault", value: "2115μs" },
                      { name: "genericRange", value: "750μs - 2250μs " },
                    ]}
                  />
                {/snippet}
                <NumberInput
                  id="rx-pulse-max"
                  min="750"
                  max="2250"
                  bind:value={FC.RX_CONFIG.rx_pulse_max}
                />
              </Field>
            </SubSection>
          </Section>
        </div>
      </Expert>
      <Section
        label="failsafeChannelFallbackSettingsTitle"
        summary="failsafeChannelFallbackSettingsHelp"
      >
        <SubSection>
          {#each { length: FC.RXFAIL_CONFIG?.length ?? 0 } as _, i (i)}
            <Field
              id={`fallback-${i}`}
              label={channelNames[i] ??
                `controlAxisAux${i - channelNames.length + 1}`}
            >
              <div class="fallback-group">
                {#if FC.RXFAIL_CONFIG[i].mode === 2}
                  <NumberInput
                    id={`set-${i}`}
                    min="875"
                    max="2125"
                    step="5"
                    bind:value={FC.RXFAIL_CONFIG[i].value}
                  />
                {/if}
                <select
                  class="switchMode"
                  id={`fallback-${i}`}
                  bind:value={FC.RXFAIL_CONFIG[i].mode}
                >
                  {#if i < channelNames.length}
                    <option value={0}>
                      {$i18n.t("failsafeChannelFallbackOptionAuto")}
                    </option>
                  {/if}
                  <option value={1}>
                    {$i18n.t("failsafeChannelFallbackOptionHold")}
                  </option>
                  <option value={2}>
                    {$i18n.t("failsafeChannelFallbackOptionSet")}
                  </option>
                </select>
              </div>
            </Field>
          {/each}
        </SubSection>
      </Section>
    </div>
    <div>
      <Section label="failsafeSubTitle1">
        <SubSection>
          <Field id="failsafe-procedure" label="failsafeProcedureItem">
            <Select
              id="failsafe-procedure"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_procedure}
              options={procedureOptions}
            />
          </Field>
          {#if FC.FAILSAFE_CONFIG.failsafe_procedure === 2}
            <div class="note" transition:slide>
              {$i18n.t("failsafeGpsRescueCliOnlyNote")}
            </div>
          {/if}
        </SubSection>
      </Section>
      <Section
        label="failsafeStageTwoSettingsTitle"
        summary="failsafeFeaturesHelpNew"
      >
        <SubSection>
          <Field id="failsafe-delay" label="failsafeDelayItem" unit="0.1s">
            {#snippet tooltip()}
              <Tooltip help="failsafeDelayHelp" />
            {/snippet}
            <NumberInput
              id="failsafe-delay"
              min="2"
              max="200"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_delay}
            />
          </Field>
          <Field
            id="failsafe-off-delay"
            label="failsafeOffDelayItem"
            unit="0.1s"
          >
            {#snippet tooltip()}
              <Tooltip help="failsafeOffDelayHelp" />
            {/snippet}
            <NumberInput
              id="failsafe-off-delay"
              min="0"
              max="200"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_off_delay}
            />
          </Field>
          <Field
            id="failsafe-throttle-low-delay"
            label="failsafeThrottleLowItem"
            unit="0.1s"
          >
            {#snippet tooltip()}
              <Tooltip help="failsafeThrottleLowHelp" />
            {/snippet}
            <NumberInput
              id="failsafe-throttle-low-delay"
              min="0"
              max="300"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay}
            />
          </Field>
          <Field id="failsafe-throttle" label="failsafeThrottleItem" unit="μs">
            <NumberInput
              id="failsafe-throttle"
              min="750"
              max="2250"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_throttle}
            />
          </Field>
          <Field
            id="failsafe-recovery-delay"
            label="failsafeRecoveryDelayItem"
            unit="0.1s"
          >
            <NumberInput
              id="failsafe-recovery-delay"
              min="0"
              max="200"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_recovery_delay}
            />
          </Field>
        </SubSection>
      </Section>
      <Section label="failsafeSwitchTitle">
        <SubSection>
          <Field id="failsafe-switch-mode" label="failsafeSwitchModeItem">
            {#snippet tooltip()}
              <Tooltip help="failsafeSwitchModeHelp" />
            {/snippet}
            <Select
              id="failsafe-switch-mode"
              bind:value={FC.FAILSAFE_CONFIG.failsafe_switch_mode}
              options={switchModeOptions}
            />
          </Field>
        </SubSection>
      </Section>
      <Section label="gpsNavSectionTitle" summary="gpsNavSectionHelp">
        <SubSection>
          <Field
            id="gps-nav-rth-altitude"
            label="gpsNavRthAltitudeItem"
            unit="m"
          >
            <NumberInput
              id="gps-nav-rth-altitude"
              min="10"
              max="500"
              bind:value={FC.GPS_NAV_CONFIG.nav_rth_altitude}
            />
          </Field>
          <Field
            id="gps-nav-loiter-radius"
            label="gpsNavLoiterRadiusItem"
            unit="m"
          >
            <NumberInput
              id="gps-nav-loiter-radius"
              min="20"
              max="500"
              bind:value={FC.GPS_NAV_CONFIG.nav_loiter_radius}
            />
          </Field>
          <Field
            id="gps-nav-loiter-direction"
            label="gpsNavLoiterDirectionItem"
          >
            <Select
              id="gps-nav-loiter-direction"
              bind:value={FC.GPS_NAV_CONFIG.nav_loiter_direction}
              options={loiterDirectionOptions}
            />
          </Field>
          <Field id="gps-nav-min-sats" label="gpsNavMinSatsItem">
            <NumberInput
              id="gps-nav-min-sats"
              min="5"
              max="50"
              bind:value={FC.GPS_NAV_CONFIG.nav_min_sats}
            />
          </Field>
          <Field
            id="gps-nav-max-bank-angle"
            label="gpsNavMaxBankAngleItem"
            unit="°"
          >
            <NumberInput
              id="gps-nav-max-bank-angle"
              min="5"
              max="45"
              bind:value={FC.GPS_NAV_CONFIG.nav_max_bank_angle}
            />
          </Field>
          <Field
            id="gps-nav-max-pitch-angle"
            label="gpsNavMaxPitchAngleItem"
            unit="°"
          >
            <NumberInput
              id="gps-nav-max-pitch-angle"
              min="5"
              max="45"
              bind:value={FC.GPS_NAV_CONFIG.nav_max_pitch_angle}
            />
          </Field>
        </SubSection>
        <Expert>
          <div transition:slide>
            <SubSection>
              <Field id="gps-nav-bearing-kp" label="gpsNavBearingKpItem">
                {#snippet tooltip()}
                  <Tooltip help="gpsNavBearingKpHelp" />
                {/snippet}
                <NumberInput
                  id="gps-nav-bearing-kp"
                  min="0"
                  max="1000"
                  bind:value={FC.GPS_NAV_CONFIG.nav_bearing_kp}
                />
              </Field>
              <Field id="gps-nav-altitude-kp" label="gpsNavAltitudeKpItem">
                {#snippet tooltip()}
                  <Tooltip help="gpsNavAltitudeKpHelp" />
                {/snippet}
                <NumberInput
                  id="gps-nav-altitude-kp"
                  min="0"
                  max="1000"
                  bind:value={FC.GPS_NAV_CONFIG.nav_altitude_kp}
                />
              </Field>
            </SubSection>
          </div>
        </Expert>
      </Section>
    </div>
  </div>
</Page>

<style lang="scss">
  .content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  .fallback-group {
    display: flex;
    flex-direction: row;
    gap: 8px;
  }

  .note {
    font-size: 0.85rem;
    color: var(--color-neutral-700);
    padding: 4px 12px 8px;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }
</style>
