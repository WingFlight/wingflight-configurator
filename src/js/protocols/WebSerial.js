import { webUsbSerialPolyfill } from './webUsbSerialPolyfill.js';

// navigator.serial is desktop-only; Chrome for Android has WebUSB but not
// Web Serial. On such browsers we fall back to a WebUSB-backed polyfill
// (see webUsbSerialPolyfill.js) that speaks the same SerialPort shape, so
// every function below can stay agnostic of which one actually backs a port.
function getSerialProvider() {
    if ('serial' in navigator) {
        return navigator.serial;
    }
    if ('usb' in navigator) {
        return webUsbSerialPolyfill;
    }
    return null;
}

// Flight-controller-adjacent USB-serial VID/PIDs, mirroring the filter set
// Betaflight Configurator passes to navigator.serial.requestPort() -- without
// filters Chrome's device picker lists every serial port on the system,
// including ones that can never be a flight controller.
// NOTE: the Web Serial API's SerialPortFilter uses usbVendorId/usbProductId
// (not vendorId/productId, which is WebUSB's USBDeviceFilter naming) --
// requestPort() throws "A filter must provide a property to filter by" if a
// filter object has neither.
const webSerialDeviceFilters = [
    { usbVendorId: 1027, usbProductId: 24577 }, // FTDI FT232R USB UART
    { usbVendorId: 1155, usbProductId: 12886 }, // STM32 in HID mode
    { usbVendorId: 1155, usbProductId: 14158 }, // STM Electronics STLink Virtual COM Port (NUCLEO boards)
    { usbVendorId: 1155, usbProductId: 22336 }, // STM Electronics Virtual COM Port
    { usbVendorId: 4292, usbProductId: 60000 }, // Silicon Labs CP210x
    { usbVendorId: 4292, usbProductId: 60001 }, // Silicon Labs CP210x
    { usbVendorId: 4292, usbProductId: 60002 }, // Silicon Labs CP210x
    { usbVendorId: 10473, usbProductId: 394 }, // GD32 VCP
    { usbVendorId: 11836, usbProductId: 22336 }, // AT32 VCP
    { usbVendorId: 12619, usbProductId: 22336 }, // APM32 VCP
    { usbVendorId: 11914, usbProductId: 9 }, // Raspberry Pi Pico VCP
    { usbVendorId: 6790, usbProductId: 29986 }, // CH340 USB-to-Serial (variant)
    { usbVendorId: 6790, usbProductId: 29987 }, // CH340 USB-to-Serial
    { usbVendorId: 6790, usbProductId: 21795 }, // CH341 USB-to-Serial
    { usbVendorId: 6790, usbProductId: 30084 }, // CH340S USB-to-Serial
    { usbVendorId: 14743, usbProductId: 22336 }, // X32 VCP
];

// Names deliberately embed the substrings PortHandler.portRecognized() (in
// port_handler.js) matches on ("STM", "CP210") so auto-select-on-detect keeps
// working the same way it does for the nwjs/chrome.serial device list.
const webSerialVendorNames = {
    1027: 'FTDI',
    1155: 'STM Electronics',
    4292: 'Silicon Labs CP210x',
    6790: 'WCH CH340',
    11836: 'AT32',
    12619: 'Geehy APM32',
    11914: 'Raspberry Pi Pico',
    14743: 'X-CORE LABS',
};

// Stable id per physical SerialPort object. Chrome reuses the same SerialPort
// instance across an MCU-reboot USB re-enumeration, so keying the id off
// object identity (rather than array index) yields an id that survives
// device-list rebuilds -- unlike a bare counter that would reset every poll.
const webSerialPortIds = new WeakMap();
let webSerialNextPortId = 0;

function getStableWebSerialId(port) {
    let id = webSerialPortIds.get(port);
    if (id === undefined) {
        id = `webserial_${webSerialNextPortId++}`;
        webSerialPortIds.set(port, id);
    }
    return id;
}

function createWebSerialPortEntry(port) {
    const info = port.getInfo?.() || {};
    const vendorName = webSerialVendorNames[info.usbVendorId];
    const displayName = vendorName
        ? `${vendorName} (VID:${info.usbVendorId} PID:${info.usbProductId})`
        : 'Web Serial device';
    return {
        path: getStableWebSerialId(port),
        displayName,
        port,
    };
}

export async function loadWebSerialPorts(self) {
    const provider = getSerialProvider();
    const ports = provider ? await provider.getPorts() : [];
    self.webSerialPorts = ports.map(createWebSerialPortEntry);
    return self.webSerialPorts;
}

