import { mount, unmount } from "svelte";

import Sensors from "@/tabs/sensors/Sensors.svelte";

const tab = {
  tabName: "sensors",
  armingEnabled: true,
  svelteComponent: null,

  initialize(callback) {
    const target = document.querySelector("#content");
    target.innerHTML = "";
    this.svelteComponent = mount(Sensors, { target });

    GUI.content_ready(callback);
  },

  cleanup(callback) {
    if (this.svelteComponent) {
      unmount(this.svelteComponent);
      this.svelteComponent = null;
    }
    serial.emptyOutputBuffer();
    callback?.();
  },
};

TABS[tab.tabName] = tab;

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule && GUI.active_tab === tab.tabName) {
      TABS[tab.tabName].initialize();
    }
  });

  import.meta.hot.dispose(() => {
    tab.cleanup();
  });
}
