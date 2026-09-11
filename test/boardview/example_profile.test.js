import { describe, expect, it } from "vitest";

import { buildPortMap } from "@/js/boardview/port_map.js";
import { normaliseProfile, validateProfile } from "@/js/boardview/schema.js";

import example from "../../tools/board-editor/examples/example-three-view.json";

// The worked example is what a profile author copies, and what the
// board editor's "Example" button loads, so it has to stay correct.
// It is also the only in-tree profile that exercises three views, a
// background and a split port at once.
describe("the board editor's worked example", () => {
  const profile = normaliseProfile(example.boards[0]);

  it("validates", () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it("has all three views", () => {
    expect(Object.keys(profile.views).sort()).toEqual(["left", "right", "top"]);
  });

  it("points its top view at a background that ships with the app", () => {
    expect(profile.views.top.background).toBe(
      "/images/boards/example-wing-top.svg",
    );
  });

  it("puts every pad on a connector", () => {
    for (const pad of profile.pads) {
      expect(pad.header, `${pad.silkscreen ?? pad.pin} has no header`).toBeTruthy();
    }
  });

  it("names a connector that exists for every pad", () => {
    const ids = new Set(profile.headers.map((header) => header.id));
    for (const pad of profile.pads) expect(ids).toContain(pad.header);
  });

  it("shows exactly one split port, and gets its two halves right", () => {
    const map = buildPortMap({
      profile,
      serialPorts: profile.ports.map((port) => ({
        identifier: port.identifier,
        functionMask: 1,
      })),
    });
    const split = map.filter((port) => port.split);
    expect(split.map((port) => port.label)).toEqual(["UART4"]);
    expect(split[0].views.sort()).toEqual(["left", "right"]);
    expect(split[0].lines.map((line) => line.pad.view)).toEqual([
      "left",
      "right",
    ]);
  });

  it("draws every port it declares", () => {
    const map = buildPortMap({ profile, serialPorts: [] });
    expect(map.every((port) => port.drawn)).toBe(true);
    expect(map).toHaveLength(profile.ports.length);
  });
});
