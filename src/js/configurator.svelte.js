export const API_VERSION_12_6 = "12.6.0";
export const API_VERSION_12_7 = "12.7.0";
export const API_VERSION_12_8 = "12.8.0";
export const API_VERSION_12_9 = "12.9.0";

export const API_VERSION_22_0 = "22.0.0";

export const API_VERSION_WGFL_MIN = API_VERSION_22_0;
export const API_VERSION_WGFL_MAX = API_VERSION_22_0;

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
  latestVersion: "0.0.1",
  latestVersionReleaseUrl:
    "https://github.com/WingFlight/wingflight-configurator/releases",
  allReleasesUrl:
    "https://github.com/WingFlight/wingflight-configurator/releases",
  expertMode: false,
});
