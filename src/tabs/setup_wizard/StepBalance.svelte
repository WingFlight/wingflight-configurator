<script>
  import { getContext } from "svelte";

  import { i18n } from "@/js/i18n.js";

  import ServoBalance from "@/tabs/servos/ServoBalance.svelte";

  const wiz = getContext("setupWizard");

  // Shown only when a surface has more than one servo (see STEPS). Each
  // follower moves with its surface's first servo; here it is started from
  // that servo's travel and then matched to it at a few points, so the servos
  // on one surface don't fight. Changes are sent live and saved with the step.
</script>

<p>{$i18n.t("setupWizardBalanceIntro")}</p>
<ol class="tips">
  <li>{$i18n.t("setupWizardBalanceTipCopy")}</li>
  <li>{$i18n.t("setupWizardBalanceTipPoints")}</li>
  <li>{$i18n.t("setupWizardBalanceTipListen")}</li>
</ol>

<div class="groups">
  {#each wiz.groups as group (group.primary)}
    <ServoBalance
      primary={group.primary}
      followers={group.followers}
      hold={wiz.holdServo}
      release={wiz.releaseServo}
      onChange={wiz.markChanged}
      servoLabel={(servo) => wiz.servoLabel(servo)}
    />
  {/each}
</div>

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .tips {
    margin: 0;
    padding-left: 1.4em;
    max-width: 70ch;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
