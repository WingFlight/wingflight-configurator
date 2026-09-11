/**
 * File: tools/board-editor/src/main.js
 * Boots the editor: translations first, because the preview mounts the
 * configurator's own component and that reads i18next from the moment
 * it renders.
 */

import { mount } from "svelte";

import "@/css/app.css";

import App from "./App.svelte";
import { startI18n } from "./lib/i18n.js";

startI18n().then(() => {
  mount(App, { target: document.getElementById("app") });
});
