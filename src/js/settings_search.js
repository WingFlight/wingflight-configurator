import i18next from "i18next";

import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { allFields } from "@/js/relevance.js";
import { openTabByName } from "@/js/tab_tree.js";

// Settings search across every interface string, reachable from anywhere.
//
// Two sources feed the index:
//   1. the field registry -- fields tagged with a tier/predicate carry a tab
//      and their label/help keys, and can be jumped to precisely via
//      data-field-id;
//   2. every other message in the locale bundle whose key prefix maps to a
//      connected tab -- forum advice of the form "set X to Y" keeps working
//      even for fields nobody has tagged yet.
//
// Search ignores tier and relevance: a hit is revealed for a while via
// CONFIGURATOR.revealedFieldId so <Tier> shows it even when folded away.

// Key prefix -> tab. Longest prefix wins. Kept in one place so the sweep
// (P7) can extend it as tabs get tagged.
const PREFIX_TABS = [
  ["journey", "journey"],
  ["initialSetup", "setup"],
  ["configuration", "configuration"],
  ["craftName", "configuration"],
  ["boardAlignment", "configuration"],
  ["mountTrim", "configuration"],
  ["sensorAlignment", "configuration"],
  ["portsFunction", "configuration"],
  ["port", "configuration"],
  ["serialPort", "configuration"],
  ["feature", "configuration"],
  ["power", "power"],
  ["battery", "power"],
  ["voltage", "power"],
  ["current", "power"],
  ["smartfuel", "power"],
  ["smartFuel", "power"],
  ["receiver", "receiver"],
  ["rx", "receiver"],
  ["rssi", "receiver"],
  ["telemetry", "receiver"],
  ["failsafe", "failsafe"],
  ["mixer", "mixer"],
  ["servo", "servos"],
  ["motors", "motors"],
  ["motor", "motors"],
  ["esc", "esc_programming"],
  ["escProtocol", "motors"],
  ["escSensor", "motors"],
  ["governor", "motors"],
  ["curves", "curves"],
  ["curve", "curves"],
  ["pid", "profiles"],
  ["profile", "profiles"],
  ["profiles", "profiles"],
  ["masterGain", "profiles"],
  ["thrustVector", "thrust_vector"],
  ["tv", "thrust_vector"],
  ["rates", "rates"],
  ["rate", "rates"],
  ["gyro", "gyro"],
  ["filter", "gyro"],
  ["dynNotch", "gyro"],
  ["rpmFilter", "gyro"],
  ["auxiliary", "auxiliary"],
  ["mode", "auxiliary"],
  ["modeHelp", "auxiliary"],
  ["adjustments", "adjustments"],
  ["adjustment", "adjustments"],
  ["logic", "logic"],
  ["gps", "gps"],
  ["ledStrip", "led_strip"],
  ["led", "led_strip"],
  ["beeper", "beepers"],
  ["sensors", "sensors"],
  ["xact", "xact_servo"],
  ["fbus", "fbus_sensors"],
  ["blackbox", "blackbox"],
  ["status", "status"],
  ["options", "options"],
  ["opt", "options"],
];

const EXCLUDED_PREFIXES = ["tab", "dialog", "error", "button", "generic", "language", "default", "serialPortOpen", "connect", "firmwareFlasher", "cli", "uniqueDevice", "craftNameReceived", "eeprom", "device"];

function tabForKey(key) {
  let best = null;
  for (const [prefix, tab] of PREFIX_TABS) {
    if (key.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, tab];
  }
  return best ? best[1] : null;
}

