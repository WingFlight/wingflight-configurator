import * as config from "@/js/config.js";

// The tab tree collapses into a single "All settings" entry (concept §8).
// The 26 tabs stay unchanged behind it, in their existing groups; this only
// toggles a class on the connected tab list and remembers the choice.

const STORAGE_KEY = "allSettingsExpanded";
const COLLAPSED_CLASS = "all-settings-collapsed";

function list() {
  return globalThis.document?.querySelector("#tabs ul.mode-connected");
}

export function isAllSettingsExpanded() {
  const stored = config.get(STORAGE_KEY);
  // Default: collapsed when the journey is the landing page, expanded
  // otherwise -- a user who turned the journey off wants the tabs.
  if (stored === undefined || stored === null) {
    const journeyLanding = config.get("journeyLanding");
    return journeyLanding === false;
  }
  return !!stored;
}

export function setAllSettingsExpanded(expanded, { persist = true } = {}) {
  const ul = list();
  if (ul) ul.classList.toggle(COLLAPSED_CLASS, !expanded);
  const toggle = globalThis.document?.querySelector("#all-settings-toggle button");
  if (toggle) toggle.setAttribute("aria-expanded", String(!!expanded));
  if (persist) config.set({ [STORAGE_KEY]: !!expanded });
}

export function expandAllSettings() {
  if (!isAllSettingsExpanded()) setAllSettingsExpanded(true);
}

export function initAllSettingsToggle() {
  setAllSettingsExpanded(isAllSettingsExpanded(), { persist: false });
  const toggle = globalThis.document?.querySelector("#all-settings-toggle button");
  toggle?.addEventListener("click", (e) => {
    e.preventDefault();
    setAllSettingsExpanded(!isAllSettingsExpanded());
  });
}

// Open a tab by name (the legacy nav is jQuery-driven). Expands the tree so
// the active tab is visible.
export function openTabByName(tabName) {
  if (tabName !== "journey") expandAllSettings();
  globalThis.$?.(`#tabs .tab_${tabName} a`).trigger("click");
}
