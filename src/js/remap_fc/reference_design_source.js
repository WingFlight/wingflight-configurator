/**
 * File: src/js/remap_fc/reference_design_source.js
 * Fetches the latest reference_designs.json straight from this
 * project's own GitHub repository at runtime, so a newly documented
 * board doesn't have to wait for the next configurator release before
 * it shows up here -- falling back to the copy bundled with this
 * build if the fetch fails or times out (offline, GitHub unreachable,
 * an unexpected response, ...). Fetched at most once per session: the
 * first call kicks it off and every later call (e.g. the tab being
 * re-opened) reuses the same result rather than re-fetching.
 */

const RAW_URL =
  "https://raw.githubusercontent.com/WingFlight/wingflight-configurator/master/src/tabs/remap_fc/reference_designs.json";

const FETCH_TIMEOUT_MS = 4000;

// A minimal sanity check that the fetched JSON is actually shaped like
// reference_designs.json -- an object whose values are themselves
// per-design-family objects -- rather than trusting an unexpected
// response (an error page, a redirect, a differently-shaped file)
// outright and silently showing wrong labels from it.
function looksLikeReferenceDesigns(data) {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).some((key) => key !== "_file" && typeof data[key] === "object")
  );
}

async function fetchReferenceDesigns(localData) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(RAW_URL, { cache: "no-cache", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!looksLikeReferenceDesigns(data)) {
      throw new Error("unexpected response shape");
    }

    console.log("remap_fc: loaded reference designs from GitHub");
    return data;
  } catch (err) {
    console.log(
      "remap_fc: could not fetch latest reference designs, using the bundled copy",
      err,
    );
    return localData;
  } finally {
    clearTimeout(timeout);
  }
}

// Cached across every call within this session, so re-opening the tab
// (which re-imports/re-runs the component that calls this) doesn't
// re-fetch -- the first call's promise is simply reused by every later
// one, whether it's still pending or already settled.
let cachedPromise = null;

/**
 * Returns the latest reference_designs.json from this project's own
 * GitHub repository, or `localData` (the copy bundled with this
 * build) if that fetch fails, times out, or returns something that
 * doesn't look like the expected data at all.
 * @param {Object} localData - The statically-imported reference_designs.json.
 * @returns {Promise<Object>}
 */
export function loadReferenceDesigns(localData) {
  cachedPromise ??= fetchReferenceDesigns(localData);
  return cachedPromise;
}
