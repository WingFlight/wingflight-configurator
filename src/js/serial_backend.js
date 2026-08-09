import semver from "semver";

import * as config from "@/js/config.js";
import { portUsage } from "@/js/port_usage.svelte.js";
import { applyVirtualConfig } from "@/js/virtual_fc.js";

// Same getDevices()-first-else-requestDevice() fallback stm32usbdfu.js's
// connectWebUsb uses at flash time, run here purely to grant/refresh WebUSB
// permission the moment DFU is selected -- mirrors Betaflight showing the
// device chooser immediately on selecting its DFU picker option, rather than
// waiting for the user to click Flash. Silent (no popup) if a matching device
// is already authorized, so it's safe to run on every DFU selection.
async function requestWebUsbDeviceFromPicker() {
    if (!('usb' in navigator)) {
        return;
    }

    try {
        const isMatch = (d) => usbDevices.filters.some((f) => d.vendorId === f.vendorId && d.productId === f.productId);
        let device = (await navigator.usb.getDevices()).find(isMatch);
        if (!device) {
            device = await navigator.usb.requestDevice({ filters: usbDevices.filters });
        }
        console.log(`USB DFU device authorized: ${device.productName}`);

        // getDevices() matching an already-authorized device (e.g. from an
        // earlier Flash) resolves silently -- no browser popup at all -- so
        // without this, selecting "DFU" can appear to do nothing. Mirror the
        // nwjs/chrome.usb picker's behavior of relabeling the option with the
        // device name so there's a visible sign the board was actually found.
        GUI.log(i18n.getMessage('usbDeviceOpened', [device.productName || device.serialNumber || 'DFU']));
        $('div#port-picker #port option[value="DFU"]').text(
            device.productName ? `DFU - ${device.productName}` : 'DFU',
        );
    } catch (error) {
        console.warn('WebUSB DFU permission request failed or was cancelled', error);
    }
}

const webPickerCommandValues = ['requestserial', 'requestbluetooth', 'DFU'];

function isWebPickerCommandValue(value) {
    return webPickerCommandValues.includes(String(value));
}

// Mirrors Betaflight resetting its selectedDevice back to "noselection" after
// firing a permission request, success or not -- these options are momentary
// triggers, never a real, sticky selection. Prefer the previously selected
// real port when it still exists; otherwise use the existing "0" no-selection
// sentinel so selecting "Add serial device" again can fire another change.
function firstNonTriggerPortValue(el) {
    const previousValue = el.data('lastNonTriggerValue');
    if (previousValue) {
        const previousOption = el.find('option').filter((_, option) => option.value === previousValue);
        if (previousOption.length && !previousOption.prop('disabled')) {
            return previousValue;
        }
    }

    const firstRealPort = el.find('option').filter((_, option) =>
        option.value !== '0' &&
        !option.disabled &&
        !isWebPickerCommandValue(option.value),
    ).first().val();

    return firstRealPort || '0';
}

function selectFallbackPort(el, fallbackValue) {
    el.val(fallbackValue || '0').trigger('change');
}

function selectRequestedPort(el, ports, entry, cachedPorts, fallbackValue) {
    if (!cachedPorts.some((port) => port.path === entry.path)) {
        cachedPorts.push(entry);
    }

    const updatedPorts = ports.some((port) => port.path === entry.path)
        ? ports
        : [...ports, { path: entry.path, displayName: entry.displayName }];

    PortHandler.updatePortSelect(updatedPorts);
    PortHandler.initialPorts = updatedPorts;
    el.val(entry.path);

    if (el.val() !== entry.path) {
        selectFallbackPort(el, fallbackValue);
        return;
    }

    el.trigger('change');
}

async function requestWebSerialDeviceFromPicker() {
    const el = $('div#port-picker #port');
    const fallbackValue = firstNonTriggerPortValue(el);

    try {
        const entry = await serial.requestWebSerialPort();

        serial.getDevices((ports) => {
            selectRequestedPort(el, ports, entry, serial.webSerialPorts, fallbackValue);
        });
    } catch (error) {
        console.warn('Web Serial permission request failed or was cancelled', error);
        selectFallbackPort(el, fallbackValue);
    }
}

async function requestWebBluetoothDeviceFromPicker() {
    const el = $('div#port-picker #port');
    const fallbackValue = firstNonTriggerPortValue(el);

    try {
        const entry = await serial.requestBluetoothPort();

        serial.getDevices((ports) => {
            selectRequestedPort(el, ports, entry, serial.bluetoothPorts, fallbackValue);
        });
    } catch (error) {
        console.warn('Web Bluetooth permission request failed or was cancelled', error);
        selectFallbackPort(el, fallbackValue);
    }
}

