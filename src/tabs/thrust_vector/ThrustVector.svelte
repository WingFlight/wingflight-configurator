<script>
  import diff from "microdiff";
  import { onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import {
    TV_PID_ADJUSTMENT_FUNCTIONS,
    TV_MASTER_GAIN_ADJUSTMENT_FUNCTIONS,
    TV_HOLD_GAIN_ADJUSTMENT_FUNCTION,
    adjustmentChannelLabel,
    adjustmentTitle,
    getAdjustmentState,
  } from "@/tabs/adjustments/adjustmentState.js";

  import Page from "@/components/Page.svelte";
  import Field from "@/components/Field.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";

  const AXES = ["ROLL", "PITCH", "YAW"];
  const GAINS = [
    {
      key: "P",
      label: "profilesProportional",
      help: "profilesProportionalHelp",
    },
    { key: "I", label: "profilesIntegral", help: "profilesIntegralHelp" },
    { key: "D", label: "profilesDerivative", help: "profilesDerivativeHelp" },
    { key: "F", label: "profilesFeedforward", help: "profilesFeedforwardHelp" },
    { key: "B", label: "profilesBoost", help: "profilesBoostHelp" },
  ];
  const MASTER_GAIN_AXES = [
    {
      key: "roll",
      axisClass: "ROLL",
      label: "axisROLL",
      gainKey: "masterGainRoll",
    },
    {
      key: "pitch",
      axisClass: "PITCH",
      label: "axisPITCH",
      gainKey: "masterGainPitch",
    },
    {
      key: "yaw",
      axisClass: "YAW",
      label: "axisYAW",
      gainKey: "masterGainYaw",
    },
  ];

  function pidAdjustmentState(axisIndex, gainIndex) {
    return getAdjustmentState(
      TV_PID_ADJUSTMENT_FUNCTIONS[axisIndex][gainIndex],
    );
  }

  function masterGainAdjustmentState(axisIndex) {
    return getAdjustmentState(TV_MASTER_GAIN_ADJUSTMENT_FUNCTIONS[axisIndex]);
  }

  let holdGainAdjustment = $derived(
    getAdjustmentState(TV_HOLD_GAIN_ADJUSTMENT_FUNCTION),
  );

  let loading = $state(true);
  let initialState = $state(null);

  function snapshotState() {
    return $state.snapshot({
      TV_PIDS: FC.TV_PIDS,
      TV_PID_PROFILE: FC.TV_PID_PROFILE,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }
    return diff(initialState, snapshotState());
  });

  let dirty = $derived(changes.length > 0);
  let showToolbar = $derived(!loading && dirty);

  // itermRelaxType is 0 when disabled; remember the last non-zero type
  // locally so re-enabling the switch restores the previous RP/RPY choice
  let itermRelaxType = $state(1);
  let itermRelaxEnabled = $derived(FC.TV_PID_PROFILE.itermRelaxType > 0);

  function toggleItermRelax(enabled) {
    FC.TV_PID_PROFILE.itermRelaxType = enabled ? itermRelaxType : 0;
  }

  function changeItermRelaxType(value) {
    itermRelaxType = value;
    if (itermRelaxEnabled) {
      FC.TV_PID_PROFILE.itermRelaxType = value;
    }
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP2_WING_TV_PID_CONFIG);

    if (FC.TV_PID_PROFILE.itermRelaxType > 0) {
      itermRelaxType = FC.TV_PID_PROFILE.itermRelaxType;
    }

    initialState = snapshotState();
    loading = false;
  });

  export async function onSave() {
    await MSP.promise(
      MSPCodes.MSP2_WING_SET_TV_PID_CONFIG,
      mspHelper.crunch(MSPCodes.MSP2_WING_SET_TV_PID_CONFIG),
    );
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    initialState = snapshotState();
  }

  export async function onRevert() {
    FC.TV_PIDS.forEach((axis, i) =>
      Object.assign(axis, initialState.TV_PIDS[i]),
    );
    Object.assign(FC.TV_PID_PROFILE, initialState.TV_PID_PROFILE);
  }

  export function isDirty() {
    return dirty;
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabThrustVector"), "_system");
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabThrustVector")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <div class="note">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("thrustVectorIntroNote")}</p>
  </div>

  <Section label="thrustVectorPidGains">
    <!-- Desktop: axes as rows, gain terms as columns. -->
    <div class="table-scroll desktop-table">
      <table class="grid">
        <thead>
          <tr>
            <th></th>
            {#each GAINS as gain (gain.key)}
              <th>
                <span class="header-label">
                  {$i18n.t(gain.label)}
                  <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
                </span>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each AXES as axis, axisIndex (axis)}
            <tr>
              <td class="axis {axis}">{$i18n.t(`axis${axis}`)}</td>
              {#each GAINS as gain, gainIndex (gain.key)}
                {@const adjustment = pidAdjustmentState(axisIndex, gainIndex)}
                <td>
                  <div
                    class="runtime-control"
                    class:runtime-controlled={adjustment}
                    class:runtime-active={adjustment?.active}
                    title={adjustmentTitle(adjustment)}
                  >
                    <NumberInput
                      min="0"
                      max="1000"
                      bind:value={FC.TV_PIDS[axisIndex][gainIndex]}
                    />
                    {#if adjustment}
                      <span class="adjustment-badge">
                        {adjustment.active
                          ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
                          : "ADJ"}
                      </span>
                    {/if}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile: five gain-term columns don't fit a phone width even
         shrunk, so terms become rows and the 3 axes become columns
         instead - same data, same steppers, just reoriented to fit.
         Mirrors Profiles/PidGains.svelte's identical transpose. -->
    <div class="table-scroll mobile-table">
      <table class="grid">
        <thead>
          <tr>
            <th></th>
            {#each AXES as axis (axis)}
              <th class="axis-header {axis}">{$i18n.t(`axis${axis}`)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each GAINS as gain, gainIndex (gain.key)}
            <tr>
              <td class="term-label">
                <span class="header-label">
                  <span class="term-key">{gain.key}</span>
                  <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
                </span>
              </td>
              {#each AXES as axis, axisIndex (axis)}
                {@const adjustment = pidAdjustmentState(axisIndex, gainIndex)}
                <td>
                  <div
                    class="runtime-control"
                    class:runtime-controlled={adjustment}
                    class:runtime-active={adjustment?.active}
                    title={adjustmentTitle(adjustment)}
                  >
                    <NumberInput
                      min="0"
                      max="1000"
                      bind:value={FC.TV_PIDS[axisIndex][gainIndex]}
                    />
                    {#if adjustment}
                      <span class="adjustment-badge">
                        {adjustment.active
                          ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
                          : "ADJ"}
                      </span>
                    {/if}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Section>

  <Section label="thrustVectorMasterGainGroup">
    <div class="table-scroll">
      <table class="grid">
        <thead>
          <tr>
            <th></th>
            <th>
              <span class="header-label">
                {$i18n.t("profilesMasterGainColumn")}
                <HelpIcon>{$i18n.t("profilesMasterGainHelp")}</HelpIcon>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each MASTER_GAIN_AXES as axis, axisIndex (axis.key)}
            {@const adjustment = masterGainAdjustmentState(axisIndex)}
            <tr>
              <td class="axis {axis.axisClass}">{$i18n.t(axis.label)}</td>
              <td>
                <div
                  class="runtime-control"
                  class:runtime-controlled={adjustment}
                  class:runtime-active={adjustment?.active}
                  title={adjustmentTitle(adjustment)}
                >
                  <NumberInput
                    min="25"
                    max="1000"
                    bind:value={FC.TV_PID_PROFILE[axis.gainKey]}
                  />
                  {#if adjustment}
                    <span class="adjustment-badge">
                      {adjustment.active
                        ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
                        : "ADJ"}
                    </span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Section>

  <Section label="thrustVectorHoldGroup">
    <div class="note">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <p>{@html $i18n.t("thrustVectorHoldIntroNote")}</p>
    </div>

    <Field id="tv-hold-gain" label="thrustVectorHoldGain">
      {#snippet tooltip()}
        {$i18n.t("thrustVectorHoldGainHelp")}
      {/snippet}
      <div
        class="runtime-control"
        class:runtime-controlled={holdGainAdjustment}
        class:runtime-active={holdGainAdjustment?.active}
        title={adjustmentTitle(holdGainAdjustment)}
      >
        <NumberInput
          id="tv-hold-gain"
          min="0"
          max="250"
          bind:value={FC.TV_PID_PROFILE.tvHoldGain}
        />
        {#if holdGainAdjustment}
          <span class="adjustment-badge">
            {holdGainAdjustment.active
              ? (adjustmentChannelLabel(holdGainAdjustment) ?? "LIVE")
              : "ADJ"}
          </span>
        {/if}
      </div>
    </Field>
    <Field id="tv-hold-deadband" label="thrustVectorHoldDeadband">
      {#snippet tooltip()}
        {$i18n.t("thrustVectorHoldDeadbandHelp")}
      {/snippet}
      <NumberInput
        id="tv-hold-deadband"
        min="0"
        max="100"
        bind:value={FC.TV_PID_PROFILE.tvHoldDeadband}
      />
    </Field>
    <Field id="tv-hold-max-rate" label="thrustVectorHoldMaxRate">
      {#snippet tooltip()}
        {$i18n.t("thrustVectorHoldMaxRateHelp")}
      {/snippet}
      <NumberInput
        id="tv-hold-max-rate"
        min="0"
        max="1800"
        bind:value={FC.TV_PID_PROFILE.tvHoldMaxRate}
      />
    </Field>
  </Section>

  {#if CONFIGURATOR.expertMode}
    <Section label="thrustVectorPidSettings">
      <SubSection label="profilesItermDecayGroup">
        <Field id="tv-iterm-decay-time" label="profilesItermDecayTime">
          {#snippet tooltip()}
            {$i18n.t("profilesItermDecayTimeHelp")}
          {/snippet}
          <NumberInput
            id="tv-iterm-decay-time"
            min="0"
            max="25"
            step="0.1"
            bind:value={
              () => FC.TV_PID_PROFILE.iterm_decay_time / 10,
              (v) => (FC.TV_PID_PROFILE.iterm_decay_time = Math.round(v * 10))
            }
          />
        </Field>
        <Field id="tv-iterm-decay-limit" label="profilesItermDecayLimit">
          {#snippet tooltip()}
            {$i18n.t("profilesItermDecayLimitHelp")}
          {/snippet}
          <NumberInput
            id="tv-iterm-decay-limit"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.iterm_decay_limit}
          />
        </Field>
      </SubSection>

      <SubSection label="profilesItermRelax">
        <Field id="tv-iterm-relax" label="profilesItermRelax">
          {#snippet tooltip()}
            {$i18n.t("profilesItermRelaxHelp")}
          {/snippet}
          <Switch
            id="tv-iterm-relax"
            bind:checked={() => itermRelaxEnabled, toggleItermRelax}
          />
        </Field>
        {#if itermRelaxEnabled}
          <SubSection>
            <Field id="tv-iterm-relax-type" label="profilesItermRelaxType">
              {#snippet tooltip()}
                {$i18n.t("profilesItermRelaxTypeHelp")}
              {/snippet}
              <Select
                id="tv-iterm-relax-type"
                options={[
                  {
                    value: 1,
                    label: $i18n.t("profilesItermRelaxTypeOptionRP"),
                  },
                  {
                    value: 2,
                    label: $i18n.t("profilesItermRelaxTypeOptionRPY"),
                  },
                ]}
                bind:value={() => itermRelaxType, changeItermRelaxType}
              />
            </Field>
            <Field
              id="tv-iterm-relax-cutoff-roll"
              label="profilesItermRelaxCutoffRoll"
            >
              {#snippet tooltip()}
                {$i18n.t("profilesItermRelaxCutoffHelp")}
              {/snippet}
              <NumberInput
                id="tv-iterm-relax-cutoff-roll"
                min="1"
                max="100"
                bind:value={FC.TV_PID_PROFILE.itermRelaxCutoffRoll}
              />
            </Field>
            <Field
              id="tv-iterm-relax-cutoff-pitch"
              label="profilesItermRelaxCutoffPitch"
            >
              <NumberInput
                id="tv-iterm-relax-cutoff-pitch"
                min="1"
                max="100"
                bind:value={FC.TV_PID_PROFILE.itermRelaxCutoffPitch}
              />
            </Field>
            {#if itermRelaxType > 1}
              <Field
                id="tv-iterm-relax-cutoff-yaw"
                label="profilesItermRelaxCutoffYaw"
              >
                <NumberInput
                  id="tv-iterm-relax-cutoff-yaw"
                  min="1"
                  max="100"
                  bind:value={FC.TV_PID_PROFILE.itermRelaxCutoffYaw}
                />
              </Field>
            {/if}
            <Field id="tv-iterm-relax-level-roll" label="tvItermRelaxLevelRoll">
              {#snippet tooltip()}
                {$i18n.t("tvItermRelaxLevelHelp")}
              {/snippet}
              <NumberInput
                id="tv-iterm-relax-level-roll"
                min="10"
                max="250"
                bind:value={FC.TV_PID_PROFILE.itermRelaxLevelRoll}
              />
            </Field>
            <Field
              id="tv-iterm-relax-level-pitch"
              label="tvItermRelaxLevelPitch"
            >
              <NumberInput
                id="tv-iterm-relax-level-pitch"
                min="10"
                max="250"
                bind:value={FC.TV_PID_PROFILE.itermRelaxLevelPitch}
              />
            </Field>
            {#if itermRelaxType > 1}
              <Field id="tv-iterm-relax-level-yaw" label="tvItermRelaxLevelYaw">
                <NumberInput
                  id="tv-iterm-relax-level-yaw"
                  min="10"
                  max="250"
                  bind:value={FC.TV_PID_PROFILE.itermRelaxLevelYaw}
                />
              </Field>
            {/if}
          </SubSection>
        {/if}
      </SubSection>

      <SubSection label="profilesErrorLimit">
        <Field id="tv-error-limit-roll" label="profilesErrorLimitRoll">
          {#snippet tooltip()}
            {$i18n.t("profilesErrorLimitHelp")}
          {/snippet}
          <NumberInput
            id="tv-error-limit-roll"
            min="0"
            max="180"
            bind:value={FC.TV_PID_PROFILE.errorLimitRoll}
          />
        </Field>
        <Field id="tv-error-limit-pitch" label="profilesErrorLimitPitch">
          <NumberInput
            id="tv-error-limit-pitch"
            min="0"
            max="180"
            bind:value={FC.TV_PID_PROFILE.errorLimitPitch}
          />
        </Field>
        <Field id="tv-error-limit-yaw" label="profilesErrorLimitYaw">
          <NumberInput
            id="tv-error-limit-yaw"
            min="0"
            max="180"
            bind:value={FC.TV_PID_PROFILE.errorLimitYaw}
          />
        </Field>
      </SubSection>

      <SubSection label="profilesGyroCutoffGroup">
        <Field
          id="tv-gyro-cutoff-roll"
          label="profilesGyroCutoffRoll"
          unit="Hz"
        >
          {#snippet tooltip()}
            {$i18n.t("profilesGyroCutoffHelp")}
          {/snippet}
          <NumberInput
            id="tv-gyro-cutoff-roll"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.gyroCutoffRoll}
          />
        </Field>
        <Field
          id="tv-gyro-cutoff-pitch"
          label="profilesGyroCutoffPitch"
          unit="Hz"
        >
          <NumberInput
            id="tv-gyro-cutoff-pitch"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.gyroCutoffPitch}
          />
        </Field>
        <Field id="tv-gyro-cutoff-yaw" label="profilesGyroCutoffYaw" unit="Hz">
          <NumberInput
            id="tv-gyro-cutoff-yaw"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.gyroCutoffYaw}
          />
        </Field>
      </SubSection>

      <SubSection label="profilesDtermCutoffGroup">
        <Field
          id="tv-dterm-cutoff-roll"
          label="profilesDtermCutoffRoll"
          unit="Hz"
        >
          {#snippet tooltip()}
            {$i18n.t("profilesDtermCutoffHelp")}
          {/snippet}
          <NumberInput
            id="tv-dterm-cutoff-roll"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.dtermCutoffRoll}
          />
        </Field>
        <Field
          id="tv-dterm-cutoff-pitch"
          label="profilesDtermCutoffPitch"
          unit="Hz"
        >
          <NumberInput
            id="tv-dterm-cutoff-pitch"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.dtermCutoffPitch}
          />
        </Field>
        <Field
          id="tv-dterm-cutoff-yaw"
          label="profilesDtermCutoffYaw"
          unit="Hz"
        >
          <NumberInput
            id="tv-dterm-cutoff-yaw"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.dtermCutoffYaw}
          />
        </Field>
      </SubSection>

      <SubSection label="profilesBtermCutoffGroup">
        <Field
          id="tv-bterm-cutoff-roll"
          label="profilesBtermCutoffRoll"
          unit="Hz"
        >
          {#snippet tooltip()}
            {$i18n.t("profilesBtermCutoffHelp")}
          {/snippet}
          <NumberInput
            id="tv-bterm-cutoff-roll"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.btermCutoffRoll}
          />
        </Field>
        <Field
          id="tv-bterm-cutoff-pitch"
          label="profilesBtermCutoffPitch"
          unit="Hz"
        >
          <NumberInput
            id="tv-bterm-cutoff-pitch"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.btermCutoffPitch}
          />
        </Field>
        <Field
          id="tv-bterm-cutoff-yaw"
          label="profilesBtermCutoffYaw"
          unit="Hz"
        >
          <NumberInput
            id="tv-bterm-cutoff-yaw"
            min="0"
            max="250"
            bind:value={FC.TV_PID_PROFILE.btermCutoffYaw}
          />
        </Field>
      </SubSection>
    </Section>
  {/if}
</Page>

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    min-width: 60px;
  }

  .note {
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
    padding: 8px 12px;
    border-radius: 4px;

    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);
  }

  .table-scroll {
    overflow-x: auto;
  }

  .mobile-table {
    display: none;
  }

  .grid {
    width: 100%;
    min-width: 480px;
    border-collapse: collapse;
  }

  th {
    padding: 4px;
    font-weight: 600;
    font-size: 0.8rem;
    text-align: center;

    color: var(--color-text-soft);
    border-bottom: 1px solid var(--color-border);
  }

  .header-label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    white-space: nowrap;
  }

  td {
    padding: 4px;
    text-align: center;
  }

  .runtime-control {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .runtime-active {
    opacity: 1;
  }

  // Absolutely positioned, not a normal flex child -- a td centers
  // .runtime-control as one box (`td { text-align: center }` below), so a
  // badge sharing the flex row would widen that box on badge-carrying rows
  // only, visibly dragging the number input itself left of where it sits
  // on every badge-less row in the same column. Taking the badge out of
  // flow keeps .runtime-control's own width (and so its centered position)
  // down to just the input, on every row alike; the badge just hangs
  // beside it without moving anything.
  .adjustment-badge {
    position: absolute;
    left: 100%;
    margin-left: 8px;
    min-width: 2.5rem;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: 3px;
    background-color: var(--color-accent, var(--accent));
    color: var(--color-text-inverse, #fff);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .runtime-control:not(.runtime-active) .adjustment-badge {
    background-color: transparent;
    color: var(--color-text-soft);
  }

  .runtime-control.runtime-active :global(.container) {
    opacity: 0.62;
  }

  .axis,
  .axis-header {
    font-weight: 600;
    white-space: nowrap;
  }

  .axis {
    text-align: left;
    padding-left: 8px;
  }

  .term-label {
    text-align: left;
    padding-left: 8px;
    font-weight: 600;
    white-space: nowrap;
  }

  // P/I/D/F/B render at slightly different widths (an "I" is narrower
  // than a "P"), which would otherwise nudge each row's help icon a
  // couple pixels out of line with the others. Fixed width keeps them in
  // one clean column regardless of which letter precedes it.
  .term-key {
    display: inline-block;
    width: 12px;
  }

  .axis.ROLL,
  .axis-header.ROLL {
    background-color: hsl(0, 100%, 85%);
  }

  .axis.PITCH,
  .axis-header.PITCH {
    background-color: hsl(120, 100%, 85%);
  }

  .axis.YAW,
  .axis-header.YAW {
    background-color: hsl(240, 100%, 88%);
  }

  :global(html[data-theme="dark"]) .axis.ROLL,
  :global(html[data-theme="dark"]) .axis-header.ROLL {
    background-color: hsl(0, 40%, 30%);
  }

  :global(html[data-theme="dark"]) .axis.PITCH,
  :global(html[data-theme="dark"]) .axis-header.PITCH {
    background-color: hsl(120, 25%, 25%);
  }

  :global(html[data-theme="dark"]) .axis.YAW,
  :global(html[data-theme="dark"]) .axis-header.YAW {
    background-color: hsl(240, 35%, 32%);
  }

  // 820px, not the usual 480px phone breakpoint: this table needs real
  // room (5 columns) before staying in desktop mode makes sense - below
  // that it was falling into its own horizontal scroll well before the
  // generic phone breakpoint kicked in. Matches Profiles/PidGains.svelte's
  // identical breakpoint for the same table shape (this page has no
  // competing two-column layout to stay in step with, unlike that one).
  //
  // Once transposed, mobile has only 3 axis columns left (see markup
  // above) - much more headroom than the 5-column desktop table, so
  // NumberInput can sit closer to its normal desktop size instead of the
  // aggressively clawed-back width a 5-column fit would need. Still skip
  // width:100% on .grid though: even 3 columns of fixed-width steppers
  // get stretched far past their content by a full-width table, which is
  // what made this look sparse before.
  @media only screen and (max-width: 820px) {
    .desktop-table {
      display: none;
    }

    .mobile-table {
      display: block;
    }

    .table-scroll {
      --number-input-height: 1.7rem;
      --number-input-btn-size: 1.7rem;
      --number-input-max-width: 116px;
      --number-input-padding-x: 6px;
    }

    .grid {
      width: auto;
      min-width: 0;
    }

    th,
    td {
      padding: 4px 6px;
    }
  }
</style>
