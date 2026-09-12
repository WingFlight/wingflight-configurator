import { describe, expect, it } from "vitest";

import { connectorPinPositions } from "@/js/boardview/connectors.js";
import { buildPortMap } from "@/js/boardview/port_map.js";
import { normaliseProfile, validateProfile } from "@/js/boardview/schema.js";

import example from "../../tools/board-editor/examples/example-three-view.json";

// The worked example is what a profile author copies, and what the
// board editor's "Example" button loads. It is also the only in-tree
// profile that exercises every part of the schema at once, so it is
// where the requirements in tools/board-editor/REQUIREMENTS.md are
// checked end to end.
describe("the board editor's worked example", () => {
  const profile = normaliseProfile(example.boards[0]);
  const serialPorts = profile.ports.map((port) => ({
    identifier: port.identifier,
    functionMask: 1,
  }));
  const portMap = buildPortMap({ profile, serialPorts });

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

  // R1: a connector owns its positions and places them itself.
  it("places a connector's pins at its own pitch, in order", () => {
    // Port A runs down the left edge, the way a peripheral port on
    // one of these boards actually sits.
    const portA = profile.connectors.find((c) => c.id === "port-a");
    expect(portA.rotation).toBe(90);
    const places = connectorPinPositions(portA);
    expect(places).toHaveLength(portA.pins.length);
    for (let i = 1; i < places.length; i += 1) {
      expect(places[i].y - places[i - 1].y).toBeCloseTo(portA.pitch, 5);
      expect(places[i].x).toBeCloseTo(places[0].x, 5);
    }
  });

  // The two new issues: a connector's labels all read to one side, and
  // that side follows the run and which edge the connector is on.
  it("labels each connector to one side, chosen by its run and its edge", () => {
    const sideOf = (id) => {
      const sides = new Set(
        profile.allPads
          .filter((pad) => pad.connector === id)
          .map((pad) => pad.labelSide),
      );
      expect(sides.size, id).toBe(1);
      return [...sides][0];
    };
    // Columns down the left and right edges read outwards.
    expect(sideOf("port-a")).toBe("left");
    expect(sideOf("port-b")).toBe("left");
    expect(sideOf("port-c")).toBe("right");
    // Rows along the top and bottom read above and below.
    expect(sideOf("pwr")).toBe("above");
    expect(sideOf("j1")).toBe("below");
  });

  it("puts every pad on a connector, with no loose pads left over", () => {
    expect(profile.pads).toEqual([]);
    for (const pad of profile.allPads) expect(pad.connector).toBeTruthy();
  });

  // R2: ground and power are first-class positions.
  it("carries ground and power positions, and keeps them out of the pins", () => {
    const nets = profile.allPads.filter((pad) => pad.role === "net");
    expect(nets.length).toBeGreaterThan(5);
    expect(nets.map((pad) => pad.net)).toContain("GND");
    expect(nets.map((pad) => pad.net)).toContain("5V");
    for (const pad of nets) expect(pad.pin).toBeNull();
  });

  it("allows many grounds without calling them a duplicate pin", () => {
    const grounds = profile.allPads.filter((pad) => pad.net === "GND");
    expect(grounds.length).toBeGreaterThan(1);
    expect(validateProfile(profile)).toEqual([]);
  });

  it("colours a ground apart from a power rail", () => {
    const byNet = Object.fromEntries(
      profile.allPads
        .filter((pad) => pad.role === "net")
        .map((pad) => [pad.net, pad.group]),
    );
    expect(byNet.GND).toBe("ground");
    expect(byNet["5V"]).toBe("power");
  });

  // R3: lettered ports that still resolve to the right UART.
  it("letters its ports and still knows which UART each is", () => {
    const portA = portMap.find((port) => port.identifier === 0);
    expect(portA.label).toBe("Port A");
    expect(portA.name).toBe("UART1");
  });

  // R4: a 2.54 mm main pinheader, one signal per position.
  it("has a main pinheader on 2.54 mm", () => {
    const header = profile.connectors.find((c) => c.kind === "header");
    expect(header.pitch).toBeCloseTo(2.54, 5);
    expect(header.pins.length).toBeGreaterThan(8);
    const signals = header.pins.filter((pin) => pin.pin);
    expect(signals.length).toBeGreaterThan(6);
  });

  // R5: the USB socket is placed, not pinned to an edge.
  it("places the USB socket freely", () => {
    const usb = profile.views.top.usb;
    expect(usb).toMatchObject({ width: 9, height: 3.6 });
    expect(usb.x).toBe(24);
    expect(profile.views.left.usb).toBeNull();
  });

  // R6: a receiver soldered on occupies a port nobody can wire.
  it("declares a built-in receiver and marks its port as internal", () => {
    const receiver = profile.receivers[0];
    expect(receiver.protocol).toBe("CRSF");
    expect(receiver.portIdentifier).toBe(5);

    const port = portMap.find((entry) => entry.identifier === 5);
    expect(port.internal).toBe(true);
    expect(port.receiver.protocol).toBe("CRSF");
    // It has no pins, and that is correct rather than a gap.
    expect(port.lines.every((line) => line.pin === null)).toBe(true);
  });

  it("shows exactly one split port, and gets its two halves right", () => {
    const split = portMap.filter((port) => port.split);
    expect(split.map((port) => port.label)).toEqual(["Port D"]);
    expect(split[0].views.sort()).toEqual(["left", "right"]);
    expect(split[0].lines.map((line) => line.pad.view)).toEqual([
      "left",
      "right",
    ]);
  });

  it("draws every port that has pins at all", () => {
    for (const port of portMap) {
      if (port.internal) continue;
      expect(port.drawn, `${port.label} is not drawn`).toBe(true);
    }
  });

  it("names the connector and position each port line comes out on", () => {
    const portA = portMap.find((port) => port.identifier === 0);
    const tx = portA.lines.find((line) => line.role === "tx");
    expect(tx.connector).toBe("port-a");
    expect(tx.position).toBe(3);
  });
});