export async function handleConnectClick() {
    if (GUI.connect_lock != true) { // GUI control overrides the user control

        const thisElement = $(this);
        const clicks = thisElement.data('clicks');

        const toggleStatus = function() {
            thisElement.data("clicks", !clicks);
        };

        GUI.configuration_loaded = false;

        const selected_baud = parseInt($('div#port-picker #baud').val());
        const selectedPort = $('div#port-picker #port option:selected');

        let portName;
        if (selectedPort.data().isManual) {
            portName = $('#port-override').val();
        } else {
            portName = String($('div#port-picker #port').val());
        }

        if (selectedPort.data().isDFU) {
            $('#baudselect').hide();
        } else if (portName !== '0') {
            if (!clicks) {
                console.log(`${serial.connectionType}: connecting to: ${portName}`);
                GUI.connecting_to = portName;

                // lock port select & baud while we are connecting / connected
                $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', true);
                $('div.connect_controls div.connect_state').text(i18n.getMessage('connecting'));

                if (selectedPort.data().isVirtual) {
                    CONFIGURATOR.virtualMode = true;
                    CONFIGURATOR.virtualApiVersion = $('#firmware-version-dropdown :selected').val();
                    CONFIGURATOR.virtualFwVersion = $('#firmware-version-dropdown :selected').data('fw');

                    serial.connect('virtual', {}, onOpenVirtual);
                } else {
                    serial.connect(portName, {bitrate: selected_baud}, onOpen);
                }
            } else {
                if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
                    $('div#flashbutton a.flash_state').removeClass('active');
                    $('div#flashbutton a.flash').removeClass('active');
                }
                GUI.timeout_kill_all();
                GUI.interval_kill_all();
                await new Promise((resolve) => GUI.tab_switch_cleanup(resolve));
                GUI.tab_switch_in_progress = false;

                await new Promise((resolve) => globalThis.mspHelper.setArmingEnabled(true, resolve));

                // Wait for the port to actually finish closing before letting the
                // caller (e.g. the firmware flasher tab switch) proceed -- finishClose()
                // used to fire-and-forget serial.disconnect(), so navigating to
                // Firmware Flasher here would mount the tab (and enable Detect)
                // while the previous connection's teardown (cancel reader / release
                // lock / port.close()) was still in flight.
                await finishClose();
            }

            toggleStatus();
        }
   }
}

