/**
 * File: src/js/remap_fc/feature_classifier.js
 * Classifies a remap_table.js option key (e.g. "M1", "S3", "Freq2",
 * "LED") into the broad feature type the timer/DMA allocators reason
 * about, and defines the groups of options that prefer to share a
 * timer base with each other.
 */

const MOTOR_RE = /^M[1-4]$/;
const SERVO_RE = /^S[1-8]$/;
const FREQ_RE = /^Freq\d+$/;

/**
 * Classifies an option key into "motor", "servo", "freq", "led", or
 * "other" -- the categories the timer allocator's base-exclusivity and
 * critical-base rules are keyed on.
 * @param {string} optionKey
 * @returns {"motor"|"servo"|"freq"|"led"|"other"}
 */
export function classifyFeature(optionKey) {
  if (MOTOR_RE.test(optionKey)) return "motor";
  if (SERVO_RE.test(optionKey)) return "servo";
  if (FREQ_RE.test(optionKey)) return "freq";
  if (optionKey === "LED") return "led";
  return "other";
}

// Groups that prefer to share a common timer base with unique
// channels on it, tried together before falling back to allocating
// their members individually. See timer_allocator.js's tryGroup.
export const SERVO_GROUP = ["S1", "S2", "S3"];
export const MOTOR_GROUP = ["M1", "M2", "M3", "M4"];

// Feature types whose DMA claim takes priority over every other type
// when two features want the same DMA stream/channel -- motors and
// the LED strip are the outputs most sensitive to DMA contention (a
// stolen stream shows up as glitching/dropped frames), so they're
// allowed to take a stream/channel a lower-priority feature (e.g. a
// servo or frequency input) already claimed. See dma_allocator.js.
export const HIGH_DMA_PRIORITY_TYPES = new Set(["motor", "led"]);
