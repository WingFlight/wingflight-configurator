import * as config from "@/js/config.js";

export const API_VERSION_22_0 = "22.0.0";
export const API_VERSION_22_1 = "22.1.0";
export const API_VERSION_22_2 = "22.2.0";

export const API_VERSION_WGFL_MIN = API_VERSION_22_0;
export const API_VERSION_WGFL_MAX = API_VERSION_22_2;

export const FW_VERSION_WGFL_MIN = "4.3.0-0";
export const FW_VERSION_WGFL_MAX = "4.6.99";

export const CONFIGURATOR = $state({
  // all versions are specified and compared using semantic versioning http://semver.org/
  API_VERSION_MIN_SUPPORTED: API_VERSION_WGFL_MIN,
  API_VERSION_MAX_SUPPORTED: API_VERSION_WGFL_MAX,

  FW_VERSION_MIN_SUPPORTED: FW_VERSION_WGFL_MIN,
  FW_VERSION_MAX_SUPPORTED: FW_VERSION_WGFL_MAX,

  connectionValid: false,
  virtualMode: false,
  virtualApiVersion: "0.0.1",
  cliEngineActive: false,
  cliEngineValid: false,
  cliTab: "",
  gitChangesetId: __COMMIT_HASH__,
  version: __APP_VERSION__,
  buildLabel: __BUILD_LABEL__,
  latestVersion: "0.0.1",
  latestVersionReleaseUrl:
    "https://github.com/WingFlight/wingflight-configurator/releases",
  allReleasesUrl:
    "https://github.com/WingFlight/wingflight-configurator/releases",
  // Legacy binary flag, kept in sync with disclosureLevel ("expert" <=> true)
  // so tabs that still read it keep working. New code reads disclosureLevel
  // (or, better, wraps fields in <Tier>).
  expertMode: false,
  // Disclosure level: "essential" | "standard" | "expert". See relevance.js.
  disclosureLevel: "standard",
  // Whether the Setup Journey is the landing page when a board connects.
  journeyLanding: true,
  // Field id that settings search asked to reveal regardless of tier.
  revealedFieldId: null,
});

const DISCLOSURE_LEVELS = ["essential", "standard", "expert"];

// Load the disclosure level from local config, migrating the pre-journey
// boolean expertMode flag (true -> expert, otherwise standard).
export function loadDisclosureLevel() {
  const stored = config.get("disclosureLevel");
  let level;
  if (DISCLOSURE_LEVELS.includes(stored)) {
    level = stored;
  } else {
    level = config.get("expertMode") === true ? "expert" : "standard";
    config.set({ disclosureLevel: level });
  }
  applyDisclosureLevel(level);
  return level;
}

export function setDisclosureLevel(level) {
  if (!DISCLOSURE_LEVELS.includes(level)) level = "standard";
  applyDisclosureLevel(level);
  config.set({ disclosureLevel: level, expertMode: level === "expert" });
}

function applyDisclosureLevel(level) {
  CONFIGURATOR.disclosureLevel = level;
  CONFIGURATOR.expertMode = level === "expert";
  // Keep the header quick-switch in step with wherever the change came from.
  const headerSelect = globalThis.document?.querySelector?.(
    "#disclosure-level select",
  );
  if (headerSelect && headerSelect.value !== level) {
    headerSelect.value = level;
  }
}

export function loadJourneyLanding() {
  const stored = config.get("journeyLanding");
  CONFIGURATOR.journeyLanding =
    stored === undefined || stored === null ? true : !!stored;
  return CONFIGURATOR.journeyLanding;
}

export function setJourneyLanding(enabled) {
  CONFIGURATOR.journeyLanding = !!enabled;
  config.set({ journeyLanding: !!enabled });
}