export function initializeSerialBackend() {
    GUI.updateManualPortVisibility = function(){
        const selected_port = $('div#port-picker #port option:selected');
        if (selected_port.data().isManual) {
            $('#port-override-option').show();
        }
        else {
            $('#port-override-option').hide();
        }
        if (selected_port.data().isVirtual) {
            $('#firmware-virtual-option').show();
        }
        else {
            $('#firmware-virtual-option').hide();
        }
        if (selected_port.data().isDFU) {
            // Hide the whole #baudselect wrapper, not just the <select> --
            // the wrapping .dropdown.dropdown-dark box still renders its own
            // styled border/arrow even with the <select> inside it hidden,
            // which otherwise leaves an empty-looking dropdown box next to
            // Auto-Connect whenever DFU is selected.
            $('#baudselect').hide();
        }
        else {
            $('#baudselect').show();
        }
    };

    GUI.updateManualPortVisibility();

    $('#port-override').on("change", function() {
        config.set({'portOverride': $('#port-override').val()});
    });

    $('#port-override').val(config.get('portOverride'));

    $('div#port-picker #port').off("change.wfPortPicker").on("change.wfPortPicker", function(event) {
        GUI.updateManualPortVisibility();

        // Mirrors Betaflight Configurator: choosing this entry is itself the
        // gesture that shows the browser's native device chooser -- no
        // separate Connect click needed, same as selecting an "I can't
        // find..." option does there.
        //
        // Guarded on event.originalEvent (only set for a real, native change
        // dispatched by the browser from an actual user selection) so that
        // programmatic `.trigger('change')` calls elsewhere -- e.g.
        // PortHandler's periodic USB poll, which re-triggers 'change' on
        // every check to refresh manual-port-visibility state -- never
        // re-open the native device chooser on their own. Without this, if
        // the picker's selection ever lands on "Add serial device" (which
        // happens automatically whenever the authorized-port list is
        // temporarily empty, e.g. right after a connected device reboots),
        // the very next poll's synthetic trigger would pop Chrome's blocking
        // device-selection prompt with no user interaction at all.
        //
        // Namespaced (.wfPortPicker) and pre-unbound with .off() so that if
        // initializeSerialBackend() ever runs more than once for the same
        // page (e.g. a dev-mode HMR update swapping this module without a
        // full reload), we don't end up with two listeners stacked on the
        // same element -- a stale, pre-fix copy left over from an earlier
        // version of this handler would otherwise keep firing forever
        // alongside the current one.
        if (__BACKEND__ === "web" && event.originalEvent) {
            const selectedData = $(this).find(':selected').data();
            if (selectedData.isRequestSerial) {
                requestWebSerialDeviceFromPicker();
            } else if (selectedData.isRequestBluetooth) {
                requestWebBluetoothDeviceFromPicker();
            } else if (selectedData.isDFU) {
                requestWebUsbDeviceFromPicker();
            }
        }

        if (__BACKEND__ === "web" && !isWebPickerCommandValue(this.value) && this.value !== '0') {
            $(this).data('lastNonTriggerValue', this.value);
        }
    });

    $('div.connect_controls a.connect').on("click", function () {
      handleConnectClick.call(this);
    });

    $('div.open_firmware_flasher a.flash').on("click", function() {
        if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
            $('div#flashbutton a.flash_state').removeClass('active');
            $('div#flashbutton a.flash').removeClass('active');
            $('#tabs ul.mode-disconnected .tab_landing a').trigger("click");
        } else {
            $('#tabs ul.mode-disconnected .tab_firmware_flasher a').trigger("click");
            $('div#flashbutton a.flash_state').addClass('active');
            $('div#flashbutton a.flash').addClass('active');
        }
    });

    // auto-connect
    if (config.get('auto_connect') ?? true) {
        // default or enabled by user
        GUI.auto_connect = true;

        $('input.auto_connect').prop('checked', true);
        $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectEnabled'));

        $('select#baud').val(115200).prop('disabled', true);
    } else {
        // disabled by user
        GUI.auto_connect = false;

        $('input.auto_connect').prop('checked', false);
        $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectDisabled'));
    }

    // bind UI hook to auto-connect checkbos
    $('input.auto_connect').change(function () {
        GUI.auto_connect = $(this).is(':checked');

        // update title/tooltip
        if (GUI.auto_connect) {
            $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectEnabled'));

            $('select#baud').val(115200).prop('disabled', true);
        } else {
            $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectDisabled'));

            if (!GUI.connected_to && !GUI.connecting_to) $('select#baud').prop('disabled', false);
        }

        config.set({'auto_connect': GUI.auto_connect});
    });

    // Show all ports
    if (GUI.operating_system === 'Android' || __BACKEND__ === "web") {
        // Port filtering does not work on Android as port names do not get
        // populated there; on the web backend PortHandler.check_serial_devices
        // already skips the recognized-name filter entirely (every
        // already-authorized WebSerial device is real and explicitly
        // user-granted, so there's nothing to filter down from), making this
        // toggle a no-op.
        GUI.show_all_ports = true;
        $('div #show-all-ports-switch').hide();
    } else {
        if (!config.get('show_all_ports')) {
            GUI.show_all_ports = false;
            $('input.show_all_ports, span.show_all_ports').prop('title', i18n.getMessage('showAllPortsDisabled'));
            $('input.show_all_ports').prop('checked', false);
        } else {
            GUI.show_all_ports = true;
            $('input.show_all_ports, span.show_all_ports').prop('title', i18n.getMessage('showAllPortsEnabled'));
            $('input.show_all_ports').prop('checked', true);
        }

        // bind UI hook to show all ports checkbox
        $('input.show_all_ports').on("change", function () {
            GUI.show_all_ports = $(this).is(':checked');

            // update title/tooltip
            if (GUI.show_all_ports) {
                $('input.show_all_ports, span.show_all_ports').prop('title', i18n.getMessage('showAllPortsEnabled'));
            } else {
                $('input.show_all_ports, span.show_all_ports').prop('title', i18n.getMessage('showAllPortsDisabled'));
            }

            config.set({ 'show_all_ports': GUI.show_all_ports });
            PortHandler.showAllPorts(GUI.show_all_ports);
        });
    }

    PortHandler.initialize(GUI.show_all_ports);
}