function stripHtml(text) {
  return String(text ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function bundle() {
  const lng = i18next.language ?? "en";
  const ns = Array.isArray(i18next.options?.defaultNS) ? i18next.options.defaultNS[0] : i18next.options?.defaultNS ?? "messages";
  return i18next.getResourceBundle?.(lng, ns) ?? i18next.getResourceBundle?.("en", ns) ?? {};
}

let cache = null;
let cacheLang = null;

export function buildIndex() {
  const lng = i18next.language ?? "en";
  if (cache && cacheLang === lng) return cache;

  const entries = [];
  const seen = new Set();
  const messages = bundle();
  const t = (key) => stripHtml(messages[key]?.message ?? messages[key] ?? i18next.t(key));

  // 1. Registered fields (precise jump).
  for (const field of allFields()) {
    const label = field.labelKey ? t(field.labelKey) : field.label ?? field.id;
    const help = field.helpKey ? t(field.helpKey) : "";
    entries.push({
      id: field.id,
      tab: field.tab ?? tabForKey(field.labelKey ?? "") ?? null,
      label,
      help,
      tier: field.tier,
      text: `${label} ${help} ${field.id}`.toLowerCase(),
      precise: true,
    });
    if (field.labelKey) seen.add(field.labelKey);
    if (field.helpKey) seen.add(field.helpKey);
  }

  // 2. Every other string that maps to a tab.
  for (const [key, value] of Object.entries(messages)) {
    if (seen.has(key)) continue;
    if (EXCLUDED_PREFIXES.some((p) => key.startsWith(p))) continue;
    const tab = tabForKey(key);
    if (!tab) continue;
    const label = stripHtml(value?.message ?? value);
    if (!label || label.length < 3) continue;
    entries.push({ id: null, key, tab, label, help: "", text: `${label} ${key}`.toLowerCase(), precise: false });
  }

  cache = entries;
  cacheLang = lng;
  return entries;
}

export function invalidateIndex() {
  cache = null;
}

// Simple ranked substring search: every term must match; earlier / label
// matches rank higher; precise (registered) hits first.
export function search(query, limit = 12) {
  const q = String(query ?? "").trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of buildIndex()) {
    let score = 0;
    let ok = true;
    for (const term of terms) {
      const inLabel = e.label.toLowerCase().indexOf(term);
      if (inLabel >= 0) score += inLabel === 0 ? 30 : 20;
      else if (e.text.includes(term)) score += 8;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (e.precise) score += 15;
    if (e.label.toLowerCase() === q) score += 40;
    scored.push({ ...e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.label.length - b.label.length);
  return scored.slice(0, limit);
}

// ---- Jumping --------------------------------------------------------------

function waitForTab(tabName, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const GUI = globalThis.GUI;
      if (GUI?.active_tab === tabName && !GUI.tab_switch_in_progress) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 60);
    };
    tick();
  });
}

function findByText(root, text) {
  const needle = text.toLowerCase();
  const candidates = root.querySelectorAll("label, .field-label, th, .title, legend, span, td, p, h2, h3, div");
  let best = null;
  for (const el of candidates) {
    const own = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!own || own.length > needle.length * 4) continue;
    if (own === needle) return el;
    if (own.includes(needle) && (!best || own.length < best.textContent.length)) best = el;
  }
  return best;
}

let revealTimer = null;

export async function jumpTo(entry) {
  if (!entry?.tab) return false;

  // Reveal regardless of tier/relevance for a while.
  CONFIGURATOR.revealedFieldId = entry.id ?? null;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    CONFIGURATOR.revealedFieldId = null;
  }, 60000);

  openTabByName(entry.tab);
  const ok = await waitForTab(entry.tab);
  if (!ok) return false;

  // Give the tab a moment to finish its own MSP fetches and render.
  await new Promise((r) => setTimeout(r, 250));
  const root = document.querySelector("#content");
  if (!root) return false;

  let el = entry.id ? root.querySelector(`[data-field-id="${entry.id}"]`) : null;
  if (!el && entry.label) el = findByText(root, entry.label);
  if (!el) return false;

  // Expand a collapsed <details> ancestor so the field is actually visible.
  let node = el;
  while (node && node !== root) {
    if (node.tagName === "DETAILS") node.open = true;
    node = node.parentElement;
  }

  // display:contents wrappers have no box -- scroll the first child instead.
  const target = el.getBoundingClientRect().width === 0 && el.firstElementChild ? el.firstElementChild : el;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.add("search-hit");
  setTimeout(() => target.classList.remove("search-hit"), 3000);
  return true;
}
