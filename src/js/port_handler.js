import * as config from '@/js/config.js';

const TIMEOUT_CHECK = 500 ; // With 250 it seems that it produces a memory leak and slowdown in some versions, reason unknown

export const usbDevices = { filters: [
    {'vendorId': 1155, 'productId': 57105},
    {'vendorId': 10473, 'productId': 393},
] };

export const PortHandler = new function () {
    this.initialPorts = false;
    this.port_detected_callbacks = [];
    this.port_removed_callbacks = [];
    this.dfu_available = false;
    this.showingAllPorts = false;
    this.lastConnectedPort = null;  // Track the last connected port for auto-reconnect
    this.reconnectTimeoutId = null; // Track reconnect timeout to prevent multiple attempts
};

PortHandler.initialize = function (showAllPorts) {
    const portPickerElementSelector = "div#port-picker #port";
    this.portPickerElement = $(portPickerElementSelector);
    this.selectList = document.querySelector(portPickerElementSelector);
    this.initialWidth = this.selectList.offsetWidth + 12;
    this.showingAllPorts = showAllPorts;

    // fill dropdown with version numbers
    generateVirtualApiVersions();

    // start listening, check after TIMEOUT_CHECK ms
    this.check();
};

PortHandler.check = function () {
    const self = this;

    self.check_usb_devices();

    self.check_serial_devices();

    GUI.updateManualPortVisibility();

    setTimeout(function () {
        self.check();
    }, TIMEOUT_CHECK);
};

function portRecognized(portName, pathSelect) {
    if (portName) {
            const isWindows = (GUI.operating_system === 'Windows');
            const isTty = pathSelect.includes('tty');
            const deviceRecognized = portName.includes('STM') || portName.includes('CP210');
            const legacyDeviceRecognized = portName.includes('usb');
            if (isWindows && deviceRecognized || isTty && (deviceRecognized || legacyDeviceRecognized)) {
                return true;
            }
    }
    return false;
}

PortHandler.showAllPorts = function(showAllPorts) {
    if (this.showingAllPorts != showAllPorts) {
        /**
         * trigger an update of the serial devices that specifically updates the port selector and resets the initialPorts simultaneously,
         * so as to not trigger an auto-connect when toggling
         */
        this.initialPorts = false;
        this.showingAllPorts = showAllPorts;
    }
};

PortHandler.check_serial_devices = function () {
    const self = this;

    serial.getDevices(function(currentPorts) {
        if (__BACKEND__ !== "web" && !self.showingAllPorts) {
            currentPorts = currentPorts.filter((p) => portRecognized(p.displayName, p.path));
        }
        // on initialization of the port selector (i.e. app startup or toggling whether to show all ports), only select a detected port, don't auto-connect
        if (!self.initialPorts) {
            currentPorts = self.updatePortSelect(currentPorts);
            self.selectPort(currentPorts);
            self.initialPorts = currentPorts;
        } else {
            self.removePort(currentPorts);
            self.detectPort(currentPorts);
        }
    });
};

PortHandler.check_usb_devices = function (callback) {
    const self = this;

    if (__BACKEND__ === "web") {
        self.check_web_usb_devices(callback);
        return;
    }

    chrome.usb.getDevices(usbDevices, function (result) {

        const dfuElement = self.portPickerElement.children("[value='DFU']");
        if (result?.length) {
            if (!dfuElement.length) {
                self.rebuildPortPickerOptions(result[0].productName ? `DFU - ${result[0].productName}` : "DFU");
            }
            self.dfu_available = true;
        } else {
            if (dfuElement.length) {
               dfuElement.remove();
               self.setPortsInputWidth();
            }
            self.dfu_available = false;
        }
        self.finishUsbDeviceCheck(callback);
    });
};

// WebUSB has no chrome.usb-style declarative permissions: navigator.usb.getDevices()
// only reports devices the user has already granted access to via a prior
// requestDevice() gesture (triggered later, from the Flash button, since that's a
// real click). Unlike the nwjs path above, this never touches the port picker's
// DOM itself -- the "DFU" option is a permanent fixture added by
// updatePortSelect (like "virtual"/"manual") specifically so it can't race
// against check_serial_devices's own rebuilds of the same <select> (which is
// exactly what happened when this used to call a destructive .empty()-based
// rebuild here: whichever check finished last on a given poll wiped out
// whatever the other one had just added, intermittently losing the "Web
// Serial" option entirely). dfu_available itself still reflects real
// detection, since STM32.connect()'s post-reboot fallback logic depends on it
// being accurate.
PortHandler.check_web_usb_devices = async function (callback) {
    const self = this;

    let matched = [];
    if ('usb' in navigator) {
        try {
            const devices = await navigator.usb.getDevices();
            matched = devices.filter((d) =>
                usbDevices.filters.some((f) => f.vendorId === d.vendorId && f.productId === d.productId),
            );
        } catch {
            matched = [];
        }
    }

    self.dfu_available = matched.length > 0;
    self.finishUsbDeviceCheck(callback);
};