function finishClose() {
    if (GUI.isCordova()) {
        UI_PHONES.reset();
    }

    const wasConnected = CONFIGURATOR.connectionValid;

    // close reset to custom defaults dialog
    $('#dialogResetToCustomDefaults')[0].close();

    // Resolves once the port has actually finished closing (not just once the
    // GUI-visible state below has been reset), so callers that need the port
    // truly free again -- e.g. handleConnectClick()'s disconnect branch -- can
    // await it instead of racing the real teardown.
    const disconnected = new Promise((resolve) => {
        serial.disconnect((result) => {
            onClosed(result);
            resolve();
        });
    });

    MSP.disconnect_cleanup();
    portUsage.reset();
    // To trigger the UI updates by Vue reset the state.
    FC.resetState();

    GUI.reboot_in_progress = false;
    GUI.connected_to = false;
    GUI.connecting_to = false;  // Ensure connecting_to is also cleared for auto-reconnect to work
    GUI.allowedTabs = GUI.defaultAllowedTabsWhenDisconnected.slice();

    // close problems dialog
    $('#dialogReportProblems-closebtn').trigger("click");

    // unlock port select & baud
    $('div#port-picker #port').prop('disabled', false);
    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

    // reset connect / disconnect button
    $('div.connect_controls a.connect').removeClass('active');
    $('div.connect_controls div.connect_state').text(i18n.getMessage('connect'));

    // reset active sensor indicators
    sensor_status(0);

    if (wasConnected) {
        // detach listeners and remove element data
        $('#content').empty();
    }

    $('#tabs .tab_landing a').trigger("click");

    return disconnected;
}

function setConnectionTimeout() {
    // After 10 seconds with no IDENT data, the FC either isn't speaking MSP
    // at all or is already sitting in a CLI shell -- fall back to CLI mode
    // the same way an explicitly unsupported/invalid firmware version does,
    // rather than just disconnecting with a log message nobody sees.
    GUI.timeout_add('connecting', function () {
        if (!CONFIGURATOR.connectionValid) {
            showConnectWarningDialogAndConnectCli('noConfigurationReceived');
        }
    }, 10000);
}

function resetConnectionTimeout() {
    GUI.timeout_remove('connecting');
}

async function onOpen(openInfo) {
    if (openInfo) {
        CONFIGURATOR.virtualMode = false;

        // update connected_to
        GUI.connected_to = GUI.connecting_to;

        // reset connecting_to
        GUI.connecting_to = false;
        
        // Clear port tracking since we've successfully reconnected
        if (typeof PortHandler !== 'undefined' && PortHandler.lastConnectedPort) {
            PortHandler.lastConnectedPort = null;
        }
        
        GUI.log(i18n.getMessage('serialPortOpened', serial.connectionType === 'serial' ? [serial.connectionId] : [openInfo.socketId]));

        // save selected port if the port differs
        config.set({'last_used_port': GUI.connected_to});

        serial.onReceive.addListener(read_serial);
        setConnectionTimeout();
        FC.resetState();

        globalThis.mspHelper = new MspHelper();
        MSP.listen(globalThis.mspHelper.process_data.bind(globalThis.mspHelper));
        console.log(`Requesting configuration data`);

        // Gather version data and validate to ensure compatibility
        try {
            await MSP.promise(MSPCodes.MSP_API_VERSION, false);
            const { API_VERSION_MIN_SUPPORTED, API_VERSION_MAX_SUPPORTED } = CONFIGURATOR;
            const { apiVersion } = FC.CONFIG;

            GUI.log(i18n.getMessage('apiVersionReceived', [apiVersion]));

            if (!semver.valid(apiVersion)) {
                throw showConnectWarningDialogAndDisconnect('apiVersionInvalid', apiVersion);
            } else if (!semver.gte(apiVersion, API_VERSION_MIN_SUPPORTED) || !semver.lte(apiVersion, API_VERSION_MAX_SUPPORTED)) {
                throw showConnectWarningDialogAndConnectCli('firmwareVersionNotSupported');
            }
            await MSP.promise(MSPCodes.MSP_FC_VARIANT, false);

            const { flightControllerIdentifier } = FC.CONFIG;
            if (flightControllerIdentifier !== 'WGFL') {
                throw showConnectWarningDialogAndConnectCli('firmwareTypeNotSupported');
            }
            await MSP.promise(MSPCodes.MSP_FC_VERSION, false);

            await MSP.promise(MSPCodes.MSP_BUILD_INFO, false);
            const { FW_VERSION_MIN_SUPPORTED, FW_VERSION_MAX_SUPPORTED } = CONFIGURATOR;
            const { buildVersion, buildRevision, buildInfo } = FC.CONFIG;

            GUI.log(i18n.getMessage('firmwareInfoReceived', [flightControllerIdentifier, buildVersion]));
            GUI.log(i18n.getMessage('buildInfoReceived', [buildRevision, buildInfo]));
            if (!semver.valid(buildVersion)) {
                throw showConnectWarningDialogAndDisconnect('firmwareVersionInvalid', buildVersion);
            } else if (!semver.gte(buildVersion, FW_VERSION_MIN_SUPPORTED) || !semver.lte(buildVersion, FW_VERSION_MAX_SUPPORTED)) {
                throw showConnectWarningDialogAndConnectCli('firmwareVersionNotSupported');
            }

            await MSP.promise(MSPCodes.MSP_BOARD_INFO, false);
            processBoardInfo();
        } catch (error) {
            console.error("Error during connection:", error);
            GUI.log(error);
        }
    }
    else {
        GUI.log(i18n.getMessage('serialPortOpenFail'));
        console.log('Failed to open serial port');
        abortConnect();
    }
}

