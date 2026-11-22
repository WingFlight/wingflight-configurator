import { reinitialiseConnection } from "@/js/serial_backend.js";
import { CliAutoComplete } from "@/js/CliAutoComplete.js";
import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { openParamSession, ResolveError } from "@/js/param/session.js";
import VirtualCli from "@/js/virtual_cli.js";

const CHAR_CODE_BACKSPACE = 8;
const CHAR_CODE_LINE_FEED = 10;
const CHAR_CODE_CARRIAGE_RETURN = 13;

// Shown when the board does not answer MSP2_WING_BUILD_ID: a firmware from
// before parameter addressing, which still has its own CLI.
const NO_ADDRESSING =
  "###ERROR: this firmware has no parameter addressing, which the configurator's CLI needs. It still has its own CLI, which this configurator does not use.";

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The firmware has no CLI any more. These commands are executed here, against
 * addressed parameter access, and their output is written to the same places
 * the serial output used to go -- so the CLI tab, cli_backup.js and the
 * firmware flasher all keep working through this one seam rather than each
 * learning about manifests.
 */
export default class CliEngine {
  #lineDelayMs = 15;
  #profileSwitchDelayMs = 100;
  #rateProfileSwitchDelayMs = 100;
  // `defaults`/`defaults nosave` makes the FC reset every PG back to its
  // default value in place -- on a target with a lot of them (servo mixer
  // rules, gyro RPM notches, etc., as on this wing platform) that can block
  // the firmware's UART processing long enough that the very next replayed
  // line arrives, and gets parsed, mid-reset. The line itself usually looks
  // fine in the backup file -- what actually fails to parse is whatever
  // partial/garbled bytes the FC's RX buffer was holding when it came back
  // up, which is why the reported failure (e.g. "###ERROR IN map: PARSING
  // FAILED###") doesn't have to match any line actually being sent. A
  // generous fixed delay here, mirroring the profile/rateprofile switch
  // delays below, gives the reset time to finish before we send anything
  // else.
  #defaultsDelayMs = 2000;

  #outputHistory = ""; // output history holds the human-readable history from the flight controller
  #cliBuffer = ""; // cliBuffer holds the current data received from the flight controller
  #cliBufferContainsPartialCommand = false; // Tracks whether the cliBuffer contains a partial command.

  #cliErrorsCount = 0;

  #onSendCommandsProgressCallback = undefined; // callback to be called when sending commands to the flight controller (used for a progress bar)
  #responseCallback = undefined; // callback to be called when a response is received from the flight controller
  #session = undefined; // the resolved manifest and addressed access behind these commands
  #cliAutoComplete = undefined; // holds an instance of the CLIAutoComplete

  #startProcessingForValidation = false; // Start processing the serial read data for validation of the engine

  #inBatchMode = false; // track whether batch mode has been detected

  #virtualCli = null; // stands in for the FC's CLI when on the Virtual FC

