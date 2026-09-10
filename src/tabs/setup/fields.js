import { registerFields } from "@/js/relevance.js";

// Field registry for the setup tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The setup tab is a list of one-shot actions (calibrate accelerometer /
// magnetometer, reset, save-to-file, reboot to bootloader / mass storage /
// firmware). None of them is a setting, so nothing is registered here.
registerFields({});
