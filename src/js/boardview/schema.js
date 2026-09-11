/**
 * File: src/js/boardview/schema.js
 * The board-view schema (version 2) and its normaliser.
 *
 * Version 1 -- what src/tabs/journey/board_profiles.json still holds --
 * is a single top-down `outline` plus a flat `pads` array. Version 2
 * adds:
 *
 *   - `views`: up to three drawings of the same board (top, left,
 *     right), each with its own extent and an optional background SVG
 *     exported from CAD;
 *   - `headers`: the physical connectors pads are grouped into, so a
 *     label can name the connector rather than every pad on it;
 *   - `ports`: the serial ports, each naming its TX pin and its RX
 *     pin. The two need not sit on the same header or even the same
 *     view -- a board that breaks a UART out as TX on one row and RX
 *     on another is described by giving the two pins, and the drawing
 *     works out that the port is split.
 *
 * Everything here is plain data and pure functions: the configurator
 * and the board editor (tools/board-editor) both import this module,
 * so a profile the editor accepts is one the configurator draws.
 *
 * `normaliseProfile` upgrades a version 1 profile in memory, so the
 * four existing profiles keep working untouched.
 */

/** The views a board can be drawn from, in tab order. */
export const VIEW_IDS = ["top", "left", "right"];

/** Pad colour groups. `internal` is drawn but never offered for reassignment. */
export const PAD_GROUPS = [
  "outputs",
  "uart",
  "i2c",
  "adc",
  "power",
  "led",
  "other",
  "internal",
];

/** The two halves of a serial port. */
export const PORT_LINES = ["tx", "rx"];

/** Default view extents, in millimetres, when a profile names none. */
const DEFAULT_EXTENT = { width: 56, height: 36 };

/** How far apart two pads of one port may sit, in mm, before it counts as split. */
export const SPLIT_DISTANCE_MM = 12;

