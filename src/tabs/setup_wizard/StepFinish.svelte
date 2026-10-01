<script>
  import { getContext } from "svelte";

  import { i18n } from "@/js/i18n.js";

  const wiz = getContext("setupWizard");
</script>

<p>{$i18n.t("setupWizardFinishIntro")}</p>
<div class="note">{$i18n.t("setupWizardFinishThrowsTune")}</div>

<ol class="tasks">
  <li>
    <span>{$i18n.t("setupWizardFinishRates")}</span>
    <button class="btn" onclick={() => wiz.openTab("rates")}
      >{$i18n.t("tabRates")}</button
    >
  </li>
  <li>
    <span>{$i18n.t("setupWizardFinishTune")}</span>
    <button class="btn" onclick={() => wiz.openTab("profiles")}
      >{$i18n.t("tabProfiles")}</button
    >
  </li>
  <li>
    <span>{$i18n.t("setupWizardFinishBackup")}</span>
    <button class="btn" onclick={() => wiz.openTab("cli")}
      >{$i18n.t("tabCLI")}</button
    >
  </li>
</ol>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-yellow-500);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .tasks {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
    }

    span {
      flex: 1 1 360px;
      min-width: 0;
    }
  }
</style>
