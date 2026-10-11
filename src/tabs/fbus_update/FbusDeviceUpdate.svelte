<script>
  import { onMount } from "svelte";

  import { i18n } from "@/js/i18n.js";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Field from "@/components/Field.svelte";
  import Select from "@/components/Select.svelte";
  import Tooltip from "@/components/Tooltip.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";
  import ErrorNote from "@/components/notes/ErrorNote.svelte";
  import InfoNote from "@/components/notes/InfoNote.svelte";
  import { getTabHelpURL } from "@/js/help";

  import updateState, { View } from "./state.svelte.js";
  import { OtaState, PHYSICAL_IDS } from "./protocol.js";

  let loading = $state(true);
  let fileInput = $state();

  function hex(value) {
    return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
  }

  let physicalIdOptions = $derived(
    PHYSICAL_IDS.map((id) => {
      const device = updateState.devices.find((d) => d.physicalId === id);
      return {
        value: id,
        label: device ? `${hex(id)} - ${device.name}` : hex(id),
      };
    }),
  );

  let percent = $derived(
    updateState.size
      ? Math.floor((100 * updateState.acked) / updateState.size)
      : 0,
  );

  let phaseLabel = $derived(
    {
      [OtaState.STARTING]: "fbusUpdatePhaseStarting",
      [OtaState.TRANSFER]: "fbusUpdatePhaseTransfer",
      [OtaState.ENDING]: "fbusUpdatePhaseEnding",
    }[updateState.phase] ?? "fbusUpdatePhaseStarting",
  );

  // The FC refuses to start while armed; that shows as fbusUpdateErrorStartRefused
  let canStart = $derived(
    updateState.file !== null &&
      updateState.physicalId !== null &&
      !updateState.busy,
  );

  onMount(async () => {
    await updateState.load();
    loading = false;
  });

  function onClickHelp() {
    window.open(getTabHelpURL("tabFbusDeviceUpdate"), "_system");
  }

  function onChooseFile() {
    fileInput.value = "";
    fileInput.click();
  }

  function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (file) {
      updateState.loadFile(file);
    }
  }

  function onClickStart() {
    updateState.start();
  }

  function onClickAbort() {
    updateState.abort();
  }

  function onClickAgain() {
    updateState.reset();
    updateState.refreshDevices();
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabFbusDeviceUpdate")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

<Page {header} {loading}>
  <p class="intro">{$i18n.t("fbusUpdateIntro")}</p>

  {#if updateState.view === View.UNSUPPORTED}
    <ErrorNote message="fbusUpdateUnsupported" />
  {:else}
    <WarningNote message="fbusUpdateWarning" />

    <div class="pages">
      <Section label="fbusUpdateSectionDevice">
        <Field id="fbusUpdatePhysicalId" label="fbusUpdatePhysicalId">
          {#snippet tooltip()}
            <Tooltip help="fbusUpdatePhysicalIdHelp" />
          {/snippet}
          <Select
            id="fbusUpdatePhysicalId"
            bind:value={updateState.physicalId}
            options={physicalIdOptions}
            disabled={updateState.busy}
          />
        </Field>
        {#if updateState.devices.length === 0}
          <p class="hint">{$i18n.t("fbusUpdateNoDevices")}</p>
        {/if}

        <Field id="fbusUpdateFile" label="fbusUpdateFile">
          {#snippet tooltip()}
            <Tooltip help="fbusUpdateFileHelp" />
          {/snippet}
          <button
            id="fbusUpdateFile"
            class="btn"
            onclick={onChooseFile}
            disabled={updateState.busy}
          >
            {$i18n.t("fbusUpdateChooseFile")}
          </button>
        </Field>
        <input
          bind:this={fileInput}
          type="file"
          accept=".frk,.frsk,.bin"
          class="hidden"
          onchange={onFileSelected}
        />

        {#if updateState.fileError}
          <ErrorNote message={updateState.fileError} />
        {:else if updateState.file}
          <p class="file-info">
            <b>{updateState.file.info.name}</b>
            <span>
              {$i18n.t("fbusUpdateFileSize", {
                size: updateState.file.payload.byteLength,
              })}
            </span>
            {#if updateState.file.info.version}
              <span>
                {$i18n.t("fbusUpdateFileVersion", {
                  version: updateState.file.info.version,
                  family: updateState.file.info.family,
                })}
              </span>
            {/if}
          </p>
        {/if}

        <div class="actions">
          {#if updateState.busy}
            <button class="btn" onclick={onClickAbort}>
              {$i18n.t("fbusUpdateAbort")}
            </button>
          {:else}
            <button class="btn" onclick={onClickStart} disabled={!canStart}>
              {$i18n.t("fbusUpdateStart")}
            </button>
          {/if}
        </div>
      </Section>

      {#if updateState.view !== View.SETUP}
        <Section label="fbusUpdateSectionProgress">
          {#if updateState.view === View.UPDATING}
            <p class="status">{$i18n.t(phaseLabel)}</p>
            <progress max="100" value={percent}></progress>
            <p class="hint">
              {$i18n.t("fbusUpdateProgress", {
                acked: updateState.acked,
                size: updateState.size,
                percent,
                retries: updateState.retries,
              })}
            </p>
          {:else if updateState.view === View.DONE}
            <InfoNote message="fbusUpdateDone" />
          {:else if updateState.view === View.FAILED}
            <ErrorNote message={updateState.error} />
          {/if}
          {#if updateState.view === View.DONE || updateState.view === View.FAILED}
            <div class="actions">
              <button class="btn" onclick={onClickAgain}>
                {$i18n.t("fbusUpdateAgain")}
              </button>
            </div>
          {/if}
        </Section>
      {/if}
    </div>
  {/if}
</Page>

<style lang="scss">
  h1 {
    margin: 0;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .intro {
    padding: 8px;
    color: var(--color-text-soft);
  }

  .pages {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    column-gap: var(--section-gap);
  }

  .hidden {
    display: none;
  }

  .hint {
    padding: 4px 8px;
    font-size: 0.85rem;
    color: var(--color-text-soft);
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    gap: 8px;
    padding: 8px;
  }

  .status {
    padding: 8px 8px 4px;
    font-weight: 600;
  }

  progress {
    width: calc(100% - 16px);
    margin: 0 8px;
  }
</style>