PortHandler.rebuildPortPickerOptions = function (dfuText) {
    const self = this;
    self.portPickerElement.empty();

    self.portPickerElement.append($('<option/>', {
        value: "DFU",
        text: dfuText,
        data: {isDFU: true},
        // also expose as a real HTML attribute so non-jQuery consumers
        // (e.g. the Svelte firmware flasher) can read it via .dataset
        'data-is-dfu': 'true',
    }));

    if (import.meta.env.DEV) {
        self.portPickerElement.append($('<option/>', {
           value: 'virtual',
           text: i18n.getMessage('portsSelectVirtual'),
           data: {isVirtual: true},
        }));
    }

    self.portPickerElement.append($('<option/>', {
        value: 'manual',
        text: i18n.getMessage('portsSelectManual'),
        data: {isManual: true},
    }));
    self.portPickerElement.val('DFU').change();
    self.setPortsInputWidth();
};

PortHandler.finishUsbDeviceCheck = function (callback) {
    const self = this;

    if (callback) {
        callback(self.dfu_available);
    }
    if (!$('option:selected', self.portPickerElement).data().isDFU) {
        if (!(GUI.connected_to || GUI.connect_lock)) {
            FC.resetState();
        }
        self.portPickerElement.trigger('change');
    }
};

/**
 * removePort removes ports if they disappear from the port list, and fires the disconnect through the connect button.
 * It will also fire any registered port removal callbacks, then finally update the port selector.
 */
PortHandler.removePort = function(currentPorts) {
    const self = this;
    const removePorts = self.array_difference(self.initialPorts, currentPorts);

    if (removePorts.length) {
        console.log(`PortHandler - Removed: ${JSON.stringify(removePorts)}`);
        // Handle disconnect and state cleanup for removed ports
        if (GUI.connected_to) {
            for (let i = 0; i < removePorts.length; i++) {
                if (removePorts[i].path === GUI.connected_to || removePorts[i] === GUI.connected_to) {
                    // Track the removed port for potential auto-reconnect when it reappears
                    self.lastConnectedPort = GUI.connected_to;
                    console.log(`PortHandler - Device disconnected due to removal: ${self.lastConnectedPort}`);
                    
                    // Attempt to trigger disconnect button click
                    const connectBtn = $('div#header_btns a.connect');
                    if (connectBtn.length) {
                        connectBtn.click();
                    } else {
                        // Fallback: If button click doesn't work (e.g., during reboot), force state cleanup
                        console.warn('PortHandler - Connect button not found, forcing disconnect state cleanup');
                        self._forceDisconnectStateCleanup();
                    }
                }
            }
        }
        // trigger callbacks (only after initialization)
        for (let i = (self.port_removed_callbacks.length - 1); i >= 0; i--) {
            const obj = self.port_removed_callbacks[i];

            // remove timeout
            clearTimeout(obj.timer);

            // trigger callback
            obj.code(removePorts);

            // remove object from array
            const index = self.port_removed_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_removed_callbacks.splice(index, 1);
            }
        }
        for (let i = 0; i < removePorts.length; i++) {
            self.initialPorts.splice(self.initialPorts.indexOf(removePorts[i]), 1);
        }
        self.updatePortSelect(self.initialPorts);
    }
};

