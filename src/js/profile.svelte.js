import { FC } from "@/js/fc.svelte.js";
import { deriveProfile } from "@/js/profile/derive.js";

export { deriveProfile } from "@/js/profile/derive.js";

// Data that does not arrive over MSP but is contributed by the stage 3 CLI
// reader (pads in use, timer/DMA conflicts, the matched board profile). It
// is session state only: reset on every connect, never persisted.
const extras = $state({
  padsInUse: null,
  conflicts: null,
  boardProfile: null,
});

// The Aircraft Profile, recomputed whenever any of its FC inputs change.
// Svelte forbids exporting a derived directly, so consumers call getProfile().
const current = $derived.by(() => deriveProfile(FC, extras));

export function getProfile() {
  return current;
}

export function setProfileExtras(patch) {
  Object.assign(extras, patch);
}

export function resetProfileExtras() {
  extras.padsInUse = null;
  extras.conflicts = null;
  extras.boardProfile = null;
}
