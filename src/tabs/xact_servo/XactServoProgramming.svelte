<script>
  import { i18n } from "@/js/i18n.js";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Field from "@/components/Field.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Select from "@/components/Select.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import { getTabHelpURL } from "@/js/help";
  import { FC } from "@/js/fc.svelte.js";
  import {
    buildMuxChannelPins,
    buildReferenceLabels,
  } from "@/js/remap_fc/reference_design_labels.js";
  import manufacturerDesigns from "@/tabs/remap_fc/manufacturer_designs.json";
  import referenceDesigns from "@/tabs/remap_fc/reference_designs.json";

  import xactState, { AutoProgramPhase, View } from "./state.svelte.js";
  import { FBUS_SERVO_DATA_BASE } from "./protocol.js";
  import { AUTO_PROGRAM_RANGE, fbusChannels } from "./mux_programming.js";

  let loading = $state(false);
  let showToolbar = $derived(
    xactState.view === View.FORM && xactState.isDirty(),
  );
  let showBackToList = $derived(
    xactState.view === View.FORM &&
      xactState.servos.length > 1 &&
      !xactState.isDirty(),
  );

  // Live checks against the other servos already discovered this scan, so picking a new
  // Physical ID/App ID gives immediate feedback on whether it actually resolves a collision --
  // xactState.values.duplicateAppId only reflects what was true when the servo was read, not
  // whatever's currently selected in the form.
  let physicalIdWillCollide = $derived(
    xactState.servos.some(
      (s) =>
        s.physicalId !== xactState.selectedPhysicalId &&
        s.physicalId === xactState.values.physicalId,
    ),
  );
  let appIdWillCollide = $derived(
    xactState.servos.some(
      (s) =>
        s.physicalId !== xactState.selectedPhysicalId &&
        s.appIdOffset === xactState.values.appIdOffset,
    ),
  );

  // FBUS mux boards: name of each mux output (e.g. "S1", "TAIL") from the board's design,
  // falling back to its number.
  const designs = { ...referenceDesigns, ...manufacturerDesigns };
  let muxOutputLabels = $derived.by(() => {
    if (!FC.FBUS_MUX) return {};
    const pins = buildMuxChannelPins(designs, FC.CONFIG.boardName);
    const labels = buildReferenceLabels(
      designs,
      FC.CONFIG.boardDesign,
      FC.CONFIG.boardName,
    );
    return Object.fromEntries(
      FC.FBUS_MUX.channels.map((_, i) => [
        i + 1,
        labels[pins[i + 1]] ?? $i18n.t("xactServoMuxOutput", { number: i + 1 }),
      ]),
    );
  });
  let autoProgramChannels = $derived(fbusChannels(FC.FBUS_MUX));
  let autoProgramBusy = $derived(
    xactState.autoProgram?.phase === AutoProgramPhase.SURVEY ||
      xactState.autoProgram?.phase === AutoProgramPhase.PROGRAMMING,
  );
  let busy = $derived(xactState.view === View.SCANNING || autoProgramBusy);
  let muxChannelOptions = $derived([
    { value: "", label: $i18n.t("xactServoMuxAllOutputs") },
    ...(FC.FBUS_MUX?.channels ?? []).map((channel, i) => ({
      value: String(i + 1),
      label: $i18n.t("xactServoMuxOutputOption", {
        output: muxOutputLabels[i + 1],
        mode: channel.mode,
      }),
    })),
  ]);

  function onMuxChannelChange(e) {
    xactState.selectMuxChannel(
      e.target.value === "" ? null : Number(e.target.value),
    );
  }

  function servoSummary(servo) {
    return [
      `${$i18n.t("xactServoPhysicalId")} ${hex(servo.physicalId, 2)}`,
      hex(FBUS_SERVO_DATA_BASE + servo.appIdOffset, 4),
      `CH${servo.channel + 1}`,
      rangeOptions.find((o) => o.value === servo.range)?.label ?? "",
    ].join(" · ");
  }

  function targetSummary(target) {
    return servoSummary({ ...target, range: AUTO_PROGRAM_RANGE });
  }

  function hex(value, digits) {
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  // Physical ID (00-1A) and App ID (6800-680F) are Select fields labelled by their literal
  // hex bus address, matching FrSky's own "XAct" ETHOS Device Config tool exactly.
  const physicalIdOptions = Array.from({ length: 27 }, (_, i) => ({
    value: i,
    label: hex(i, 2),
  }));
  const appIdOptions = Array.from({ length: 16 }, (_, i) => ({
    value: i,
    label: hex(FBUS_SERVO_DATA_BASE + i, 4),
  }));
  const rangeOptions = [
    { value: 0, label: "120°" },
    { value: 1, label: "90°" },
    { value: 2, label: "180°" },
  ];
  const directionOptions = [
    { value: 0, label: $i18n.t("xactServoDirectionClockwise") },
    { value: 1, label: $i18n.t("xactServoDirectionAnticlockwise") },
  ];
  const pulseTypeOptions = [
    { value: 0, label: "1500us" },
    { value: 1, label: "760us" },
  ];
  const workingModeOptions = [
    { value: 0, label: $i18n.t("xactServoWorkingModeAngle") },
    { value: 1, label: $i18n.t("xactServoWorkingModeRange") },
    { value: 2, label: $i18n.t("xactServoWorkingModeRotate") },
  ];

  export function onSave() {
    return xactState.onSave();
  }

  export function onRevert() {
    xactState.onRevert();
  }

  export function isDirty() {
    return xactState.isDirty();
  }

  function onClickScan() {
    xactState.scan();
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabXactServoProgramming"), "_system");
  }

  function onClickBackToList() {
    xactState.backToList();
  }

  function onSelectServo(physicalId) {
    xactState.selectServo(physicalId);
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabXactServoProgramming")}</h1>
  <div class="grow"></div>
  <button class="btn" onclick={onClickScan} disabled={busy}>
    {$i18n.t("xactServoScanButton")}
  </button>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <p class="intro">{$i18n.t("xactServoIntro")}</p>
  <WarningNote message="xactServoSingleServoNote" />

  <!-- FBUS mux boards: pick the output to program on (FBUS put on it alone), and
       auto-programming over every output saved as FBUS. -->
  {#if FC.FBUS_MUX}
    <div class="mux-card">
      <Section label="xactServoMuxSection">
        <Field id="muxChannel" label="xactServoMuxChannel">
          {#snippet tooltip()}
            <Tooltip help="xactServoMuxChannelHelp" />
          {/snippet}
          <Select
            id="muxChannel"
            value={xactState.muxChannel === null
              ? ""
              : String(xactState.muxChannel)}
            options={muxChannelOptions}
            disabled={busy}
            onchange={onMuxChannelChange}
          />
        </Field>
        {#if xactState.muxChannel !== null}
          <p class="mux-note">{$i18n.t("xactServoMuxChannelHeld")}</p>
        {/if}

        <div class="auto-program">
          <p class="mux-note">{$i18n.t("xactServoAutoProgramHelp")}</p>
          <WarningNote message="xactServoAutoProgramOneServoNote" />
          <button
            class="btn"
            onclick={() => xactState.autoProgramSurvey()}
            disabled={busy || autoProgramChannels.length === 0}
          >
            {$i18n.t("xactServoAutoProgramButton")}
          </button>
          {#if autoProgramChannels.length === 0}
            <p class="status error">{$i18n.t("xactServoAutoProgramNoFbus")}</p>
          {/if}
        </div>

        {#if xactState.autoProgram}
          {@const ap = xactState.autoProgram}
          {#if ap.current !== null}
            <p class="status">
              {$i18n.t(
                ap.phase === AutoProgramPhase.SURVEY
                  ? "xactServoAutoProgramChecking"
                  : "xactServoAutoProgramWriting",
                { output: muxOutputLabels[ap.current] },
              )}
            </p>
          {/if}
          {#if ap.plan.length}
            <table class="auto-program-table">
              <thead>
                <tr>
                  <th>{$i18n.t("xactServoAutoProgramOutput")}</th>
                  <th>{$i18n.t("xactServoAutoProgramFound")}</th>
                  <th>{$i18n.t("xactServoAutoProgramNew")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each ap.plan as entry (entry.channel)}
                  {@const result = ap.results.find(
                    (r) => r.channel === entry.channel,
                  )}
                  <tr>
                    <td>{muxOutputLabels[entry.channel]}</td>
                    <td>{entry.servo ? servoSummary(entry.servo) : "-"}</td>
                    <td>{entry.target ? targetSummary(entry.target) : "-"}</td>
                    <td
                      class:error={[
                        "failed",
                        "idClash",
                        "multipleServos",
                      ].includes(result?.status ?? entry.status)}
                    >
                      {$i18n.t(
                        `xactServoAutoStatus_${result?.status ?? entry.status}`,
                        {
                          id: entry.target
                            ? hex(entry.target.physicalId, 2)
                            : "",
                        },
                      )}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
          {#if ap.clashes?.length}
            <p class="status error">
              {$i18n.t("xactServoAutoProgramBusClash", {
                outputs: ap.clashes.map((ch) => muxOutputLabels[ch]).join(", "),
              })}
            </p>
          {/if}
          {#if (ap.phase === AutoProgramPhase.REVIEW || ap.phase === AutoProgramPhase.DONE) && xactState.emptyChannels().length}
            <WarningNote message="xactServoAutoProgramEmptyNote" />
            <div class="auto-program-actions">
              <button
                class="btn"
                onclick={() => xactState.setEmptyOutputsToPwm()}
              >
                {$i18n.t("xactServoAutoProgramSetPwm", {
                  outputs: xactState
                    .emptyChannels()
                    .map((ch) => muxOutputLabels[ch])
                    .join(", "),
                })}
              </button>
            </div>
          {/if}
          {#if ap.phase === AutoProgramPhase.REVIEW}
            <div class="auto-program-actions">
              <button
                class="btn"
                onclick={() => xactState.autoProgramApply()}
                disabled={!ap.plan.some((e) => e.status === "program")}
              >
                {$i18n.t("xactServoAutoProgramApply")}
              </button>
              <button class="btn" onclick={() => xactState.closeAutoProgram()}>
                {$i18n.t("xactServoAutoProgramCancel")}
              </button>
            </div>
          {:else if ap.phase === AutoProgramPhase.DONE}
            <div class="auto-program-actions">
              <button class="btn" onclick={() => xactState.closeAutoProgram()}>
                {$i18n.t("xactServoAutoProgramClose")}
              </button>
            </div>
          {/if}
        {/if}
        {#if xactState.error}
          <p class="status error">{xactState.error}</p>
        {/if}
      </Section>
    </div>
  {/if}

  {#if xactState.view === View.IDLE}
    <p class="status">{$i18n.t("xactServoIdle")}</p>
  {:else if xactState.view === View.SCANNING}
    <p class="status">{$i18n.t("xactServoScanning")}</p>
  {:else if xactState.view === View.NOT_FOUND}
    <p class="status error">{$i18n.t("xactServoNotFound")}</p>
  {:else if xactState.view === View.LIST}
    <p class="status">
      {$i18n.t("xactServoMultipleFound", { count: xactState.servos.length })}
    </p>
    <div class="servo-list">
      {#each xactState.servos as servo (servo.physicalId)}
        <button
          type="button"
          class="servo-list-row"
          onclick={() => onSelectServo(servo.physicalId)}
        >
          <span class="servo-row-channel">
            {#if servo.ready}
              {$i18n.t("xactServoChannel")}: CH{servo.channel + 1}
            {:else}
              {$i18n.t("xactServoListReading")}
            {/if}
          </span>
          <span class="servo-row-field">
            {$i18n.t("xactServoPhysicalId")}: {hex(servo.physicalId, 2)}
          </span>
          <span class="servo-row-field">
            {$i18n.t("xactServoAppIdOffset")}: {hex(
              FBUS_SERVO_DATA_BASE + servo.appIdOffset,
              4,
            )}
          </span>
          <span class="row-grow"></span>
          {#if servo.duplicateAppId}
            <span class="servo-row-conflict"
              >{$i18n.t("xactServoDuplicateAppIdBadge")}</span
            >
          {:else if servo.conflict}
            <span class="servo-row-conflict"
              >{$i18n.t("xactServoConflictBadge")}</span
            >
          {/if}
          <em class="fas fa-chevron-right servo-row-chevron"></em>
        </button>
      {/each}
    </div>
  {:else if xactState.view === View.FORM}
    {#if showBackToList}
      <button type="button" class="back-btn" onclick={onClickBackToList}>
        <em class="fas fa-chevron-left"></em>
        {$i18n.t("xactServoBackToList")}
      </button>
    {/if}

    {#if physicalIdWillCollide}
      <WarningNote message="xactServoPhysicalIdCollisionWarning" />
    {:else if appIdWillCollide}
      <WarningNote message="xactServoDuplicateAppIdWarning" />
    {:else if xactState.values.conflict}
      <WarningNote message="xactServoConflictWarning" />
    {/if}

    <div class="pages">
      <Section label="xactServoSectionProtocol">
        <Field id="physicalId" label="xactServoPhysicalId">
          {#snippet tooltip()}
            <Tooltip help="xactServoPhysicalIdHelp" />
          {/snippet}
          <Select
            id="physicalId"
            bind:value={xactState.values.physicalId}
            options={physicalIdOptions}
          />
        </Field>
        <Field id="appIdOffset" label="xactServoAppIdOffset">
          {#snippet tooltip()}
            <Tooltip help="xactServoAppIdOffsetHelp" />
          {/snippet}
          <Select
            id="appIdOffset"
            bind:value={xactState.values.appIdOffset}
            options={appIdOptions}
          />
        </Field>
        <Field id="firmwareVersion" label="xactServoFirmwareVersion">
          {#snippet tooltip()}
            <Tooltip help="xactServoFirmwareVersionHelp" />
          {/snippet}
          <NumberInput
            id="firmwareVersion"
            value={xactState.values.firmwareVersion}
            disabled
            min={0}
            max={255}
            step={1}
          />
        </Field>
      </Section>

      <Section label="xactServoSectionServo">
        <Field id="range" label="xactServoRange">
          {#snippet tooltip()}
            <Tooltip help="xactServoRangeHelp" />
          {/snippet}
          <Select
            id="range"
            bind:value={xactState.values.range}
            options={rangeOptions}
          />
        </Field>
        <Field id="direction" label="xactServoDirection">
          {#snippet tooltip()}
            <Tooltip help="xactServoDirectionHelp" />
          {/snippet}
          <Select
            id="direction"
            bind:value={xactState.values.direction}
            options={directionOptions}
          />
        </Field>
        <Field id="pulseType" label="xactServoPulseType">
          {#snippet tooltip()}
            <Tooltip help="xactServoPulseTypeHelp" />
          {/snippet}
          <Select
            id="pulseType"
            bind:value={xactState.values.pulseType}
            options={pulseTypeOptions}
          />
        </Field>
        <Field id="dataRate" label="xactServoDataRate" unit="ms">
          {#snippet tooltip()}
            <Tooltip help="xactServoDataRateHelp" />
          {/snippet}
          <NumberInput
            id="dataRate"
            bind:value={xactState.values.dataRate}
            min={10}
            max={60000}
            step={1}
          />
        </Field>
        <Field id="channel" label="xactServoChannel">
          {#snippet tooltip()}
            <Tooltip help="xactServoChannelHelp" />
          {/snippet}
          <NumberInput
            id="channel"
            bind:value={
              () => xactState.values.channel + 1,
              (v) => (xactState.values.channel = v - 1)
            }
            min={1}
            max={24}
            step={1}
          />
        </Field>
        <Field id="center" label="xactServoCenter">
          {#snippet tooltip()}
            <Tooltip help="xactServoCenterHelp" />
          {/snippet}
          <NumberInput
            id="center"
            bind:value={xactState.values.center}
            min={-125}
            max={125}
            step={1}
          />
        </Field>
      </Section>

      <Section label="xactServoSectionAdvanced">
        <Field id="holdingStrength" label="xactServoHoldingStrength">
          {#snippet tooltip()}
            <Tooltip help="xactServoHoldingStrengthHelp" />
          {/snippet}
          <NumberInput
            id="holdingStrength"
            bind:value={xactState.values.holdingStrength}
            min={4}
            max={15}
            step={1}
          />
        </Field>
        <Field id="operationSmoothing" label="xactServoOperationSmoothing">
          {#snippet tooltip()}
            <Tooltip help="xactServoOperationSmoothingHelp" />
          {/snippet}
          <NumberInput
            id="operationSmoothing"
            bind:value={xactState.values.operationSmoothing}
            min={0}
            max={50}
            step={1}
          />
        </Field>
        <Field id="deadband" label="xactServoDeadband">
          {#snippet tooltip()}
            <Tooltip help="xactServoDeadbandHelp" />
          {/snippet}
          <NumberInput
            id="deadband"
            bind:value={xactState.values.deadband}
            min={0}
            max={90}
            step={1}
          />
        </Field>
      </Section>

      {#if xactState.values.hasExtendedParams}
        <Section label="xactServoSectionSeries65">
          <Field id="workingMode" label="xactServoWorkingMode">
            {#snippet tooltip()}
              <Tooltip help="xactServoWorkingModeHelp" />
            {/snippet}
            <Select
              id="workingMode"
              bind:value={xactState.values.workingMode}
              options={workingModeOptions}
            />
          </Field>
          <Field id="maxAngle" label="xactServoMaxAngle" unit="°">
            {#snippet tooltip()}
              <Tooltip help="xactServoMaxAngleHelp" />
            {/snippet}
            <NumberInput
              id="maxAngle"
              bind:value={xactState.values.maxAngle}
              min={0}
              max={359}
              step={1}
            />
          </Field>
        </Section>
      {/if}
    </div>
  {/if}
</Page>

<style lang="scss">
  h1 {
    margin: 0;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .back-btn {
    @extend %button;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0 8px 4px;
  }

  .intro {
    padding: 8px;
    color: var(--color-text-soft);
  }

  .status {
    padding: 8px;
    font-weight: 600;
  }

  .status.error {
    color: var(--color-red-900);
  }

  .mux-card {
    max-width: 760px;
    margin-bottom: 8px;
  }

  .mux-note {
    padding: 4px 8px;
    color: var(--color-text-soft);
  }

  .auto-program {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-top: 8px;

    .btn {
      margin-left: 8px;
    }
  }

  .auto-program-table {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
    font-size: 0.85rem;

    th,
    td {
      padding: 4px 8px;
      text-align: left;
    }

    tr + tr td,
    tbody tr:first-child td {
      border-top: 1px dotted var(--color-border);
    }

    td.error {
      color: var(--color-red-900);
    }
  }

  .auto-program-actions {
    display: flex;
    gap: 8px;
    padding: 8px;
  }

  .pages {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  .servo-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 2px;
  }

  .servo-list-row {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font: inherit;
    text-align: left;
    cursor: pointer;

    color: var(--color-text);
    background-color: var(--color-surface);

    @media (hover: hover) {
      &:hover {
        background-color: var(--color-surface-float, var(--color-surface));
      }
    }
  }

  .servo-row-channel {
    flex-shrink: 0;
    min-width: 90px;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .servo-row-field {
    flex-shrink: 0;
    font-size: 0.85rem;
    color: var(--color-text-soft);
  }

  .row-grow {
    flex: 1;
  }

  .servo-row-conflict {
    flex-shrink: 0;
    font-size: 0.75rem;
    font-weight: 700;

    color: var(--color-red-900);
  }

  .servo-row-chevron {
    flex-shrink: 0;
    font-size: 0.8rem;

    color: var(--color-text-soft);
  }
</style>
