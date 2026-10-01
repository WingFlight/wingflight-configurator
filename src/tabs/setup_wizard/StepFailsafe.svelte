<script>
  import { getContext } from "svelte";

  import { i18n } from "@/js/i18n.js";

  const wiz = getContext("setupWizard");
</script>

<p>{$i18n.t("setupWizardFailsafeIntro")}</p>
<ol class="tasks">
  <li>{$i18n.t("setupWizardFailsafeReceiver")}</li>
  <li>{$i18n.t("setupWizardFailsafeTest")}</li>
</ol>

<div>
  <button class="btn" onclick={() => wiz.openTab("failsafe")}>
    {$i18n.t("setupWizardOpenFailsafe")}
  </button>
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .tasks {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 70ch;
  }
</style>
