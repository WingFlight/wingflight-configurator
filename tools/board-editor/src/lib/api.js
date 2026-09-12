/**
 * File: tools/board-editor/src/lib/api.js
 * The browser half of the editor's file access. Every call goes to the
 * dev server in server/api.mjs; there is no other way for the page to
 * touch the repository.
 */

async function json(response) {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let message = `${response.status} ${response.statusText}`;
    try {
      message = JSON.parse(detail).error ?? message;
    } catch {
      /* the body was not JSON; the status line will have to do */
    }
    throw new Error(message);
  }
  return response.json();
}

/** The profile file as it is on disk. */
export function getProfiles() {
  return fetch("/api/profiles").then(json);
}

/** Replaces the profile file. */
export function putProfiles(file) {
  return fetch("/api/profiles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(file),
  }).then(json);
}

/** The board background SVGs already in the repository. */
export function getBackgrounds() {
  return fetch("/api/backgrounds").then(json);
}

/**
 * Saves an SVG into src/images/boards and returns the path a profile
 * should store, e.g. "/images/boards/matek-f405-top.svg".
 * @param {string} name plain file name ending in .svg
 * @param {string} svg
 * @returns {Promise<{href: string}>}
 */
export function putBackground(name, svg) {
  return fetch(`/api/backgrounds/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "image/svg+xml" },
    body: svg,
  }).then(json);
}

/**
 * The unified target catalogue, as `{source, entries}` where entries
 * are the raw GitHub contents rows. `source` says whether the answer
 * came from GitHub, a fresh cache, or a stale cache because the
 * network was unavailable.
 */
export function getTargets({ refresh = false } = {}) {
  return fetch(`/api/targets${refresh ? "?refresh=1" : ""}`).then(json);
}

/** One target's `.config` file, verbatim. */
export async function getTargetConfig(targetId, { refresh = false } = {}) {
  const response = await fetch(
    `/api/targets/${encodeURIComponent(targetId)}${refresh ? "?refresh=1" : ""}`,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let message = `${response.status} ${response.statusText}`;
    try {
      message = JSON.parse(detail).error ?? message;
    } catch {
      /* the body was not JSON; the status line will have to do */
    }
    throw new Error(message);
  }
  return response.text();
}