export async function requestWebSerialPort(self) {
    const provider = getSerialProvider();
    if (!provider) {
        throw new Error('Neither Web Serial nor WebUSB is available in this browser');
    }
    const userPort = await provider.requestPort({ filters: webSerialDeviceFilters });
    let entry = self.webSerialPorts.find((p) => p.port === userPort);
    if (!entry) {
        entry = createWebSerialPortEntry(userPort);
        self.webSerialPorts.push(entry);
    }
    return entry;
}

// path is either the stable id of an already-authorized SerialPort (from
// prior requestWebSerialPort() grant, listed directly in the port picker
// by getDevices() below) or the fixed "requestserial" picker-trigger value
// -- in which case no matching entry exists yet, and requestWebSerialPort()
// is what actually shows the browser's native device chooser. This mirrors
// Betaflight's separation between silently reusing a granted device and
// explicitly requesting a new one, so a device the user already paired
// never re-prompts on subsequent connects.
export async function connectWebSerial(self, path, options, callback) {
    if (!getSerialProvider()) {
        console.warn('Neither Web Serial nor WebUSB is available in this browser');
        callback?.(false);
        return;
    }

    self.connectionType = 'serial';

    try {
        let entry = self.webSerialPorts.find((p) => p.path === path);
        if (!entry) {
            // Cache miss (e.g. reconnecting to a device whose port list
            // hasn't been refreshed since it reappeared) -- refresh from
            // the browser before giving up.
            await loadWebSerialPorts(self);
            entry = self.webSerialPorts.find((p) => p.path === path);
        }

        if (!entry) {
            // Deliberately not falling back to requestWebSerialPort() here:
            // that shows Chrome's native device chooser, which would pop
            // up unattended during auto-reconnect. Fail quietly instead
            // and let the user retry/select manually.
            console.warn(`WebSerial port not found: ${path}`);
            callback?.(false);
            return;
        }

        const port = entry.port;
        await port.open({ baudRate: options?.bitrate || 115200 });

        self.webSerialPort = port;
        self.webSerialWriter = port.writable.getWriter();
        self.connected = true;
        self.connectionId = entry.path;
        self.bitrate = options?.bitrate || 115200;
        self.bytesReceived = 0;
        self.bytesSent = 0;
        self.failed = 0;

        // Web Serial has no "onReceiveError"-style callback of its own --
        // readWebSerialLoop() synthesizes one by dispatching onReceiveError
        // when reader.read() throws (e.g. the device vanishing after a DFU
        // reboot). Without a listener here that error is dropped silently:
        // self.connected stays true and the UI never notices the port died.
        self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
            self.errorHandler(info.error, 'receive');
        });

        self.webSerialReadableClosed = readWebSerialLoop(self, port);

        console.log(`${self.connectionType}: web serial connection opened, Baud: ${self.bitrate}`);
        callback?.({ connectionId: self.connectionId, bitrate: self.bitrate });
    } catch (error) {
        console.warn('Web Serial connection failed', error);
        callback?.(false);
    }
}

export function writeWebSerial(self, data) {
    return self.webSerialWriter.write(new Uint8Array(data)).then(() => data.byteLength);
}

export function disconnectWebSerial(self, callback) {
    const port = self.webSerialPort;
    const reader = self.webSerialReader;
    const writer = self.webSerialWriter;
    const readableClosed = self.webSerialReadableClosed;

    self.webSerialPort = false;
    self.webSerialReader = false;
    self.webSerialWriter = false;

    Promise.resolve()
        .then(() => reader?.cancel())
        .catch(() => {})
        // Wait for readWebSerialLoop's own finally block to actually
        // release the reader lock before closing -- cancel() only
        // unblocks the pending read(), it doesn't itself guarantee
        // the lock is released by the time this chain continues.
        .then(() => readableClosed)
        .catch(() => {})
        .then(() => writer?.releaseLock())
        .then(() => port.close())
        .then(() => {
            console.log(`${self.connectionType}: closed web serial connection, Sent: ${self.bytesSent} bytes, Received: ${self.bytesReceived} bytes`);
            self.connectionId = false;
            self.bitrate = 0;
            callback?.(true);
        })
        .catch((error) => {
            console.warn('Web Serial disconnect failed', error);
            callback?.(false);
        });
}

export async function readWebSerialLoop(self, port) {
    try {
        while (port.readable && self.connected) {
            const reader = port.readable.getReader();
            self.webSerialReader = reader;

            try {
                while (self.connected) {
                    const { value, done } = await reader.read();
                    if (done) {
                        break;
                    }
                    if (value) {
                        self.onReceive.dispatch({
                            connectionId: self.connectionId,
                            data: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
                        });
                    }
                }
            } finally {
                reader.releaseLock();
                self.webSerialReader = false;
            }
        }
    } catch (error) {
        if (self.connected) {
            self.onReceiveError.dispatch({ connectionId: self.connectionId, error: error.name || 'system_error' });
        }
    }
}