function str(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** Canonical pin spelling: upper case, no `P` prefix, two digits ("b7" -> "B07"). */
export function normalisePin(pin) {
  const raw = str(pin).toUpperCase().replace(/^P/, "");
  const match = raw.match(/^([A-K])(\d{1,2})$/);
  return match ? `${match[1]}${match[2].padStart(2, "0")}` : raw;
}

/**
 * An empty view spec, used by the editor when a view is added.
 * @param {string} id one of VIEW_IDS
 * @returns {Object}
 */
export function emptyView(id) {
  return {
    id,
    width: DEFAULT_EXTENT.width,
    height: id === "top" ? DEFAULT_EXTENT.height : 12,
    background: null,
    backgroundOpacity: 1,
    mountHoles: [],
    usb: { edge: id === "top" ? "top" : "left", offset: 0.5 },
  };
}

function normaliseView(id, raw, fallback) {
  const source = raw ?? fallback ?? {};
  const blank = emptyView(id);
  return {
    id,
    width: num(source.width, blank.width),
    height: num(source.height, blank.height),
    background: str(source.background) || null,
    backgroundOpacity:
      source.backgroundOpacity === undefined
        ? 1
        : Math.min(1, Math.max(0, num(source.backgroundOpacity, 1))),
    mountHoles: (source.mountHoles ?? [])
      .filter((hole) => Array.isArray(hole) && hole.length >= 2)
      .map((hole) => [num(hole[0]), num(hole[1])]),
    // Where the board's USB connector sits in this view, so the drawing
    // can orient itself. Explicit null means "do not draw it".
    usb:
      source.usb === null
        ? null
        : {
            edge: str(source.usb?.edge) || blank.usb.edge,
            offset:
              source.usb?.offset === undefined ? 0.5 : num(source.usb.offset, 0.5),
          },
  };
}

function normaliseHeader(raw, index) {
  return {
    id: str(raw?.id) || `header-${index + 1}`,
    label: str(raw?.label) || null,
    view: VIEW_IDS.includes(str(raw?.view)) ? str(raw.view) : "top",
    // The connector's footprint in millimetres, for the outline drawn
    // behind its pads. Optional: a header with no extent is derived
    // from the pads that name it.
    x: raw?.x === undefined || raw?.x === null ? null : num(raw.x),
    y: raw?.y === undefined || raw?.y === null ? null : num(raw.y),
    width:
      raw?.width === undefined || raw?.width === null ? null : num(raw.width),
    height:
      raw?.height === undefined || raw?.height === null ? null : num(raw.height),
  };
}

function normalisePad(raw, index) {
  const view = VIEW_IDS.includes(str(raw?.view)) ? str(raw.view) : "top";
  return {
    pin: normalisePin(raw?.pin),
    silkscreen: str(raw?.silkscreen) || null,
    x: num(raw?.x),
    y: num(raw?.y),
    view,
    // Which face of the PCB the pad is on. Bottom-side pads are drawn
    // dashed; this is independent of the view they appear in.
    side: str(raw?.side) === "bottom" ? "bottom" : "top",
    group: PAD_GROUPS.includes(str(raw?.group)) ? str(raw.group) : "other",
    header: str(raw?.header) || null,
    // Which way the pad's label runs. "auto" lets the drawing pick the
    // nearest edge, which is right for all but a few crowded corners.
    labelSide: ["left", "right", "above", "below"].includes(str(raw?.labelSide))
      ? str(raw.labelSide)
      : "auto",
    reserved: Boolean(raw?.reserved),
    order: index,
  };
}

function normalisePort(raw, index) {
  const tx = normalisePin(raw?.tx ?? raw?.pins?.tx);
  const rx = normalisePin(raw?.rx ?? raw?.pins?.rx);
  return {
    id: str(raw?.id) || `port-${index + 1}`,
    // The firmware's own serial port identifier (0 = UART1). This is
    // what joins a drawn port to FC.SERIAL_CONFIG, so it must follow
    // the target, not the silkscreen.
    identifier:
      raw?.identifier === undefined || raw?.identifier === null
        ? null
        : num(raw.identifier),
    label: str(raw?.label) || null,
    tx: tx || null,
    rx: rx || null,
    // Set only to override what the geometry says; normally the drawing
    // decides "split" from where the two pins land.
    split: raw?.split === undefined || raw?.split === null ? null : Boolean(raw.split),
    notes: str(raw?.notes) || null,
  };
}

/**
 * Upgrades any accepted profile to the version 2 shape. Version 1
 * profiles (an `outline`, pads without a `view`) become a single top
 * view. Always returns a new object; never mutates its argument.
 * @param {Object} raw
 * @returns {?Object} normalised profile
 */
export function normaliseProfile(raw) {
  if (!raw) return null;

  const legacyTop = raw.outline
    ? { ...raw.outline, background: raw.background ?? null }
    : null;

  const views = {};
  for (const id of VIEW_IDS) {
    const declared = raw.views?.[id];
    if (!declared && !(id === "top" && legacyTop)) continue;
    views[id] = normaliseView(id, declared, id === "top" ? legacyTop : null);
  }
  // A profile with pads but no view at all still has to draw something.
  if (!Object.keys(views).length) views.top = emptyView("top");

  const pads = (raw.pads ?? [])
    .map(normalisePad)
    // Drop pads pointing at a view the profile does not define, rather
    // than drawing them at the origin of a view they do not belong to.
    .filter((pad) => views[pad.view]);

  return {
    schema: 2,
    id: str(raw.id),
    display: str(raw.display) || str(raw.id),
    mcu: str(raw.mcu) || null,
    match: {
      targetName: (raw.match?.targetName ?? []).map(str).filter(Boolean),
      boardDesign: (raw.match?.boardDesign ?? []).map(str).filter(Boolean),
    },
    coordinatesSchematic: Boolean(raw.coordinatesSchematic),
    // True for a profile this build synthesised rather than read from
    // the profile file. Set by generic_layout.js, never by a file.
    synthesised: Boolean(raw.synthesised),
    credit: str(raw.credit) || null,
    views,
    headers: (raw.headers ?? []).map(normaliseHeader),
    pads,
    ports: (raw.ports ?? []).map(normalisePort),
    // Kept so callers that read `outline` (BoardCanvas) keep working.
    outline: {
      width: views.top?.width ?? DEFAULT_EXTENT.width,
      height: views.top?.height ?? DEFAULT_EXTENT.height,
      mountHoles: views.top?.mountHoles ?? [],
    },
  };
}

/**
 * Serialises a normalised profile back to the on-disk shape: version 2
 * throughout, with the derived `outline` and per-pad `order` dropped
 * and empty optional fields omitted, so the file stays readable.
 * @param {Object} profile a normalised profile
 * @returns {Object}
 */
export function serialiseProfile(profile) {
  const out = {
    schema: 2,
    id: profile.id,
    match: {
      targetName: profile.match?.targetName ?? [],
      boardDesign: profile.match?.boardDesign ?? [],
    },
    display: profile.display,
    mcu: profile.mcu,
  };
  if (profile.coordinatesSchematic) out.coordinatesSchematic = true;
  if (profile.credit) out.credit = profile.credit;

  out.views = {};
  for (const id of VIEW_IDS) {
    const view = profile.views?.[id];
    if (!view) continue;
    const written = { width: view.width, height: view.height };
    if (view.background) written.background = view.background;
    if (view.backgroundOpacity !== 1)
      written.backgroundOpacity = view.backgroundOpacity;
    if (view.mountHoles?.length) written.mountHoles = view.mountHoles;
    if (view.usb === null) written.usb = null;
    else if (view.usb) written.usb = view.usb;
    out.views[id] = written;
  }

  if (profile.headers?.length) {
    out.headers = profile.headers.map((header) => {
      const written = { id: header.id, view: header.view };
      if (header.label) written.label = header.label;
      for (const key of ["x", "y", "width", "height"]) {
        if (header[key] !== null && header[key] !== undefined) {
          written[key] = round(header[key]);
        }
      }
      return written;
    });
  }

  out.pads = profile.pads.map((pad) => {
    const written = {
      pin: pad.pin,
      silkscreen: pad.silkscreen,
      x: round(pad.x),
      y: round(pad.y),
      view: pad.view,
      side: pad.side,
      group: pad.group,
    };
    if (pad.header) written.header = pad.header;
    if (pad.labelSide !== "auto") written.labelSide = pad.labelSide;
    if (pad.reserved) written.reserved = true;
    return written;
  });

  if (profile.ports?.length) {
    out.ports = profile.ports.map((port) => {
      const written = { id: port.id };
      if (port.identifier !== null) written.identifier = port.identifier;
      if (port.label) written.label = port.label;
      if (port.tx) written.tx = port.tx;
      if (port.rx) written.rx = port.rx;
      if (port.split !== null) written.split = port.split;
      if (port.notes) written.notes = port.notes;
      return written;
    });
  }

  return out;
}

/**
 * Checks a normalised profile for the mistakes that make a drawing
 * wrong rather than merely ugly. The editor shows these; the test
 * suite fails on the errors.
 * @param {Object} profile normalised profile
 * @returns {{level: 'error'|'warning', message: string, pin?: string}[]}
 */
export function validateProfile(profile) {
  const problems = [];
  if (!profile) return [{ level: "error", message: "No profile." }];
  if (!profile.id) problems.push({ level: "error", message: "Missing id." });

  const seen = new Map();
  for (const pad of profile.pads) {
    if (!/^[A-K]\d{2}$/.test(pad.pin)) {
      problems.push({
        level: "error",
        pin: pad.pin,
        message: `Pin "${pad.pin}" is not a port/number pin such as B07.`,
      });
    }
    if (seen.has(pad.pin)) {
      problems.push({
        level: "error",
        pin: pad.pin,
        message: `Pin ${pad.pin} is placed twice (${seen.get(pad.pin)} and ${pad.view}).`,
      });
    } else {
      seen.set(pad.pin, pad.view);
    }
    const view = profile.views[pad.view];
    if (
      view &&
      (pad.x < 0 || pad.y < 0 || pad.x > view.width || pad.y > view.height)
    ) {
      problems.push({
        level: "warning",
        pin: pad.pin,
        message: `Pad ${pad.silkscreen ?? pad.pin} sits outside the ${pad.view} view.`,
      });
    }
    if (pad.header && !profile.headers.some((header) => header.id === pad.header)) {
      problems.push({
        level: "warning",
        pin: pad.pin,
        message: `Pad ${pad.silkscreen ?? pad.pin} names header "${pad.header}", which does not exist.`,
      });
    }
  }

  const identifiers = new Set();
  for (const port of profile.ports) {
    for (const line of PORT_LINES) {
      const pin = port[line];
      if (pin && !seen.has(pin)) {
        problems.push({
          level: "warning",
          pin,
          message: `${port.label ?? port.id} ${line.toUpperCase()} is pin ${pin}, which has no pad.`,
        });
      }
    }
    if (!port.tx && !port.rx) {
      problems.push({
        level: "error",
        message: `${port.label ?? port.id} names neither a TX nor an RX pin.`,
      });
    }
    if (port.identifier !== null) {
      if (identifiers.has(port.identifier)) {
        problems.push({
          level: "error",
          message: `Two ports claim serial identifier ${port.identifier}.`,
        });
      }
      identifiers.add(port.identifier);
    }
  }

  return problems;
}
