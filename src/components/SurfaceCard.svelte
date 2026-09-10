<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { deflectionFor } from "@/js/airframe/geometry.js";

  // Surface detail card: output, pad + silkscreen, direction, centre and
  // travel for one control surface, with Reverse and Centre-here actions.
  // Writes go straight to the servo's configuration slot and EEPROM -- the
  // same path the Servos tab uses for a single servo.
  let { surface, profile, onChanged, children } = $props();

  const FLAG_REVERSE = 1;

  let index = $derived(surface.output - 1);
  let config = $derived(FC.SERVO_CONFIG?.[index] ?? null);
  let pulse = $derived(FC.SERVO_DATA?.[index] ?? 0);
  let deflection = $derived(deflectionFor(pulse, config));
  let reversed = $derived(config ? (config.flags & FLAG_REVERSE) !== 0 : false);
  let pad = $derived.by(() => {
    if (!Array.isArray(profile?.padsInUse)) return null;
    return profile.padsInUse.find((p) => p.key === surface.label) ?? null;
  });
  let busy = $state(false);

  async function writeServo() {
    busy = true;
    await new Promise((resolve) => mspHelper.sendServoConfig(index, resolve));
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));
    busy = false;
    onChanged?.();
  }

  function toggleReverse() {
    if (!config) return;
    config.flags = reversed
      ? config.flags & ~FLAG_REVERSE
      : config.flags | FLAG_REVERSE;
    writeServo();
  }

  function centreHere() {
    if (!config || !pulse) return;
    config.mid = Math.round(pulse);
    writeServo();
  }

  let sideText = $derived(
    surface.side && surface.side !== "center" && surface.side !== "both"
      ? ` · ${$i18n.t(`journeySide.${surface.side}`)}`
      : "",
  );
</script>

<div class="card">
  <div class="head">
    <strong>{$i18n.t(`journeyRole.${surface.role}`)}{sideText}</strong>
    <span class="mono">{surface.label}</span>
  </div>
  <dl>
    <dt>{$i18n.t("surfaceCardPad")}</dt>
    <dd>
      {#if pad}
        <span class="mono">{pad.silkscreen ?? "?"}</span>
        <span class="muted mono">{pad.pin}</span>
      {:else}
        <span class="muted">{$i18n.t("surfaceCardPadUnknown")}</span>
      {/if}
    </dd>
    <dt>{$i18n.t("surfaceCardAxes")}</dt>
    <dd>
      {surface.axes
        .map(
          (a) =>
            `${$i18n.t(`journeyAxis.${a}`)}${surface.signs[a] < 0 ? " (−)" : ""}`,
        )
        .join(", ")}
    </dd>
    <dt>{$i18n.t("surfaceCardLive")}</dt>
    <dd class="mono">
      {pulse || "–"} µs
      <span class="muted"
        >({deflection.angle >= 0 ? "+" : ""}{deflection.angle.toFixed(
          0,
        )}°)</span
      >
    </dd>
    {#if config}
      <dt>{$i18n.t("surfaceCardCentre")}</dt>
      <dd class="mono">{config.mid} µs</dd>
      <dt>{$i18n.t("surfaceCardTravel")}</dt>
      <dd class="mono">
        {config.min} … +{config.max}
        <span class="muted">· {config.rneg}/{config.rpos}</span>
      </dd>
      <dt>{$i18n.t("surfaceCardDirection")}</dt>
      <dd>
        {reversed
          ? $i18n.t("surfaceCardReversed")
          : $i18n.t("surfaceCardNormal")}
      </dd>
    {/if}
  </dl>
  <div class="actions">
    <button class="btn" disabled={!config || busy} onclick={toggleReverse}
      >{$i18n.t("surfaceCardReverse")}</button
    >
    <button
      class="btn"
      disabled={!config || busy || !pulse}
      onclick={centreHere}>{$i18n.t("surfaceCardCentreHere")}</button
    >
  </div>
  {@render children?.()}
</div>

<style lang="scss">
  .card {
    @extend %section-shadow;
    padding: 10px 12px;
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.85rem;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 3px 12px;
    margin: 0;
  }

  dt {
    color: var(--color-text-muted);
  }

  dd {
    margin: 0;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .btn {
    @extend %button;
  }
</style>
