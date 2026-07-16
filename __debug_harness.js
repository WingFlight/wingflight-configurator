import { mount } from "svelte";

import * as configurator from "@/js/configurator.svelte.js";
import * as serialBackend from "@/js/serial_backend.js";
import { FC } from "@/js/fc.svelte.js";
import { GuiControl } from "@/js/gui.js";
import { MSP } from "@/js/msp.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { MspHelper } from "@/js/msp/MSPHelper.js";
import { i18n } from "@/js/localization.js";
import { applyVirtualConfig } from "@/js/virtual_fc.js";

import "@/js/injected_methods.js";

import Sensors from "@/tabs/sensors/Sensors.svelte";

globalThis.GUI = new GuiControl();
globalThis.mspHelper = new MspHelper();
MSP.listen(globalThis.mspHelper.process_data.bind(globalThis.mspHelper));

Object.assign(globalThis, {
  ...configurator,
  ...serialBackend,
  FC,
  MSP,
  MSPCodes,
  MspHelper,
  i18n,
});

async function boot() {
  try {
    await i18n.init();

    globalThis.CONFIGURATOR.virtualMode = true;
    applyVirtualConfig();

    const target = document.querySelector("#sensors-app");
    window.__sensorsComponent = mount(Sensors, { target });

    window.__debugReady = true;
  } catch (err) {
    window.__debugError = err.message + "\n" + err.stack;
    console.error(err);
  }
}

boot();
