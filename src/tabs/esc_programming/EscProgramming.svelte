<script>
  import { onMount } from "svelte";

  import { i18n } from "@/js/i18n.js";
  import Page from "@/components/Page.svelte";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import escState, { View } from "./state.svelte.js";
  import ManufacturerPicker from "./ManufacturerPicker.svelte";
  import EscTargetSelector from "./EscTargetSelector.svelte";
  import DetectionStatus from "./DetectionStatus.svelte";
  import ParameterForm from "./ParameterForm.svelte";

  let loading = $state(true);
  let showToolbar = $derived(escState.view === View.FORM && escState.isDirty());

  // The manufacturer picker's protocol soft-filter reads FC.ESC_SENSOR_CONFIG.protocol.
  // Without an explicit fetch here, it just showed whatever another tab (e.g. Motors) had last
  // left that value as -- stale or absent depending on prior navigation, which is exactly why
  // the filter looked inconsistent (sometimes every manufacturer enabled, sometimes not).
  async function refreshAndReset() {
    loading = true;
    escState.reset();
    await MSP.promise(MSPCodes.MSP_ESC_SENSOR_CONFIG);
    loading = false;
  }

  onMount(refreshAndReset);

  export function onSave() {
    return escState.onSave();
  }

  export function onRevert() {
    escState.onRevert();
  }

  export function isDirty() {
    return escState.view === View.FORM && escState.isDirty();
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabEscProgramming")}</h1>
  <div class="grow"></div>
  {#if escState.view !== View.PICKER}
    <button class="btn" onclick={refreshAndReset}>
      {$i18n.t("escProgrammingChangeEsc")}
    </button>
  {/if}
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  {#if escState.armed}
    <p class="armed-warning">{$i18n.t("escProgrammingArmedWarning")}</p>
  {/if}

  {#if escState.view === View.PICKER}
    <ManufacturerPicker />
  {:else if escState.view === View.SELECTOR}
    <EscTargetSelector />
  {:else if escState.view === View.DETECTING}
    <DetectionStatus />
  {:else if escState.view === View.FORM}
    <ParameterForm />
  {/if}
</Page>

<style lang="scss">
  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .armed-warning {
    padding: 8px;
    font-weight: 600;
    color: var(--color-red-900);
  }
</style>
