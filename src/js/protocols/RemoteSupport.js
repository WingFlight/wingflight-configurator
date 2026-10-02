import * as config from '@/js/config.js';

/*
    Client for the Wingflight remote support tool
    (https://github.com/WingFlight/wingflight-remote-support). The supporter
    runs the tool in "join" mode next to the
    configurator; the tool listens on UDP 127.0.0.1:5763 and tunnels to the
    computer the flight controller is plugged into. This module makes that
    remote computer's serial ports and DFU devices usable like local ones:

    - serial.js connects to ports whose path starts with REMOTE_PORT_PREFIX
      through openSerial()/writeSerial()/closeSerial().
    - stm32usbdfu.js drives remote DFU devices through RemoteUsbDevice, which
      implements the part of the WebUSB USBDevice interface it uses.

    The wire format is described in PROTOCOL.md in the tool's repository. The
    tool encrypts everything it forwards end to end; this local UDP leg is
    plain. Only the nwjs backend has chrome.sockets.udp, so this is inert in
    the web and cordova builds.
*/

export const REMOTE_PORT_PREFIX = 'remote:';

const DEFAULT_UDP_PORT = 5763;
const PROTOCOL_VERSION = 1;
const HELLO_INTERVAL = 1000;
// No STATUS reply for this long means the tool is gone.
const TOOL_TIMEOUT = 3000;
// Longer than the tool's own 10 s USB transfer timeout, so a slow transfer
// reports its real error instead of this one.
const REQUEST_TIMEOUT = 15000;
const SERIAL_WRITE_CHUNK = 8192;

const MSG = {
    HELLO:          0x01,
    STATUS:         0x02,
    LIST_DEVICES:   0x10,
    DEVICE_LIST:    0x11,
    SERIAL_OPEN:    0x20,
    SERIAL_CLOSE:   0x21,
    SERIAL_WRITE:   0x22,
    SERIAL_DATA:    0x23,
    SERIAL_CLOSED:  0x24,
    USB_OPEN:       0x30,
    USB_CLOSE:      0x31,
    USB_CLAIM:      0x32,
    USB_RELEASE:    0x33,
    USB_RESET:      0x34,
    USB_CTRL_IN:    0x35,
    USB_CTRL_OUT:   0x36,
    RESULT:         0x40,
};

const RESULT_OK = 0;
const RESULT_STALL = 1;

const STATUS_HOST_CONNECTED = 0x02;

