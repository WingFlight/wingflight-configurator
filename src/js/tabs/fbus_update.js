import { mount, unmount } from "svelte";

import FbusDeviceUpdate from "@/tabs/fbus_update/FbusDeviceUpdate.svelte";
import updateState from "@/tabs/fbus_update/state.svelte.js";

const tab = {
  tabName: "fbus_update",
  svelteComponent: null,

  initialize(callback) {
    if (GUI.tab_switch_in_progress && !updateState.busy) {
      updateState.reset();
    }
    const target = document.querySelector("#content");
    target.innerHTML = "";
    this.svelteComponent = mount(FbusDeviceUpdate, { target });

    GUI.content_ready(callback);
  },

  // Leaving the tab cancels a running update (the FC would otherwise stop it
  // itself once no more data arrives).
  exit(callback) {
    if (!updateState.busy) {
      callback?.();
      return;
    }
    if (window.confirm(i18n.getMessage("fbusUpdateLeaveConfirm"))) {
      updateState.abort();
      callback?.();
    }
  },

  cleanup(callback) {
    if (this.svelteComponent) {
      unmount(this.svelteComponent);
      this.svelteComponent = null;
    }
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
