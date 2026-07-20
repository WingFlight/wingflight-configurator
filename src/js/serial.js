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

// Common BLE UART-bridge profiles (serviceUuid + read/write characteristic
// UUIDs), mirroring Betaflight Configurator's device list -- these are the
// GATT services flight-controller Bluetooth/BLE modules typically expose.
const bleDeviceProfiles = [
    {
        name: 'CC2541',
        serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
        writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
        readCharacteristic: '0000ffe2-0000-1000-8000-00805f9b34fb',
    },
    {
        name: 'HC-05',
        serviceUuid: '00001101-0000-1000-8000-00805f9b34fb',
        writeCharacteristic: '00001101-0000-1000-8000-00805f9b34fb',
        readCharacteristic: '00001101-0000-1000-8000-00805f9b34fb',
    },
    {
        name: 'HM-10',
        serviceUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
        writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
        readCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
    },
    {
        name: 'HM-11',
        serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        writeCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
        readCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    },
    {
        name: 'Nordic NRF',
        serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        writeCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
        readCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    },
    {
        name: 'SpeedyBee V1',
        serviceUuid: '00001000-0000-1000-8000-00805f9b34fb',
        writeCharacteristic: '00001001-0000-1000-8000-00805f9b34fb',
        readCharacteristic: '00001002-0000-1000-8000-00805f9b34fb',
    },
    {
        name: 'SpeedyBee V2',
        serviceUuid: '0000abf0-0000-1000-8000-00805f9b34fb',
        writeCharacteristic: '0000abf1-0000-1000-8000-00805f9b34fb',
        readCharacteristic: '0000abf2-0000-1000-8000-00805f9b34fb',
    },
    {
        name: 'DroneBridge',
        serviceUuid: '0000db32-0000-1000-8000-00805f9b34fb',
        writeCharacteristic: '0000db33-0000-1000-8000-00805f9b34fb',
        readCharacteristic: '0000db34-0000-1000-8000-00805f9b34fb',
    },
];

function createBluetoothPortEntry(device) {
    return {
        path: `bluetooth_${device.id}`,
        displayName: device.name || 'Bluetooth device',
        port: device,
    };
}

