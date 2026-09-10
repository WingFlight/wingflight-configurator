import { registerFields, when } from "@/js/relevance.js";

// Field registry for the led_strip tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// Everything on this tab only matters when the LED_STRIP feature is enabled
// (when.hasLedStrip). The LED grid itself, the colour palette swatches and the
// wiring-order buttons are the editing surface, not settings, and stay
// untagged; the configuration controls around them are what is registered.
registerFields({
  // Per-LED function / overlays (standard: what most people set up)
  "led_strip.function.function": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripFunctionTitle",
    when: when.hasLedStrip,
  },
  "led_strip.function.colorModifier": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripColorModifierTitle",
    when: when.hasLedStrip,
  },
  "led_strip.function.blink": {
    tier: "expert",
    tab: "led_strip",
    labelKey: "ledStripBlinkTitle",
    when: when.hasLedStrip,
  },
  "led_strip.function.overlays": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripOverlayTitle",
    when: when.hasLedStrip,
  },
  "led_strip.function.directions": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripModesColorTitle",
    when: when.hasLedStrip,
  },

  // Mode / special colours
  "led_strip.modeColors.modeColors": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripModeColorsTitle",
    when: when.hasLedStrip,
  },
  "led_strip.modeColors.specialColors": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripModesSpecialColorsTitle",
    when: when.hasLedStrip,
  },

  // Colour palette HSV sliders
  "led_strip.palette.hsv": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripH",
    when: when.hasLedStrip,
  },

  // Global settings
  "led_strip.global.profile": {
    tier: "standard",
    tab: "led_strip",
    labelKey: "ledStripProfileTitle",
    when: when.hasLedStrip,
  },
  "led_strip.global.blinkRate": {
    tier: "expert",
    tab: "led_strip",
    labelKey: "ledStripGlobalBlinkRate",
    when: when.hasLedStrip,
  },
  "led_strip.global.fadeRate": {
    tier: "expert",
    tab: "led_strip",
    labelKey: "ledStripGlobalFadeRate",
    when: when.hasLedStrip,
  },
  "led_strip.global.flickerRate": {
    tier: "expert",
    tab: "led_strip",
    labelKey: "ledStripGlobalFlickerRate",
    when: when.hasLedStrip,
  },
  "led_strip.global.brightness": {
    tier: "expert",
    tab: "led_strip",
    labelKey: "ledStripGlobalBrightness",
    when: when.hasLedStrip,
  },
});
