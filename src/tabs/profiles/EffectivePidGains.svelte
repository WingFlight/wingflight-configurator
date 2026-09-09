<script>
  import { FC } from "@/js/fc.svelte.js";
  import { GainCurve } from "@/js/GainCurve.js";
  import { i18n } from "@/js/i18n.js";

  import HelpIcon from "@/components/HelpIcon.svelte";

  const PID_AXES = ["ROLL", "PITCH", "YAW"];
  const CURVE_PREVIEW_WIDTH = 190;
  const CURVE_PREVIEW_HEIGHT = 34;
  const CURVE_PREVIEW_HEIGHT_EXPANDED = 68;
  const CURVE_PREVIEW_PAD = 4;
  const MASTER_GAIN_KEYS = [
    "masterGainRoll",
    "masterGainPitch",
    "masterGainYaw",
  ];
  const GAIN_CURVE_KEYS = ["gainCurveRoll", "gainCurvePitch", "gainCurveYaw"];
  const PID_GAINS = [
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

  function isMasterGainAffected(gainIndex) {
    return gainIndex < 4;
  }

  let runtimeGains = $derived(
    FC.PID_RUNTIME_GAINS?.version >= 1 ? FC.PID_RUNTIME_GAINS : null,
  );
  let curveExpanded = $state(false);

  function curvePreviewHeight() {
    return curveExpanded ? CURVE_PREVIEW_HEIGHT_EXPANDED : CURVE_PREVIEW_HEIGHT;
  }

  function curveForAxis(axisIndex) {
    const curveIndex = Number(FC.PID_PROFILE[GAIN_CURVE_KEYS[axisIndex]]) || 0;
    return curveIndex > 0 ? FC.GAIN_CURVES?.[curveIndex - 1] : null;
  }

  function curveLabel(axisIndex) {
    const curveIndex = Number(FC.PID_PROFILE[GAIN_CURVE_KEYS[axisIndex]]) || 0;
    return curveIndex > 0 ? `Curve ${curveIndex}` : "Flat";
  }

  function displayCurveForAxis(axisIndex) {
    return curveForAxis(axisIndex) ?? GainCurve.nullCurve();
  }

  function runtimeMasterGain(axisIndex) {
    return (
      runtimeGains?.axes?.[axisIndex]?.masterGain ??
      profileMasterGain(axisIndex)
    );
  }

  function profileMasterGain(axisIndex) {
    const profileMasterGain = Number(
      FC.PID_PROFILE[MASTER_GAIN_KEYS[axisIndex]],
    );
    return Number.isFinite(profileMasterGain) ? profileMasterGain : 100;
  }

  function runtimeThrottleGain() {
    return runtimeGains?.fwTpa ?? 100;
  }

  function hasRuntimeThrottleDelta() {
    return Math.abs(runtimeThrottleGain() - 100) >= 0.5;
  }

  function scaledCurveY(curveY, masterGain, termScale = 100) {
    return (curveY * masterGain * termScale) / 10000;
  }

  function hasRuntimeMasterGainDelta(axisIndex) {
    return (
      Math.abs(runtimeMasterGain(axisIndex) - profileMasterGain(axisIndex)) >=
      0.5
    );
  }

  function curveMax(axisIndex) {
    const curve = displayCurveForAxis(axisIndex);

    const masterGains = [
      profileMasterGain(axisIndex),
      runtimeMasterGain(axisIndex),
    ];
    const termScales = [100, runtimeThrottleGain()];
    const maxPoint = Math.max(
      ...masterGains.flatMap((masterGain) =>
        termScales.flatMap((termScale) => [
          ...curve.points
            .slice(0, curve.count)
            .map((point) => scaledCurveY(point.y, masterGain, termScale)),
          scaledCurveY(GainCurve.NEUTRAL, masterGain, termScale),
        ]),
      ),
    );

    return Math.max(GainCurve.NEUTRAL, maxPoint) * 1.1;
  }

  function curveX(x) {
    const plotWidth = CURVE_PREVIEW_WIDTH - CURVE_PREVIEW_PAD * 2;
    return CURVE_PREVIEW_PAD + (x / GainCurve.X_MAX) * plotWidth;
  }

  function curveY(axisIndex, y) {
    const plotHeight = curvePreviewHeight() - CURVE_PREVIEW_PAD * 2;
    return (
      curvePreviewHeight() -
      CURVE_PREVIEW_PAD -
      (y / curveMax(axisIndex)) * plotHeight
    );
  }

  function curvePath(
    axisIndex,
    masterGain = runtimeMasterGain(axisIndex),
    termScale = 100,
  ) {
    const curve = displayCurveForAxis(axisIndex);

    return curve.points
      .slice(0, curve.count)
      .map((point, index) => {
        const x = curveX(point.x);
        const y = curveY(
          axisIndex,
          scaledCurveY(point.y, masterGain, termScale),
        );
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function neutralLineY(axisIndex) {
    return curveY(
      axisIndex,
      scaledCurveY(GainCurve.NEUTRAL, profileMasterGain(axisIndex)),
    );
  }

  function curveMarker(axisIndex, termScale = 100) {
    const curve = displayCurveForAxis(axisIndex);
    const position = runtimeGains?.axes?.[axisIndex]?.gainCurvePosition;
    if (!Number.isFinite(position)) {
      return null;
    }

    const xValue = position * 10;
    const yValue = scaledCurveY(
      GainCurve.evaluate(curve, xValue),
      runtimeMasterGain(axisIndex),
      termScale,
    );
    return {
      x: curveX(xValue),
      y: curveY(axisIndex, yValue),
    };
  }

  function formatMasterGain(value) {
    return Math.round(value);
  }

  function formatThrottleGain(value) {
    return Math.round(value);
  }

  function realPid(axisIndex, gainIndex) {
    const gainKey = PID_GAINS[gainIndex].key;
    const runtimeValue = runtimeGains?.axes?.[axisIndex]?.effective?.[gainKey];
    if (Number.isFinite(runtimeValue)) {
      return runtimeValue;
    }

    const base = Number(FC.PIDS[axisIndex][gainIndex]) || 0;
    if (!isMasterGainAffected(gainIndex)) {
      return base;
    }

    const masterGain =
      Number(FC.PID_PROFILE[MASTER_GAIN_KEYS[axisIndex]]) || 100;
    return (base * masterGain) / 100;
  }

  function formatRealPid(value) {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded)
      ? String(rounded)
      : rounded
          .toFixed(2)
          .replace(/\.0+$/, "")
          .replace(/(\.\d*[1-9])0+$/, "$1");
  }
</script>

{#snippet valueCell(axisIndex, gainIndex)}
  <div class="real-pid-wrap">
    <div class="real-pid" title={$i18n.t("profilesMasterGainHelp")}>
      {formatRealPid(realPid(axisIndex, gainIndex))}
    </div>
  </div>
{/snippet}

{#snippet curveCell(axisIndex)}
  <div class="curve-preview-wrap">
    <svg
      class="curve-preview"
      class:expanded={curveExpanded}
      viewBox="0 0 {CURVE_PREVIEW_WIDTH} {curvePreviewHeight()}"
      style="height: {curvePreviewHeight()}px"
      aria-hidden="true"
    >
      <rect
        class="curve-frame"
        x="1"
        y="1"
        width={CURVE_PREVIEW_WIDTH - 2}
        height={curvePreviewHeight() - 2}
        rx="2"
      ></rect>
      <line
        class="curve-neutral"
        x1={CURVE_PREVIEW_PAD}
        y1={neutralLineY(axisIndex)}
        x2={CURVE_PREVIEW_WIDTH - CURVE_PREVIEW_PAD}
        y2={neutralLineY(axisIndex)}
      ></line>
      {#if hasRuntimeMasterGainDelta(axisIndex)}
        <path
          class="curve-profile"
          d={curvePath(axisIndex, profileMasterGain(axisIndex))}
        ></path>
      {/if}
      <path class="curve-live" d={curvePath(axisIndex)}></path>
      {#if hasRuntimeThrottleDelta()}
        <path
          class="curve-throttle"
          d={curvePath(
            axisIndex,
            runtimeMasterGain(axisIndex),
            runtimeThrottleGain(),
          )}
        ></path>
      {/if}
      {#if curveMarker(axisIndex)}
        <line
          class="curve-pointer"
          x1={curveMarker(axisIndex).x}
          y1={curvePreviewHeight() - CURVE_PREVIEW_PAD}
          x2={curveMarker(axisIndex).x}
          y2={curveMarker(axisIndex).y}
        ></line>
        <circle
          cx={curveMarker(axisIndex).x}
          cy={curveMarker(axisIndex).y}
          r="3"
        ></circle>
      {/if}
      {#if hasRuntimeThrottleDelta() && curveMarker(axisIndex, runtimeThrottleGain())}
        <circle
          class="throttle-marker"
          cx={curveMarker(axisIndex, runtimeThrottleGain()).x}
          cy={curveMarker(axisIndex, runtimeThrottleGain()).y}
          r="2.4"
        ></circle>
      {/if}
    </svg>
    <span class="curve-live-label">{curveLabel(axisIndex)}</span>
    {#if hasRuntimeMasterGainDelta(axisIndex)}
      <span
        class="curve-gain-label"
        class:gain-higher={runtimeMasterGain(axisIndex) >
          profileMasterGain(axisIndex)}
        class:gain-lower={runtimeMasterGain(axisIndex) <
          profileMasterGain(axisIndex)}
      >
        {formatMasterGain(runtimeMasterGain(axisIndex))}%
      </span>
    {/if}
    {#if hasRuntimeThrottleDelta()}
      <span
        class="curve-throttle-label"
        class:tpa-higher={runtimeThrottleGain() > 100}
        class:tpa-lower={runtimeThrottleGain() < 100}
        title="P/D throttle attenuation"
      >
        TPA {formatThrottleGain(runtimeThrottleGain())}%
      </span>
    {/if}
  </div>
{/snippet}

<div class="effective-pids-section">
  <div class="effective-pids-header">
    <span class="header-label">
      Effective PID Gains
      <HelpIcon>{$i18n.t("profilesEffectivePidGainsHelp")}</HelpIcon>
    </span>
    <button
      type="button"
      class="curve-expand-button"
      aria-label={curveExpanded ? "Collapse curves" : "Expand curves"}
      title={curveExpanded ? "Collapse curves" : "Expand curves"}
      onclick={() => (curveExpanded = !curveExpanded)}
    >
      <em class={curveExpanded ? "fas fa-compress-alt" : "fas fa-expand-alt"}
      ></em>
    </button>
  </div>

  <!-- Desktop: axes as rows, gain terms + curve as columns. -->
  <div class="effective-pids-content desktop-table">
    <table class="grid effective-grid">
      <thead>
        <tr>
          <th></th>
          {#each PID_GAINS as gain (gain.key)}
            <th>
              <span class="header-label">
                {$i18n.t(gain.label)}
                <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
              </span>
            </th>
          {/each}
          <th class="curve-column">
            <span class="header-label">
              {$i18n.t("profilesGainCurveColumn")}
              <HelpIcon>{$i18n.t("profilesGainCurveHelp")}</HelpIcon>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each PID_AXES as axis, axisIndex (axis)}
          <tr>
            <td class="axis {axis}">{$i18n.t(`axis${axis}`)}</td>
            {#each PID_GAINS as gain, gainIndex (gain.key)}
              <td>{@render valueCell(axisIndex, gainIndex)}</td>
            {/each}
            <td class="curve-cell">{@render curveCell(axisIndex)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Mobile: gain terms as rows, axes as columns - five narrow numeric
       columns don't fit a phone width, but three do. The curve graphs are
       dropped entirely here rather than squeezed in - they're a supporting
       visualization, not the data itself, and there's no room left to show
       three of them legibly. -->
  <div class="effective-pids-content mobile-table">
    <table class="grid effective-grid">
      <thead>
        <tr>
          <th></th>
          {#each PID_AXES as axis (axis)}
            <th class="axis-header {axis}">{$i18n.t(`axis${axis}`)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each PID_GAINS as gain, gainIndex (gain.key)}
          <tr>
            <td class="term-label">
              <span class="header-label">
                <span class="term-key">{gain.key}</span>
                <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
              </span>
            </td>
            {#each PID_AXES as axis, axisIndex (axis)}
              <td>{@render valueCell(axisIndex, gainIndex)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style lang="scss">
  .effective-pids-section {
    @extend %section-shadow;

    margin-top: var(--section-gap);
    overflow: hidden;
  }

  .effective-pids-header {
    @extend %section-header;

    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
  }

  .effective-pids-header .header-label {
    color: var(--color-text-alt);
  }

  .curve-expand-button {
    margin-left: auto;
    padding: 0 6px;
    height: 1.4rem;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--color-text-alt);
    cursor: pointer;
    line-height: 1.4rem;
  }

  .curve-expand-button:hover {
    background-color: color-mix(in srgb, var(--color-surface) 18%, transparent);
  }

  .mobile-table {
    display: none;
  }

  .effective-pids-content {
    padding: 4px;
    overflow-x: auto;
    background-color: var(--color-surface);
  }

  .grid {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  th {
    padding: 4px 12px;
    font-weight: 600;
    font-size: 0.8rem;
    text-align: center;
    white-space: nowrap;

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
    padding: 4px 12px;
    text-align: center;
  }

  .effective-grid .axis {
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

  .curve-column {
    width: 34%;
  }

  .curve-cell {
    width: 34%;
    padding-left: 16px;
    padding-right: 18px;
  }

  .real-pid {
    width: 100%;
    min-width: 0;
    height: 1.5rem;
    padding: 0 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    background-color: var(--color-input-bg-disabled);
    color: var(--color-text-soft);
    text-align: right;
    line-height: 1.5rem;
    font-size: 0.75rem;
    pointer-events: none;
    user-select: none;
  }

  .real-pid-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    width: 100%;
    min-width: 72px;
    max-width: 100px;
  }

  .curve-preview-wrap {
    position: relative;
    display: inline-block;
    width: min(100%, 260px);
  }

  .curve-preview {
    display: block;
    width: 100%;
    height: 34px;
    overflow: visible;
  }

  .curve-preview.expanded {
    height: 68px;
  }

  .curve-preview .curve-frame {
    fill: color-mix(in srgb, var(--color-surface) 78%, transparent);
    stroke: var(--color-border);
    stroke-width: 1;
  }

  .curve-preview .curve-neutral {
    stroke: var(--color-border);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.65;
  }

  .curve-preview .curve-profile {
    fill: none;
    stroke: var(--color-text-soft);
    stroke-width: 1.2;
    stroke-dasharray: 4 3;
    opacity: 0.42;
  }

  .curve-preview .curve-live {
    fill: none;
    stroke: var(--color-text-soft);
    stroke-width: 1.9;
    opacity: 0.9;
  }

  .curve-preview .curve-throttle {
    fill: none;
    stroke: hsl(35, 82%, 44%);
    stroke-width: 1.5;
    stroke-dasharray: 2 2;
    opacity: 0.9;
  }

  .curve-preview .curve-pointer {
    stroke: var(--color-accent, var(--accent));
    stroke-width: 1;
    opacity: 0.55;
  }

  .curve-preview circle {
    fill: var(--color-accent, var(--accent));
    stroke: var(--color-surface);
    stroke-width: 1;
  }

  .curve-preview .throttle-marker {
    fill: hsl(35, 82%, 44%);
  }

  .curve-live-label,
  .curve-gain-label,
  .curve-throttle-label {
    position: absolute;
    padding: 0 4px;
    border-radius: var(--radius-xs);
    background-color: color-mix(in srgb, var(--color-surface) 82%, transparent);
    color: var(--color-text-soft);
    font-size: 0.65rem;
    line-height: 1rem;
    pointer-events: none;
  }

  .curve-live-label {
    left: 4px;
    top: 2px;
  }

  .curve-gain-label {
    top: 2px;
    right: 4px;
  }

  .curve-throttle-label {
    right: 4px;
    bottom: 2px;
    color: hsl(35, 82%, 34%);
  }

  .curve-gain-label.gain-higher {
    color: hsl(145, 55%, 34%);
  }

  .curve-gain-label.gain-lower {
    color: hsl(8, 64%, 43%);
  }

  :global(html[data-theme="dark"]) .curve-gain-label.gain-higher {
    color: hsl(145, 55%, 62%);
  }

  :global(html[data-theme="dark"]) .curve-gain-label.gain-lower {
    color: hsl(8, 72%, 68%);
  }

  :global(html[data-theme="dark"]) .curve-preview .curve-throttle {
    stroke: hsl(35, 82%, 62%);
  }

  :global(html[data-theme="dark"]) .curve-preview .throttle-marker {
    fill: hsl(35, 82%, 62%);
  }

  :global(html[data-theme="dark"]) .curve-throttle-label {
    color: hsl(35, 82%, 68%);
  }

  .axis,
  .axis-header {
    font-weight: 600;
    white-space: nowrap;
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

  // 820px, not the usual 480px phone breakpoint: this is the widest table
  // on the page (760px min-width) and needs real room before staying in
  // desktop mode makes sense - below that it was falling into its own
  // horizontal scroll well before the generic phone breakpoint kicked in.
  // See Profiles.svelte's matching comment - this must switch in step
  // with the rest of the page.
  //
  // Once transposed, five gain-term columns don't fit a phone width even
  // shrunk, so the number grid becomes terms as rows, axes as the 3
  // columns (same trick as PidGains.svelte) instead of scrolling. The
  // curve graphs are dropped entirely (see markup above). These value
  // boxes are also read-only display, not real inputs - no touch target
  // to protect here, unlike the editable tables - so we drop the
  // input-styled border/background (which also reads as misleadingly
  // "editable") and reclaim the width instead.
  //
  // This must come after every unconditional ".grid" etc. rule above:
  // media queries don't add specificity, so with equal-specificity
  // selectors the later rule in the file wins regardless of which one's
  // condition matches - an earlier copy of this block was silently losing
  // to the plain ".grid" rule below it.
  // %section-header (in _global.scss, shared by every section header in
  // the app) drops its dark bar entirely at <=480px and switches text to
  // --color-text to read against the page background that replaces it.
  // This header force-sets --color-text-alt (white) unconditionally
  // below, so it needs its own matching swap back to --color-text - but
  // that has to stay paired with %section-header's own <=480 breakpoint,
  // not this file's 820px table breakpoint, or the two desync: the bar
  // stays dark past 480px while the text already went dark-on-dark.
  @media only screen and (max-width: 480px) {
    .effective-pids-header .header-label {
      color: var(--color-text);
    }
  }

  @media only screen and (max-width: 820px) {
    .desktop-table {
      display: none;
    }

    .mobile-table {
      display: block;
    }

    .curve-expand-button {
      display: none;
    }

    .grid {
      // Not width:100% here - with only 4 columns (label + 3 axes), a full-
      // width table stretches every column far past what its content
      // needs. Let it shrink to fit instead; .mobile-table's overflow-x
      // still catches it on the rare screen too narrow to fit even that.
      width: auto;
      min-width: 0;
    }

    th,
    td {
      padding: 4px 6px;
    }

    // Sized to roughly match PidGains.svelte's mobile NumberInput width
    // just below it on the page, so the two tables read as one system
    // instead of the value boxes here looking arbitrarily tiny.
    .real-pid-wrap {
      min-width: 50px;
      max-width: 80px;
    }

    .real-pid {
      padding: 0 6px;
      height: 1.4rem;
      line-height: 1.4rem;
      font-size: 0.75rem;
      border-color: transparent;
      background-color: transparent;
    }
  }
</style>
