/**
 * File: tools/board-editor/src/lib/i18n.js
 * Starts i18next with the configurator's English strings, so the
 * preview pane renders the same component the app does without the
 * app's whole boot sequence behind it.
 *
 * The message file's `{key: {message: "..."}}` shape is flattened the
 * same way src/js/localization.js flattens it.
 */

import i18next from "i18next";

import messages from "@/../locales/en/messages.json";

function flatten(file) {
  const out = {};
  for (const [key, value] of Object.entries(file)) {
    out[key] = value?.message ?? value?.english ?? "";
  }
  return out;
}

/** Resolves once the preview's translations are usable. */
export function startI18n() {
  return i18next.init({
    lng: "en",
    ns: ["messages"],
    defaultNS: "messages",
    fallbackLng: "en",
    resources: { en: { messages: flatten(messages) } },
    interpolation: { escapeValue: false },
  });
}