const REQUEST_TYPES = { standard: 0x00, class: 0x20, vendor: 0x40 };
const RECIPIENTS = { device: 0x00, interface: 0x01, endpoint: 0x02, other: 0x03 };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concat(...parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function header(type, req, extraLength = 0) {
    const bytes = new Uint8Array(5 + extraLength);
    bytes[0] = type;
    new DataView(bytes.buffer).setUint32(1, req, true);
    return bytes;
}

function toBytes(data) {
    if (!data) {
        return new Uint8Array(0);
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return Uint8Array.from(data);
}

function setupBytes(direction, setup) {
    const bytes = new Uint8Array(6);
    const view = new DataView(bytes.buffer);
    bytes[0] = (direction === 'in' ? 0x80 : 0x00) | (REQUEST_TYPES[setup.requestType] ?? 0) | (RECIPIENTS[setup.recipient] ?? 0);
    bytes[1] = setup.request;
    view.setUint16(2, setup.value, true);
    view.setUint16(4, setup.index, true);
    return bytes;
}

function failure(result) {
    return new Error(textDecoder.decode(result.payload) || 'Remote request failed');
}

/**
 * A remote DFU device, shaped like WebUSB's USBDevice as far as
 * stm32usbdfu.js's WebUSB code path uses it.
 */
export class RemoteUsbDevice {
    constructor(client, entry) {
        this.client = client;
        this.id = entry.id;
        this.vendorId = entry.vid;
        this.productId = entry.pid;
        this.productName = entry.product ?? '';
        this.serialNumber = entry.serial ?? '';
        // The tool selects configuration 1 when opening, so there is always
        // one active.
        this.configuration = { configurationValue: 1 };
    }

    async simple(type, extra = new Uint8Array(0)) {
        const result = await this.client.request((req) => concat(header(type, req), extra));
        if (result.status !== RESULT_OK) {
            throw failure(result);
        }
    }

    open() {
        return this.simple(MSG.USB_OPEN, textEncoder.encode(this.id));
    }

    async selectConfiguration() {}

    close() {
        return this.simple(MSG.USB_CLOSE);
    }

    claimInterface(interfaceNumber) {
        return this.simple(MSG.USB_CLAIM, Uint8Array.of(interfaceNumber));
    }

    releaseInterface(interfaceNumber) {
        return this.simple(MSG.USB_RELEASE, Uint8Array.of(interfaceNumber));
    }

    reset() {
        return this.simple(MSG.USB_RESET);
    }

    async controlTransferIn(setup, length) {
        const lengthBytes = new Uint8Array(2);
        new DataView(lengthBytes.buffer).setUint16(0, length, true);
        const result = await this.client.request((req) =>
            concat(header(MSG.USB_CTRL_IN, req), setupBytes('in', setup), lengthBytes),
        );
        if (result.status === RESULT_STALL) {
            return { status: 'stall', data: new DataView(new ArrayBuffer(0)) };
        }
        if (result.status !== RESULT_OK) {
            throw failure(result);
        }
        const data = result.payload.slice();
        return { status: 'ok', data: new DataView(data.buffer) };
    }

    async controlTransferOut(setup, data) {
        const bytes = toBytes(data);
        const result = await this.client.request((req) =>
            concat(header(MSG.USB_CTRL_OUT, req), setupBytes('out', setup), bytes),
        );
        if (result.status === RESULT_STALL) {
            return { status: 'stall', bytesWritten: 0 };
        }
        if (result.status !== RESULT_OK) {
            throw failure(result);
        }
        return { status: 'ok', bytesWritten: bytes.length };
    }
}

class RemoteSupportClient {
    constructor() {
        this.started = false;
        this.socketId = null;
        this.udpPort = DEFAULT_UDP_PORT;
        this.lastStatus = 0;
        this.hostConnected = false;
        this.serialPorts = [];
        this.dfuDevices = [];
        this.pending = new Map();
        this.nextReq = 1;
        // Set by serial.js while a remote port is open.
        this.onSerialData = null;
        this.onSerialClosed = null;
    }

    /** True while the tool is running and connected to a device host. */
    get available() {
        return this.hostConnected && Date.now() - this.lastStatus < TOOL_TIMEOUT;
    }

    start() {
        if (this.started || __BACKEND__ !== 'nwjs' || !globalThis.chrome?.sockets?.udp) {
            return;
        }
        this.started = true;
        this.udpPort = Number(config.get('remoteSupportUdpPort')) || DEFAULT_UDP_PORT;

        const udp = chrome.sockets.udp;
        udp.create({ bufferSize: 65536 }, (createInfo) => {
            if (chrome.runtime.lastError || !createInfo) {
                console.warn('Remote support: could not create UDP socket', chrome.runtime.lastError?.message);
                return;
            }
            this.socketId = createInfo.socketId;
            udp.onReceive.addListener((info) => this.handleReceive(info));
            // A receive error (e.g. ICMP port unreachable while no tool is
            // running) pauses the socket; keep listening.
            udp.onReceiveError.addListener((info) => {
                if (info.socketId === this.socketId) {
                    udp.setPaused(this.socketId, false, () => void chrome.runtime.lastError);
                }
            });
            udp.bind(this.socketId, '127.0.0.1', 0, (result) => {
                if (chrome.runtime.lastError || result < 0) {
                    console.warn('Remote support: could not bind UDP socket', result);
                    return;
                }
                this.sayHello();
                setInterval(() => this.sayHello(), HELLO_INTERVAL);
            });
        });
    }

    send(bytes) {
        if (this.socketId === null) {
            return;
        }
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        chrome.sockets.udp.send(this.socketId, buffer, '127.0.0.1', this.udpPort, () => void chrome.runtime.lastError);
    }

    sayHello() {
        if (this.hostConnected && !this.available) {
            console.log('Remote support: tool stopped answering');
            this.linkDown();
        }
        this.send(Uint8Array.of(MSG.HELLO, PROTOCOL_VERSION));
    }

    linkDown() {
        this.hostConnected = false;
        this.serialPorts = [];
        this.dfuDevices = [];
        for (const { reject, timer } of this.pending.values()) {
            clearTimeout(timer);
            reject(new Error('Remote support connection lost'));
        }
        this.pending.clear();
        this.onSerialClosed?.('Remote support connection lost');
    }

    handleReceive(info) {
        if (info.socketId !== this.socketId || info.remotePort !== this.udpPort) {
            return;
        }
        const data = new Uint8Array(info.data);
        if (!data.length) {
            return;
        }
        const view = new DataView(data.buffer);

        switch (data[0]) {
            case MSG.STATUS: {
                this.lastStatus = Date.now();
                const hostConnected = data.length >= 3 && (data[2] & STATUS_HOST_CONNECTED) !== 0;
                if (hostConnected && !this.hostConnected) {
                    console.log('Remote support: connected to remote device host');
                    this.hostConnected = true;
                    this.refreshDevices().catch(() => {});
                } else if (!hostConnected && this.hostConnected) {
                    console.log('Remote support: remote device host disconnected');
                    this.linkDown();
                }
                break;
            }
            case MSG.DEVICE_LIST: {
                if (data.length < 5) {
                    break;
                }
                const req = view.getUint32(1, true);
                try {
                    const list = JSON.parse(textDecoder.decode(data.subarray(5)));
                    this.serialPorts = list.serial ?? [];
                    this.dfuDevices = list.dfu ?? [];
                } catch (err) {
                    console.warn('Remote support: bad device list', err);
                }
                this.resolve(req, { status: RESULT_OK, payload: new Uint8Array(0) });
                break;
            }
            case MSG.SERIAL_DATA:
                this.onSerialData?.(data.slice(1).buffer);
                break;
            case MSG.SERIAL_CLOSED:
                this.onSerialClosed?.(textDecoder.decode(data.subarray(1)));
                break;
            case MSG.RESULT:
                if (data.length >= 6) {
                    this.resolve(view.getUint32(1, true), { status: data[5], payload: data.subarray(6) });
                }
                break;
        }
    }

    resolve(req, result) {
        const pending = this.pending.get(req);
        if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(req);
            pending.resolve(result);
        }
    }

    /** Sends `build(req)` and resolves with the matching RESULT/DEVICE_LIST. */
    request(build) {
        if (!this.available) {
            return Promise.reject(new Error('Remote support is not connected'));
        }
        const req = this.nextReq;
        this.nextReq = this.nextReq >= 0xffffffff ? 1 : this.nextReq + 1;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(req);
                reject(new Error('Remote support request timed out'));
            }, REQUEST_TIMEOUT);
            this.pending.set(req, { resolve, reject, timer });
            this.send(build(req));
        });
    }

    refreshDevices() {
        return this.request((req) => header(MSG.LIST_DEVICES, req));
    }

    /** Remote serial ports, shaped like serial.getDevices() entries. */
    getSerialPorts() {
        if (!this.available) {
            return [];
        }
        return this.serialPorts.map((port) => ({
            path: REMOTE_PORT_PREFIX + port.path,
            displayName: i18n.getMessage('portsRemoteDevice', [port.displayName]),
        }));
    }

    /** The first remote DFU device matching a chrome.usb-style filter list, or null. */
    findDfuDevice(filters) {
        if (!this.available) {
            return null;
        }
        const entry = this.dfuDevices.find((d) => filters.some((f) => f.vendorId === d.vid && f.productId === d.pid));
        return entry ? new RemoteUsbDevice(this, entry) : null;
    }

    /** `options` are chrome.serial connect options. */
    async openSerial(path, options = {}) {
        const settings = new Uint8Array(7);
        const view = new DataView(settings.buffer);
        view.setUint32(0, options.bitrate || 115200, true);
        settings[4] = { odd: 1, even: 2 }[options.parityBit] ?? 0;
        settings[5] = options.stopBits === 'two' ? 2 : 1;
        settings[6] = options.dataBits === 'seven' ? 7 : 8;
        const result = await this.request((req) => concat(header(MSG.SERIAL_OPEN, req), settings, textEncoder.encode(path)));
        if (result.status !== RESULT_OK) {
            throw failure(result);
        }
    }

    writeSerial(data) {
        // Stay well below the UDP datagram limit, e.g. for a large CLI paste.
        const bytes = toBytes(data);
        for (let offset = 0; offset < bytes.length; offset += SERIAL_WRITE_CHUNK) {
            this.send(concat(Uint8Array.of(MSG.SERIAL_WRITE), bytes.subarray(offset, offset + SERIAL_WRITE_CHUNK)));
        }
    }

    async closeSerial() {
        const result = await this.request((req) => header(MSG.SERIAL_CLOSE, req));
        if (result.status !== RESULT_OK) {
            throw failure(result);
        }
    }
}

export const RemoteSupport = new RemoteSupportClient();
