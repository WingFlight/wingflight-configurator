import {
  SETTINGS_NAMESPACE,
  importSettingsOnFirstStart,
  mirrorSettings,
} from "@/js/configImport.js";

// Each release line keeps its own settings; see configImport.js.

/**
 * @param {string} key
 */
export function get(key) {
  try {
    return JSON.parse(
      globalThis.localStorage.getItem(SETTINGS_NAMESPACE + key),
    )[key];
  } catch {
    //
  }
}

/**
 * @param {Object<string, any>} obj key value entries to set
 */
export function set(obj) {
  for (const [key, value] of Object.entries(obj)) {
    globalThis.localStorage.setItem(
      SETTINGS_NAMESPACE + key,
      JSON.stringify({ [key]: value }),
    );
  }
  mirrorSettings();
}

importSettingsOnFirstStart(set);
