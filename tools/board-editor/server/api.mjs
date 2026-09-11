/**
 * File: tools/board-editor/server/api.mjs
 * The board editor's dev-server side: a small Vite plugin that lets
 * the editor read and write the files the configurator ships.
 *
 * It is deliberately narrow. Only three paths are writable -- the
 * profile file, the board images directory and nothing else -- and
 * every path is resolved and checked against its root before use, so
 * a crafted request cannot walk out of the repository.
 *
 * Routes:
 *   GET  /api/profiles           the profile file, verbatim
 *   PUT  /api/profiles           replace it (formatted, 2-space JSON)
 *   GET  /api/backgrounds        the SVGs already in src/images/boards
 *   POST /api/backgrounds/<name> save an SVG there
 *   GET  /api/targets            the firmware targets found next door
 *   GET  /api/targets/<name>     one target's pins, parsed from its
 *                                target.h and target.c
 *   GET  /images/...             src/images, the way the app serves it
 */

import fs from "node:fs/promises";
import path from "node:path";

const PROFILE_RELATIVE = "src/tabs/journey/board_profiles.json";
const IMAGES_RELATIVE = "src/images";
const BOARDS_RELATIVE = "src/images/boards";
/** Where the firmware repository sits relative to the configurator's. */
const FIRMWARE_RELATIVE = "../wingflight-firmware/src/main/target";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Resolves `relative` under `root`, refusing anything that escapes it. */
function resolveWithin(root, relative) {
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes its root: ${relative}`);
  }
  return resolved;
}

function send(res, status, body, type = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// --- firmware target parsing ------------------------------------------

const PIN_RE = /P([A-K])(\d{1,2})/;

function toPin(text) {
  const match = String(text ?? "").match(PIN_RE);
  return match ? `${match[1]}${match[2].padStart(2, "0")}` : null;
}

/**
 * Pulls the pin definitions out of a target's headers: the UART pairs,
 * I2C, the ADC inputs, the LED strip and the beeper. This is the same
 * source docs/adding-a-board-profile.md tells a profile author to read,
 * so the editor can seed a new profile instead of making them type it.
 */
function parseTargetHeader(text) {
  const uarts = {};
  for (const match of text.matchAll(
    /#define\s+UART(\d+)_(TX|RX)_PIN\s+(\S+)/g,
  )) {
    const pin = toPin(match[3]);
    if (!pin) continue;
    const index = Number(match[1]);
    (uarts[index] ??= {})[match[2].toLowerCase()] = pin;
  }

  const softSerial = {};
  for (const match of text.matchAll(
    /#define\s+SOFTSERIAL(\d+)_(TX|RX)_PIN\s+(\S+)/g,
  )) {
    const pin = toPin(match[3]);
    if (!pin) continue;
    (softSerial[Number(match[1])] ??= {})[match[2].toLowerCase()] = pin;
  }

  const singles = {};
  const SINGLE_DEFINES = {
    VBAT_ADC_PIN: { key: "Vbat", group: "adc" },
    CURRENT_METER_ADC_PIN: { key: "Curr", group: "adc" },
    RSSI_ADC_PIN: { key: "RSSI", group: "adc" },
    EXTERNAL1_ADC_PIN: { key: "Vext", group: "adc" },
    LED_STRIP_PIN: { key: "LED", group: "led" },
    BEEPER_PIN: { key: "Beeper", group: "other" },
  };
  for (const [define, meta] of Object.entries(SINGLE_DEFINES)) {
    const match = text.match(new RegExp(`#define\\s+${define}\\s+(\\S+)`));
    const pin = match ? toPin(match[1]) : null;
    if (pin) singles[meta.key] = { pin, group: meta.group };
  }

  const i2c = {};
  for (const match of text.matchAll(
    /#define\s+I2C(\d+)_(SCL|SDA)\s+(\S+)/g,
  )) {
    const pin = toPin(match[3]);
    if (!pin) continue;
    (i2c[Number(match[1])] ??= {})[match[2].toLowerCase()] = pin;
  }

  const mcu =
    text.match(/#define\s+TARGET_MCU\s+(\w+)/)?.[1] ??
    text.match(/#define\s+(STM32[A-Z0-9]+)\b/)?.[1] ??
    null;

  return { uarts, softSerial, singles, i2c, mcu };
}

/**
 * Walks a target's timerHardware[] table and hands back its motor,
 * servo and LED entries in declaration order, which is how the
 * firmware numbers them.
 */
function parseTargetTimers(text) {
  const outputs = [];
  let motors = 0;
  let servos = 0;
  for (const match of text.matchAll(
    /DEF_TIM\(\s*\w+\s*,\s*\w+\s*,\s*P([A-K])(\d{1,2})\s*,\s*(TIM_USE_\w+)/g,
  )) {
    const pin = `${match[1]}${match[2].padStart(2, "0")}`;
    const use = match[3];
    if (use.includes("MOTOR")) {
      motors += 1;
      outputs.push({ key: `M${motors}`, pin, group: "outputs" });
    } else if (use.includes("SERVO")) {
      servos += 1;
      outputs.push({ key: `S${servos}`, pin, group: "outputs" });
    } else if (use.includes("LED")) {
      outputs.push({ key: "LED", pin, group: "led" });
    } else if (use.includes("PPM")) {
      outputs.push({ key: "PPM", pin, group: "uart" });
    }
  }
  return outputs;
}

/**
 * The MCU a target builds for. It is not in the headers: the build
 * system picks it up from target.mk's `F405_TARGETS += $(TARGET)`
 * line, so that is where to read it.
 */
function parseTargetMcu(makefile) {
  const match = makefile.match(/^\s*([FH]\w+)_TARGETS\s*\+?=/m);
  return match ? `STM32${match[1]}` : null;
}

async function readTarget(targetRoot, name) {
  const dir = resolveWithin(targetRoot, name);
  const read = (file) =>
    fs.readFile(path.join(dir, file), "utf8").catch(() => "");
  const [header, source, makefile] = await Promise.all([
    read("target.h"),
    read("target.c"),
    read("target.mk"),
  ]);
  if (!header && !source) return null;
  const parsed = parseTargetHeader(header);
  return {
    name,
    ...parsed,
    mcu: parsed.mcu ?? parseTargetMcu(makefile),
    outputs: parseTargetTimers(source),
  };
}

// --- the plugin -------------------------------------------------------

/**
 * @param {{repoRoot: string}} options
 * @returns {import("vite").Plugin}
 */
export default function boardEditorApi({ repoRoot }) {
  const profilePath = path.resolve(repoRoot, PROFILE_RELATIVE);
  const imagesRoot = path.resolve(repoRoot, IMAGES_RELATIVE);
  const boardsRoot = path.resolve(repoRoot, BOARDS_RELATIVE);
  const targetRoot = path.resolve(repoRoot, FIRMWARE_RELATIVE);

  return {
    name: "board-editor-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const route = decodeURIComponent(url.pathname);

        try {
          // The app serves src/images at /images; the editor has to do
          // the same, because a profile's background path is stored the
          // way the configurator will ask for it.
          if (route.startsWith("/images/")) {
            const file = resolveWithin(imagesRoot, route.slice("/images/".length));
            const body = await fs.readFile(file).catch(() => null);
            if (!body) return next();
            const type = file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".png")
                ? "image/png"
                : "application/octet-stream";
            return send(res, 200, body.toString("utf8"), type);
          }

          if (route === "/api/profiles" && req.method === "GET") {
            const text = await fs.readFile(profilePath, "utf8");
            return send(res, 200, text);
          }

          if (route === "/api/profiles" && req.method === "PUT") {
            const body = await readBody(req);
            const parsed = JSON.parse(body.toString("utf8"));
            if (!parsed || !Array.isArray(parsed.boards)) {
              return send(res, 400, { error: "Expected { boards: [...] }." });
            }
            await fs.writeFile(
              profilePath,
              `${JSON.stringify(parsed, null, 2)}\n`,
              "utf8",
            );
            return send(res, 200, { saved: PROFILE_RELATIVE });
          }

          if (route === "/api/backgrounds" && req.method === "GET") {
            const names = await fs
              .readdir(boardsRoot)
              .catch(() => [])
              .then((list) => list.filter((name) => name.endsWith(".svg")));
            return send(res, 200, { files: names });
          }

          if (route.startsWith("/api/backgrounds/") && req.method === "POST") {
            const name = route.slice("/api/backgrounds/".length);
            if (!/^[a-z0-9][a-z0-9._-]*\.svg$/i.test(name)) {
              return send(res, 400, {
                error: "Name must be a plain file name ending in .svg.",
              });
            }
            const body = (await readBody(req)).toString("utf8");
            if (!body.includes("<svg")) {
              return send(res, 400, { error: "That is not an SVG." });
            }
            await fs.mkdir(boardsRoot, { recursive: true });
            await fs.writeFile(resolveWithin(boardsRoot, name), body, "utf8");
            return send(res, 200, { href: `/images/boards/${name}` });
          }

          if (route === "/api/targets" && req.method === "GET") {
            const entries = await fs
              .readdir(targetRoot, { withFileTypes: true })
              .catch(() => []);
            const names = entries
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort();
            return send(res, 200, { targets: names });
          }

          if (route.startsWith("/api/targets/") && req.method === "GET") {
            const name = route.slice("/api/targets/".length);
            if (!/^[A-Za-z0-9_]+$/.test(name)) {
              return send(res, 400, { error: "Bad target name." });
            }
            const target = await readTarget(targetRoot, name);
            if (!target) return send(res, 404, { error: "No such target." });
            return send(res, 200, target);
          }
        } catch (error) {
          return send(res, 500, { error: String(error.message ?? error) });
        }

        return next();
      });
    },
  };
}
