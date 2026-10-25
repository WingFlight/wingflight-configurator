// Splits a parsed hex (see workers/hex_parser.js) into the part a DFU device
// can write now and the part that has to wait for another DFU device.
//
// The FrSky Aegis Lite (STM32H730) hex holds the Wingflight loader for the
// internal flash (0x08000000) and the firmware for the external flash
// (0x90000000). The ST ROM DFU only exposes the internal flash, so it writes
// the loader, then the loader comes up as its own DFU device that only
// exposes the external flash and writes the firmware.

// Start of the memory mapped external flash firmware executes in place from
export const EXTERNAL_FLASH_BASE = 0x90000000;

export function lowestAddress(hex) {
    return hex.data.reduce((lowest, block) => Math.min(lowest, block.address), Infinity);
}

function subsetHex(hex, blocks) {
    return {
        ...hex,
        data: blocks,
        bytes_total: blocks.reduce((sum, block) => sum + block.bytes, 0),
        start_linear_address: blocks.reduce((lowest, block) => Math.min(lowest, block.address), Infinity),
    };
}

// layout: a parsed DFU memory descriptor ({ start_address, total_size, ... }).
// isExternal: whether the device writes external flash with this layout.
//
// Returns { hex, next, skipped }:
// - hex: what to write with this layout. The input object itself whenever
//   nothing needs splitting, so every other hex behaves as before.
// - next: blocks for the next stage (internal flash device, remaining blocks
//   all in external flash), or null.
// - skipped: blocks an external flash device doesn't expose (e.g. the loader
//   in internal flash), not written in this attempt.
export function planDfuStage(hex, layout, isExternal) {
    const start = layout.start_address;
    const end = layout.start_address + layout.total_size;

    const inside = [];
    const outside = [];
    for (const block of hex.data) {
        (block.address >= start && block.address < end ? inside : outside).push(block);
    }

    if (inside.length === 0 || outside.length === 0) {
        return { hex, next: null, skipped: [] };
    }

    if (isExternal) {
        return { hex: subsetHex(hex, inside), next: null, skipped: outside };
    }

    if (outside.every((block) => block.address >= EXTERNAL_FLASH_BASE)) {
        return { hex: subsetHex(hex, inside), next: subsetHex(hex, outside), skipped: [] };
    }

    return { hex, next: null, skipped: [] };
}