function showConnectWarningDialogAndConnectCli(messageKey, ...params) {
    const msg = showConnectWarningDialog(messageKey, params);
    connectCli();
    return msg;
}

function showConnectWarningDialogAndDisconnect(messageKey, ...params) {
    const msg = showConnectWarningDialog(messageKey, params);
    $('div.connect_controls a.connect').trigger("click"); // trigger disconnect
    return msg;
}

function showConnectWarningDialog(messageKey, ...params) {
    const msg = i18n.getMessage(messageKey, params);
    const dialog = $('.dialogConnectWarning')[0];
    $('.dialogConnectWarning-content').html(msg);
    $('.dialogConnectWarning-closebtn').on("click", function() { dialog.close(); });
    dialog.showModal();
    return msg;
}

function onOpenVirtual() {
    GUI.connected_to = GUI.connecting_to;
    GUI.connecting_to = false;

    // Clear port tracking since we've successfully reconnected
    if (typeof PortHandler !== 'undefined' && PortHandler.lastConnectedPort) {
        PortHandler.lastConnectedPort = null;
    }

    CONFIGURATOR.connectionValid = true;

    globalThis.mspHelper = new MspHelper();

    applyVirtualConfig();

    processBoardInfo();

    update_dataflash_global();
    sensor_status(FC.CONFIG.activeSensors);
    updateTabList(FC.FEATURE_CONFIG.features);
}

function abortConnect() {
    $('div#connectbutton div.connect_state').text(i18n.getMessage('connect'));
    $('div#connectbutton a.connect').removeClass('active');

    // unlock port select & baud
    $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', false);

    // reset data
    $('div#connectbutton a.connect').data("clicks", false);
}

function processBoardInfo() {
    GUI.log(i18n.getMessage('boardInfoReceived', [FC.getHardwareName(), FC.CONFIG.boardVersion]));

    if (FC.CONFIG.configurationState == FC.CONFIGURATION_STATES.DEFAULTS_BARE &&
        bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_CUSTOM_DEFAULTS) &&
        bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.HAS_CUSTOM_DEFAULTS)) {
        const dialog = $('#dialogResetToCustomDefaults')[0];

        $('#dialogResetToCustomDefaults-acceptbtn').off("click").on("click", async () => {
            $('#dialogResetToCustomDefaults-acceptbtn').off("click");
            $('#dialogResetToCustomDefaults-cancelbtn').off("click");
            dialog.close();
            await MSP.promise(MSPCodes.MSP_RESET_CONF, [globalThis.mspHelper.RESET_TYPES.CUSTOM_DEFAULTS]);
            GUI.timeout_add('disconnect', function () {
                $('div.connect_controls a.connect').trigger("click");
            }, 0);
        });

        $('#dialogResetToCustomDefaults-cancelbtn').off("click").on("click", () => {
            $('#dialogResetToCustomDefaults-acceptbtn').off("click");
            $('#dialogResetToCustomDefaults-cancelbtn').off("click");
            dialog.close();
            setConnectionTimeout();
            checkReportProblems();
        });
        resetConnectionTimeout();
        dialog.showModal();
        return;
    }
    checkReportProblems();
}

