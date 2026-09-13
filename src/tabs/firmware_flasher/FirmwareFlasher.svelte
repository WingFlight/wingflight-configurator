<script>
  import * as marked from "marked";
  import { onMount, onDestroy } from "svelte";

  import * as config from "@/js/config.js";
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { ConfigInserter } from "@/js/ConfigInserter.js";
  import { FirmwareCache } from "@/js/FirmwareCache.js";
  import * as github from "@/js/GitHubApi.js";
  import { getIntegerValue } from "@/js/main.js";
  import { manufacturers } from "@/js/manufacturers.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { MspHelper } from "@/js/msp/MSPHelper.js";
  import { readTextFile, writeTextFile } from "@/js/filesystem.js";
  import {
    backupOverSerial,
    restoreOverSerial,
    saveBackupToFile,
    BACKUP_TYPES,
  } from "@/js/cli_backup.js";
  import { ReleaseChecker } from "@/js/release_checker.js";
  import { STM32 } from "@/js/protocols/stm32.js";
  import { STM32DFU } from "@/js/protocols/stm32usbdfu.js";
  import { usbDevices } from "@/js/port_handler.js";
  import { requestWebSerialDeviceFromPicker } from "@/js/serial_backend.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import Page from "@/components/Page.svelte";
  import Select from "@/components/Select.svelte";
  import StepIndicator from "@/components/StepIndicator.svelte";
  import Switch from "@/components/Switch.svelte";

  import {
    buildTargetsByManufacturer,
    cleanUnifiedConfigFile,
    grabBuildNameFromConfig,
    grabKeywordFromConfig,
    hasUnifiedTargetBuild,
    injectDefaultDesign,
    injectTargetInfo,
    parseHex,
    parseUnifiedTargets,
    populateBuilds,
    processBoardOptions,
    versionOptions,
  } from "./util.js";
  import {
    FLASH_MESSAGE_TYPES,
    flashState,
    setFlashingEnabled,
    setFlashingMessage,
    setFlashProgress,
  } from "./state.svelte.js";

  const releaseChecker = new ReleaseChecker(
    "firmware",
    "https://api.github.com/repos/WingFlight/wingflight-firmware/releases",
  );

  const BUILD_TYPES = [
    { tag: "firmwareFlasherOptionLabelBuildTypeRelease", level: 0 },
    { tag: "firmwareFlasherOptionLabelBuildTypePreRelease", level: 1 },
    { tag: "firmwareFlasherOptionLabelBuildTypeDevelopment", level: 2 },
    { tag: "firmwareFlasherOptionLabelBuildTypeFeatureBranch", level: 3 },
  ];

  let buildTypeIndex = $state(0);
  let releases = $state({});
  let unifiedConfigs = $state({});
  let bareBoard = $state(undefined);

  let selectedBoard = $state("0");
  let boardsLoading = $state(true);
  let releasesLoading = $state(false);
  let selectedVersion = $state("0");
  let versionsLoading = $state(false);
  let firmwareVersionEntries = $state([]);

  let showAdvancedOpts = config.get("showAdvancedFirmwareOpts") ?? false;
  let showLegacyTargets = $state(
    showAdvancedOpts ? (config.get("showLegacyTargets") ?? false) : false,
  );
  let eraseChip = $state(
    showAdvancedOpts ? (config.get("erase_chip") ?? true) : true,
  );

  const BACKUP_MODE_NONE = "none";

  // Web Serial's permission model (and thus the "Select Port" recovery
  // buttons, see selectPortForBackup()/selectPortForRestore()) only exists
  // in the browser build -- the packaged app's native serial backend has no
  // such prompt.
  const isWebSerialBackend = __BACKEND__ === "web";

  // Folds the old "backup on/off" toggle + separate diff/dump select into
  // one dropdown: "none" | BACKUP_TYPES.DIFF | BACKUP_TYPES.DUMP. Falls back
  // to the previous two-setting config shape if that's what's stored, so an
  // existing preference isn't silently reset.
  //
  // Defaults to Dump rather than Diff: a `diff all` backup always opens with
  // `defaults nosave`, and on this firmware that replays the target's
  // embedded custom-defaults blob with a bug that can leave a bogus
  // `###ERROR IN map: PARSING FAILED###` in the CLI output (see
  // replayBackup() in cli_backup.js for the save-retry workaround this
  // forces on restore). `dump all` never emits `defaults nosave`, so it
  // never hits that bug at all -- Dump sidesteps it rather than papering
  // over it.
  function initialBackupMode() {
    const stored = config.get("backupBeforeFlashingMode");
    if (stored) return stored;
    if (config.get("backupBeforeFlashing") === false) return BACKUP_MODE_NONE;
    return config.get("backupBeforeFlashingType") ?? BACKUP_TYPES.DUMP;
  }

  let backupMode = $state(initialBackupMode());
  let backupBeforeFlash = $derived(backupMode !== BACKUP_MODE_NONE);

  let localFirmwareLoaded = $state(false);
  let intelHex;
  let parsedHex = $state(null);
  let unifiedTarget = $state({});
  let isConfigLocal = $state(false);
  let boardDetectionInProgress = $state(false);
  let loadingRemote = $state(false);

  // Detection's outcome, surfaced inline instead of only in GUI.log (which a
  // first-time user has no reason to be watching). null/"detecting" keep the
  // board field on its Detect call-to-action; any terminal outcome
  // ("found"/"notFound"/"failed") reveals the manual board dropdown --
  // pre-filled with the detected board on success, empty as a genuine
  // fallback otherwise. manualSelectionShown is the separate, explicit
  // "skip detection entirely" escape hatch.
  let detectStatus = $state(null);
  let detectedBoardName = $state("");
  let manualSelectionShown = $state(false);
  let showManualBoardSelect = $derived(
    manualSelectionShown ||
      detectStatus === "found" ||
      detectStatus === "notFound" ||
      detectStatus === "failed",
  );

  let releaseInfoVisible = $state(false);
  let releaseInfo = $state(null);
  let releaseNotesHtml = $state("");

  let portIsDfu = $state(false);
  let portSelected = $state(false);

  // Detect and Flash both silently do nothing without a real port (DFU
  // aside) -- board detection just never starts, and worse, Flash looked
  // enabled but flashFirmware() would just log "No valid port" and stop.
  // Surfaced explicitly wherever that would otherwise happen, with a
  // one-click fix on the web build (see requestWebSerialDeviceFromPicker).
  let needsPortSelection = $derived(!portIsDfu && !portSelected);

  let detectDialogEl;
  let detectDialogTitle = $state("");
  let detectDialogContent = $state("");

  let detectTimer;
  let detectConnectDelayTimer;
  let detectMspHelper;

  let boardGroups = $derived(
    buildTargetsByManufacturer(
      unifiedConfigs,
      showLegacyTargets,
      selectedBoard,
    ),
  );

  // Drives the setup wizard: 1 Source, 2 Select Firmware, 3 Backup,
  // 4 Flash, 5 Restore. Backup and restore are each a real step now, not a
  // popup layered on top of Flash -- see backupRun/restoreRun below, which
  // each own their step the same way any other step owns its own state.
  const WIZARD_STEPS = [
    "firmwareFlasherStepSourceTitle",
    "firmwareFlasherStepFirmwareTitle",
    "firmwareFlasherStepBackupTitle",
    "firmwareFlasherStepReviewTitle",
    "firmwareFlasherStepRestoreTitle",
  ];
  let wizardStep = $state(1);

  // Which of step 2's two mutually-exclusive flows (pick an online release
  // vs. load a file already on disk) is showing. Chosen up front in step 1
  // rather than juxtaposed with the online select fields, which used to
  // read as if they were prerequisites for "Load local file" too.
  let firmwareSource = $state("online");

  // Step 4 defaults to a one-line summary rather than the full technical
  // card (target/manufacturer/version/filenames/release notes, plus the
  // Save Firmware/Config actions) -- that level of detail is noise for
  // someone who just wants to hit Flash, so it's tucked behind this and
  // opt-in rather than always on.
  let showReleaseDetails = $state(false);

  // True from the moment flashFirmware() actually hands off to
  // STM32/STM32DFU until their callback fires (see flashFirmware() below) --
  // GUI.connect_lock covers re-entrancy at the logic level already, but it
  // isn't reactive, so the Flash button never visibly disabled during an
  // active flash without this.
  let flashInProgress = $state(false);

  // --- Backup (step 3) / Restore (step 5) --------------------------------
  //
  // Each step owns its own little state machine and reads/writes it
  // directly -- no more shared "phase" flag deciding which of two dialogs
  // to show. port/baud/text are kept as plain (non-reactive) fields since
  // they're only ever read imperatively (by runBackup()/runRestore()
  // themselves), never rendered.
  let backupRun = $state({ status: "idle", text: null, saved: false }); // idle | connecting | running | ready | failed
  let backupPort = null;
  let backupBaud = null;

  let restoreRun = $state({ status: "idle" }); // idle | prompt | waiting | connecting | running | done | failed | skipped
  let restorePort = null;
  let restoreBaud = null;
  let restoreText = null;

  let backupCommand = $derived(
    backupMode === BACKUP_TYPES.DUMP ? "dump all" : "diff all",
  );

  // Step 3's Next is gated on an actual backup existing *only* when one is
  // both wanted and possible -- DFU and "no port" both make backing up
  // impossible outright, so they fall through to letting Next proceed
  // rather than trapping the user on a step that can never complete.
  let canLeaveBackupStep = $derived(
    backupMode === BACKUP_MODE_NONE ||
      portIsDfu ||
      needsPortSelection ||
      backupRun.status === "ready",
  );

  // Whether step 3/5's operation is actively talking to hardware right now
  // -- used to block navigating away mid-operation the same way
  // flashInProgress does for step 4.
  let backupOrRestoreBusy = $derived(
    ["connecting", "running"].includes(backupRun.status) ||
      ["waiting", "connecting", "running"].includes(restoreRun.status),
  );

  // Everything steps 2-5 built up around one firmware/board choice --
  // loaded hex/config, detected board, version list, release summary,
  // any backup taken/restore state. None of it means anything once you're
  // back choosing a source again, so it's cleared rather than left to look
  // like it still applies to whatever gets picked next. Deliberately leaves
  // alone what are really persisted preferences rather than per-flash state
  // -- backupMode, eraseChip, showLegacyTargets (all config.set() already)
  // -- so those don't reset just because you went back a step.
  function clearFirmwareSelection() {
    // A detect attempt mid-flight is talking to real hardware over a serial
    // connection this component opened -- leaving it running unseen in the
    // background would be worse than the small chance of interrupting it
    // right as it was about to finish.
    if (boardDetectionInProgress) disconnectDetect();

    showReleaseDetails = false;
    detectStatus = null;
    detectedBoardName = "";
    manualSelectionShown = false;
    clearBufferedFirmware();
    selectedBoard = "0";
    bareBoard = undefined;
    selectedVersion = "0";
    firmwareVersionEntries = [];
    releaseInfoVisible = false;
    releaseInfo = null;
    releaseNotesHtml = "";
    backupRun = { status: "idle", text: null, saved: false };
    restoreRun = { status: "idle" };
    backupPort = null;
    backupBaud = null;
    restorePort = null;
    restoreBaud = null;
    restoreText = null;
    setFlashingEnabled(false);
    setFlashProgress(0);
    setFlashingMessage(
      $i18n.t("firmwareFlasherLoadFirmwareFile"),
      FLASH_MESSAGE_TYPES.NEUTRAL,
    );
  }

  function goToStep(step) {
    // An active flash or an active backup/restore isn't interruptible --
    // block navigating away mid-operation, since it's talking to real
    // hardware and abandoning it isn't something a step change can safely
    // undo.
    if (flashInProgress || backupOrRestoreBusy) return;
    // StepIndicator already disables markers past `wizardStep`, but guard
    // here too since this is also reachable from plain Back/Next clicks.
    if (step < 1 || step > WIZARD_STEPS.length) return;
    // Landing back on Source (whether via Back or jumping the indicator)
    // always clears whatever steps 2-5 had cached -- see
    // clearFirmwareSelection() -- rather than only on an explicit
    // "Flash Another Board".
    if (step === 1 && wizardStep !== 1) clearFirmwareSelection();
    wizardStep = step;
  }
  const onWizardBack = () => goToStep(wizardStep - 1);
  const onWizardNext = () => goToStep(wizardStep + 1);

  // Puts the wizard back exactly where it starts on a fresh visit to the
  // tab, so flashing a second board doesn't mean clicking Back four times.
  function resetWizardToStart() {
    wizardStep = 1;
    firmwareSource = "online";
    clearFirmwareSelection();
  }

  onMount(() => {
    FirmwareCache.load();
    FirmwareCache.onPutToCache(onCacheUpdate);
    FirmwareCache.onRemoveFromCache(onCacheUpdate);

    setFlashingMessage(
      $i18n.t("firmwareFlasherLoadFirmwareFile"),
      FLASH_MESSAGE_TYPES.NEUTRAL,
    );

    portPickerElement().addEventListener("change", onPortChange);
    onPortChange();

    document.addEventListener("keypress", onKeypress);

    chrome.storage.local.get("selected_build_type", (result) => {
      buildTypeIndex = result.selected_build_type ?? 0;
      loadBuildType(buildTypeIndex);
    });
  });

  onDestroy(() => {
    portPickerElement()?.removeEventListener("change", onPortChange);
    document.removeEventListener("keypress", onKeypress);
    clearTimeout(detectTimer);
    clearTimeout(detectConnectDelayTimer);
  });

  function onCacheUpdate(release) {
    for (const entry of firmwareVersionEntries) {
      if (entry.summary?.file === release.file) {
        entry.cached = FirmwareCache.has(release);
      }
    }
  }

  function portPickerElement() {
    return document.querySelector("div#port-picker #port");
  }

  function onPortChange() {
    const el = portPickerElement();
    const selected = el?.options?.[el.selectedIndex];
    portIsDfu = !!selected?.dataset?.isDfu || !!selected?.isDFU;
    portSelected = !!el && String(el.value) !== "0";
  }

  function onKeypress(e) {
    // Flash is step 4, not necessarily the last step -- Restore (step 5)
    // follows it, but Enter shouldn't trigger anything there.
    if (wizardStep === 4 && (e.which === 13 || e.key === "Enter")) {
      onClickFlash();
    }
  }

  function loadBuildType(index, force = false) {
    chrome.storage.local.set({ selected_build_type: index });
    if (GUI.connect_lock) return;

    unifiedConfigs = {};
    boardsLoading = true;
    releasesLoading = true;
    releaseChecker.loadReleaseData((releaseData) => {
      releasesLoading = false;
      onReleaseData(releaseData ?? [], BUILD_TYPES[index].level);
    }, force);
  }

  function onBuildTypeChange(index) {
    buildTypeIndex = Number(index);
    selectedBoard = "0";
    firmwareVersionEntries = [];
    selectedVersion = "0";
    loadBuildType(buildTypeIndex);
  }

  function onClickRefreshReleases() {
    if (releasesLoading || GUI.connect_lock) return;
    selectedBoard = "0";
    firmwareVersionEntries = [];
    selectedVersion = "0";
    loadBuildType(buildTypeIndex, true);
  }

  async function onReleaseData(releaseData, buildLevel) {
    const builds = processBoardOptions(
      releaseData,
      buildLevel,
      CONFIGURATOR.FW_VERSION_MIN_SUPPORTED,
      CONFIGURATOR.FW_VERSION_MAX_SUPPORTED,
    );

    if (hasUnifiedTargetBuild(builds)) {
      await loadUnifiedBuilds(builds);
    } else {
      releases = builds;
      boardsLoading = false;
    }
  }

  async function getCachedUnifiedTargets() {
    const { unifiedSourceCache } = await new Promise((resolve) =>
      chrome.storage.local.get("unifiedSourceCache", resolve),
    );
    if (
      !unifiedSourceCache?.supportedTargets &&
      !unifiedSourceCache?.legacyTargets
    )
      return;
    return unifiedSourceCache;
  }

  async function loadUnifiedBuilds(builds) {
    const expirationPeriod = 3600 * 2;
    const now = Math.floor(Date.now() / 1000);

    const cache = await getCachedUnifiedTargets();
    const cacheAge = now - (cache?.lastUpdate ?? 0);

    let supportedTargets = cache?.supportedTargets;
    let legacyTargets = cache?.legacyTargets;

    if (cacheAge > expirationPeriod) {
      try {
        supportedTargets = await github.getContents(
          "WingFlight/wingflight-targets",
          "master",
          "configs",
        );
        legacyTargets = await github.getContents(
          "rotorflight/rotorflight-targets",
          "rotorflight",
          "legacy",
        );

        await new Promise((resolve) =>
          chrome.storage.local.set(
            {
              unifiedSourceCache: {
                lastUpdate: now,
                supportedTargets,
                legacyTargets,
              },
            },
            resolve,
          ),
        );
      } catch (err) {
        console.log("Fetching unified targets failed", err);
      }
    }

    if (!supportedTargets || !legacyTargets) {
      boardsLoading = false;
      return;
    }

    const targets = [
      ...supportedTargets.map((x) => ({ ...x, supported: true })),
      ...legacyTargets.map((x) => ({ ...x, supported: false })),
    ];

    const parsed = parseUnifiedTargets(targets, builds);
    releases = parsed.releases;
    unifiedConfigs = parsed.unifiedConfigs;
    boardsLoading = false;

    // This is two sequential GitHub API calls on a cache miss, kicked off
    // from onMount() -- easily still in flight well after the user has
    // already picked a board themselves (manually or via Detect), loaded
    // firmware (online *or* local file), and moved on to Backup/Flash,
    // especially on a cold cache or slower connection. Auto-selecting the
    // remembered board unconditionally here would call onBoardChange() this
    // late and stomp everything the user already did in the meantime -- see
    // onBoardChange()'s own "please load firmware file" reset. Only worth
    // doing if nothing has been loaded/picked yet.
    if (parsedHex || selectedBoard !== "0") return;

    let initialBoard;
    if (config.get("rememberLastSelectedBoard")) {
      initialBoard = config.get("selected_board");
    }
    if (initialBoard && unifiedConfigs[initialBoard]) {
      selectedBoard = initialBoard;
      await onBoardChange(initialBoard);
    }
  }

  function clearBufferedFirmware() {
    isConfigLocal = false;
    unifiedTarget = {};
    intelHex = undefined;
    parsedHex = null;
    localFirmwareLoaded = false;
  }

  async function onBoardChange(target) {
    if (GUI.connect_lock && !boardDetectionInProgress) return;

    if (selectedBoard !== target && isConfigLocal) {
      isConfigLocal = false;
      unifiedTarget = {};
    }

    if (config.get("rememberLastSelectedBoard")) {
      config.set({ selected_board: target });
    }
    selectedBoard = target;
    bareBoard = undefined;

    setFlashingMessage(
      $i18n.t("firmwareFlasherLoadFirmwareFile"),
      FLASH_MESSAGE_TYPES.NEUTRAL,
    );
    setFlashProgress(0);
    releaseInfoVisible = false;

    if (!localFirmwareLoaded) setFlashingEnabled(false);

    if (target === "0") {
      clearBufferedFirmware();
      firmwareVersionEntries = [];
      selectedVersion = "0";
      return;
    }

    versionsLoading = true;
    firmwareVersionEntries = [];
    selectedVersion = "0";

    const builds = {};
    const targetSpec = unifiedConfigs[target];

    if (targetSpec) {
      const expirationPeriod = 3600 * 2;
      const now = Math.floor(Date.now() / 1000);

      const { unifiedConfigLast } = await new Promise((resolve) =>
        chrome.storage.local.get("unifiedConfigLast", resolve),
      );
      const cacheAge = now - (unifiedConfigLast?.lastUpdate ?? 0);
      const cacheCouldApply =
        unifiedConfigLast?.targetId === targetSpec.target &&
        cacheAge <= expirationPeriod;

      async function fetchLatestCommit() {
        return targetSpec.supported
          ? github.getFileLastCommitInfo(
              "WingFlight/wingflight-targets",
              "master",
              targetSpec.path,
            )
          : github.getFileLastCommitInfo(
              "rotorflight/rotorflight-targets",
              "rotorflight",
              targetSpec.path,
            );
      }

      // A target config directly controls what gets flashed onto real
      // hardware, so even inside the cache window, cheaply confirm the
      // source file actually hasn't changed since we cached it rather than
      // trusting age alone -- otherwise a config fix (e.g.
      // WingFlight/wingflight-targets#1) can go completely unnoticed for up
      // to expirationPeriod: every reflash keeps re-injecting the same
      // stale, already-fixed-upstream blob, no matter how thoroughly the
      // board itself is erased and reflashed, since chrome.storage.local
      // here is entirely separate from the board's own flash. This is a
      // metadata-only request (the latest commit touching this one file),
      // much cheaper than refetching and reprocessing the full config.
      let latestCommit = null;
      let cacheIsFresh = false;
      if (cacheCouldApply) {
        try {
          latestCommit = await fetchLatestCommit();
          cacheIsFresh =
            latestCommit?.commitHash === unifiedConfigLast.commitHash;
        } catch (err) {
          console.log(
            "Failed to check target config freshness, refetching",
            err,
          );
        }
      }

      if (cacheIsFresh) {
        const cached = unifiedConfigLast.unifiedTarget;
        const bare = grabBuildNameFromConfig(cached?.config ?? "");
        bareBoard = bare;
        unifiedTarget = target === bare ? {} : cached;
      } else {
        try {
          const res = await fetch(targetSpec.download_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          let cfg = await res.text();
          cfg = cleanUnifiedConfigFile(cfg);
          if (!cfg) throw new Error("Invalid config");

          const bare = grabBuildNameFromConfig(cfg);
          bareBoard = bare;

          const commit = latestCommit ?? (await fetchLatestCommit());
          cfg = injectDefaultDesign(cfg, "BTFL");
          cfg = injectTargetInfo(
            cfg,
            targetSpec.name,
            target,
            targetSpec.manufacturer,
            commit,
          );

          setUnifiedConfig(
            target,
            bare,
            cfg,
            targetSpec.manufacturer,
            targetSpec.name,
            targetSpec.download_url,
            commit.date,
          );
          await new Promise((resolve) =>
            chrome.storage.local.set(
              {
                unifiedConfigLast: {
                  unifiedTarget,
                  targetId: targetSpec.target,
                  commitHash: commit?.commitHash,
                  lastUpdate: now,
                },
              },
              resolve,
            ),
          );
        } catch (err) {
          console.log("Failed to fetch target config", err);
          unifiedTarget = {};
          isConfigLocal = false;
          GUI.log(
            $i18n.t("firmwareFlasherFailedToLoadUnifiedConfig", {
              remote_file: targetSpec.download_url,
            }),
          );
        }
      }

      populateBuilds(builds, targetSpec.manufacturer, releases[bareBoard]);
    } else {
      unifiedTarget = {};
    }

    if (releases[target]) {
      bareBoard = target;
      populateBuilds(builds, undefined, releases[target]);
    }

    firmwareVersionEntries = versionOptions(builds, (key, opts) =>
      $i18n.t(key, opts),
    );
    versionsLoading = false;

    // Assume flashing latest, so default to it.
    if (firmwareVersionEntries.length > 0) {
      selectedVersion = firmwareVersionEntries[0].value;
      onVersionChange(selectedVersion);
    }
  }

  function setUnifiedConfig(
    target,
    bareBoardName,
    targetConfig,
    manufacturerId,
    fileName,
    fileUrl,
    date,
  ) {
    if (bareBoardName === target) {
      unifiedTarget = {};
    } else {
      unifiedTarget = {
        config: targetConfig,
        manufacturerId,
        fileName,
        fileUrl,
        date,
      };
      isConfigLocal = false;
    }
  }

  function selectedVersionEntry() {
    return firmwareVersionEntries.find((e) => e.value === selectedVersion);
  }

  function onVersionChange(value) {
    selectedVersion = value;
    releaseInfoVisible = false;

    if (!localFirmwareLoaded) {
      setFlashingEnabled(false);
      setFlashingMessage(
        $i18n.t("firmwareFlasherLoadFirmwareFile"),
        FLASH_MESSAGE_TYPES.NEUTRAL,
      );
      if (parsedHex?.bytes_total) {
        intelHex = undefined;
        parsedHex = null;
      }
    }

    const entry = selectedVersionEntry();
    const release = entry?.summary;
    const isCached = release && FirmwareCache.has(release);
    if (value === "0" || isCached) {
      if (isCached) {
        FirmwareCache.get(release, (cached) =>
          onLoadSuccess(cached.hexdata, release),
        );
      }
    }
  }

  async function processHex(data, summary) {
    intelHex = data;
    const parsed = await parseHex(intelHex);
    parsedHex = parsed;

    if (parsed) {
      if (!FirmwareCache.has(summary)) {
        FirmwareCache.put(summary, intelHex);
      }
      showLoadedHex(summary);
    } else {
      setFlashingMessage(
        $i18n.t("firmwareFlasherHexCorrupted"),
        FLASH_MESSAGE_TYPES.INVALID,
      );
    }
  }

  async function onLoadSuccess(data, summary) {
    localFirmwareLoaded = false;
    const release =
      typeof summary === "object" ? summary : selectedVersionEntry()?.summary;
    await processHex(data, release);
    loadingRemote = false;
  }

  function showLoadedHex(summary) {
    flashState.message = $i18n.t("firmwareFlasherFirmwareOnlineLoaded", {
      1: parsedHex.bytes_total,
    });
    flashState.messageType = FLASH_MESSAGE_TYPES.NEUTRAL;
    flashState.showSaveLink = true;
    setFlashingEnabled(true);

    releaseInfo = {
      manufacturer: unifiedTarget.manufacturerId,
      target: selectedBoard,
      version: summary.version,
      versionUrl: summary.releaseUrl,
      date: summary.date,
      file: summary.file,
      fileUrl: summary.url,
      unifiedTargetFile: unifiedTarget.fileName,
      unifiedTargetFileUrl: unifiedTarget.fileUrl,
      unifiedTargetDate: unifiedTarget.date,
      hasUnifiedTarget: Object.keys(unifiedTarget).length > 0,
    };
    releaseNotesHtml = marked.parse(summary.notes ?? "");
    releaseInfoVisible = true;
  }

  async function onClickLoadLocal() {
    setFlashingEnabled(false);

    const file = await readTextFile({
      description: "Firmware/Target",
      extensions: [".hex", ".config"],
    });
    if (!file) return;

    if (file.name.endsWith(".hex")) {
      intelHex = file.content;
      parsedHex = await parseHex(intelHex);

      if (parsedHex) {
        localFirmwareLoaded = true;
        flashingMessageLocal();
      } else {
        setFlashingMessage(
          $i18n.t("firmwareFlasherHexCorrupted"),
          FLASH_MESSAGE_TYPES.INVALID,
        );
      }
    } else {
      clearBufferedFirmware();

      let cfg = cleanUnifiedConfigFile(file.content);
      if (cfg !== null) {
        const manufac = grabKeywordFromConfig(cfg, "manufacturer_id", "NONE");
        const target = grabKeywordFromConfig(cfg, "board_name", "NONE");
        cfg = injectDefaultDesign(cfg, "BTFL");
        cfg = injectTargetInfo(cfg, file.name, target, manufac, {
          commitHash: "unknown",
          date: file.lastModified?.toISOString?.() ?? new Date().toISOString(),
        });
        unifiedTarget = { ...unifiedTarget, config: cfg, fileName: file.name };
        isConfigLocal = true;
        flashingMessageLocal();
      }
    }
  }

  function flashingMessageLocal() {
    if (isConfigLocal && !parsedHex) {
      setFlashingMessage(
        $i18n.t("firmwareFlasherLoadedConfig"),
        FLASH_MESSAGE_TYPES.NEUTRAL,
      );
    }
    if (isConfigLocal && parsedHex && !localFirmwareLoaded) {
      setFlashingEnabled(true);
      setFlashingMessage(
        $i18n.t("firmwareFlasherFirmwareLocalLoaded", {
          1: parsedHex.bytes_total,
        }),
        FLASH_MESSAGE_TYPES.NEUTRAL,
      );
    }
    if (localFirmwareLoaded) {
      setFlashingEnabled(true);
      setFlashingMessage(
        $i18n.t("firmwareFlasherFirmwareLocalLoaded", {
          1: parsedHex.bytes_total,
        }),
        FLASH_MESSAGE_TYPES.NEUTRAL,
      );
    }
  }

  async function onClickLoadRemote() {
    setFlashingEnabled(false);
    localFirmwareLoaded = false;

    if (selectedVersion === "0") {
      GUI.log($i18n.t("firmwareFlasherNoFirmwareSelected"));
      return;
    }

    const summary = selectedVersionEntry()?.summary;
    if (!summary) {
      setFlashingMessage(
        $i18n.t("firmwareFlasherFailedToLoadOnlineFirmware"),
        FLASH_MESSAGE_TYPES.INVALID,
      );
      return;
    }

    if (isConfigLocal && FirmwareCache.has(summary)) {
      FirmwareCache.get(summary, (cached) =>
        onLoadSuccess(cached.hexdata, summary),
      );
      return;
    }

    loadingRemote = true;
    try {
      const res = await fetch(summary.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.text();
      await onLoadSuccess(data, summary);
    } catch (err) {
      console.log("Failed to download firmware", err);
      loadingRemote = false;
      setFlashingMessage(
        $i18n.t("firmwareFlasherFailedToLoadOnlineFirmware"),
        FLASH_MESSAGE_TYPES.INVALID,
      );
    }
  }

  function onClickExitDfu() {
    if (GUI.connect_lock) return;
    try {
      STM32DFU.connect(usbDevices, parsedHex, { exitDfu: true });
    } catch (e) {
      console.log(`Exiting DFU failed: ${e.message}`);
    }
  }

  // --- Backup (step 3) ----------------------------------------------------
  //
  // startBackup() captures the currently-selected port once, at the moment
  // the user actually asks to back up; runBackup() (the retryable part)
  // always reuses whatever's in backupPort/backupBaud rather than re-reading
  // the picker, so a retry keeps talking to the same device even if the
  // global port selection has since changed underneath it.
  function startBackup() {
    const el = portPickerElement();
    backupPort = el ? String(el.value) : "0";
    backupBaud = getIntegerValue("select#baud") ?? 115200;
    runBackup();
  }

  async function runBackup() {
    backupRun.status = "connecting";
    backupRun.text = null;
    backupRun.saved = false;

    GUI.connect_lock = true;

    const text = await backupOverSerial(
      backupPort,
      backupBaud,
      backupMode,
      (status) => {
        backupRun.status = status === "running" ? "running" : "connecting";
      },
    );

    GUI.connect_lock = false;

    if (!text) {
      backupRun.status = "failed";
      return;
    }

    backupRun.text = text;
    backupRun.status = "ready";
  }

  async function saveBackupFile() {
    const saved = await saveBackupToFile(backupRun.text, "backup_pre_flash");
    backupRun.saved = !!saved;
  }

  function cancelBackup() {
    backupRun = { status: "idle", text: null, saved: false };
  }

  // Recovery for when runBackup()/runRestore() can't retry their way out of
  // it: the browser never granted (or has since forgotten) Web Serial
  // permission for this exact port, so every reconnect attempt fails with
  // "port not found" -- no amount of waiting fixes that, only the user
  // re-picking the device through the browser's own chooser can. That
  // chooser requires a real user gesture, which a button click is and a
  // background retry loop isn't. Only relevant to the browser build (Web
  // Serial permissions don't exist for the packaged app's native serial
  // backend) -- see isWebSerialBackend.
  async function selectPortForBackup() {
    try {
      const entry = await serial.requestWebSerialPort();
      backupPort = entry.path;
    } catch (error) {
      console.warn(
        "Backup: Web Serial permission request failed or was cancelled",
        error,
      );
      return;
    }
    runBackup();
  }

  // --- Restore (step 5) ----------------------------------------------------
  //
  // Runs after STM32/STM32DFU finish (successfully or not) -- see
  // flashFirmware() below. Only reachable when a backup was actually taken
  // in step 3 (a DFU flash never gets here at all, since a DFU-flashed board
  // typically re-enumerates on a different serial port we have no reliable
  // way to find). Asks before doing anything -- the user may want to try the
  // new firmware on its own defaults first.
  function offerRestore(text, port, baud) {
    if (flashState.messageType !== FLASH_MESSAGE_TYPES.VALID) {
      GUI.log($i18n.t("firmwareFlasherRestoreSkippedFlashFailed"));
      return; // stay on step 4 -- flashing failed, nothing to restore
    }

    restoreText = text;
    restorePort = port;
    restoreBaud = baud;
    restoreRun.status = "prompt";
    wizardStep = 5;
  }

  async function runRestore() {
    restoreRun.status = "waiting";
    GUI.connect_lock = true;

    // give the freshly-flashed firmware a moment to boot before talking to
    // it again.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const restored = await restoreOverSerial(
      restorePort,
      restoreBaud,
      restoreText,
      (status) => {
        restoreRun.status = status === "running" ? "running" : "connecting";
      },
    );

    GUI.connect_lock = false;
    restoreRun.status = restored ? "done" : "failed";
  }

  function skipRestore() {
    restoreRun.status = "skipped";
  }

  async function selectPortForRestore() {
    try {
      const entry = await serial.requestWebSerialPort();
      restorePort = entry.path;
    } catch (error) {
      console.warn(
        "Restore: Web Serial permission request failed or was cancelled",
        error,
      );
      return;
    }
    runRestore();
  }

  function flashFirmware(firmware, backupText, backupPortArg) {
    const options = {
      no_reboot: false,
      erase_chip: eraseChip,
      baud: getIntegerValue("select#baud") ?? 115200,
    };

    // STM32.js/STM32DFU.js call this exactly once, at the true end of the
    // attempt (success or failure).
    const onFlashDone = () => {
      flashInProgress = false;
      if (backupText) {
        offerRestore(backupText, backupPortArg, options.baud);
      } else if (flashState.messageType === FLASH_MESSAGE_TYPES.VALID) {
        // Nothing to restore -- still move on to the wizard's terminal step
        // rather than leaving the user sitting on Flash with no next action.
        wizardStep = 5;
      }
    };

    if (!portIsDfu) {
      const el = portPickerElement();
      if (el && String(el.value) !== "0") {
        flashInProgress = true;
        STM32.connect(
          String(el.value),
          options.baud,
          firmware,
          options,
          onFlashDone,
        );
      } else {
        GUI.log($i18n.t("firmwareFlasherNoValidPort"));
      }
    } else {
      flashInProgress = true;
      GUI.connect_lock = true;
      STM32DFU.connect(usbDevices, firmware, options, onFlashDone);
    }
  }

  function proceedToFlash(backupText, backupPort) {
    try {
      if (unifiedTarget.config && !parsedHex.configInserted) {
        const configInserter = new ConfigInserter();
        if (configInserter.insertConfig(parsedHex, unifiedTarget.config)) {
          parsedHex.configInserted = true;
        } else {
          console.log("Firmware does not support custom defaults.");
          unifiedTarget = {};
        }
      }

      flashFirmware(parsedHex, backupText, backupPort);
      GUI.saveDefaultTab("status");
    } catch (e) {
      console.log(`Flashing failed: ${e.message}`);
    }
  }

  // Whether a backup was actually captured back in step 3 -- if so, it and
  // the port it came from ride along to flashFirmware(), which hands them
  // to offerRestore() once flashing finishes.
  function onClickFlash() {
    if (GUI.connect_lock) return;
    if (!parsedHex) {
      flashState.message = $i18n.t("firmwareFlasherFirmwareNotLoaded");
      flashState.messageType = FLASH_MESSAGE_TYPES.NEUTRAL;
      return;
    }

    proceedToFlash(backupRun.text, backupRun.text ? backupPort : null);
  }

  async function onClickDetectBoard() {
    if (GUI.connect_lock || portIsDfu || !portSelected) return;

    const isLoaded = releases ? Object.keys(releases).length > 0 : false;
    if (!isLoaded) {
      GUI.log($i18n.t("firmwareFlasherNoBoardsLoaded"));
      return;
    }

    if (serial.connected || serial.connectionId) {
      serial.disconnect();
      detectStatus = null;
      return;
    }

    setFlashingEnabled(false);
    GUI.connect_lock = true;
    boardDetectionInProgress = true;
    detectStatus = "detecting";

    GUI.log($i18n.t("firmwareFlasherBoardDetectionInProgress"));
    detectTimer = setTimeout(() => {
      GUI.log($i18n.t("firmwareFlasherBoardDetectionFail"));
      detectStatus = "failed";
      disconnectDetect();
    }, 8000);

    const el = portPickerElement();
    const port = String(el.value);
    const baud = getIntegerValue("select#baud") ?? 115200;

    // If we just got here from a connected session, navigating to this tab
    // forces a disconnect first -- give the board/USB stack a brief moment to
    // settle before reopening the same port and querying it. Without this,
    // reconnecting immediately can get no response back in time (see
    // handleConnectClick()'s disconnect branch, which now awaits the actual
    // port close, but the board itself may still need a moment to be ready).
    detectConnectDelayTimer = setTimeout(() => {
      serial.connect(port, { bitrate: baud }, onDetectConnect);
    }, 300);
  }

  function onDetectConnect(openInfo) {
    if (openInfo) {
      GUI.log(
        $i18n.t("serialPortOpened", [
          serial.connectionType === "serial"
            ? serial.connectionId
            : openInfo.socketId,
        ]),
      );
      serial.onReceive.addListener((info) => MSP.read(info));

      detectMspHelper = new MspHelper();
      MSP.listen(detectMspHelper.process_data.bind(detectMspHelper));

      getBoardInfo();
    } else {
      clearTimeout(detectTimer);
      GUI.log(
        `${$i18n.t("firmwareFlasherBoardDetectionFail")}: ${$i18n.t("serialPortOpenFail")}`,
      );
      detectStatus = "failed";
      disconnectDetect();
    }
  }

  async function getBoardInfo() {
    await MSP.promise(MSPCodes.MSP_BOARD_INFO);
    handleDetectResponse();
  }

  async function handleDetectResponse() {
    let board = FC.CONFIG.boardName;
    if (!board) return;

    clearTimeout(detectTimer);

    if (board.includes(".")) {
      const newBoardName = board.replace(".", "_");
      GUI.log(
        $i18n.t("dialogBoardDetectionMessageInvalidBoardNameContent", [
          board,
          newBoardName,
        ]),
      );
      openDetectDialog(
        $i18n.t("dialogBoardDetectionMessageInvalidBoardNameTitle"),
        $i18n.t("dialogBoardDetectionMessageInvalidBoardNameContent", [
          board,
          newBoardName,
        ]) +
          "<br />" +
          $i18n.t("dialogBoardDetectionMessageInvalidBoardNameRecommendation"),
      );
      board = newBoardName;
    }

    const target = `${FC.CONFIG.manufacturerId}-${board}`;
    const targetAvailable = !!unifiedConfigs[target];
    detectedBoardName = board;
    detectStatus = targetAvailable ? "found" : "notFound";
    selectedBoard = target;
    await onBoardChange(target);

    GUI.log(
      $i18n.t(
        targetAvailable
          ? "firmwareFlasherBoardDetectionSucceeded"
          : "firmwareFlasherBoardDetectionBoardNotFound",
        { boardName: board },
      ),
    );
    disconnectDetect();
  }

  function disconnectDetect() {
    clearTimeout(detectConnectDelayTimer);
    serial.disconnect(onDetectClose);
    MSP.disconnect_cleanup();
    // onClickDetectBoard() disables flashing for the duration of the detect
    // connection -- restore whatever's actually true now, rather than
    // unconditionally re-enabling it. Detecting a board doesn't load
    // firmware by itself (onVersionChange()'s cache auto-load is a separate,
    // not-yet-settled async chain at this point), so hardcoding `true` here
    // let Next on step 2 go through with nothing actually loaded.
    setFlashingEnabled(!!parsedHex);
    boardDetectionInProgress = false;
    GUI.connect_lock = false;
  }

  function onDetectClose(result) {
    GUI.log($i18n.t(result ? "serialPortClosedOk" : "serialPortClosedFail"));
    MSP.clearListeners();
  }

  function openDetectDialog(title, content) {
    detectDialogTitle = title;
    detectDialogContent = content;
    detectDialogEl.showModal();
  }

  function onSaveFirmware() {
    const summary = selectedVersionEntry()?.summary;
    writeTextFile(intelHex, {
      suggestedName: summary?.file ?? "firmware.hex",
      description: "Wingflight Firmware (.hex)",
    }).catch((err) => console.log("Error saving firmware file", err));
  }

  // Only offered alongside onSaveFirmware -- both save a local copy of
  // something that was fetched from the network rather than something the
  // user already has a file for (see the `!isConfigLocal` gating where
  // this is rendered).
  function onSaveConfig() {
    writeTextFile(unifiedTarget.config, {
      suggestedName: `${unifiedTarget.fileName || bareBoard || "target"}.config`,
      description: "Wingflight Target Config (.config)",
    }).catch((err) => console.log("Error saving target config file", err));
  }

  function onEraseChipChange(checked) {
    eraseChip = checked;
    config.set({ erase_chip: checked });
  }

  function onBackupModeChange(value) {
    backupMode = value;
    config.set({ backupBeforeFlashingMode: value });
  }

  function onShowLegacyChange(checked) {
    showLegacyTargets = checked;
    config.set({ showLegacyTargets: checked });
  }

  let messageClass = $derived(
    {
      [FLASH_MESSAGE_TYPES.VALID]: "valid",
      [FLASH_MESSAGE_TYPES.INVALID]: "invalid",
      [FLASH_MESSAGE_TYPES.ACTION]: "actionRequired",
    }[flashState.messageType] ?? "",
  );
</script>

{#snippet header()}
  <h1>{$i18n.t("tabFirmwareFlasher")}</h1>
  <!-- Exit DFU is a rescue action for a board stuck in DFU mode, unrelated
       to wizard progress -- kept reachable regardless of which step is
       showing, rather than gated behind step 3. It doesn't touch parsedHex
       at all (STM32DFU's exitDfu path skips straight to leave(), no flash
       data needed) -- gating on "or firmware is loaded" as well as DFU (as
       this used to) left it enabled through most of a normal, non-DFU
       flash, where clicking it can't do anything. -->
  <button class="btn header-btn" disabled={!portIsDfu} onclick={onClickExitDfu}>
    <span class="label-full">{$i18n.t("firmwareFlasherExitDfu")}</span>
    <span class="label-short">{$i18n.t("firmwareFlasherExitDfuShort")}</span>
  </button>
{/snippet}

<!-- Reused wherever needsPortSelection would otherwise leave a control
     (Detect, Flash) silently doing nothing. On the web build this is a
     one-click fix -- requestWebSerialDeviceFromPicker() is the exact same
     flow as choosing "Add serial device" from the port picker itself, just
     triggered from here instead. The packaged app has no such prompt (its
     serial backend just lists ports), so it points at the toolbar instead. -->
{#snippet portPrompt()}
  <p class="port-notice">
    <em class="fas fa-plug"></em>
    {#if isWebSerialBackend}
      {$i18n.t("firmwareFlasherNoPortWeb")}
      <button class="btn" onclick={requestWebSerialDeviceFromPicker}>
        {$i18n.t("firmwareFlasherSelectPort")}
      </button>
    {:else}
      {$i18n.t("firmwareFlasherNoPortNative")}
    {/if}
  </p>
{/snippet}

<Page {header}>
  <StepIndicator
    steps={WIZARD_STEPS.map((tag) => ({ label: $i18n.t(tag) }))}
    current={wizardStep}
    onSelect={goToStep}
  />

  {#if wizardStep === 1}
    <div class="step-body">
      <div class="source-choice">
        <label
          class="source-option"
          class:selected={firmwareSource === "online"}
        >
          <input type="radio" bind:group={firmwareSource} value="online" />
          <em class="fas fa-cloud-download-alt"></em>
          <span class="source-title"
            >{$i18n.t("firmwareFlasherSourceOnlineTitle")}</span
          >
          <span class="source-description"
            >{$i18n.t("firmwareFlasherSourceOnlineDescription")}</span
          >
        </label>
        <label
          class="source-option"
          class:selected={firmwareSource === "local"}
        >
          <input type="radio" bind:group={firmwareSource} value="local" />
          <em class="fas fa-folder-open"></em>
          <span class="source-title"
            >{$i18n.t("firmwareFlasherSourceLocalTitle")}</span
          >
          <span class="source-description"
            >{$i18n.t("firmwareFlasherSourceLocalDescription")}</span
          >
        </label>
      </div>

      <div class="step-nav">
        <span></span>
        <button class="btn primary" onclick={onWizardNext}>
          {$i18n.t("firmwareFlasherWizardNext")}
        </button>
      </div>
    </div>
  {:else if wizardStep === 2 && firmwareSource === "online"}
    <div class="step-body">
      <div class="options">
        <div class="field">
          <div class="board-select-flex">
            <Select
              value={buildTypeIndex}
              options={BUILD_TYPES.map((b, i) => ({
                value: i,
                label: $i18n.t(b.tag),
              }))}
              onchange={(e) => onBuildTypeChange(e.target.value)}
            />
            <span class="default_btn detect_btn">
              <button
                class="detect-board"
                disabled={releasesLoading}
                title={$i18n.t("firmwareFlasherRefreshReleasesButton")}
                onclick={onClickRefreshReleases}
              >
                <em class="fas fa-sync-alt" class:fa-spin={releasesLoading}
                ></em>
              </button>
            </span>
          </div>
          <span class="description"
            >{$i18n.t("firmwareFlasherOnlineSelectBuildType")}</span
          >
        </div>

        <div class="field">
          {#if !showManualBoardSelect}
            <div class="detect-cta">
              {#if detectStatus === "detecting"}
                <p class="status">
                  <span class="spinner"></span>
                  {$i18n.t("firmwareFlasherBoardDetectionInProgress")}
                </p>
              {:else if portIsDfu}
                <p class="detect-fallback-notice">
                  {$i18n.t("firmwareFlasherDetectUnavailableDfu")}
                </p>
              {:else if needsPortSelection}
                {@render portPrompt()}
              {:else}
                <button
                  class="btn primary"
                  disabled={boardsLoading}
                  onclick={onClickDetectBoard}
                >
                  <em class="fas fa-search"></em>
                  {$i18n.t("firmwareFlasherDetectBoardCta")}
                </button>
                <HelpIcon>
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html $i18n.t(
                    "firmwareFlasherBoardDetectionDescriptionHint",
                  )}
                </HelpIcon>
              {/if}
              <button
                class="details-toggle"
                onclick={() => (manualSelectionShown = true)}
              >
                {$i18n.t("firmwareFlasherSelectBoardManually")}
              </button>
            </div>
          {:else}
            {#if detectStatus === "found"}
              <p class="detect-fallback-notice ok">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html $i18n.t("firmwareFlasherBoardDetectionSucceeded", {
                  boardName: detectedBoardName,
                })}
              </p>
            {:else if detectStatus === "notFound" || detectStatus === "failed"}
              <p class="detect-fallback-notice">
                {#if detectStatus === "notFound"}
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html $i18n.t("firmwareFlasherBoardDetectionBoardNotFound", {
                    boardName: detectedBoardName,
                  })}
                {:else}
                  {$i18n.t("firmwareFlasherBoardDetectionFail")}
                {/if}
              </p>
            {/if}
            <div class="board-select-flex">
              {#if boardsLoading}
                <Select
                  value="0"
                  options={[
                    {
                      value: "0",
                      label: $i18n.t("firmwareFlasherOptionLoading"),
                    },
                  ]}
                  disabled
                />
              {:else}
                <select
                  class="board-select"
                  value={selectedBoard}
                  onchange={(e) => onBoardChange(e.target.value)}
                >
                  <option value="0"
                    >{$i18n.t("firmwareFlasherOptionLabelSelectBoard")}</option
                  >
                  {#each boardGroups as group (group.manufacturerId)}
                    <optgroup
                      label={manufacturers[group.manufacturerId]?.name ??
                        group.manufacturerId}
                    >
                      {#each group.boards as board (board.target)}
                        <option value={board.target}>{board.board}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
              {/if}
              <span class="default_btn detect_btn">
                <button
                  class="detect-board"
                  disabled={portIsDfu || !portSelected}
                  onclick={onClickDetectBoard}
                >
                  <span>{$i18n.t("firmwareFlasherBoardDetectionButton")}</span>
                  <em class="fas fa-search"></em>
                </button>
              </span>
            </div>
            <div class="description-row">
              <span class="description"
                >{$i18n.t("firmwareFlasherOnlineSelectBoardDescription")}</span
              >
              <HelpIcon>
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html $i18n.t("firmwareFlasherOnlineSelectBoardHint")}
              </HelpIcon>
            </div>
            {#if needsPortSelection}
              {@render portPrompt()}
            {/if}
          {/if}
        </div>

        <div class="field">
          <Select
            value={selectedVersion}
            options={[
              {
                value: "0",
                label: versionsLoading
                  ? $i18n.t("firmwareFlasherOptionLoading")
                  : `${$i18n.t("firmwareFlasherOptionLabelSelectFirmwareVersionFor")} ${bareBoard ?? ""}`,
              },
              // Cached entries load instantly (and, on selection, right
              // away -- see onVersionChange()'s auto-load-if-cached
              // branch) rather than needing "Load Firmware Online"
              // clicked -- worth being visible about which is which,
              // rather than that difference just looking inconsistent.
              ...firmwareVersionEntries.map((entry) =>
                entry.cached
                  ? {
                      ...entry,
                      label: $i18n.t("firmwareFlasherVersionCachedLabel", {
                        label: entry.label,
                      }),
                    }
                  : entry,
              ),
            ]}
            onchange={(e) => onVersionChange(e.target.value)}
          />
          <span class="description"
            >{$i18n.t(
              "firmwareFlasherOnlineSelectFirmwareVersionDescription",
            )}</span
          >
        </div>

        {#if showAdvancedOpts}
          <div class="field">
            <label>
              <Switch
                checked={showLegacyTargets}
                onchange={(e) => onShowLegacyChange(e.target.checked)}
              />
              <span
                >{$i18n.t("firmware_flasher.show_legacy_targets.label")}</span
              >
            </label>
            <span class="description"
              >{$i18n.t(
                "firmware_flasher.show_legacy_targets.description",
              )}</span
            >
          </div>
        {/if}
      </div>

      <div class="load-row">
        <button
          class="btn"
          disabled={selectedVersion === "0" || loadingRemote}
          onclick={onClickLoadRemote}
        >
          {#if loadingRemote}
            {$i18n.t("firmwareFlasherButtonDownloading")}
          {:else}
            <span class="label-full"
              >{$i18n.t("firmwareFlasherButtonLoadOnline")}</span
            >
            <span class="label-short"
              >{$i18n.t("firmwareFlasherButtonLoadOnlineShort")}</span
            >
          {/if}
        </button>
        <span class="load-status {messageClass}">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html flashState.message}
        </span>
      </div>

      <div class="step-nav">
        <button class="btn" onclick={onWizardBack}>
          {$i18n.t("firmwareFlasherWizardBack")}
        </button>
        <button
          class="btn primary"
          disabled={!flashState.flashingEnabled}
          onclick={onWizardNext}
        >
          {$i18n.t("firmwareFlasherWizardNext")}
        </button>
      </div>
    </div>
  {:else if wizardStep === 2}
    <div class="step-body">
      <div class="load-row">
        <button class="btn" onclick={onClickLoadLocal}>
          <span class="label-full"
            >{$i18n.t("firmwareFlasherButtonLoadLocal")}</span
          >
          <span class="label-short"
            >{$i18n.t("firmwareFlasherButtonLoadLocalShort")}</span
          >
        </button>
        <span class="load-status {messageClass}">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html flashState.message}
        </span>
      </div>

      <div class="step-nav">
        <button class="btn" onclick={onWizardBack}>
          {$i18n.t("firmwareFlasherWizardBack")}
        </button>
        <button
          class="btn primary"
          disabled={!flashState.flashingEnabled}
          onclick={onWizardNext}
        >
          {$i18n.t("firmwareFlasherWizardNext")}
        </button>
      </div>
    </div>
  {:else if wizardStep === 3}
    <div class="step-body">
      <div class="options">
        <div class="field">
          <Select
            value={backupMode}
            disabled={backupRun.status === "connecting" ||
              backupRun.status === "running"}
            options={[
              {
                value: BACKUP_MODE_NONE,
                label: $i18n.t("firmwareFlasherBackupModeNone"),
              },
              {
                value: BACKUP_TYPES.DIFF,
                label: $i18n.t("firmwareFlasherBackupTypeDiff"),
              },
              {
                value: BACKUP_TYPES.DUMP,
                label: $i18n.t("firmwareFlasherBackupTypeDump"),
              },
            ]}
            onchange={(e) => onBackupModeChange(e.target.value)}
          />
          <span class="description"
            >{backupBeforeFlash
              ? $i18n.t("firmwareFlasherBackupTypeDescription")
              : $i18n.t("firmwareFlasherBackupBeforeFlashingDescription")}</span
          >
        </div>
      </div>

      {#if backupMode !== BACKUP_MODE_NONE}
        {#if portIsDfu}
          <p class="detect-fallback-notice">
            {$i18n.t("firmwareFlasherBackupSkippedDfu")}
          </p>
        {:else if needsPortSelection}
          {@render portPrompt()}
        {:else if backupRun.status === "idle"}
          <div class="detect-cta">
            <button class="btn primary" onclick={startBackup}>
              {$i18n.t("firmwareFlasherRunBackupCta")}
            </button>
          </div>
        {:else}
          <div class="backup-panel">
            {#if backupRun.status === "connecting"}
              <p class="status">
                <span class="spinner"></span>
                {$i18n.t("firmwareFlasherWizardConnecting")}
              </p>
            {:else if backupRun.status === "running"}
              <p class="status">
                <span class="spinner"></span>
                {$i18n.t("firmwareFlasherWizardBackupRunning", {
                  command: backupCommand,
                })}
              </p>
            {:else if backupRun.status === "ready"}
              <p class="detect-fallback-notice ok">
                {$i18n.t("firmwareFlasherWizardBackupReady")}
              </p>
              <div class="save-row">
                <button class="btn" onclick={saveBackupFile}>
                  {$i18n.t("firmwareFlasherWizardSaveBackupFile")}
                </button>
                {#if backupRun.saved}
                  <span class="detect-fallback-notice ok inline">
                    <em class="fas fa-check"></em>
                    {$i18n.t("firmwareFlasherWizardBackupSaved")}
                  </span>
                {/if}
              </div>
            {:else if backupRun.status === "failed"}
              <p class="detect-fallback-notice">
                {$i18n.t("firmwareFlasherWizardBackupFailed")}
              </p>
              <div class="buttons">
                <button class="btn" onclick={cancelBackup}>
                  {$i18n.t("firmwareFlasherWizardCancel")}
                </button>
                {#if isWebSerialBackend}
                  <button class="btn" onclick={selectPortForBackup}>
                    {$i18n.t("firmwareFlasherWizardSelectPort")}
                  </button>
                {/if}
                <button class="btn primary" onclick={runBackup}>
                  {$i18n.t("firmwareFlasherWizardRetry")}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      {/if}

      <div class="step-nav">
        <button
          class="btn"
          disabled={backupRun.status === "connecting" ||
            backupRun.status === "running"}
          onclick={onWizardBack}
        >
          {$i18n.t("firmwareFlasherWizardBack")}
        </button>
        <button
          class="btn primary"
          disabled={!canLeaveBackupStep}
          onclick={onWizardNext}
        >
          {$i18n.t("firmwareFlasherWizardNext")}
        </button>
      </div>
    </div>
  {:else if wizardStep === 4}
    <div class="step-body">
      {#if releaseInfoVisible && releaseInfo}
        <p class="ready-summary">
          {$i18n.t("firmwareFlasherReadyToFlash", {
            target: releaseInfo.target,
            version: releaseInfo.version,
          })}
          <button
            class="details-toggle"
            onclick={() => (showReleaseDetails = !showReleaseDetails)}
          >
            {showReleaseDetails
              ? $i18n.t("firmwareFlasherHideDetails")
              : $i18n.t("firmwareFlasherShowDetails")}
          </button>
        </p>
      {/if}

      {#if showReleaseDetails && releaseInfoVisible && releaseInfo}
        <div class="release_info">
          <div class="release-title">
            {$i18n.t("firmwareFlasherReleaseSummaryHead")}
          </div>
          <div class="release-body">
            <p>
              <strong>{$i18n.t("firmwareFlasherReleaseTarget")}</strong>
              <span class="target">{releaseInfo.target}</span>
            </p>
            {#if releaseInfo.manufacturer}
              <p>
                <strong>{$i18n.t("firmwareFlasherReleaseManufacturer")}</strong>
                {releaseInfo.manufacturer}
              </p>
            {/if}
            <p>
              <strong>{$i18n.t("firmwareFlasherReleaseVersion")}</strong>
              <a
                href={releaseInfo.versionUrl}
                target="_blank"
                rel="noopener noreferrer">{releaseInfo.version}</a
              >
            </p>
            <p>
              <strong>{$i18n.t("firmwareFlasherReleaseFile")}</strong>
              <a
                href={releaseInfo.fileUrl}
                target="_blank"
                rel="noopener noreferrer">{releaseInfo.file}</a
              >
            </p>
            <p>
              <strong>{$i18n.t("firmwareFlasherReleaseDate")}</strong>
              {releaseInfo.date}
            </p>
            {#if releaseInfo.hasUnifiedTarget}
              <p>
                <strong>{$i18n.t("firmwareFlasherUnifiedTargetName")}</strong>
                <a
                  href={releaseInfo.unifiedTargetFileUrl}
                  target="_blank"
                  rel="noopener noreferrer">{releaseInfo.unifiedTargetFile}</a
                >
              </p>
              <p>
                <strong>{$i18n.t("firmwareFlasherUnifiedTargetDate")}</strong>
                {releaseInfo.unifiedTargetDate}
              </p>
            {/if}
            <strong>{$i18n.t("firmwareFlasherReleaseNotes")}</strong>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <div class="notes">{@html releaseNotesHtml}</div>

            {#if flashState.showSaveLink || (unifiedTarget.config && !isConfigLocal)}
              <div class="save-row">
                {#if flashState.showSaveLink}
                  <button class="btn" onclick={onSaveFirmware}>
                    {$i18n.t("firmwareFlasherSaveFirmware")}
                  </button>
                {/if}
                {#if unifiedTarget.config && !isConfigLocal}
                  <button class="btn" onclick={onSaveConfig}>
                    {$i18n.t("firmwareFlasherSaveConfig")}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if showAdvancedOpts}
        <div class="options">
          <div class="field">
            <label>
              <Switch
                checked={eraseChip}
                onchange={(e) => onEraseChipChange(e.target.checked)}
              />
              <span>{$i18n.t("firmwareFlasherFullChipErase")}</span>
            </label>
            <span class="description"
              >{$i18n.t("firmwareFlasherFullChipEraseDescription")}</span
            >
          </div>
        </div>
      {/if}

      <div class="progress-info">
        <progress class="progress" value={flashState.progress} min="0" max="100"
        ></progress>
        <span class="progress-label {messageClass}">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html flashState.message}
        </span>
      </div>

      {#if needsPortSelection}
        {@render portPrompt()}
      {/if}

      <div class="step-nav">
        <button class="btn" disabled={flashInProgress} onclick={onWizardBack}>
          {$i18n.t("firmwareFlasherWizardBack")}
        </button>
        <button
          class="btn primary"
          disabled={!flashState.flashingEnabled ||
            flashInProgress ||
            needsPortSelection}
          onclick={onClickFlash}
        >
          <span class="label-full"
            >{$i18n.t("firmwareFlasherFlashFirmware")}</span
          >
          <span class="label-short"
            >{$i18n.t("firmwareFlasherFlashFirmwareShort")}</span
          >
        </button>
      </div>
    </div>
  {:else}
    <div class="step-body">
      {#if restoreRun.status === "prompt"}
        <div class="backup-panel">
          <p>{$i18n.t("firmwareFlasherWizardRestorePrompt")}</p>
          <div class="buttons">
            <button class="btn" onclick={skipRestore}>
              {$i18n.t("firmwareFlasherWizardSkip")}
            </button>
            <button class="btn primary" onclick={runRestore}>
              {$i18n.t("firmwareFlasherWizardRestoreNow")}
            </button>
          </div>
        </div>
      {:else if ["waiting", "connecting", "running"].includes(restoreRun.status)}
        <div class="backup-panel">
          <p class="status">
            <span class="spinner"></span>
            {#if restoreRun.status === "waiting"}
              {$i18n.t("firmwareFlasherWizardRestoreWaiting")}
            {:else if restoreRun.status === "connecting"}
              {$i18n.t("firmwareFlasherWizardConnecting")}
            {:else}
              {$i18n.t("firmwareFlasherWizardRestoreRunning")}
            {/if}
          </p>
        </div>
      {:else if restoreRun.status === "failed"}
        <div class="backup-panel">
          <p class="detect-fallback-notice">
            {$i18n.t("firmwareFlasherWizardRestoreFailed")}
          </p>
          <div class="buttons">
            <button class="btn" onclick={skipRestore}>
              {$i18n.t("firmwareFlasherWizardSkip")}
            </button>
            {#if isWebSerialBackend}
              <button class="btn" onclick={selectPortForRestore}>
                {$i18n.t("firmwareFlasherWizardSelectPort")}
              </button>
            {/if}
            <button class="btn primary" onclick={runRestore}>
              {$i18n.t("firmwareFlasherWizardRetry")}
            </button>
          </div>
        </div>
      {:else if restoreRun.status === "done"}
        <p class="detect-fallback-notice ok">
          {$i18n.t("firmwareFlasherWizardRestoreDone")}
        </p>
      {:else}
        <!-- "idle" (no backup was taken this run) or "skipped" -->
        <p class="ready-summary">
          {$i18n.t("firmwareFlasherFlashCompleteMessage")}
        </p>
      {/if}

      {#if !["prompt", "waiting", "connecting", "running"].includes(restoreRun.status)}
        <div class="step-nav">
          <span></span>
          <button class="btn primary" onclick={resetWizardToStart}>
            {$i18n.t("firmwareFlasherStartOver")}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Shown on every step, not just Backup & Safety -- these are general
       safety/recovery notes about the flasher itself, not something
       specific to that one step's controls. -->
  <div class="note warning">
    <div class="note-title">{$i18n.t("warningTitle")}</div>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("firmwareFlasherWarningText")}</p>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("firmwareFlasherTargetWarning")}</p>
  </div>

  <!-- eslint-disable svelte/no-at-html-tags -->
  <div class="note">
    <div class="note-title">{@html $i18n.t("firmwareFlasherRecoveryHead")}</div>
    <p>{@html $i18n.t("firmwareFlasherRecoveryText")}</p>
  </div>
  <!-- eslint-enable svelte/no-at-html-tags -->
</Page>

<dialog bind:this={detectDialogEl}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <h3>{@html detectDialogTitle}</h3>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <div class="content">{@html detectDialogContent}</div>
  <div class="buttons">
    <button class="btn" onclick={() => detectDialogEl.close()}>
      {$i18n.t("dialogBoardDetectionMessageAcknowledge")}
    </button>
  </div>
</dialog>

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .btn {
    @extend %button;
    white-space: nowrap;

    &.primary {
      @extend %button-primary;
    }
  }

  .options {
    display: grid;
    grid-template-columns: 300px 1fr;
    align-items: center;
    gap: 4px 24px;
    padding: 4px 0;
    margin-top: var(--section-gap);
  }

  .field {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    min-height: 32px;
    padding: 4px 0;

    & + .field {
      border-top: 1px solid var(--color-border);
    }
  }

  .description {
    display: block;
    min-width: 0;
    font-size: 0.75rem;
    font-style: italic;
    color: var(--color-text-soft);
  }

  .description-row {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;

    :global(> .container) {
      flex-shrink: 0;
      margin-left: 0;
    }
  }

  .board-select-flex {
    display: flex;
    width: 100%;
    gap: 6px;
  }

  .port-notice {
    // Spans the full field width rather than sitting in .field's subgrid
    // column 1 only -- this isn't a second label+description pair, it's a
    // one-off notice that happens to live inside a .field.
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 6px 0 0;
    padding: 8px 10px;
    font-size: 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-accent);
    background-color: var(--color-surface);

    em {
      color: var(--color-accent-500);
    }
  }

  .board-select {
    flex-grow: 1;
  }

  // The Select component has no <style> of its own, so Svelte's scoping
  // can't reach its internal <select> from here without :global() - without
  // it, only .board-select (a real element in this template) would pick up
  // the height/padding below, leaving it visibly taller than the other
  // dropdowns in this panel that go through <Select>.
  .options :global(select) {
    height: 1.5rem;
    min-width: 120px;
    padding: 0 4px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--color-border-soft);
    background-color: var(--color-input-bg);
    color: var(--color-text);
  }

  .detect-board {
    @extend %button;
    white-space: nowrap;
  }

  .detect-cta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
  }

  .spinner {
    flex-shrink: 0;
    width: 1em;
    height: 1em;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent-500);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .detect-fallback-notice {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--color-text-soft);

    &.ok {
      color: var(--color-valid, #00d000);
      font-style: normal;
      font-weight: 600;
    }

    // Sits next to a button in a .save-row rather than stacked as its own
    // paragraph above/below one.
    &.inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 0;
    }
  }

  // Backup (step 3) and restore (step 5) both run as a small self-contained
  // panel within their step, each just a status line/spinner plus whatever
  // buttons that status calls for.
  .backup-panel {
    padding: 10px 0;

    p {
      margin: 0 0 8px;
    }
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .source-choice {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .source-option {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px 16px;
    text-align: center;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    cursor: pointer;

    em {
      font-size: 1.5rem;
      color: var(--color-text-soft);
    }

    &.selected {
      border-color: var(--color-accent-500);

      em {
        color: var(--color-accent-500);
      }
    }

    // The actual radio is visually hidden -- the whole card is the hit
    // target and .selected (driven by the same bind:group) carries the
    // checked look, so there's nothing left for a visible dot to add.
    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    &:has(input:focus-visible) {
      outline: 2px solid var(--color-focus-ring);
      outline-offset: 2px;
    }
  }

  .source-title {
    font-weight: 600;
  }

  .source-description {
    font-size: 0.75rem;
    font-style: italic;
    color: var(--color-text-soft);
  }

  @media only screen and (max-width: 480px) {
    .source-choice {
      grid-template-columns: 1fr;
    }
  }

  .ready-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-weight: 600;
  }

  .details-toggle {
    background: none;
    border: none;
    padding: 0;
    text-decoration: underline;
    color: var(--color-text-soft);
    font-weight: normal;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .release_info {
    margin-top: var(--section-gap);
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .release-title {
    text-align: center;
    font-weight: 600;
    padding: 6px;
    background-color: var(--color-surface-float, var(--color-surface));
    border-bottom: 1px solid var(--color-border);
  }

  .release-body {
    padding: 8px 12px;
    background-color: var(--color-surface);

    p {
      margin: 4px 0;
    }
  }

  .note {
    margin-top: var(--section-gap);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);

    &.warning {
      border-color: #a62e32;
    }
  }

  .note-title {
    text-align: center;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .header-btn {
    // Pushes Exit DFU to the far end of the header, away from the title,
    // rather than sitting right up against it.
    margin-left: auto;
  }

  .step-body {
    display: flex;
    flex-direction: column;
  }

  .load-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: var(--section-gap);
  }

  .load-status {
    font-size: 0.8rem;
    font-weight: 600;

    &.valid {
      color: var(--color-valid, #00d000);
    }

    &.invalid {
      color: var(--color-invalid, #a62e32);
    }

    &.actionRequired {
      color: #0081ff;
    }
  }

  .step-nav {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: var(--section-gap);
    padding-top: var(--section-gap);
    border-top: 1px solid var(--color-border-soft);
  }

  .progress-info {
    position: relative;
    margin-top: var(--section-gap);
  }

  .label-short {
    display: none;
  }

  // Narrow screens get shorter button labels so Load Online/Load Local
  // (step 1) and Back/Flash (step 3) don't wrap awkwardly or overflow.
  @media only screen and (max-width: 700px) {
    .label-full {
      display: none;
    }

    .label-short {
      display: inline;
    }
  }

  .progress {
    width: 100%;
    height: 26px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);

    &::-webkit-progress-bar {
      background-color: #4f4f4f;
      border-radius: var(--radius-sm);
    }

    &::-webkit-progress-value {
      background-color: #f86008;
      border-radius: var(--radius-sm);
    }
  }

  .progress-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 600;
    color: #fff;
    text-shadow:
      0 0 3px black,
      0 0 3px black;
    pointer-events: none;

    &.valid {
      background-color: #00d000;
      border-radius: var(--radius-sm);
      color: #fff;
    }

    &.invalid {
      background-color: #a62e32;
      border-radius: var(--radius-sm);
      color: #fff;
    }

    &.actionRequired {
      background-color: #0081ff;
      border-radius: var(--radius-sm);
      color: #fff;
    }
  }

  .save-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }

  dialog {
    width: 32em;
    border-radius: var(--radius-lg);
  }

  dialog .buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: 1.5em;
  }

  dialog h3 {
    margin-bottom: 0.5em;
  }
</style>