  // GUI elements for presenting an interactable CLI
  #GUI = {
    window: null, // the CLI window
    windowWrapper: null, // contains the output history
    textarea: null, // the textarea for command entry
  };

  // History tracker for previously entered commands
  #history = {
    history: [],
    wipCommand: "",
    index: 0,
    add: function (str) {
      this.history.push(str);
      this.index = this.history.length;
      this.wipCommand = "";
    },
    prev: function () {
      if (this.index > 0) {
        this.index -= 1;
      }
      return this.history[this.index];
    },
    next: function () {
      if (this.index < this.history.length - 1) {
        this.index += 1;
        return this.history[this.index];
      }
      this.index = this.history.length;
      return "";
    },
  };

  get outputHistory() {
    return this.#outputHistory;
  }
  clearOutputHistory() {
    this.#outputHistory = "";
    this.#GUI.windowWrapper.empty();
  }

  get errorsCount() {
    return this.#cliErrorsCount;
  }
  get inBatchMode() {
    return this.#inBatchMode;
  }

  setUi(window, windowWrapper, textarea) {
    this.#GUI.window = window;
    this.#GUI.windowWrapper = windowWrapper;
    this.#GUI.textarea = textarea;
    this.#setTextareaListen();
  }

  initializeAutoComplete() {
    const self = this;
    CliAutoComplete.initialize(
      this.#GUI.textarea,
      this.sendLine.bind(this),
      this.writeToOutput.bind(this),
    );
    $(CliAutoComplete).on("build:start", function () {
      self.#GUI.textarea
        .val("")
        .attr("placeholder", i18n.getMessage("cliInputPlaceholderBuilding"))
        .prop("disabled", true);
    });
    $(CliAutoComplete).on("build:stop", function () {
      self.#GUI.textarea
        .attr("placeholder", i18n.getMessage("cliInputPlaceholder"))
        .prop("disabled", false)
        .focus();
    });
    this.#cliAutoComplete = CliAutoComplete;
  }

  setProgressCallback(sendCommandsProgressCallback) {
    this.#onSendCommandsProgressCallback = sendCommandsProgressCallback;
  }

  #reportSendCommandsProgress(value) {
    this.#onSendCommandsProgressCallback?.(value);
  }

  // There is no CLI on the board to enter. What this does now is assemble the
  // pieces the commands need -- identify the firmware, find and verify the
  // manifest that describes it -- and report the outcome the way the firmware's
  // banner used to.
  async enterCliMode() {
    this.#cliBuffer = "";
    CONFIGURATOR.cliEngineActive = true;

    // The Virtual FC has no board and no manifest: its own CLI stands in.
    if (CONFIGURATOR.virtualMode) {
      this.#virtualCli = new VirtualCli();
      this.#receiveVirtual(this.#virtualCli.banner());
      return true;
    }

    try {
      this.#session = await openParamSession({
        onProgress: (what) => this.#writeLocalLine(`# ${what}`),
      });
    } catch (error) {
      this.#session = undefined;
      CONFIGURATOR.cliEngineValid = false;
      // A missing manifest explains itself (ResolveError). Anything else here
      // is the board not answering MSP2_WING_BUILD_ID.
      this.#writeLocalLine(`###ERROR: ${error.message}`);
      if (!(error instanceof ResolveError)) {
        this.#writeLocalLine(NO_ADDRESSING);
      }
      return false;
    }

    // Callers do not await this; they poll cliEngineValid, exactly as they did
    // when it was the firmware's banner being waited for. Setting it here is
    // what keeps them working unchanged.
    CONFIGURATOR.cliEngineValid = true;

    const { identity, source, manifest } = this.#session;
    this.#writeLocalLine(`# Wingflight / ${identity.target} ${identity.version} (${identity.revision})`);
    this.#writeLocalLine(`# manifest ${identity.buildId} from ${source}, ${manifest.settings.size} settings`);
    this.#writeLocalLine("# type 'help' for a list of commands");
    return true;
  }

  #setTextareaListen() {
    // Tab key detection must be on keydown,
    // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
    this.#GUI.textarea.keydown((event) => {
      if (event.key === "Tab") {
        // prevent default tabbing behaviour
        event.preventDefault();

        if (this.#cliAutoComplete) {
          if (!this.#cliAutoComplete.isEnabled()) {
            // Native FC autoComplete
            const outString = this.#GUI.textarea.val();
            const lastCommand = outString.split("\n").pop();
            this.#sendLineWithTab(lastCommand);
          } else if (
            !this.#cliAutoComplete.isOpen() &&
            !this.#cliAutoComplete.isBuilding()
          ) {
            // force show autocomplete on Tab
            this.#cliAutoComplete.openLater(true);
          }
        }
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (this.#cliAutoComplete && this.#cliAutoComplete.isOpen()) {
          return; // disable history keys if autocomplete is open
        }

        const historyEntry =
          event.key === "ArrowUp" ? this.#history.prev() : this.#history.next();

        event.preventDefault();
        this.#GUI.textarea.val(historyEntry ?? "");
      }
    });

    this.#GUI.textarea.keypress((event) => {
      if (event.key === "Enter") {
        event.preventDefault(); // prevent the adding of new line

        if (this.#cliAutoComplete && this.#cliAutoComplete.isBuilding()) {
          return; // silently ignore commands if autocomplete is still building
        }

        const outString = this.#GUI.textarea.val();
        this.#history.add(outString);
        this.executeCommands(outString);
        this.#GUI.textarea.val("");
      }
    });

    // give input element user focus
    this.#GUI.textarea.focus();
  }

  // Close attempts to send an `exit` to the flight controller. Notably, it uses the `_lineWithBuffer` function as there could be pending CLI buffer data.
  // Nothing to leave: the board was never put into a CLI mode, so there is no
  // `exit` to send and -- unlike the firmware's cliExit() -- no reboot. That
  // is a real improvement: leaving the tab used to cost a reconnect.
  close(callback) {
    if (CONFIGURATOR.virtualMode) {
      // Nothing to reboot, and replying with "Rebooting" would switch tabs
      // in the middle of whatever is closing the CLI (e.g. a disconnect).
      this.#virtualCli = null;
      CONFIGURATOR.cliEngineActive = false;
      CONFIGURATOR.cliEngineValid = false;
      CONFIGURATOR.cliTab = "";
      callback?.();
      return;
    }

    this.#session = undefined;
    CONFIGURATOR.cliEngineActive = false;
    CONFIGURATOR.cliEngineValid = false;
    CONFIGURATOR.cliTab = "";
    callback?.();
  }

  // executeCommands splits (on \n) the given output string into an array of strings and returns a promise that resolves after all of the commands have been sent.
  async executeCommands(commandString) {
    const commandArray = commandString.split("\n");
    await this.executeCommandsArray(commandArray);
  }

  // executeCommandsArray
  async executeCommandsArray(commandsArray) {
    this.#reportSendCommandsProgress(0);
    for (let i = 0, delay = 0; i < commandsArray.length; i++) {
      let line = commandsArray[i].trim();
      if (line.length === 0) continue;

      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

      if (this.#cliBufferContainsPartialCommand) {
        line = this.#lineWithBuffer(line);
      }

      await new Promise((resolve) => this.sendLine(line, resolve));

      this.#reportSendCommandsProgress((100.0 * i) / commandsArray.length);

      if (line.toLowerCase().startsWith("defaults")) {
        delay = this.#defaultsDelayMs;
      } else if (line.toLowerCase().startsWith("profile")) {
        delay = this.#profileSwitchDelayMs;
      } else if (line.toLowerCase().startsWith("rateprofile")) {
        delay = this.#rateProfileSwitchDelayMs;
      } else {
        delay = this.#lineDelayMs;
      }
    }
    this.#reportSendCommandsProgress(100);
  }

  // removePromptHash removes the # from the prompt text, and is used to handle the output of the FC native autocomplete.
  #removePromptHash(promptText) {
    return promptText.replace(/^# /, "");
  }

  // The cliBuffer may have a partial command from a previous auto-complete request.
  // #lineWithBuffer parses the input line and the cliBuffer, to return a line that when sent, will achieve the desired command.
  // For example, if the cliBuffer contains "# dump all", and the user is trying to run a "diff all", the input for this function should be "diff all"
  // and the line returned by this function would be `<number of backspaces required to reduce the cliBuffer to "# d">iff all`.
  #lineWithBuffer(line) {
    const buffer = this.#removePromptHash(this.#cliBuffer);
    const bufferRegex = new RegExp(`^${buffer}`, "g");
    if (line.match(bufferRegex)) {
      return line.replace(bufferRegex, "");
    }

    let commonChars = 0;

    for (let i = 0; i < buffer.length; i++) {
      if (line[i] === buffer[i]) {
        commonChars++;
      } else {
        break;
      }
    }

    const noOfCharsToDelete = buffer.length - commonChars;

    const backspace = String.fromCharCode(127);
    return (
      backspace.repeat(noOfCharsToDelete) +
      line.substring(buffer.length - noOfCharsToDelete, line.length)
    );
  }

  // writeToOutput is a function used to write text to the window wrapper -- while primarily used by the CliEngine, it is also used by CliAutoComplete.
  writeToOutput(text) {
    this.#GUI.windowWrapper.append(text);
    this.#GUI.window.scrollTop(this.#GUI.window.prop("scrollHeight"));
  }

  // A line the configurator produced itself, now that the CLI runs here: kept
  // raw in the output history, which is what backups and the Remap FC tab read
  // back, and escaped for the console, which renders HTML. Serial output is
  // escaped and recorded as it is read (#adjustCliBuffer).
  #writeLocalLine(text) {
    this.#outputHistory += `${text}\n`;
    this.#writeLineToOutput(escapeHtml(text));
  }

  #writeLineToOutput(text) {
    if (this.#cliAutoComplete && this.#cliAutoComplete.isBuilding()) {
      this.#cliAutoComplete.builderParseLine(text);
    } else {
      if (text.startsWith("###ERROR")) {
        this.writeToOutput(`<span class="error_message">${text}</span><br>`);
        this.#cliErrorsCount++;
      } else {
        this.writeToOutput(`${text}<br>`);
      }
    }
    this.#responseCallback?.();
  }

  readSerial(readInfo) {
    /*  Some info about handling line feeds and carriage return

            line feed = LF = \n = 0x0A = 10
            carriage return = CR = \r = 0x0D = 13

            MAC only understands CR
            Linux and Unix only understand LF
            Windows understands (both) CRLF
            Chrome OS currently unknown
        */
    const data = new Uint8Array(readInfo.data ?? readInfo);
    let validateText = "";
    let sequenceCharsToSkip = 0;

    for (const charCode of data) {
      const currentChar = String.fromCharCode(charCode);
      const isCRLF =
        currentChar.charCodeAt() === CHAR_CODE_LINE_FEED ||
        currentChar.charCodeAt() === CHAR_CODE_CARRIAGE_RETURN;

      if (
        !CONFIGURATOR.cliEngineValid &&
        (isCRLF || this.#startProcessingForValidation)
      ) {
        // try to catch part of valid CLI enter message
        this.#startProcessingForValidation = true;
        validateText += currentChar;
        this.writeToOutput(currentChar);
        continue;
      }

      const escapeSequenceCode = 27;
      const escapeSequenceCharLength = 3;
      if (charCode === escapeSequenceCode && !sequenceCharsToSkip) {
        // ESC + other
        sequenceCharsToSkip = escapeSequenceCharLength;
      }

      if (sequenceCharsToSkip) {
        sequenceCharsToSkip--;
        continue;
      }

      this.#adjustCliBuffer(charCode);

      if (this.#cliBuffer === "Rebooting" && CHAR_CODE_BACKSPACE !== charCode) {
        CONFIGURATOR.cliEngineActive = false;
        CONFIGURATOR.cliEngineValid = false;
        CONFIGURATOR.cliTab = "";
        GUI.log(i18n.getMessage("cliReboot"));
        reinitialiseConnection();
        if (CONFIGURATOR.virtualMode) {
          this.#rebootVirtual();
        }
      }
      if (
        this.#cliBuffer === "Command batch started" &&
        CHAR_CODE_BACKSPACE !== charCode
      ) {
        this.#inBatchMode = true;
      }

      if (
        this.#cliBuffer === "Command batch ended" &&
        CHAR_CODE_BACKSPACE !== charCode
      ) {
        this.#inBatchMode = false;
      }
    }
    if (!CONFIGURATOR.cliEngineValid && validateText.indexOf("CLI") !== -1) {
      GUI.log(i18n.getMessage("cliEnter"));
      CONFIGURATOR.cliEngineValid = true; // TODO: consolidate this!

      // begin output history with the prompt (last line of welcome message)
      // this is to match the content of the history with what the user sees on this tab
      const lastLine = validateText.split("\n").pop();
      this.#outputHistory = lastLine;

      if (
        this.#cliAutoComplete &&
        this.#cliAutoComplete.isEnabled() &&
        !this.#cliAutoComplete.isBuilding()
      ) {
        // start building autoComplete
        this.#cliAutoComplete.builderStart();
      }
    }

    if (CONFIGURATOR.cliEngineValid) {
      // fallback to native autocomplete
      if (
        ((this.#cliAutoComplete && !this.#cliAutoComplete.isEnabled()) ||
          this.#cliAutoComplete == undefined) &&
        this.#cliBufferContainsPartialCommand
      ) {
        this.setPrompt(this.#removePromptHash(this.#cliBuffer));
      }
    }
  }

  setPrompt(text) {
    this.#GUI.textarea.val(text);
  }

  // Runs one command here rather than sending it to the board. The output goes
  // through the same writer the serial data used to, so anything subscribed --
  // the tab's window, a headless backup collector -- sees it unchanged.
  sendLine(line, callback) {
    if (this.#virtualCli) {
      this.#send(`${line}
`, callback);
      return;
    }
    this.#executeLocally(line).finally(() => callback?.());
  }

  async #executeLocally(line) {
    const text = String(line).replace(/[\r\n]+$/, "");

    // Echo the command, as the board did when it was the one reading it.
    this.#writeLocalLine(`# ${text}`);

    if (!this.#session) {
      this.#writeLocalLine("###ERROR: no manifest for this board; configuration is unavailable");
      return;
    }

    try {
      const output = await this.#session.cli.execute(text);
      for (const outputLine of String(output).split("\n")) {
        if (outputLine.length) {
          this.#writeLocalLine(outputLine);
        }
      }
    } catch (error) {
      this.#writeLocalLine(`###ERROR: ${error.message}`);
    }
  }

  // _sendLineWithTab sends a line with a tab character -- this triggers the FC's native autocomplete, which in turn will populate the buffer with a partial command that needs to be handled.
  #sendLineWithTab(line, callback) {
    if (this.#cliBufferContainsPartialCommand) {
      line = this.#lineWithBuffer(line);
    } else {
      this.#cliBufferContainsPartialCommand = true;
    }
    this.#send(line + "\t", callback);
  }

  subscribeResponseCallback(callback) {
    this.#responseCallback = callback;
  }
  unsubscribeResponseCallback() {
    this.#responseCallback = undefined;
  }

  #send(line, callback) {
    if (this.#virtualCli) {
      callback?.({ bytesSent: line.length });
      this.#receiveVirtual(this.#virtualCli.input(line));
      return;
    }

    const bufferOut = new ArrayBuffer(line.length);
    const bufView = new Uint8Array(bufferOut);

    for (let cKey = 0; cKey < line.length; cKey++) {
      bufView[cKey] = line.charCodeAt(cKey);
    }

    serial.send(bufferOut, callback);
  }

  // Delivers the Virtual FC's reply as if it had arrived over serial, after
  // the current call returns, like a real FC's reply would.
  #receiveVirtual(text) {
    const data = Uint8Array.from(text, (char) => char.charCodeAt(0));
    setTimeout(() => this.readSerial(data), 0);
  }

  // A real FC drops off the port and is reconnected, landing on the default
  // tab (see serial_backend.js finishOpen). The Virtual FC stays connected,
  // so just leave the CLI for the default tab.
  #rebootVirtual() {
    this.#virtualCli = null;
    GUI.reboot_in_progress = false;
    setTimeout(() => GUI.selectDefaultTabWhenConnected(), 0);
  }

  // adjustCliBuffer handles a character code and translates it as necessary onto the CLI buffer.
  #adjustCliBuffer(newCharacterCode) {
    if (CONFIGURATOR.cliEngineValid) {
      const currentChar = String.fromCharCode(newCharacterCode);
      switch (newCharacterCode) {
        // Windows
        case CHAR_CODE_LINE_FEED:
          if (GUI.operating_system === "Windows") {
            this.#writeLineToOutput(this.#cliBuffer);
            this.#cliBuffer = "";
          }
          break;
        // Everything else
        case CHAR_CODE_CARRIAGE_RETURN:
          if (GUI.operating_system !== "Windows") {
            this.#writeLineToOutput(this.#cliBuffer);
            this.#cliBuffer = "";
          }
          break;
        case 60:
          this.#cliBuffer += "&lt";
          break;
        case 62:
          this.#cliBuffer += "&gt";
          break;
        case CHAR_CODE_BACKSPACE:
          this.#cliBuffer = this.#cliBuffer.slice(0, -1);
          this.#outputHistory = this.#outputHistory.slice(0, -1);
          return; // Return so we don't unnecessarily append to the output history.
        default:
          this.#cliBuffer += currentChar;
      }
      this.#outputHistory += currentChar;
    }
  }
}