async function checkReportProblems() {
    const problemItemTemplate = $('#dialogReportProblems-listItemTemplate');

    function checkReportProblem(problemName, problemDialogList) {
        if (bit_check(FC.CONFIG.configurationProblems, FC.CONFIGURATION_PROBLEM_FLAGS[problemName])) {
            problemItemTemplate.clone().html(i18n.getMessage(`reportProblemsDialog${problemName}`)).appendTo(problemDialogList);
            return true;
        }
        return false;
    }

    await MSP.promise(MSPCodes.MSP_STATUS, false);

    let needsProblemReportingDialog = false;
    const problemDialogList = $('#dialogReportProblems-list');
    problemDialogList.empty();

    if (semver.gt(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MAX_SUPPORTED)) {
        const problemName = 'API_VERSION_MAX_SUPPORTED';
        problemItemTemplate.clone().html(i18n.getMessage(`reportProblemsDialog${problemName}`,
            [CONFIGURATOR.latestVersion, CONFIGURATOR.latestVersionReleaseUrl, CONFIGURATOR.version, FC.CONFIG.buildVersion])).appendTo(problemDialogList);
        needsProblemReportingDialog = true;
    }

    if (FC.CONFIG.configurationState == FC.CONFIGURATION_STATES.DEFAULTS_BARE &&
        bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_CUSTOM_DEFAULTS) &&
        !bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.HAS_CUSTOM_DEFAULTS)) {
        const problemName = 'UNIFIED_FIRMWARE_WITHOUT_DEFAULTS';
        problemItemTemplate.clone().html(i18n.getMessage(`reportProblemsDialog${problemName}`)).appendTo(problemDialogList);
        needsProblemReportingDialog = true;
    }

    //needsProblemReportingDialog = checkReportProblem('MOTOR_PROTOCOL_DISABLED', problemDialogList) || needsProblemReportingDialog;

    if (have_sensor(FC.CONFIG.activeSensors, 'acc')) {
        needsProblemReportingDialog = checkReportProblem('ACC_NEEDS_CALIBRATION', problemDialogList) || needsProblemReportingDialog;
    }

    if (needsProblemReportingDialog) {
        const problemDialog = $('#dialogReportProblems')[0];
        $('#dialogReportProblems-closebtn').off("click").on("click", () => {
            $('#dialogReportProblems-closebtn').off("click");
            problemDialog.close();
        });
        problemDialog.showModal();
        $('#dialogReportProblems').scrollTop(0);
        $('#dialogReportProblems-closebtn').trigger("focus");
    }

    await processUid();
    await processName();
    await setRtc();
    finishOpen();
}

async function processUid() {
    await MSP.promise(MSPCodes.MSP_UID, false);

    const UID = FC.CONFIG.uid[0].toString(16) + FC.CONFIG.uid[1].toString(16) + FC.CONFIG.uid[2].toString(16);
    GUI.log(i18n.getMessage('uniqueDeviceIdReceived', [UID]));
}

async function processName() {
    await MSP.promise(MSPCodes.MSP_NAME, false);
    GUI.log(i18n.getMessage('craftNameReceived', [FC.CONFIG.name]));
}

async function setRtc() {
    await MSP.promise(MSPCodes.MSP_SET_RTC, globalThis.mspHelper.crunch(MSPCodes.MSP_SET_RTC));
    GUI.log(i18n.getMessage('realTimeClockSet'));
}

function finishOpen() {
    CONFIGURATOR.connectionValid = true;
    GUI.reboot_in_progress = false;
    GUI.allowedTabs = GUI.defaultAllowedFCTabsWhenConnected.slice();

    if (GUI.isCordova()) {
        UI_PHONES.reset();
    }

    onConnect();

    GUI.selectDefaultTabWhenConnected();
}

function connectCli() {
    CONFIGURATOR.connectionValid = true; // making it possible to open the CLI tab
    GUI.allowedTabs = ['cli'];
    onConnect();
    $('#tabs .tab_cli a').trigger("click");
}

