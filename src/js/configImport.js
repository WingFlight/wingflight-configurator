// Each release line (2.2, 2.3, dev) keeps its own settings, so that changing
// one in 2.3 doesn't change 2.2, which may be installed for an older model.
// See release-channel.mjs. When a line starts for the first time, it picks up
// the settings of the line before it, so a pilot doesn't start from scratch:
//
// - web: every line shares one origin and one localStorage, and keeps its
//   settings under "settings:<line>:". Builds from before the lines saved
//   theirs without a prefix; those are the fallback.
// - desktop: every line has its own NW.js profile, which another line can't
//   read. Each one also mirrors its settings to <line>.json in a shared
//   directory, which the next line reads.

import { isStorageCacheKey } from "@/js/chromeStorageShim.js";

export const SETTINGS_NAMESPACE =
  __BACKEND__ === "web" ? `settings:${__APP_CHANNEL__}:` : "";

// Set once a line has its settings, imported or not.
const STARTED_KEY =
  __BACKEND__ === "web" ? `settings:${__APP_CHANNEL__}` : "settingsLine";

const RELEASE_LINE = /^\d+\.\d+$/;
const WEB_KEY = /^settings:([^:]+):/;

function compareLines(a, b) {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

// The newest release line older than this one, or else the newest one at
// all (e.g. for dev), or else dev.
export function pickSourceLine(own, lines) {
  const others = lines.filter((line) => line !== own);
  const releases = others
    .filter((line) => RELEASE_LINE.test(line))
    .sort(compareLines);
  if (RELEASE_LINE.test(own)) {
    const older = releases.filter((line) => compareLines(line, own) < 0);
    if (older.length) return older.at(-1);
  }
  return releases.at(-1) ?? others.find((line) => line === "dev");
}

function storageKeys() {
  const keys = [];
  for (let i = 0; i < globalThis.localStorage.length; i++) {
    keys.push(globalThis.localStorage.key(i));
  }
  return keys;
}

// config.js saves each setting as { [name]: value } under its name; that
// tells settings apart from everything else in localStorage, except the
// chrome.storage shim's caches, which are saved the same way.
function readSettings(prefix) {
  const settings = {};
  for (const key of storageKeys()) {
    if (!key.startsWith(prefix) || isStorageCacheKey(key)) continue;
    const name = key.slice(prefix.length);
    try {
      const value = JSON.parse(globalThis.localStorage.getItem(key));
      const names = value && typeof value === "object" ? Object.keys(value) : [];
      if (names.length === 1 && names[0] === name) {
        settings[name] = value[name];
      }
    } catch {
      //
    }
  }
  return settings;
}

function listWebLines() {
  const lines = new Set();
  for (const key of storageKeys()) {
    const match = WEB_KEY.exec(key);
    if (match) lines.add(match[1]);
  }
  return [...lines];
}

// NW.js gives the window Node's require().
function node() {
  const { require } = globalThis;
  return {
    fs: require("node:fs"),
    os: require("node:os"),
    path: require("node:path"),
    process: require("node:process"),
  };
}

function desktopDir() {
  const { os, path, process } = node();
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "Wingflight", "Configurator", "settings");
}

function readDesktopLine(line) {
  const { fs, path } = node();
  const file = path.join(desktopDir(), `${line}.json`);
  // Tolerate a byte order mark from a hand-edited file.
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function listDesktopLines() {
  const { fs } = node();
  let files;
  try {
    files = fs.readdirSync(desktopDir());
  } catch (error) {
    // No line has run yet.
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
}

function findSettingsToImport() {
  if (__BACKEND__ === "web") {
    const source = pickSourceLine(__APP_CHANNEL__, listWebLines());
    return readSettings(source ? `settings:${source}:` : "");
  }
  if (__BACKEND__ === "nwjs") {
    const source = pickSourceLine(__APP_CHANNEL__, listDesktopLines());
    return source ? readDesktopLine(source) : {};
  }
  return {};
}

// Called once at startup, before any setting is read. `set` is config.js's.
export function importSettingsOnFirstStart(set) {
  try {
    if (globalThis.localStorage.getItem(STARTED_KEY)) return;
    // A profile that already has settings (a desktop dev build) keeps them.
    if (Object.keys(readSettings(SETTINGS_NAMESPACE)).length === 0) {
      set(findSettingsToImport());
    }
  } catch (error) {
    console.warn("Could not import settings from another version", error);
  }
  try {
    globalThis.localStorage.setItem(STARTED_KEY, "1");
  } catch {
    //
  }
  mirrorSettings();
}

let mirrorTimer;

// Desktop only: keep <line>.json up to date for the lines that come later.
export function mirrorSettings() {
  if (__BACKEND__ !== "nwjs") return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    try {
      const { fs, path } = node();
      const dir = desktopDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${__APP_CHANNEL__}.json`),
        JSON.stringify(readSettings(SETTINGS_NAMESPACE), undefined, 2),
      );
    } catch (error) {
      console.warn("Could not save settings for other versions", error);
    }
  }, 1000);
}
