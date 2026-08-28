import semver from "semver";

import { FirmwareCache } from "@/js/FirmwareCache.js";

const FILENAME_EXPRESSION =
  /^wingflight_([\d]+[.][\d]+[.][\d]+((-[A-Za-z][\w]*)|(-[\d]+(?:[.][\d]+)*))?)_([A-Za-z][\w]*)[.]hex$/;

export function supportsUnifiedTargets(version) {
  return semver.gte(version, "4.2.0");
}

// GitHub Release assets are served from release-assets.githubusercontent.com,
// which sends no Access-Control-Allow-Origin header -- fetching one directly
// from the browser is always blocked by CORS, regardless of origin. The
// wingflight-firmware release/snapshot workflows also mirror each build's
// .hex files into WingFlight/wingflight-artifacts (firmware/<tag>/<file>),
// a plain public repo, and jsDelivr's GitHub CDN mirrors that with correct
// CORS headers plus real caching -- so fetch from there instead of the
// release asset's browser_download_url.
export function firmwareArtifactUrl(tag, filename) {
  return `https://cdn.jsdelivr.net/gh/WingFlight/wingflight-artifacts@master/firmware/${tag}/${filename}`;
}

export function hasUnifiedTargetBuild(builds) {
  return Object.keys(builds).some((key) =>
    builds[key].some((target) => supportsUnifiedTargets(target.version)),
  );
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Feature-branch dev builds (wingflight-firmware's dev-build.yml, tag
// dev/<branch-slug>) are also GitHub prereleases, same as snapshot/* builds --
// but they're rebuilt on every push to an in-progress branch rather than a
// deliberate snapshot cut, so they get their own build-type tier instead of
// being lumped into "All Releases and Snapshots".
function isFeatureBranchBuild(release) {
  return release.tag_name?.startsWith("dev/") ?? false;
}

export function processBoardOptions(releaseData, buildLevel, minVersion, maxVersion) {
  const releases = {};
  releaseData.forEach((release) => {
    if (isFeatureBranchBuild(release)) {
      if (buildLevel < 3) return;
    } else if (release.prerelease && buildLevel < 2) {
      return;
    }
    release.assets.forEach((asset) => {
      const match = FILENAME_EXPRESSION.exec(asset.name);
      if (!match) return;
      if (match[2] && buildLevel < 1) return;
      if (semver.lt(match[1], minVersion) || semver.gt(match[1], maxVersion)) return;

      const version = match[1];
      const target = match[5];
      const descriptor = {
        releaseUrl: release.html_url,
        name: version,
        version,
        url: firmwareArtifactUrl(release.tag_name, asset.name),
        file: asset.name,
        target,
        date: formatDate(new Date(release.published_at)),
        notes: release.body,
      };
      if (!releases[target]) releases[target] = [];
      releases[target].push(descriptor);
    });
  });
  return releases;
}

export function parseUnifiedTargets(targets, builds) {
  const releases = { ...builds };
  const unifiedConfigs = {};
  const TARGET_REGEXP = /^([^-]{1,4})-(.*).config$/;

  for (const target of targets) {
    const targetParts = target.name.match(TARGET_REGEXP);
    if (!targetParts) continue;

    target.board = targetParts[2];
    target.manufacturer = targetParts[1];
    target.target = `${target.manufacturer}-${target.board}`;
    unifiedConfigs[target.target] = target;
  }

  return { releases, unifiedConfigs };
}

export function buildTargetsByManufacturer(unifiedConfigs, showLegacy, selected) {
  const grouped = Object.values(unifiedConfigs).reduce((acc, target) => {
    (acc[target.manufacturer] ??= []).push(target);
    return acc;
  }, {});

  const groups = [];
  for (const manufacturerId of Object.keys(grouped).sort()) {
    const boards = grouped[manufacturerId]
      .filter((x) => x.supported || showLegacy || x.target === selected)
      .sort((a, b) => (a.board < b.board ? -1 : a.board > b.board ? 1 : 0));
    if (boards.length === 0) continue;
    groups.push({ manufacturerId, boards });
  }
  return groups;
}

export function populateBuilds(builds, manufacturerId, targetVersions) {
  if (!targetVersions) return;

  targetVersions.forEach((descriptor) => {
    let version = descriptor.version;
    const build = { descriptor };
    if (manufacturerId) {
      if (!supportsUnifiedTargets(descriptor.version)) return;
      build.manufacturerId = manufacturerId;
    } else {
      version = `${version}-legacy`;
      build.isLegacy = true;
    }
    builds[version] = build;
  });
}

export function versionOptions(builds, t) {
  const targetVersions = Object.keys(builds);
  if (targetVersions.length === 0) return [];

  const options = [];
  targetVersions
    .sort((a, b) => -semver.compareBuild(a, b))
    .forEach((versionName) => {
      const version = builds[versionName];
      if (!version.isLegacy && !supportsUnifiedTargets(version.descriptor.version)) return;

      let label;
      if (
        version.isLegacy &&
        Object.values(builds).some(
          (b) => b.descriptor.version === version.descriptor.version && !b.isLegacy,
        )
      ) {
        label = t("firmwareFlasherLegacyLabel", { target: version.descriptor.version });
      } else if (
        !version.isLegacy &&
        Object.values(builds).some(
          (b) =>
            b.descriptor.version === version.descriptor.version &&
            b.manufacturerId !== version.manufacturerId &&
            !b.isLegacy,
        )
      ) {
        label = `${version.descriptor.version} (${version.manufacturerId})`;
      } else {
        label = version.descriptor.version;
      }

      options.push({
        value: versionName,
        label: `${version.descriptor.date} - ${label}`,
        cached: FirmwareCache.has(version.descriptor),
        summary: version.descriptor,
      });
    });
  return options;
}

const IGNORE_REGEXP = [
  /^feature [-]?AIRMODE/i,
  /^feature [-]?ANTI/i,
  /^feature [-]?DISPLAY/i,
  /^feature [-]?DYNAMIC/i,
  /^feature [-]?ESC_SENSOR/i,
  /^feature [-]?GPS/i,
  /^feature [-]?LED_STRIP/i,
  /^feature [-]?MOTOR_STOP/i,
  /^feature [-]?OSD/i,
  /^feature [-]?RSSI/i,
  /^feature [-]?RX_PARALLEL/i,
  /^feature [-]?RX_SERIAL/i,
  /^feature [-]?RX_SPI/i,
  /^feature [-]?SOFTSERIAL/i,
  /^feature [-]?TELEMETRY/i,
  /^resource PWM/i,
  /^resource MOTOR [5-8]/i,
  /^resource OSD/i,
  /^serial [0-9]/i,
  /^set serialrx/i,
  /^set max7456/i,
];

export function cleanUnifiedConfigFile(input) {
  let output = "";
  let fork = "BF";
  input.split(/[\r\n]+/).forEach((rawLine, index) => {
    let line = rawLine;
    if (index === 0 && line.match(/^# [A-Za-z]*flight/)) {
      if (line.match(/^# Rotorflight/)) fork = "RF";
    } else {
      line = line
        .replace(/#.*$/, "")
        .replace(/[ \t]+$/, "")
        .replace(/[ \t]+/, " ")
        .replace(/^[ ]*$/, "");
      if (line.length === 0) return;
      if (fork !== "RF" && IGNORE_REGEXP.some((re) => line.match(re))) return;
    }
    output += line + "\n";
  });
  return output;
}

export function grabBuildNameFromConfig(config) {
  try {
    return config.match(/.+\/ (STM32[^ ]*)/)[1];
  } catch (e) {
    console.log("grabBuildNameFromConfig failed: ", e.message);
    return undefined;
  }
}

export function grabKeywordFromConfig(config, keyword, fallback = "") {
  try {
    const res = config.match(`${keyword} (.*)\n`);
    return res ? res[1] : fallback;
  } catch (e) {
    console.log("grabKeywordFromConfig failed: ", e.message);
    return fallback;
  }
}

export function injectDefaultDesign(targetConfig, boardDesign) {
  const designLineRegex = /board_design [A-Za-z0-9_+-]+\n/gm;
  const nameLineRegex = /board_name [A-Za-z0-9_+-]+\n/gm;
  const newLine = `board_design ${boardDesign}\n`;

  if (!targetConfig.match(designLineRegex)) {
    const match = targetConfig.match(nameLineRegex);
    if (match) {
      targetConfig = targetConfig.replace(nameLineRegex, match[0] + newLine);
    }
  }
  return targetConfig;
}

export function injectTargetInfo(targetConfig, configName, targetName, manufacturerId, commitInfo) {
  const configLineRegex = /# config: manufacturer_id: .*\n/gm;
  targetConfig = targetConfig.replace(configLineRegex, "");

  return (
    "## Wingflight Custom Defaults\n" +
    `# config: ${configName}\n` +
    `# board: ${targetName}\n` +
    `# make: ${manufacturerId}\n` +
    `# hash: ${commitInfo.commitHash}\n` +
    `# date: ${commitInfo.date}\n` +
    "##\n" +
    targetConfig
  );
}

export function parseHex(str) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("@/js/workers/hex_parser.js", import.meta.url));
    worker.onmessage = (event) => resolve(event.data);
    worker.postMessage(str);
  });
}