// detectPort accepts a port array and attempts to recognize a port and auto-connect to it (if enabled)
PortHandler.detectPort = function(currentPorts) {
    const self = this;
    const newPorts = self.array_difference(currentPorts, self.initialPorts);

    if (newPorts.length) {
        // pick last_used_port for manual tcp auto-connect or detect and select new port for serial
        currentPorts = self.updatePortSelect(currentPorts);
        console.log(`PortHandler - Found: ${JSON.stringify(newPorts)}`);

        const last_used_port = config.get('last_used_port');
        if (last_used_port) {
            if (last_used_port.includes('tcp')) {
                self.portPickerElement.val('manual');
            } else if (newPorts.length === 1) {
                self.portPickerElement.val(newPorts[0].path);
            } else if (newPorts.length > 1) {
                self.selectPort(currentPorts);
            }
        }

        // auto-connect if enabled - improved logic for reconnection after device reboot
        const shouldAutoConnect = GUI.auto_connect && !GUI.connecting_to && !GUI.connected_to && GUI.active_tab !== 'firmware_flasher';
        const isLastConnectedPortReappearing = self.lastConnectedPort && newPorts.some(p => p.path === self.lastConnectedPort);
        
        if (shouldAutoConnect || isLastConnectedPortReappearing) {
            // Clear the tracked port since we're attempting to reconnect
            if (isLastConnectedPortReappearing) {
                console.log(`PortHandler - Previously connected device reappeared, initiating auto-reconnect`);
                // If the specific port reappeared, select it
                const portOption = currentPorts.find(p => p.path === self.lastConnectedPort);
                if (portOption) {
                    self.portPickerElement.val(self.lastConnectedPort);
                }
                self.lastConnectedPort = null;
            }
            
            // start connect procedure with a delay to allow bus to initialize
            if (self.reconnectTimeoutId) {
                clearTimeout(self.reconnectTimeoutId);
            }
            // [IMPROVED] Use longer delay for device reappearance to ensure USB device and port list stabilize
            // Regular auto-connect uses connectionTimeout (~100ms), but reconnection needs more time
            const reconnectDelay = isLastConnectedPortReappearing ? 500 : (config.get('connectionTimeout') ?? 100);
            self.reconnectTimeoutId = GUI.timeout_add('auto-connect_timeout', function () {
                self.reconnectTimeoutId = null;
                $('div#header_btns a.connect').click();
            }, reconnectDelay);
        }
        // trigger callbacks
        for (let i = (self.port_detected_callbacks.length - 1); i >= 0; i--) {
            const obj = self.port_detected_callbacks[i];

            // remove timeout
            clearTimeout(obj.timer);

            // trigger callback
            obj.code(newPorts);

            // remove object from array
            const index = self.port_detected_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_detected_callbacks.splice(index, 1);
            }
        }
        self.initialPorts = currentPorts;
    }
};

PortHandler.sortPorts = function(ports) {
    return ports.sort(function(a, b) {
        return a.path.localeCompare(b.path, window.navigator.language, {
            numeric: true,
            sensitivity: 'base',
        });
    });
};

/**
 * updatePortSelect accepts an array of ports and updates the portPickerElement with the given ports
 */
PortHandler.updatePortSelect = function (ports) {
    ports = this.sortPorts(ports);
    this.portPickerElement.empty();

    for (let i = 0; i < ports.length; i++) {
        let portText;
        if (ports[i].displayName) {
            portText = (`${ports[i].path} - ${ports[i].displayName}`);
        } else {
            portText = ports[i].path;
        }

        this.portPickerElement.append($("<option/>", {
            value: ports[i].path,
            text: portText,
            data: {isManual: false},
        }));
    }

    if (import.meta.env.DEV) {
        this.portPickerElement.append($("<option/>", {
           value: 'virtual',
           text: i18n.getMessage('portsSelectVirtual'),
           data: {isVirtual: true},
        }));
    }

    if (__BACKEND__ !== "web") {
        // Manual entry means typing a raw OS device path or tcp:// address,
        // which only makes sense against chrome.serial/chrome.sockets.tcp --
        // neither exists in a real browser, so this option can't do anything
        // useful (or anything at all) under the web backend.
        this.portPickerElement.append($("<option/>", {
            value: 'manual',
            text: i18n.getMessage('portsSelectManual'),
            data: {isManual: true},
        }));
    }

    if (__BACKEND__ === "web") {
        // Mirrors Betaflight Configurator's device picker: real,
        // already-authorized devices (serial + Bluetooth) are listed above as
        // their own options (populated silently from
        // navigator.serial.getPorts()/navigator.bluetooth.getDevices(), no
        // browser prompt), separated from permanent, explicit "request
        // permission" entries -- selecting one of these immediately calls
        // navigator.serial.requestPort()/navigator.bluetooth.requestDevice()/
        // navigator.usb.requestDevice() (see serial_backend.js's port-picker
        // change handler) and shows the native device chooser. DFU's option
        // stays a single fixed entry (not enumerated per-device) since
        // stm32usbdfu.js's connectWebUsb already resolves to whichever
        // authorized device matches, independent of picker selection.
        this.portPickerElement.append(
            $("<option/>", {
                value: "0",
                text: i18n.getMessage('portsSelectPleaseSelect'),
            }),
        );

        this.portPickerElement.append($("<option/>", {
            value: "requestserial",
            text: i18n.getMessage('portsSelectAddSerialDevice'),
            data: {isRequestSerial: true},
        }));

        if ('bluetooth' in navigator) {
            this.portPickerElement.append($("<option/>", {
                value: "requestbluetooth",
                text: i18n.getMessage('portsSelectAddBluetoothDevice'),
                data: {isRequestBluetooth: true},
            }));
        }

        this.portPickerElement.append($("<option/>", {
            value: "DFU",
            text: i18n.getMessage('portsSelectAddDfuDevice'),
            data: {isDFU: true},
            // also expose as a real HTML attribute so non-jQuery consumers
            // (e.g. the Svelte firmware flasher) can read it via .dataset
            'data-is-dfu': 'true',
        }));
    }

    this.setPortsInputWidth();
    return ports;
};