async function onConnect() {
    console.log("On connnection");
    if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
        $('div#flashbutton a.flash_state').removeClass('active');
        $('div#flashbutton a.flash').removeClass('active');
    }
    resetConnectionTimeout();
    $('div#connectbutton div.connect_state').text(i18n.getMessage('disconnect')).addClass('active');
    $('div#connectbutton a.connect').addClass('active');

    $('#tabs ul.mode-disconnected').hide();
    $('#tabs ul.mode-connected-cli').show();

    // show only appropriate tabs
    $('#tabs ul.mode-connected li:not(.tab-group-header)').hide();
    $('#tabs ul.mode-connected li:not(.tab-group-header)').filter(function () {
        const classes = $(this).attr("class").split(/\s+/);
        let found = false;
        $.each(GUI.allowedTabs, (_index, value) => {
                const tabName = `tab_${value}`;
                if ($.inArray(tabName, classes) >= 0) {
                    found = true;
                }
            });

        return found;
    }).show();

    if (FC.CONFIG.flightControllerVersion !== '') {
        FC.BEEPER_CONFIG.beepers = new Beepers(FC.CONFIG);
        FC.BEEPER_CONFIG.dshotBeaconConditions = new Beepers(FC.CONFIG, [ "RX_LOST", "RX_SET" ]);

        $('#tabs ul.mode-connected').show();

        await new Promise((resolve) => setTimeout(resolve, 100));
        await MSP.promise(MSPCodes.MSP_BOXNAMES, false);
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG, false);
        await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG, false);
        await MSP.promise(MSPCodes.MSP_STATUS, false);
        await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY, false);
        // Needed early (not just lazily per-tab) so the FBUS Sensors diagnostic
        // tab's visibility -- gated on an FBUS_OUT/SPORT_MASTER port -- is
        // correct as soon as the tab list is shown.
        await MSP.promise(MSPCodes.MSP_SERIAL_CONFIG, false);

        if (FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2) {
            startLiveDataRefreshTimer();
        }
    }

    const sensorState = $('#sensor-status');
    sensorState.show();

    const portPicker = $('#portsinput');
    portPicker.hide();

    const dataflash = $('#dataflash_wrapper_global');
    dataflash.show();
}

function onClosed(result) {
    if (result) { // All went as expected
        GUI.log(i18n.getMessage('serialPortClosedOk'));
    } else { // Something went wrong
        GUI.log(i18n.getMessage('serialPortClosedFail'));
    }

    $('#tabs ul.mode-connected').hide();
    $('#tabs ul.mode-connected-cli').hide();
    $('#tabs ul.mode-disconnected').show();

    const sensorState = $('#sensor-status');
    sensorState.hide();

    const portPicker = $('#portsinput');
    portPicker.show();

    const dataflash = $('#dataflash_wrapper_global');
    dataflash.hide();

    const battery = $('#quad-status_wrapper');
    battery.hide();

    MSP.clearListeners();

    CONFIGURATOR.connectionValid = false;
    CONFIGURATOR.cliEngineValid = false;
    CONFIGURATOR.cliEngineActive = false;
    CONFIGURATOR.cliTab = "";
}

export function read_serial(info) {
    if (!CONFIGURATOR.cliEngineActive) {
        MSP.read(info);
    } else {
        switch(CONFIGURATOR.cliTab) {
            case 'cli':
                TABS.cli.read(info);
                break;
            case 'presets':
                TABS.presets.read(info);
                break;
        }
    }
}

export function sensor_status(sensors_detected) {
    // initialize variable (if it wasn't)
    if (!sensor_status.previous_sensors_detected) {
        sensor_status.previous_sensors_detected = -1; // Otherwise first iteration will not be run if sensors_detected == 0
    }

    // update UI (if necessary)
    if (sensor_status.previous_sensors_detected == sensors_detected) {
        return;
    }

    // set current value
    sensor_status.previous_sensors_detected = sensors_detected;

    const eSensorStatus = $('div#sensor-status');

    if (have_sensor(sensors_detected, 'acc')) {
        $('.accel', eSensorStatus).addClass('on');
        $('.accicon', eSensorStatus).addClass('active');

    } else {
        $('.accel', eSensorStatus).removeClass('on');
        $('.accicon', eSensorStatus).removeClass('active');
    }

    if ((FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2) && have_sensor(sensors_detected, 'gyro')) {
        $('.gyro', eSensorStatus).addClass('on');
        $('.gyroicon', eSensorStatus).addClass('active');
    } else {
        $('.gyro', eSensorStatus).removeClass('on');
        $('.gyroicon', eSensorStatus).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'baro')) {
        $('.baro', eSensorStatus).addClass('on');
        $('.baroicon', eSensorStatus).addClass('active');
    } else {
        $('.baro', eSensorStatus).removeClass('on');
        $('.baroicon', eSensorStatus).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'mag')) {
        $('.mag', eSensorStatus).addClass('on');
        $('.magicon', eSensorStatus).addClass('active');
    } else {
        $('.mag', eSensorStatus).removeClass('on');
        $('.magicon', eSensorStatus).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'gps')) {
        $('.gps', eSensorStatus).addClass('on');
    $('.gpsicon', eSensorStatus).addClass('active');
    } else {
        $('.gps', eSensorStatus).removeClass('on');
        $('.gpsicon', eSensorStatus).removeClass('active');
    }
}

