<script>
  import diff from "microdiff";
  import { onMount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { Mixer } from "@/js/Mixer.js";
  import { getTabHelpURL } from "@/js/help";
  import { updateTabList } from "@/js/main.js";

  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";

  import RuleTable from "./RuleTable.svelte";
  import AxisConfig from "./AxisConfig.svelte";
  import OverridePanel from "./OverridePanel.svelte";
  import WizardDialog from "./WizardDialog.svelte";
  import ModelTypePicker from "./ModelTypePicker.svelte";
  import SimplifiedMixerForm from "./SimplifiedMixerForm.svelte";
  import {
    MIXER_ROLE_ADJUSTMENT_FUNCTIONS,
    getAdjustmentState,
  } from "@/tabs/adjustments/adjustmentState.js";

  let loading = $state(true);
  let initialState = $state();
  let conditionStatusInterval;
  let wizardRef;

  function snapshotState() {
    return $state.snapshot({
      MIXER_CONFIG: FC.MIXER_CONFIG,
      MIXER_INPUTS: FC.MIXER_INPUTS,
      MIXER_RULES: FC.MIXER_RULES,
    });
  }

  let changes = $derived.by(() => {
    if (!initialState) {
      return [];
    }

    return diff(initialState, snapshotState());
  });
  let dirty = $derived(changes.length > 0);
  let showToolbar = $derived(!loading && dirty);
  let isCustom = $derived(
    FC.MIXER_CONFIG.model_type === Mixer.MODEL_TYPE_CUSTOM,
  );

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    // Needed so the RC Roll/Pitch/Yaw/Throttle (bypass) input options can
    // show the pilot's actual physical channel (RuleTable/SimplifiedMixerForm
    // via Mixer.inputLabel) -- nothing fetches this globally on connect,
    // only Receiver.svelte does, for its own channel map UI.
    await MSP.promise(MSPCodes.MSP_RX_MAP);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_INPUTS);
    await MSP.promise(MSPCodes.MSP_MIXER_RULES);
    await MSP.promise(MSPCodes.MSP_MIXER_OVERRIDE);
    // Needed for the Purpose-tagged rules' ADJ/LIVE badge (RuleTable/
    // SimplifiedMixerForm) -- Profiles.svelte and Servos.svelte each fetch
    // this themselves for their own badges too, since nothing fetches it
    // globally on connect. Without it, FC.ADJUSTMENT_RANGES stays whatever
    // it was left at (usually empty), so getAdjustmentState() never finds a
    // match and the badge silently never renders.
    await MSP.promise(MSPCodes.MSP_ADJUSTMENT_RANGES);

    // Real hardware always reports MIXER_RULE_COUNT (32) rules; pad out the
    // simulator's empty default so the rule editor has slots to add into.
    while (FC.MIXER_RULES.length < Mixer.RULE_COUNT) {
      FC.MIXER_RULES.push(Mixer.nullRule());
    }

    initialState = snapshotState();
    loading = false;

    conditionStatusInterval = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_LOGIC_CONDITIONS_STATUS);
      await refreshLiveRoleWeights();
    }, 200);
  });

  // A role-tagged rule's weight can be driven live by an RC adjustment range
  // (ADJUSTMENT_FLAP_COMPENSATION_GAIN etc.) -- re-poll MSP_MIXER_RULES so
  // the displayed value actually moves with the switch/pot, instead of
  // staying frozen at whatever it was when the tab loaded. Skipped whenever
  // there are unsaved edits pending: MSP_MIXER_RULES replaces FC.MIXER_RULES
  // wholesale (see MSPHelper.js), so refreshing while dirty would silently
  // discard anything the pilot hasn't saved yet, elsewhere in the table.
  // Re-baselining initialState afterwards keeps this refresh itself from
  // being mistaken for an edit that needs saving.
  async function refreshLiveRoleWeights() {
    if (dirty) return;

    const anyActive = FC.MIXER_RULES.some((rule) => {
      const adjFunction = MIXER_ROLE_ADJUSTMENT_FUNCTIONS[rule.role];
      return adjFunction && getAdjustmentState(adjFunction)?.active;
    });
    if (!anyActive) return;

    await MSP.promise(MSPCodes.MSP_MIXER_RULES);
    initialState = snapshotState();
  }

  onDestroy(() => {
    clearInterval(conditionStatusInterval);
  });

  export async function onSave() {
    const configDirty = changes.some((c) => c.path[0] === "MIXER_CONFIG");
    const inputsDirty = changes.some((c) => c.path[0] === "MIXER_INPUTS");
    const rulesDirty = changes.some((c) => c.path[0] === "MIXER_RULES");

    if (configDirty) {
      await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    }
    if (inputsDirty) {
      await new Promise((resolve) => mspHelper.sendMixerInputs(resolve));
    }
    if (rulesDirty) {
      await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
    }

    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    initialState = snapshotState();
  }

  export async function onRevert() {
    Object.assign(FC.MIXER_CONFIG, initialState.MIXER_CONFIG);
    Object.assign(FC.MIXER_INPUTS, initialState.MIXER_INPUTS);
    Object.assign(FC.MIXER_RULES, initialState.MIXER_RULES);
  }

  export function isDirty() {
    return dirty;
  }

  async function onWizardApply(options) {
    FC.MIXER_RULES = Mixer.buildRuleTableFromOptions(options, FC.MIXER_RULES);

    // The feature flag isn't part of the staged mixer rules, and this tab's
    // own Save only pushes MIXER_CONFIG/MIXER_INPUTS/MIXER_RULES -- so commit
    // it immediately here rather than leaving it as unsaved FC state that a
    // later tab visit (which re-fetches MSP_FEATURE_CONFIG on mount) could
    // silently discard.
    const thrustVectorEnabled =
      !!options.thrustVectorRoll ||
      !!options.thrustVectorPitch ||
      !!options.thrustVectorYaw;
    if (
      thrustVectorEnabled !==
      FC.FEATURE_CONFIG.features.isEnabled("THRUST_VECTOR")
    ) {
      FC.FEATURE_CONFIG.features.setFeature(
        "THRUST_VECTOR",
        thrustVectorEnabled,
      );
      await MSP.promise(
        MSPCodes.MSP_SET_FEATURE_CONFIG,
        mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG),
      );
      await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
      updateTabList(FC.FEATURE_CONFIG.features);
    }
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabMixer"), "_system");
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabMixer")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <ModelTypePicker />

  <Section label="mixerRulesTitle">
    {#if isCustom}
      <RuleTable onOpenWizard={() => wizardRef.open()} />
    {:else}
      <SimplifiedMixerForm />
    {/if}
  </Section>

  <div class="axis-row">
    <AxisConfig />
  </div>

  <OverridePanel />
</Page>

<WizardDialog bind:this={wizardRef} onApply={onWizardApply} />

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .grow {
    flex-grow: 1;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    min-width: 60px;
  }

  .axis-row {
    margin-top: var(--section-gap);
  }
</style>
