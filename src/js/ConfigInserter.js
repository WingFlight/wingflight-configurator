export const ConfigInserter = function () {
};

// The external flash for firmware executing in place from it (STM32H730), or
// internal flash. External first: the STM32H730 hex also holds the Wingflight
// loader in internal flash, whose code covers 0x08002800.
const CUSTOM_DEFAULTS_POINTER_ADDRESSES = [0x90002800, 0x08002800];
const BLOCK_SIZE = 16384;

function seek(firmware, address) {
    let index = 0;
    for (; index < firmware.data.length && address >= firmware.data[index].address + firmware.data[index].bytes; index++);

    const result = {
        lineIndex: index
    };

    if (firmware.data[index] && address >= firmware.data[index].address) {
        result.byteIndex = address - firmware.data[index].address;
    }

    return result;
}

function readUint32(firmware, index) {
    let result = 0;
    for (let position = 0; position < 4; position++) {
        result += firmware.data[index.lineIndex].data[index.byteIndex++] << (8 * position);
        if (index.byteIndex >= firmware.data[index.lineIndex].bytes) {
            index.lineIndex++;
            index.byteIndex = 0;
        }
    }

    // Unsigned: the external flash addresses (0x90000000) have the top bit set
    return result >>> 0;
}

// What follows the end address in a firmware whose custom defaults are compiled
// field writes rather than CLI text (the firmware's config/custom_defaults.c):
// a magic word, a format version and the build ID the records must be compiled
// against. A firmware with text custom defaults has nothing there.
const RECORDS_MAGIC = 0x44434657; // "WFCD"
const RECORDS_LOCATOR_OFFSET = 8; // after the start and end addresses
const BUILD_ID_LENGTH = 8;

function readByte(firmware, address) {
    const index = seek(firmware, address);
    return index.byteIndex === undefined ? undefined : firmware.data[index.lineIndex].data[index.byteIndex];
}

/** `count` bytes at `address`, or null if the hex does not cover all of them. */
function readBytes(firmware, address, count) {
    const bytes = [];
    for (let i = 0; i < count; i++) {
        const byte = readByte(firmware, address + i);
        if (byte === undefined) {
            return null;
        }
        bytes.push(byte);
    }
    return bytes;
}

function recordsFormat(firmware, pointerAddress) {
    const locator = readBytes(firmware, pointerAddress + RECORDS_LOCATOR_OFFSET, 8 + BUILD_ID_LENGTH);
    if (!locator) {
        return undefined;
    }
    const magic = (locator[0] | (locator[1] << 8) | (locator[2] << 16) | (locator[3] << 24)) >>> 0;
    if (magic !== RECORDS_MAGIC) {
        return undefined;
    }
    return {
        version: locator[4],
        buildId: locator.slice(8).map((b) => b.toString(16).padStart(2, "0")).join(""),
    };
}

function getCustomDefaultsArea(firmware) {
    const result = {};

    const pointerAddress = CUSTOM_DEFAULTS_POINTER_ADDRESSES.find(
        (address) => seek(firmware, address).byteIndex !== undefined,
    );
    if (pointerAddress === undefined) {
        return;
    }
    const index = seek(firmware, pointerAddress);

    result.startAddress = readUint32(firmware, index);
    result.endAddress = readUint32(firmware, index);
    result.records = recordsFormat(firmware, pointerAddress);

    return result;
}

function generateData(firmware, input, startAddress) {
    let address = startAddress;

    const index = seek(firmware, address);

    if (index.byteIndex !== undefined) {
        throw new Error('Configuration area in firmware not free.');
    }

    // Text is zero-terminated, as the CLI read it; records carry their length.
    const bytes = typeof input === "string"
        ? Array.from({ length: input.length + 1 }, (_, i) => (i < input.length ? input.charCodeAt(i) : 0))
        : [...input];

    let inputIndex = 0;
    while (inputIndex < bytes.length) {
        const remaining = bytes.length - inputIndex;
        const line = {
            address: address,
            bytes: BLOCK_SIZE > remaining ? remaining : BLOCK_SIZE,
            data: []
        };

        if (firmware.data[index.lineIndex] && (line.address + line.bytes) > firmware.data[index.lineIndex].address) {
            throw new Error("Aborting data generation, free area too small.");
        }

        for (let i = 0; i < line.bytes; i++) {
            line.data.push(bytes[inputIndex++]);
        }

        address = address + line.bytes;

        firmware.data.splice(index.lineIndex++, 0, line);
    }

    firmware.bytes_total += bytes.length;
}

const CONFIG_LABEL = `Custom defaults inserted in`;

/**
 * How this firmware takes custom defaults: `null` if it takes none, else
 * `{ size, records }`, where `records` is `{ version, buildId }` for a firmware
 * that takes compiled field writes (see param/flash_config.js) and undefined
 * for one that takes CLI text.
 */
ConfigInserter.prototype.customDefaults = function (firmware) {
    const area = getCustomDefaultsArea(firmware);
    if (!area || area.endAddress - area.startAddress === 0) {
        return null;
    }
    return { size: area.endAddress - area.startAddress, records: area.records };
};

/**
 * Insert custom defaults: CLI text (a string) for a firmware that takes text,
 * compiled records (a Uint8Array) for one that takes records.
 */
ConfigInserter.prototype.insertConfig = function (firmware, input) {
    console.time(CONFIG_LABEL);

    const customDefaultsArea = getCustomDefaultsArea(firmware);

    if (!customDefaultsArea || customDefaultsArea.endAddress - customDefaultsArea.startAddress === 0) {
        return false;
    }
    if ((typeof input === "string") === Boolean(customDefaultsArea.records)) {
        throw new Error(customDefaultsArea.records
            ? "This firmware takes compiled custom defaults, not config text."
            : "This firmware takes custom defaults as config text.");
    }
    const length = typeof input === "string" ? input.length + 1 : input.length;
    if (length > customDefaultsArea.endAddress - customDefaultsArea.startAddress) {
        throw new Error(`Custom defaults area too small (${customDefaultsArea.endAddress - customDefaultsArea.startAddress} bytes), ${length} bytes needed.`);
    }

    generateData(firmware, input, customDefaultsArea.startAddress);

    console.timeEnd(CONFIG_LABEL);

    return true;
};
