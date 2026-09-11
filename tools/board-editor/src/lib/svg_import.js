/**
 * File: tools/board-editor/src/lib/svg_import.js
 * Reads a board drawing exported from CAD.
 *
 * The useful thing a CAD export carries is its real size: a board
 * outline plotted at 1:1 has `width="56mm"`, and taking the view's
 * extent from that means the pads the author then places land in real
 * millimetres rather than in arbitrary drawing units. Where the export
 * has no units the viewBox is used and the author is told to check the
 * scale.
 *
 * Nothing here trusts the file: it is parsed with DOMParser, scripts
 * and event handlers are stripped, and only the cleaned text is ever
 * written back.
 */

/** Multipliers from an SVG length unit to millimetres (96 dpi user units). */
const TO_MM = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
  "": 25.4 / 96,
};

function lengthToMm(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(-?[\d.]+)\s*(mm|cm|in|pt|pc|px|)$/i);
  if (!match) return null;
  const factor = TO_MM[match[2].toLowerCase()];
  return factor === undefined ? null : Number(match[1]) * factor;
}

/**
 * Removes everything a drawing has no business carrying: scripts,
 * event handlers, external references and embedded HTML.
 * @param {SVGElement} svg
 */
function sanitise(svg) {
  for (const node of [...svg.querySelectorAll("script,foreignObject")]) {
    node.remove();
  }
  const walker = [svg, ...svg.querySelectorAll("*")];
  for (const element of walker) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      // A drawing may reference its own defs (#id) but nothing remote.
      else if (
        (name === "href" || name === "xlink:href") &&
        !value.startsWith("#") &&
        !value.startsWith("data:image/")
      ) {
        element.removeAttribute(attribute.name);
      } else if (value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

/**
 * @param {string} text the file's contents
 * @returns {{svg: string, width: ?number, height: ?number, scaled: boolean,
 *           warning: ?string}}
 *   `width`/`height` are millimetres when the file said so. `scaled`
 *   is false when they had to be guessed from the viewBox.
 */
export function readBoardSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") {
    return {
      svg: "",
      width: null,
      height: null,
      scaled: false,
      warning: "That file is not an SVG.",
    };
  }
  if (doc.querySelector("parsererror")) {
    return {
      svg: "",
      width: null,
      height: null,
      scaled: false,
      warning: "The SVG could not be parsed.",
    };
  }

  sanitise(svg);

  const width = lengthToMm(svg.getAttribute("width"));
  const height = lengthToMm(svg.getAttribute("height"));
  if (width && height) {
    return {
      svg: svg.outerHTML,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      scaled: true,
      warning: null,
    };
  }

  const viewBox = (svg.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (viewBox.length === 4) {
    return {
      svg: svg.outerHTML,
      width: Math.round(viewBox[2] * 100) / 100,
      height: Math.round(viewBox[3] * 100) / 100,
      scaled: false,
      warning:
        "This export carries no real-world size, so the view extent was taken " +
        "from its viewBox. Set the board's width and height in millimetres by " +
        "hand, or re-export at 1:1 with millimetre units.",
    };
  }

  return {
    svg: svg.outerHTML,
    width: null,
    height: null,
    scaled: false,
    warning: "The SVG has neither a size nor a viewBox; set the extent by hand.",
  };
}

/**
 * A file name for a board's background, e.g. ("Matek F405", "top") ->
 * "matek-f405-top.svg".
 * @param {string} boardId
 * @param {string} viewId
 * @returns {string}
 */
export function backgroundName(boardId, viewId) {
  const slug = String(boardId ?? "board")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "board"}-${viewId}.svg`;
}