/**
 * selectPort accepts an array of ports and selects a recognized port if one is found
 */
PortHandler.selectPort = function(ports) {
    for (let i = 0; i < ports.length; i++) {
        const portName = ports[i].displayName;
        if (portName) {
            const pathSelect = ports[i].path;
            if (portRecognized(portName, pathSelect)) {
                this.portPickerElement.val(pathSelect);
                console.log(`Porthandler detected device ${portName} on port: ${pathSelect}`);
            }
        }
    }
};

/**
 * Internal helper: Force disconnect state cleanup when normal disconnect flow fails
 * This is called as a fallback when the connect button click doesn't work during device reboot
 */
PortHandler._forceDisconnectStateCleanup = function() {
    // Directly clear connection state variables
    GUI.connected_to = false;
    GUI.connecting_to = false;
    
    // Reset CONFIGURATOR connection flags
    if (typeof CONFIGURATOR !== 'undefined') {
        CONFIGURATOR.connectionValid = false;
        CONFIGURATOR.cliEngineValid = false;
        CONFIGURATOR.cliEngineActive = false;
    }
    
    // Update UI to reflect disconnected state
    $('div.connect_controls a.connect').removeClass('active');
    $('div.connect_controls div.connect_state').text(i18n.getMessage('connect'));
    $('div#port-picker #port').prop('disabled', false);
    if (!GUI.auto_connect) {
        $('div#port-picker #baud').prop('disabled', false);
    }
    
    console.log('PortHandler - Forced disconnect state cleanup completed');
};

PortHandler.setPortsInputWidth = function() {

    function findMaxLengthOption(selectEl) {
        let max = 0;

        $(selectEl.options).each(function () {
            const textSize = getTextWidth(this.textContent);
            if (textSize > max) {
                max = textSize;
            }
        });

        return max;
    }

    const correction = 24; // account for up/down button and spacing
    let width = findMaxLengthOption(this.selectList) + correction;

    width = (width > this.initialWidth) ? width : this.initialWidth;

    const portsInput = document.querySelector("div#port-picker #portsinput");
    portsInput.style.width = `${width}px`;
};

PortHandler.port_detected = function(name, code, timeout, ignore_timeout) {
    const self = this;
    const obj = {'name': name,
                 'code': code,
                 'timeout': (timeout) ? timeout : 10000,
                };

    if (!ignore_timeout) {
        obj.timer = setTimeout(function() {
            console.log(`PortHandler - timeout - ${obj.name}`);

            // trigger callback
            code(false);

            // remove object from array
            const index = self.port_detected_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_detected_callbacks.splice(index, 1);
            }
        }, (timeout) ? timeout : 10000);
    } else {
        obj.timer = false;
        obj.timeout = false;
    }

    this.port_detected_callbacks.push(obj);

    return obj;
};

PortHandler.port_removed = function (name, code, timeout, ignore_timeout) {
    const self = this;
    const obj = {'name': name,
                 'code': code,
                 'timeout': (timeout) ? timeout : 10000,
                };

    if (!ignore_timeout) {
        obj.timer = setTimeout(function () {
            console.log(`PortHandler - timeout - ${obj.name}`);

            // trigger callback
            code(false);

            // remove object from array
            const index = self.port_removed_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_removed_callbacks.splice(index, 1);
            }
        }, (timeout) ? timeout : 10000);
    } else {
        obj.timer = false;
        obj.timeout = false;
    }

    this.port_removed_callbacks.push(obj);

    return obj;
};

// accepting single level array with "value" as key
PortHandler.array_difference = function (firstArray, secondArray) {
    const cloneArray = [];

    // create hardcopy
    for (let i = 0; i < firstArray.length; i++) {
        cloneArray.push(firstArray[i]);
    }

    for (let i = 0; i < secondArray.length; i++) {
        const elementExists = cloneArray.findIndex(element => element.path === secondArray[i].path);
        if (elementExists !== -1) {
            cloneArray.splice(elementExists, 1);
        }
    }

    return cloneArray;
};

PortHandler.flush_callbacks = function () {
    let killed = 0;

    for (let i = this.port_detected_callbacks.length - 1; i >= 0; i--) {
        if (this.port_detected_callbacks[i].timer) {
            clearTimeout(this.port_detected_callbacks[i].timer);
        }
        this.port_detected_callbacks.splice(i, 1);

        killed++;
    }

    for (let i = this.port_removed_callbacks.length - 1; i >= 0; i--) {
        if (this.port_removed_callbacks[i].timer) {
            clearTimeout(this.port_removed_callbacks[i].timer);
        }
        this.port_removed_callbacks.splice(i, 1);

        killed++;
    }

    return killed;
};
