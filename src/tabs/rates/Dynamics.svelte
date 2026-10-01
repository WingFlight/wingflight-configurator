<script>
  import { FC } from "@/js/fc.svelte.js";
  import { defaultRateSlot } from "@/js/virtual_fc.js";
  import { i18n } from "@/js/i18n.js";

  import Expert from "@/components/Expert.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";

  // Firmware defaults (pg/rates.c), so a changed value
  // stays visible in basic mode. The Virtual FC seeds its rate profiles from
  // the same values. Every row here is an expert setting.
  const DEFAULTS = defaultRateSlot();
  const differs = (...keys) =>
    keys.some((key) => FC.RC_TUNING[key] !== DEFAULTS[key]);

  let responseChanged = $derived(
    differs("roll_response_time", "pitch_response_time", "yaw_response_time"),
  );
  let boostChanged = $derived(
    differs(
      "roll_setpoint_boost_gain",
      "pitch_setpoint_boost_gain",
      "yaw_setpoint_boost_gain",
      "roll_setpoint_boost_cutoff",
      "pitch_setpoint_boost_cutoff",
      "yaw_setpoint_boost_cutoff",
    ),
  );
  let yawDynamicChanged = $derived(
    differs(
      "yaw_dynamic_ceiling_gain",
      "yaw_dynamic_deadband_gain",
      "yaw_dynamic_deadband_filter",
    ),
  );
</script>

<Section label="rateSetupDynamic">
  <div class="grid">
    <Expert
      changed={responseChanged || boostChanged || yawDynamicChanged}
      counted={false}
    >
      <div class="title">
        <div class="header"></div>
        <div class="axis-title roll">{$i18n.t("axisROLL")}</div>
        <div class="axis-title pitch">{$i18n.t("axisPITCH")}</div>
        <div class="axis-title yaw">{$i18n.t("axisYAW")}</div>
      </div>
    </Expert>

    <Expert changed={responseChanged}>
      <div class="group">
        <div class="row-label">
          <span class="label-text" title={$i18n.t("rateSetupResponse")}
            >{$i18n.t("rateSetupResponse")}</span
          >
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
    </Expert>

    <Expert changed={boostChanged}>
      <div class="group">
        <div class="row-label">
          <span class="label-text" title={$i18n.t("rateSetpointBoostGain")}
            >{$i18n.t("rateSetpointBoostGain")}</span
          >
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
          <span
            class="label-text"
            title="{$i18n.t('rateSetpointBoostCutoff')} [Hz]"
            >{$i18n.t("rateSetpointBoostCutoff")} [Hz]</span
          >
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
    </Expert>

    <Expert changed={yawDynamicChanged}>
      <div class="group">
        <div class="row-label">
          <span class="label-text" title={$i18n.t("rateYawDynamicCeilingGain")}
            >{$i18n.t("rateYawDynamicCeilingGain")}</span
          >
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
          <span class="label-text" title={$i18n.t("rateYawDynamicDeadbandGain")}
            >{$i18n.t("rateYawDynamicDeadbandGain")}</span
          >
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
          <span
            class="label-text"
            title="{$i18n.t('rateYawDynamicDeadbandFilter')} [Hz]"
            >{$i18n.t("rateYawDynamicDeadbandFilter")} [Hz]</span
          >
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
    </Expert>
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

  .label-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    // Flex items default to a min-width based on their content's natural
    // size, which for nowrap text is the full, untruncated width - that
    // silently defeats text-overflow:ellipsis unless overridden.
    min-width: 0;
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

  // 650px, not the usual 480px phone breakpoint: this grid's label column
  // (up to 220px, for the longest untruncated labels like "Setpoint Boost
  // Cutoff [Hz]") starts crowding the 3 input columns well before 480px.
  // Shrinking it earlier - with the label truncating to an ellipsis, full
  // text still available as a tooltip/via each row's help icon - gives
  // the inputs real room instead of staying squeezed. Matches
  // RatesTable.svelte/Rates.svelte's tab labels, which switch at the same
  // point so the whole page goes compact together.
  @media only screen and (max-width: 650px) {
    .grid {
      grid-template-columns: minmax(70px, 110px) repeat(3, minmax(70px, 1fr));
    }

    .row-label {
      padding-left: 2px;
    }
  }
</style>