export const serial = {
    connected:      false,
    connectionId:   false,
    openCanceled:   false,
    bitrate:        0,
    bytesReceived:  0,
    bytesSent:      0,
    failed:         0,
    connectionType: 'serial', // 'serial' or 'tcp' or 'virtual'
    connectionIP:   '127.0.0.1',
    connectionPort: 5761,
    webSerialPort:  false,
    webSerialReader: false,
    webSerialWriter: false,
    webSerialReadableClosed: false,
    webSerialWritableClosed: false,
    webSerialPorts: [],
    bluetoothPorts: [],
    bleDevice: false,
    bleServer: false,
    bleService: false,
    bleDeviceProfile: false,
    bleWriteCharacteristic: false,
    bleReadCharacteristic: false,

    transmitting:   false,
    outputBuffer:   [],

    connect: function (path, options, callback) {
        const self = this;

        // "requestserial"/"requestbluetooth"/"DFU" are the port picker's
        // permission-request trigger options, not real, connectable devices --
        // they're only meant to be acted on by a genuine user selecting them
        // (handled in serial_backend.js's picker change listener). If one of
        // them is still the picker's selected value when connect() is reached
        // from an unattended path (e.g. the auto-reconnect timer), fail
        // quietly rather than risk falling through to a requestDevice()-style
        // fallback that would pop a native browser device chooser with no
        // user interaction at all.
        if (__BACKEND__ === "web" && (path === 'requestserial' || path === 'requestbluetooth' || path === 'DFU')) {
            console.warn(`serial.connect: refusing to auto-connect to reserved picker value "${path}"`);
            callback?.(false);
            return;
        }

        const testUrl = path.match(/^tcp:\/\/([A-Za-z0-9.-]+)(?::(\d+))?$/);
        if (testUrl) {
            self.connectTcp(testUrl[1], testUrl[2], options, callback);
        } else if (path === 'virtual') {
            self.connectVirtual(callback);
        } else if (__BACKEND__ === "web" && path.startsWith('bluetooth_')) {
            self.connectWebBluetooth(path, callback);
        } else {
            self.connectSerial(path, options, callback);
        }
    },
    connectSerial: function (path, options, callback) {
        const self = this;

        if (__BACKEND__ === "web") {
            self.connectWebSerial(path, options, callback);
            return;
        }

        self.connectionType = 'serial';

        chrome.serial.connect(path, options, function (connectionInfo) {
            if (connectionInfo && !self.openCanceled && !checkChromeRuntimeError()) {
                self.connected = true;
                self.connectionId = connectionInfo.connectionId;
                self.bitrate = connectionInfo.bitrate;
                self.bytesReceived = 0;
                self.bytesSent = 0;
                self.failed = 0;

                self.onReceive.addListener(function log_bytesReceived(info) {
                    self.bytesReceived += info.data.byteLength;
                });

                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                    switch (info.error) {
                        case 'system_error': // we might be able to recover from this one
                            if (!self.failed++) {
                                chrome.serial.setPaused(self.connectionId, false, function () {
                                    self.getInfo(function (getInfo) {
                                        if (getInfo) {
                                            if (!getInfo.paused) {
                                                console.log(`${self.connectionType}: connection recovered from last onReceiveError`);
                                                self.failed = 0;
                                            } else {
                                                console.log(`${self.connectionType}: connection did not recover from last onReceiveError, disconnecting`);
                                                GUI.log(i18n.getMessage('serialUnrecoverable'));
                                                self.errorHandler(getInfo.error, 'receive');
                                            }
                                        } else {
                                            checkChromeRuntimeError();
                                        }
                                    });
                                });
                            }
                            break;

                        case 'overrun':
                            // wait 50 ms and attempt recovery
                            self.error = info.error;
                            setTimeout(function() {
                                chrome.serial.setPaused(info.connectionId, false, function() {
                                    self.getInfo(function (_info) {
                                        if (_info) {
                                            if (_info.paused) {
                                                // assume unrecoverable, disconnect
                                                console.log(`${self.connectionType}: connection did not recover from ${self.error} condition, disconnecting`);
                                                GUI.log(i18n.getMessage('serialUnrecoverable'));
                                                self.errorHandler(_info.error, 'receive');
                                            }
                                            else {
                                                console.log(`${self.connectionType}: connection recovered from ${self.error} condition`);
                                            }
                                        }
                                    });
                                });
                            }, 50);
                            break;

                        case 'timeout':
                            // No data has been received for receiveTimeout milliseconds.
                            // We will do nothing.
                            break;

                        case 'frame_error':
                            GUI.log(i18n.getMessage('serialErrorFrameError'));
                            self.errorHandler(info.error, 'receive');
                            break;
                        case 'parity_error':
                            GUI.log(i18n.getMessage('serialErrorParityError'));
                            self.errorHandler(info.error, 'receive');
                            break;
                        case 'break': // This seems to be the error that is thrown under NW.js in Windows when the device reboots after typing 'exit' in CLI
                        case 'disconnected':
                        case 'device_lost':
                        default:
                            self.errorHandler(info.error, 'receive');
                            break;
                    }
                });

                console.log(`${self.connectionType}: connection opened with ID: ${connectionInfo.connectionId} , Baud: ${connectionInfo.bitrate}`);

                if (callback) {
                    callback(connectionInfo);
                }

            } else {

                if (connectionInfo && self.openCanceled) {
                    // connection opened, but this connect sequence was canceled
                    // we will disconnect without triggering any callbacks
                    self.connectionId = connectionInfo.connectionId;
                    console.log(`${self.connectionType}: connection opened with ID: ${connectionInfo.connectionId} , but request was canceled, disconnecting`);

                    // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
                    setTimeout(function initialization() {
                        self.openCanceled = false;
                        self.disconnect(function resetUI() {
                            console.log(`${self.connectionType}: connect sequence was cancelled, disconnecting...`);
                        });
                    }, 150);
                } else if (self.openCanceled) {
                    // connection didn't open and sequence was canceled, so we will do nothing
                    console.log(`${self.connectionType}: connection didn't open and request was canceled`);
                    self.openCanceled = false;
                } else {
                    console.log(`${self.connectionType}: failed to open serial port`);
                }
                if (callback) {
                    callback(false);
                }
            }
        });
    },
    // path is either the stable id of an already-authorized SerialPort (from a
    // prior requestWebSerialPort() grant, listed directly in the port picker
    // by getDevices() below) or the fixed "requestserial" picker-trigger value
    // -- in which case no matching entry exists yet, and requestWebSerialPort()
    // is what actually shows the browser's native device chooser. This mirrors
    // Betaflight's separation between silently reusing a granted device and
    // explicitly requesting a new one, so a device the user already paired
    // never re-prompts on subsequent connects.
    connectWebSerial: async function (path, options, callback) {
        const self = this;

        if (!('serial' in navigator)) {
            console.warn('Web Serial API is not available in this browser');
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
                await self.loadWebSerialPorts();
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

            self.webSerialReadableClosed = self.readWebSerialLoop(port);

            console.log(`${self.connectionType}: web serial connection opened, Baud: ${self.bitrate}`);
            callback?.({ connectionId: self.connectionId, bitrate: self.bitrate });
        } catch (error) {
            console.warn('Web Serial connection failed', error);
            callback?.(false);
        }
    },
    loadWebSerialPorts: async function () {
        const ports = await navigator.serial.getPorts();
        this.webSerialPorts = ports.map(createWebSerialPortEntry);
        return this.webSerialPorts;
    },
    requestWebSerialPort: async function () {
        const userPort = await navigator.serial.requestPort({ filters: webSerialDeviceFilters });
        let entry = this.webSerialPorts.find((p) => p.port === userPort);
        if (!entry) {
            entry = createWebSerialPortEntry(userPort);
            this.webSerialPorts.push(entry);
        }
        return entry;
    },
    // Web Bluetooth has no reliable equivalent of getPorts()/getDevices() on a
    // normal Chrome install -- navigator.bluetooth.getDevices() only returns
    // anything under an experimental "persistent permissions" flag most users
    // won't have enabled, so unlike WebSerial/WebUSB this can't silently
    // rediscover a previously-granted device across a page reload. Feature-
    // detected here so it transparently starts working if/when that lands as
    // a shipped feature; until then bluetoothPorts only grows via
    // requestBluetoothPort() for the lifetime of the page.
    loadBluetoothPorts: async function () {
        if (typeof navigator.bluetooth?.getDevices !== 'function') {
            return this.bluetoothPorts;
        }
        try {
            const devices = await navigator.bluetooth.getDevices();
            this.bluetoothPorts = devices.map(createBluetoothPortEntry);
        } catch (error) {
            console.warn('Failed to load previously-granted Bluetooth devices', error);
        }
        return this.bluetoothPorts;
    },
    requestBluetoothPort: async function () {
        const optionalServices = bleDeviceProfiles.map((profile) => profile.serviceUuid);
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
        let entry = this.bluetoothPorts.find((p) => p.port === device);
        if (!entry) {
            entry = createBluetoothPortEntry(device);
            this.bluetoothPorts.push(entry);
        }
        return entry;
    },
    connectWebBluetooth: async function (path, callback) {
        const self = this;

        if (!('bluetooth' in navigator)) {
            console.warn('Web Bluetooth API is not available in this browser');
            callback?.(false);
            return;
        }

        self.connectionType = 'bluetooth';

        try {
            let entry = self.bluetoothPorts.find((p) => p.path === path);
            if (!entry) {
                // Deliberately not falling back to requestBluetoothPort() here:
                // that shows the browser's native Bluetooth device chooser,
                // which would pop up unattended during auto-reconnect. Fail
                // quietly instead -- pairing a new device is only ever
                // initiated by a genuine user selection of "Add bluetooth
                // device" in the picker.
                console.warn(`WebBluetooth port not found: ${path}`);
                callback?.(false);
                return;
            }

            const device = entry.port;
            device.addEventListener('gattserverdisconnected', self.handleBluetoothDisconnect);

            const server = await device.gatt.connect();
            const services = await server.getPrimaryServices();
            const service = services.find((s) => bleDeviceProfiles.some((p) => p.serviceUuid === s.uuid));
            const deviceProfile = bleDeviceProfiles.find((p) => p.serviceUuid === service?.uuid);

            if (!service || !deviceProfile) {
                throw new Error('No recognized BLE UART service found on this device');
            }

            const characteristics = await service.getCharacteristics();
            const writeCharacteristic = characteristics.find((c) => c.uuid === deviceProfile.writeCharacteristic);
            const readCharacteristic = characteristics.find((c) => c.uuid === deviceProfile.readCharacteristic);

            if (!writeCharacteristic || !readCharacteristic) {
                throw new Error('Expected read/write characteristics not found');
            }

            readCharacteristic.addEventListener('characteristicvaluechanged', self.handleBluetoothNotification);
            await readCharacteristic.startNotifications();

            self.bleDevice = device;
            self.bleServer = server;
            self.bleService = service;
            self.bleDeviceProfile = deviceProfile;
            self.bleWriteCharacteristic = writeCharacteristic;
            self.bleReadCharacteristic = readCharacteristic;

            self.connected = true;
            self.connectionId = entry.path;
            self.bitrate = 115200;
            self.bytesReceived = 0;
            self.bytesSent = 0;
            self.failed = 0;

            console.log(`${self.connectionType}: Bluetooth connection opened with ID: ${self.connectionId} (${deviceProfile.name})`);
            callback?.({ connectionId: self.connectionId, bitrate: self.bitrate });
        } catch (error) {
            console.warn('Web Bluetooth connection failed', error);
            callback?.(false);
        }
    },
    handleBluetoothNotification: function (event) {
        const self = serial;
        const dataView = event.target.value;
        const buffer = dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength);
        self.onReceive.dispatch({ connectionId: self.connectionId, data: buffer });
    },
    handleBluetoothDisconnect: function () {
        const self = serial;
        if (self.connected) {
            console.log(`${self.connectionType}: Bluetooth device disconnected externally`);
            self.disconnect();
        }
    },
    readWebSerialLoop: async function (port) {
        const self = this;

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
    },
    connectTcp: function (ip, port, options, callback) {
        const self = this;
        self.connectionIP = ip;
        self.connectionPort = port || 5761;
        self.connectionPort = parseInt(self.connectionPort);
        self.connectionType = 'tcp';

        chrome.sockets.tcp.create({
            persistent: false,
            name: 'Wingflight',
            bufferSize: 65535,
        }, function(createInfo) {
            if (createInfo && !self.openCanceled || !checkChromeRuntimeError()) {
                self.connectionId = createInfo.socketId;
                self.bitrate = 115200; // fake
                self.bytesReceived = 0;
                self.bytesSent = 0;
                self.failed = 0;

                chrome.sockets.tcp.connect(createInfo.socketId, self.connectionIP, self.connectionPort, function (result) {
                    if (result === 0 || !checkChromeRuntimeError()) {
                        chrome.sockets.tcp.setNoDelay(createInfo.socketId, true, function (noDelayResult) {
                            if (noDelayResult === 0 || !checkChromeRuntimeError()) {
                                self.onReceive.addListener(function log_bytesReceived(info) {
                                    self.bytesReceived += info.data.byteLength;
                                });
                                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                                    if (info.socketId !== self.connectionId) return;

                                    if (self.connectionType === 'tcp' && info.resultCode < 0) {
                                        self.errorHandler(info.resultCode, 'receive');
                                    }
                                });
                                self.connected = true;
                                console.log(`${self.connectionType}: connection opened with ID ${createInfo.socketId} , url: ${self.connectionIP}:${self.connectionPort}`);
                                if (callback) {
                                    callback(createInfo);
                                }
                            }
                        });
                    } else {
                        console.log(`${self.connectionType}: failed to connect with result ${result}`);
                        if (callback) {
                            callback(false);
                        }
                    }
                });
            }
        });
    },
    connectVirtual: function (callback) {
        const self = this;
        self.connectionType = 'virtual';

        if (!self.openCanceled) {
            self.connected = true;
            self.connectionId = 'virtual';
            self.bitrate = 115200;
            self.bytesReceived = 0;
            self.bytesSent = 0;
            self.failed = 0;

            callback?.();
        }
    },
    disconnect: function (callback) {
        const self = this;
        self.connected = false;
        self.emptyOutputBuffer();

        if (self.connectionId) {
            // remove listeners
            for (let i = (self.onReceive.listeners.length - 1); i >= 0; i--) {
                self.onReceive.removeListener(self.onReceive.listeners[i]);
            }

            for (let i = (self.onReceiveError.listeners.length - 1); i >= 0; i--) {
                self.onReceiveError.removeListener(self.onReceiveError.listeners[i]);
            }
            if (__BACKEND__ === "web" && self.webSerialPort) {
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
            } else if (__BACKEND__ === "web" && self.bleDevice) {
                const device = self.bleDevice;
                const readCharacteristic = self.bleReadCharacteristic;

                self.bleDevice = false;
                self.bleServer = false;
                self.bleService = false;
                self.bleDeviceProfile = false;
                self.bleWriteCharacteristic = false;
                self.bleReadCharacteristic = false;

                (async () => {
                    try {
                        device.removeEventListener('gattserverdisconnected', self.handleBluetoothDisconnect);
                        if (readCharacteristic) {
                            readCharacteristic.removeEventListener('characteristicvaluechanged', self.handleBluetoothNotification);
                            if (device.gatt?.connected) {
                                await readCharacteristic.stopNotifications().catch(() => {});
                            }
                        }
                        if (device.gatt?.connected) {
                            device.gatt.disconnect();
                        }
                        console.log(`${self.connectionType}: closed Bluetooth connection, Sent: ${self.bytesSent} bytes, Received: ${self.bytesReceived} bytes`);
                        self.connectionId = false;
                        self.bitrate = 0;
                        callback?.(true);
                    } catch (error) {
                        console.warn('Web Bluetooth disconnect failed', error);
                        callback?.(false);
                    }
                })();
            } else if (self.connectionType !== 'virtual') {
                if (self.connectionType === 'tcp') {
                    chrome.sockets.tcp.disconnect(self.connectionId, function () {
                        checkChromeRuntimeError();
                        console.log(`${self.connectionType}: disconnecting socket.`);
                    });
                }

                const disconnectFn = (self.connectionType === 'serial') ? chrome.serial.disconnect : chrome.sockets.tcp.close;
                disconnectFn(self.connectionId, function (result) {
                    checkChromeRuntimeError();

                    result = result || self.connectionType === 'tcp';
                    console.log(`${self.connectionType}: ${result ? 'closed' : 'failed to close'} connection with ID: ${self.connectionId}, Sent: ${self.bytesSent} bytes, Received: ${self.bytesReceived} bytes`);

                    self.connectionId = false;
                    self.bitrate = 0;

                    if (callback) callback(result);
                });
            } else {
                self.connectionId = false;
                CONFIGURATOR.virtualMode = false;
                self.connectionType = false;
                if (callback) {
                    callback(true);
                }
            }
        } else {
            // connection wasn't opened, so we won't try to close anything
            // instead we will rise canceled flag which will prevent connect from continueing further after being canceled
            self.openCanceled = true;
        }
    },
    getDevices: function (callback) {
        if (__BACKEND__ === "web") {
            const serialPorts = 'serial' in navigator ? this.loadWebSerialPorts() : Promise.resolve([]);
            const bluetoothPorts = 'bluetooth' in navigator ? this.loadBluetoothPorts() : Promise.resolve([]);

            Promise.all([serialPorts, bluetoothPorts])
                .then(([sPorts, btPorts]) =>
                    callback([...sPorts, ...btPorts].map((p) => ({ path: p.path, displayName: p.displayName }))),
                )
                .catch(() => callback([]));
            return;
        }

        chrome.serial.getDevices(function (devices_array) {
            const devices = [];
            devices_array.forEach(function (device) {
                devices.push({
                              path: device.path,
                              displayName: device.displayName,
                             });
            });

            callback(devices);
        });
    },
    getInfo: function (callback) {
        if (__BACKEND__ === "web" && (this.webSerialPort || this.bleDevice)) {
            callback({ connectionId: this.connectionId, bitrate: this.bitrate, paused: false });
            return;
        }

        const chromeType = (this.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
        chromeType.getInfo(this.connectionId, callback);
    },
    send: function (data, callback) {
        const self = this;
        self.outputBuffer.push({'data': data, 'callback': callback});
        function _send() {
            // store inside separate variables in case array gets destroyed
            const _data = self.outputBuffer[0].data;
            const _callback = self.outputBuffer[0].callback;

            if (!self.connected) {
                console.log(`${self.connectionType}: attempting to send when disconnected`);
                if (_callback) {
                    _callback({
                        bytesSent: 0,
                        error: 'undefined',
                    });
                }
                return;
            }

            if (__BACKEND__ === "web" && self.webSerialWriter) {
                self.webSerialWriter.write(new Uint8Array(_data)).then(() => {
                    const bytesSent = _data.byteLength;
                    self.bytesSent += bytesSent;
                    _callback?.({ bytesSent });
                    self.outputBuffer.shift();

                    if (self.outputBuffer.length) {
                        _send();
                    } else {
                        self.transmitting = false;
                    }
                }).catch((error) => {
                    self.errorHandler(error.name || 'undefined', 'send');
                    _callback?.({ bytesSent: 0, error: error.name || 'undefined' });
                });
                return;
            }

            if (__BACKEND__ === "web" && self.bleWriteCharacteristic) {
                // There is no writable stream in the Web Bluetooth API -- each
                // write is its own GATT operation, queued the same way the
                // outputBuffer already serializes chrome.serial/WebSerial sends.
                self.bleWriteCharacteristic.writeValue(new Uint8Array(_data)).then(() => {
                    const bytesSent = _data.byteLength;
                    self.bytesSent += bytesSent;
                    _callback?.({ bytesSent });
                    self.outputBuffer.shift();

                    if (self.outputBuffer.length) {
                        _send();
                    } else {
                        self.transmitting = false;
                    }
                }).catch((error) => {
                    self.errorHandler(error.name || 'undefined', 'send');
                    _callback?.({ bytesSent: 0, error: error.name || 'undefined' });
                });
                return;
            }

            const sendFn = (self.connectionType === 'serial') ? chrome.serial.send : chrome.sockets.tcp.send;
            sendFn(self.connectionId, _data, function (sendInfo) {
                checkChromeRuntimeError();

                if (sendInfo === undefined) {
                    console.log('undefined send error');
                    if (_callback) {
                        _callback({
                            bytesSent: 0,
                            error: 'undefined',
                        });
                    }
                    return;
                }

                if (self.connectionType === 'tcp' && sendInfo.resultCode < 0) {
                    self.errorHandler(sendInfo.resultCode, 'send');
                    return;
                }

                // track sent bytes for statistics
                self.bytesSent += sendInfo.bytesSent;

                // fire callback
                if (_callback) {
                    _callback(sendInfo);
                }

                // remove data for current transmission from the buffer
                self.outputBuffer.shift();

                // if there is any data in the queue fire send immediately, otherwise stop trasmitting
                if (self.outputBuffer.length) {
                    // keep the buffer withing reasonable limits
                    if (self.outputBuffer.length > 100) {
                        let counter = 0;

                        while (self.outputBuffer.length > 100) {
                            self.outputBuffer.pop();
                            counter++;
                        }

                        console.log(`${self.connectionType}: send buffer overflowing, dropped: ${counter} ${entries}`);
                    }

                    _send();
                } else {
                    self.transmitting = false;
                }
            });
        }

        if (!self.transmitting) {
            self.transmitting = true;
            _send();
        }
    },
    onReceive: {
        listeners: [],

        addListener: function (function_reference) {
            if (__BACKEND__ === "web") {
                this.listeners.push(function_reference);
                return;
            }

            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            chromeType.onReceive.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            if (__BACKEND__ === "web") {
                this.listeners = this.listeners.filter((listener) => listener !== function_reference);
                return;
            }

            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            for (let i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chromeType.onReceive.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        },
        dispatch: function (info) {
            this.listeners.forEach((listener) => listener(info));
        },
    },
    onReceiveError: {
        listeners: [],

        addListener: function (function_reference) {
            if (__BACKEND__ === "web") {
                this.listeners.push(function_reference);
                return;
            }

            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            chromeType.onReceiveError.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            if (__BACKEND__ === "web") {
                this.listeners = this.listeners.filter((listener) => listener !== function_reference);
                return;
            }

            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            for (let i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chromeType.onReceiveError.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        },
        dispatch: function (info) {
            this.listeners.forEach((listener) => listener(info));
        },
    },
    emptyOutputBuffer: function () {
        this.outputBuffer = [];
        this.transmitting = false;
    },
    errorHandler: function (result, direction) {
        const self = this;

        self.connected = false;
        FC.CONFIG.armingDisabled = false;

        let message = 'error: UNDEFINED';
        if (self.connectionType === 'tcp') {
            switch (result){
                case -15:
                    // connection is lost, cannot write to it anymore, preventing further disconnect attempts
                    message = 'error: ERR_SOCKET_NOT_CONNECTED';
                    console.log(`${self.connectionType}: ${direction} ${message}: ${result}`);
                    self.connectionId = false;
                    return;
                case -21:
                    message = 'error: NETWORK_CHANGED';
                    break;
                case -100:
                    message = 'error: CONNECTION_CLOSED';
                    break;
                case -102:
                    message = 'error: CONNECTION_REFUSED';
                    break;
                case -105:
                    message = 'error: NAME_NOT_RESOLVED';
                    break;
                case -106:
                    message = 'error: INTERNET_DISCONNECTED';
                    break;
                case -109:
                    message = 'error: ADDRESS_UNREACHABLE';
                    break;
            }
        }
        console.log(`${self.connectionType}: ${direction} ${message}: ${result}`);

        if (GUI.connected_to || GUI.connecting_to) {
            $('a.connect').click();
        } else {
            self.disconnect();
        }
    },
};
