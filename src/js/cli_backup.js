// Shared helpers for running a CLI-based configuration backup (`dump all` /
// `diff all`) and, symmetrically, replaying a previously captured backup back
// into the CLI to restore it. Used by the CLI tab's "Backup" button (where a
// CliEngine + window is already wired up and the serial port is already
// connected) and by the Firmware Flasher's "Backup before flashing" option
// (where neither is true, so this also has to open/close the serial
// connection itself).
import CliEngine from "@/js/cli_engine.js";
import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { generateFilename } from "@/js/main.js";
import { writeTextFile } from "@/js/filesystem.js";

export const BACKUP_TYPES = {
  DIFF: "diff",
  DUMP: "dump",
};

const BACKUP_COMMANDS = {
  [BACKUP_TYPES.DIFF]: "diff all",
  [BACKUP_TYPES.DUMP]: "dump all",
};

const CLI_ENTER_TIMEOUT_MS = 8000;
const CLI_IDLE_MS = 750;
const CLI_RECONNECT_ATTEMPTS = 3;
const CLI_RECONNECT_DELAY_MS = 2000;

// This firmware's CLI has no "just switch back to MSP" exit -- both `exit`
// and `save` always end in a real cliReboot() (see cliExit()/cliSave() in
// cli.c). Whatever comes next on this port (the Firmware Flasher's own MSP
// reconnect, for one) needs the flight controller to have actually finished
// rebooting -- sensors reinitialised, USB/UART back up -- or it'll find
// nothing answering and time out. This is a blind wait (there's no reliable
// "boot finished" signal to listen for), sized generously for that.
const CLI_REBOOT_WAIT_MS = 3000;

// CliEngine writes its output straight into jQuery GUI elements. When there's
// no visible CLI tab/dialog to give it (e.g. running from the Firmware
// Flasher), hand it detached ones so it can still run.
function headlessCliEngine() {
  const cliEngine = new CliEngine();
  cliEngine.setUi($("<div>"), $("<div>"), $("<textarea>"));
  return cliEngine;
}

function waitForCliValid(timeoutMs) {
  return new Promise((resolve) => {
    if (CONFIGURATOR.cliEngineValid) {
      resolve(true);
      return;
    }
    const timeout = setTimeout(() => {
      clearInterval(poll);
      resolve(false);
    }, timeoutMs);
    const poll = setInterval(() => {
      if (CONFIGURATOR.cliEngineValid) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve(true);
      }
    }, 200);
  });
}

// Resolves once no CLI response has arrived for `idleMs` -- used to detect
// that a `dump all`/`diff all` has finished printing.
function waitForIdle(cliEngine, idleMs) {
  return new Promise((resolve) => {
    let lastReceived = performance.now();
    cliEngine.subscribeResponseCallback(() => {
      lastReceived = performance.now();
    });
    const check = setInterval(() => {
      if (performance.now() - lastReceived > idleMs) {
        clearInterval(check);
        cliEngine.unsubscribeResponseCallback();
        resolve();
      }
    }, 200);
  });
}

function openSerial(port, baud) {
  return new Promise((resolve) => {
    serial.connect(port, { bitrate: baud }, (openInfo) => resolve(!!openInfo));
  });
}

function closeSerial() {
  return new Promise((resolve) => {
    if (serial.connected || serial.connectionId) {
      serial.disconnect(() => resolve());
    } else {
      resolve();
    }
  });
}

/**
 * Sends a `dump all`/`diff all` on an already-connected, already-in-CLI-mode
 * `cliEngine` and resolves with the captured output once it settles.
 */
export async function runBackupCommand(cliEngine, backupType) {
  cliEngine.sendLine(BACKUP_COMMANDS[backupType]);
  await waitForIdle(cliEngine, CLI_IDLE_MS);
  return cliEngine.outputHistory;
}

/**
 * Connects to `port`, enters CLI mode, runs a `dump all`/`diff all` backup
 * and disconnects again -- headless, no CLI tab/dialog needs to be mounted.
 * Resolves with the captured CLI text, or null if it couldn't connect/enter
 * CLI mode. `onStatus`, if given, is called with "connecting" then "running"
 * as the backup progresses -- for a caller (e.g. a wizard dialog) that wants
 * to show live status.
 */
export async function backupOverSerial(port, baud, backupType, onStatus) {
  CONFIGURATOR.cliEngineValid = false;
  onStatus?.("connecting");

  const opened = await openSerial(port, baud);
  if (!opened) return null;

  const cliEngine = headlessCliEngine();
  const onReceive = (info) => cliEngine.readSerial(info);
  serial.onReceive.addListener(onReceive);
  CONFIGURATOR.cliTab = "firmware_flasher";
  cliEngine.enterCliMode();

  const valid = await waitForCliValid(CLI_ENTER_TIMEOUT_MS);
  if (!valid) {
    serial.onReceive.removeListener(onReceive);
    await closeSerial();
    return null;
  }

  onStatus?.("running");
  const text = await runBackupCommand(cliEngine, backupType);

  // Leaving CLI mode (however we do it) reboots the flight controller -- see
  // CLI_REBOOT_WAIT_MS above -- so disconnect first and then wait, rather
  // than holding this connection open across a reset we can't observe.
  await new Promise((resolve) => cliEngine.close(resolve));
  serial.onReceive.removeListener(onReceive);
  await closeSerial();
  await new Promise((resolve) => setTimeout(resolve, CLI_REBOOT_WAIT_MS));

  return text;
}

/**
 * Reconnects to `port` (retrying a few times while a freshly-flashed board
 * boots) and replays a previously-captured `dump all`/`diff all` backup.
 * That text ends with `save`, so the flight controller saves and reboots on
 * its own once it's replayed -- this just waits for that before
 * disconnecting. Resolves true/false for whether the replay was sent.
 * `onStatus`, if given, is called with "connecting" then "running".
 */
export async function restoreOverSerial(port, baud, backupText, onStatus) {
  let valid = false;
  let cliEngine;
  let onReceive;

  onStatus?.("connecting");

  for (let attempt = 0; attempt < CLI_RECONNECT_ATTEMPTS && !valid; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, CLI_RECONNECT_DELAY_MS),
      );
    }

    CONFIGURATOR.cliEngineValid = false;

    const opened = await openSerial(port, baud);
    if (!opened) continue;

    cliEngine = headlessCliEngine();
    onReceive = (info) => cliEngine.readSerial(info);
    serial.onReceive.addListener(onReceive);
    CONFIGURATOR.cliTab = "firmware_flasher";
    cliEngine.enterCliMode();

    valid = await waitForCliValid(CLI_ENTER_TIMEOUT_MS);
    if (!valid) {
      serial.onReceive.removeListener(onReceive);
      await closeSerial();
    }
  }

  if (!valid) return false;

  onStatus?.("running");
  await cliEngine.executeCommands(backupText);

  // the replayed commands end with `save`, which -- like `exit` -- reboots
  // the flight controller (see CLI_REBOOT_WAIT_MS above). Give it that same
  // window to finish before we disconnect.
  await new Promise((resolve) => setTimeout(resolve, CLI_REBOOT_WAIT_MS));

  serial.onReceive.removeListener(onReceive);
  await closeSerial();

  return true;
}

// Best-effort save -- failure (including the user cancelling the file
// picker) is left for the caller to decide whether it matters.
export async function saveBackupToFile(text, prefix) {
  return writeTextFile(text, {
    suggestedName: generateFilename(prefix, "txt"),
    description: "TXT files",
  });
}
