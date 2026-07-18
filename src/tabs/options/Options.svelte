<script>
  import * as config from "@/js/config.js";
  import { DarkTheme } from "@/js/DarkTheme.js";
  import { i18n } from "@/js/i18n.js";
  import { checkForConfiguratorUpdates } from "@/js/main.js";
  import { cordovaUI } from "@/js/cordova_startup.js";

  import Field from "@/components/Field.svelte";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import Switch from "@/components/Switch.svelte";

  let checkUnstableVersions = $state(
    config.get("checkForConfiguratorUnstableVersions") ?? true,
  );
  let rememberLastTab = $state(config.get("rememberLastTab") ?? true);
  let rememberLastBoard = $state(
    config.get("rememberLastSelectedBoard") ?? false,
  );
  let showAdvancedFirmwareOpts = $state(
    config.get("showAdvancedFirmwareOpts") ?? false,
  );
  let connectionTimeout = $state(config.get("connectionTimeout") ?? 100);
  let cordovaForceComputerUI = $state(
    config.get("cordovaForceComputerUI") ?? false,
  );
  let darkTheme = $state(DarkTheme.configEnabled);

  const showConfiguratorUpdateOptions = __BACKEND__ !== "web";
  const showCordovaOption = GUI.isCordova() && cordovaUI.canChangeUI;

  const timeoutOptions = [100, 500, 1000, 1500, 2500, 5000].map((v) => ({
    value: v,
    label: String(v),
  }));

  let darkThemeOptions = $derived([
    { value: 0, label: $i18n.t("on") },
    { value: 1, label: $i18n.t("off") },
    { value: 2, label: $i18n.t("auto") },
  ]);

  function onCheckUnstableVersionsChange() {
    config.set({ checkForConfiguratorUnstableVersions: checkUnstableVersions });
    checkForConfiguratorUpdates();
  }

  function onRememberLastTabChange() {
    config.set({ rememberLastTab });
  }

  function onRememberLastBoardChange() {
    config.set({ rememberLastSelectedBoard: rememberLastBoard });
  }

  function onShowAdvancedFirmwareOptsChange() {
    config.set({ showAdvancedFirmwareOpts });
  }

  function onConnectionTimeoutChange() {
    config.set({ connectionTimeout: parseInt(connectionTimeout) });
  }

  function onCordovaForceComputerUIChange() {
    config.set({ cordovaForceComputerUI });
    cordovaUI?.set?.();
  }

  function onDarkThemeChange() {
    config.set({ darkTheme });
    DarkTheme.setConfig(darkTheme);
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabOptions")}</h1>
{/snippet}

<Page {header}>
  <Section label="tabOptions">
    {#if showConfiguratorUpdateOptions}
      <Field
        id="opt-check-unstable-versions"
        label="checkForConfiguratorUnstableVersions"
      >
        <Switch
          id="opt-check-unstable-versions"
          bind:checked={checkUnstableVersions}
          onchange={onCheckUnstableVersionsChange}
        />
      </Field>
    {/if}
    <Field id="opt-remember-last-tab" label="rememberLastTab">
      <Switch
        id="opt-remember-last-tab"
        bind:checked={rememberLastTab}
        onchange={onRememberLastTabChange}
      />
    </Field>
    <Field id="opt-remember-last-board" label="rememberLastSelectedBoard">
      <Switch
        id="opt-remember-last-board"
        bind:checked={rememberLastBoard}
        onchange={onRememberLastBoardChange}
      />
    </Field>
    <Field
      id="opt-show-advanced-firmware-opts"
      label="options.show_advanced_firmware_opts.label"
    >
      <Switch
        id="opt-show-advanced-firmware-opts"
        bind:checked={showAdvancedFirmwareOpts}
        onchange={onShowAdvancedFirmwareOptsChange}
      />
    </Field>
    <Field id="opt-connection-timeout" label="connectionTimeout">
      <Select
        id="opt-connection-timeout"
        bind:value={connectionTimeout}
        options={timeoutOptions}
        onchange={onConnectionTimeoutChange}
      />
    </Field>
    {#if showCordovaOption}
      <Field id="opt-cordova-force-computer-ui" label="cordovaForceComputerUI">
        <Switch
          id="opt-cordova-force-computer-ui"
          bind:checked={cordovaForceComputerUI}
          onchange={onCordovaForceComputerUIChange}
        />
      </Field>
    {/if}
    <Field id="opt-dark-theme" label="darkTheme">
      <Select
        id="opt-dark-theme"
        bind:value={darkTheme}
        options={darkThemeOptions}
        onchange={onDarkThemeChange}
      />
    </Field>
  </Section>
</Page>

<style lang="scss">
  h1 {
    font-weight: 600;
  }
</style>