export function have_sensor(sensors_detected, sensor_code) {
    switch(sensor_code) {
        case 'acc':
            return bit_check(sensors_detected, 0);
        case 'baro':
            return bit_check(sensors_detected, 1);
        case 'mag':
            return bit_check(sensors_detected, 2);
        case 'gps':
            return bit_check(sensors_detected, 3);
        case 'sonar':
            return bit_check(sensors_detected, 4);
        case 'gyro':
            return bit_check(sensors_detected, 5);
    }
    return false;
}

function startLiveDataRefreshTimer() {
    // live data refresh
    GUI.timeout_add('data_refresh', function () { update_live_status(); }, 100);
}

function update_live_status() {

    const statuswrapper = $('#quad-status_wrapper');

    $(".quad-status-contents").css({
       display: 'inline-block'
    });

    if (GUI.active_tab != 'cli' && GUI.active_tab != 'presets') {
        MSP.promise(MSPCodes.MSP_BATTERY_STATE, false);
    }

    for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
        if (FC.AUX_CONFIG[i] === 'ARM') {
            if (bit_check(FC.CONFIG.mode, i)) {
                $(".armedicon").addClass('active');
            } else {
                $(".armedicon").removeClass('active');
            }
        }
        if (FC.AUX_CONFIG[i] === 'FAILSAFE') {
            if (bit_check(FC.CONFIG.mode, i)) {
                $(".failsafeicon").addClass('active');
            } else {
                $(".failsafeicon").removeClass('active');
            }
        }
    }

    const cells = FC.BATTERY_STATE.cellCount;
    const min = FC.BATTERY_CONFIG.vbatmincellvoltage * cells;
    const max = FC.BATTERY_CONFIG.vbatmaxcellvoltage * cells;
    const warn = FC.BATTERY_CONFIG.vbatwarningcellvoltage * cells;

    const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8;

    if (FC.BATTERY_STATE.voltage < NO_BATTERY_VOLTAGE_MAXIMUM) {
        $(".battery-status").removeClass('state-empty').addClass('state-ok').removeClass('state-warning');
        $(".battery-status").css({ width: "0%", });
    }
    else if (FC.BATTERY_STATE.voltage < min) {
        $(".battery-status").addClass('state-empty').removeClass('state-ok').removeClass('state-warning');
        $(".battery-status").css({ width: "100%", });
    } else {
        $(".battery-status").css({ width: `${((FC.BATTERY_STATE.voltage - min) / (max - min) * 100)}%`, });
        if (FC.BATTERY_STATE.voltage < warn) {
            $(".battery-status").addClass('state-warning').removeClass('state-empty').removeClass('state-ok');
        } else  {
            $(".battery-status").addClass('state-ok').removeClass('state-warning').removeClass('state-empty');
        }
    }

    const last_received = Date.now() - MSP.last_received_timestamp;

    if (last_received < 300) {
        $(".linkicon").addClass('active');
    } else {
        $(".linkicon").removeClass('active');
    }

    statuswrapper.show();
    GUI.timeout_remove('data_refresh');
    startLiveDataRefreshTimer();
}

export function specificByte(num, pos) {
    return 0x000000FF & (num >> (8 * pos));
}

export function bit_check(num, bit) {
    return ((num >> bit) % 2 != 0);
}

export function bit_set(num, bit) {
    return num | 1 << bit;
}

export function bit_clear(num, bit) {
    return num & ~(1 << bit);
}

export function update_dataflash_global() {
    function formatFilesize(bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        const kilobytes = bytes / 1024;

        if (kilobytes < 1024) {
            return Math.round(kilobytes) + "kB";
        }

        const megabytes = kilobytes / 1024;

        return megabytes.toFixed(1) + "MB";
    }

    const supportsDataflash = FC.DATAFLASH.totalSize > 0;

    if (supportsDataflash){
        $(".noflash_global").css({
           display: 'none'
        });

        $(".dataflash-contents_global").css({
           display: 'block'
        });

        $(".dataflash-free_global").css({
           width: (100-(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize) / FC.DATAFLASH.totalSize * 100) + "%",
           display: 'block'
        });
        $(".dataflash-free_global div").text('Dataflash: free ' + formatFilesize(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize));
     } else {
        $(".noflash_global").css({
           display: 'block'
        });

        $(".dataflash-contents_global").css({
           display: 'none'
        });
     }
}

export function reinitialiseConnection(callback) {
    if (!CONFIGURATOR.virtualMode) {
        GUI.reboot_in_progress = true;
    }

    callback?.();
}
