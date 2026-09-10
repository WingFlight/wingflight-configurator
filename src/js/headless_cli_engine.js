import CliEngine from "@/js/cli_engine.js";

/**
 * File: src/js/headless_cli_engine.js
 * HeadlessCliEngine is a CliEngine with no on-screen console.
 *
 * Ported unchanged from Rotorflight Configurator PR #433.
 *
 * CliEngine only touches its jQuery-wrapped `#GUI` elements from three
 * places: `setUi()`/`initializeAutoComplete()` (which we never call),
 * `clearOutputHistory()` (never called -- callers slice
 * `outputHistory` by a remembered start offset instead) and
 * `writeToOutput()` (called internally, including from deep inside
 * `readSerial()`). Overriding `writeToOutput` as a no-op means `#GUI`
 * is never dereferenced, while `outputHistory` still accumulates
 * correctly -- that bookkeeping lives in CliEngine's own private
 * `#adjustCliBuffer()` logic and does not depend on the UI at all.
 *
 * Use this for code that just needs to send a fixed CLI command
 * sequence and read back the response text, without rendering an
 * interactive console (see src/js/remap_fc/wiring_session.svelte.js).
 */
export default class HeadlessCliEngine extends CliEngine {
  writeToOutput(_text) {
    // Intentionally empty -- no console to write to.
  }
}
