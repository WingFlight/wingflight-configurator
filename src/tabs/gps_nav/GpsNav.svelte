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
      GPS_NAV_CONFIG: FC.GPS_NAV_CONFIG,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });
  let showToolbar = $derived(!loading && changes.length > 0);

  // nav_loiter_direction values match TABLE_NAV_LOITER_DIRECTION (CW, CCW).
  let loiterDirectionOptions = $derived([
    { value: 0, label: $i18n.t("gpsNavLoiterDirectionCw") },
    { value: 1, label: $i18n.t("gpsNavLoiterDirectionCcw") },
  ]);

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP2_WING_GPS_NAV_CONFIG);

    initialState = snapshotState();
    loading = false;
  });

  export async function onSave() {
    await MSP.promise(
      MSPCodes.MSP2_WING_SET_GPS_NAV_CONFIG,
      mspHelper.crunch(MSPCodes.MSP2_WING_SET_GPS_NAV_CONFIG),
    );

    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    reinitialiseConnection();
  }

  export function onRevert() {
    Object.assign(FC.GPS_NAV_CONFIG, initialState.GPS_NAV_CONFIG);
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabGpsNav"), "_system");
  }

  export function isDirty() {
    return changes.length > 0;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabGpsNav")}</h1>
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
          <Field id="gps-nav-throttle" label="gpsNavThrottleItem" unit="%">
            {#snippet tooltip()}
              <Tooltip help="gpsNavThrottleHelp" />
            {/snippet}
            <NumberInput
              id="gps-nav-throttle"
              min="0"
              max="100"
              bind:value={FC.GPS_NAV_CONFIG.nav_throttle}
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
              <Field id="gps-nav-altitude-kd" label="gpsNavAltitudeKdItem">
                {#snippet tooltip()}
                  <Tooltip help="gpsNavAltitudeKdHelp" />
                {/snippet}
                <NumberInput
                  id="gps-nav-altitude-kd"
                  min="0"
                  max="1000"
                  bind:value={FC.GPS_NAV_CONFIG.nav_altitude_kd}
                />
              </Field>
              <Field
                id="gps-nav-turn-coordination"
                label="gpsNavTurnCoordinationItem"
                unit="%"
              >
                {#snippet tooltip()}
                  <Tooltip help="gpsNavTurnCoordinationHelp" />
                {/snippet}
                <NumberInput
                  id="gps-nav-turn-coordination"
                  min="0"
                  max="200"
                  bind:value={FC.GPS_NAV_CONFIG.nav_turn_coordination}
                />
              </Field>
            </SubSection>
          </div>
        </Expert>
      </Section>
    </div>
    <div></div>
  </div>
</Page>

<style lang="scss">
  .content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
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
