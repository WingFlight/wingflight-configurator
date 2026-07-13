<script>
  import semver from "semver";

  import { API_VERSION_12_8 } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";

  let showBoostDynamics = $derived(
    semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_8),
  );
</script>

<Section label="rateSetupDynamic">
  <div class="grid">
    <div class="title">
      <div class="header"></div>
      <div class="axis-title roll">{$i18n.t("axisROLL")}</div>
      <div class="axis-title pitch">{$i18n.t("axisPITCH")}</div>
      <div class="axis-title yaw">{$i18n.t("axisYAW")}</div>
    </div>

    <div class="group">
      <div class="row-label">
        <span>{$i18n.t("rateSetupResponse")}</span>
        <HelpIcon>{$i18n.t("rateSetupResponseHelp")}</HelpIcon>
      </div>
      <NumberInput
        min="0"
        max="250"
        bind:value={FC.RC_TUNING.roll_response_time}
      />
      <NumberInput
        min="0"
        max="250"
        bind:value={FC.RC_TUNING.pitch_response_time}
      />
      <NumberInput
        min="0"
        max="250"
        bind:value={FC.RC_TUNING.yaw_response_time}
      />
    </div>

    {#if showBoostDynamics}
      <div class="group">
        <div class="row-label">
          <span>{$i18n.t("rateSetpointBoostGain")}</span>
          <HelpIcon>{$i18n.t("rateSetpointBoostGainHelp")}</HelpIcon>
        </div>
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.roll_setpoint_boost_gain}
        />
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.pitch_setpoint_boost_gain}
        />
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.yaw_setpoint_boost_gain}
        />

        <div class="row-label">
          <span>{$i18n.t("rateSetpointBoostCutoff")} [Hz]</span>
        </div>
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.roll_setpoint_boost_cutoff}
        />
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.pitch_setpoint_boost_cutoff}
        />
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.yaw_setpoint_boost_cutoff}
        />
      </div>

      <div class="group">
        <div class="row-label">
          <span>{$i18n.t("rateYawDynamicCeilingGain")}</span>
          <HelpIcon>{$i18n.t("rateYawDynamicCeilingGainHelp")}</HelpIcon>
        </div>
        <div></div>
        <div></div>
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.yaw_dynamic_ceiling_gain}
        />

        <div class="row-label">
          <span>{$i18n.t("rateYawDynamicDeadbandGain")}</span>
          <HelpIcon>{$i18n.t("rateYawDynamicDeadbandGainHelp")}</HelpIcon>
        </div>
        <div></div>
        <div></div>
        <NumberInput
          min="0"
          max="250"
          bind:value={FC.RC_TUNING.yaw_dynamic_deadband_gain}
        />

        <div class="row-label">
          <span>{$i18n.t("rateYawDynamicDeadbandFilter")} [Hz]</span>
        </div>
        <div></div>
        <div></div>
        <NumberInput
          min="0"
          max="25"
          step="0.1"
          bind:value={
            () => FC.RC_TUNING.yaw_dynamic_deadband_filter / 10,
            (v) =>
              (FC.RC_TUNING.yaw_dynamic_deadband_filter = Math.round(v * 10))
          }
        />
      </div>
    {/if}
  </div>
</Section>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: minmax(min-content, 220px) repeat(
        3,
        minmax(60px, 1fr)
      );
    align-items: center;
  }

  .axis-title {
    text-align: center;
    padding: 4px;
  }

  .title {
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    grid-column: 1 / -1;
    background-color: var(--color-surface-float, var(--color-surface));
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }

  .group {
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    row-gap: 4px;
    grid-column: 1 / -1;
    padding: 4px;
    border-top: 1px solid var(--color-border);
  }

  .row-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-left: 4px;
  }

  .axis-title.roll {
    background-color: hsl(0, 100%, 85%);
  }

  .axis-title.pitch {
    background-color: hsl(120, 100%, 85%);
  }

  .axis-title.yaw {
    background-color: hsl(240, 100%, 88%);
  }

  :global(html[data-theme="dark"]) .axis-title.roll {
    background-color: hsl(0, 40%, 30%);
  }

  :global(html[data-theme="dark"]) .axis-title.pitch {
    background-color: hsl(120, 25%, 25%);
  }

  :global(html[data-theme="dark"]) .axis-title.yaw {
    background-color: hsl(240, 35%, 32%);
  }
</style>
