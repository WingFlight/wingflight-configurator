// The legacy code base leans on a handful of globals that main.js normally
// installs (bit helpers from serial_backend.js, the GUI singleton, i18n).
// Provide the minimum so pure modules can be imported in isolation.
globalThis.bit_check = (num, bit) => (num >> bit) % 2 !== 0;
globalThis.bit_set = (num, bit) => num | (1 << bit);
globalThis.bit_clear = (num, bit) => num & ~(1 << bit);

globalThis.GUI = globalThis.GUI ?? {
  log() {},
  active_tab: null,
  connected_to: false,
};

globalThis.i18n = globalThis.i18n ?? {
  getMessage: (key) => key,
  existsMessage: () => false,
};
