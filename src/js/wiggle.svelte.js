import { bit_check, bit_set, bit_clear } from "./serial_backend.js";

export class WiggleFlags {
  static FLAGS = {
    READY: 1,
    ARMED: 2,
    ERROR: 3,
    FATAL: 4,
  };

  bitfield = $state(0);

  constructor() {
    // allow each flag in the bitfield to be accessed as a regular property
    for (const flag of Object.keys(WiggleFlags.FLAGS)) {
      Object.defineProperty(this, flag, {
        get() {
          return this.isEnabled(flag);
        },
        set(v) {
          this.setFlag(flag, v);
        },
      });
    }
  }

  isEnabled(flagName) {
    return bit_check(this.bitfield, WiggleFlags.FLAGS[flagName]);
  }

  setFlag(flagName, enabled) {
    this.bitfield = enabled
      ? bit_set(this.bitfield, WiggleFlags.FLAGS[flagName])
      : bit_clear(this.bitfield, WiggleFlags.FLAGS[flagName]);
  }
}
