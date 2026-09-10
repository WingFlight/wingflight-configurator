<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import NumberInput from "@/components/NumberInput.svelte";
  import Select from "@/components/Select.svelte";
  import Tier from "@/components/Tier.svelte";

  import { bpmToMs, msToBpm } from "./util.js";

  const PROFILE_OPTIONS = [
    "ledStripProfileRaceOption",
    "ledStripProfileBeaconOption",
    "ledStripProfileStatusOption",
    "ledStripProfileStatusAltOption",
  ];

  let profileOptions = $derived(
    PROFILE_OPTIONS.map((label, value) => ({ value, label: $i18n.t(label) })),
  );

  let blinkRateBpm = $derived(
    msToBpm(FC.LED_STRIP_CONFIG.ledstrip_blink_period_ms),
  );

  function onchange() {
    mspHelper.sendLedStripSettings();
  }

  function onBlinkRateChange(bpm) {
    FC.LED_STRIP_CONFIG.ledstrip_blink_period_ms = bpmToMs(bpm);
    onchange();
  }
</script>

<div class="section">{$i18n.t("ledStripGlobalSettings")}</div>

<Tier id="led_strip.global.profile">
  <div class="field">
    <span class="label">{$i18n.t("ledStripProfileTitle")}</span>
    <Select
      bind:value={FC.LED_STRIP_CONFIG.ledstrip_profile}
      options={profileOptions}
      {onchange}
    />
  </div>
</Tier>

<Tier id="led_strip.global.blinkRate">
  <label class="field">
    <span class="label">{$i18n.t("ledStripGlobalBlinkRate")}</span>
    <NumberInput
      bind:value={() => blinkRateBpm, onBlinkRateChange}
      min={30}
      max={300}
      step={1}
    />
  </label>
</Tier>

<Tier id="led_strip.global.fadeRate">
  <label class="field">
    <span class="label">{$i18n.t("ledStripGlobalFadeRate")}</span>
    <NumberInput
      bind:value={FC.LED_STRIP_CONFIG.ledstrip_fade_rate}
      min={1}
      max={100}
      step={1}
      {onchange}
    />
  </label>
</Tier>

<Tier id="led_strip.global.flickerRate">
  <label class="field">
    <span class="label">{$i18n.t("ledStripGlobalFlickerRate")}</span>
    <NumberInput
      bind:value={FC.LED_STRIP_CONFIG.ledstrip_flicker_rate}
      min={0}
      max={100}
      step={1}
      {onchange}
    />
  </label>
</Tier>

<Tier id="led_strip.global.brightness">
  <label class="field">
    <span class="label">{$i18n.t("ledStripGlobalBrightness")}</span>
    <NumberInput
      bind:value={FC.LED_STRIP_CONFIG.ledstrip_brightness}
      min={5}
      max={100}
      step={1}
      {onchange}
    />
  </label>
</Tier>

<style lang="scss">
  .section {
    margin: 16px 0 6px;
    padding-bottom: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-soft);
    border-bottom: 1px solid var(--color-border);
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
    font-size: 0.8rem;
  }
</style>
