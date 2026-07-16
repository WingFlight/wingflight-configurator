<script>
  import { i18n } from "@/js/i18n.js";
  import { i18n as legacyI18n } from "@/js/localization.js";

  let selectedLanguage = $state(legacyI18n.selectedLanguage);
  const languages = legacyI18n.getLanguagesAvailables();

  function selectLanguage(lang) {
    if (selectedLanguage === lang) return;
    legacyI18n.changeLanguage(lang);
    selectedLanguage = lang;
  }
</script>

<div class="landing">
  <div class="hero">
    <img class="logo" src="/images/cf_logo_black.svg" alt="Wingflight" />
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p>{@html $i18n.t("defaultWelcomeIntro")}</p>
  </div>

  <div class="columns">
    <div class="column">
      <section>
        <h2>{$i18n.t("defaultDownloadsHead")}</h2>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div>{@html $i18n.t("defaultDownloadsText")}</div>
      </section>

      <section>
        <h2>{$i18n.t("defaultCommunityHead")}</h2>
        <p>{$i18n.t("defaultCommunityText")}</p>
        <ul class="social">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <li>{@html $i18n.t("defaultWebsiteText")}</li>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <li>{@html $i18n.t("defaultDiscordText")}</li>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <li>{@html $i18n.t("defaultFacebookText")}</li>
        </ul>
      </section>
    </div>

    <div class="column">
      <section>
        <h2>{$i18n.t("defaultContributingHead")}</h2>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div>{@html $i18n.t("defaultContributingText")}</div>
      </section>
    </div>
  </div>

  <div class="language-switcher">
    <span>{$i18n.t("language_choice_message")}</span>
    <button
      class:selected={selectedLanguage === "DEFAULT"}
      onclick={() => selectLanguage("DEFAULT")}
    >
      {$i18n.t("language_default_pretty")}
    </button>
    {#each languages as lang (lang)}
      <button
        class:selected={selectedLanguage === lang}
        onclick={() => selectLanguage(lang)}
      >
        {$i18n.t(`language_${lang}`)}
      </button>
    {/each}
  </div>
</div>

<style lang="scss">
  .landing {
    height: 100%;
    overflow-y: auto;
    background-color: #2e2e2e;
  }

  .hero {
    padding: 20px;
    text-align: center;
    background: #fff url(/images/pattern.png);
    background-size: 300px;
    color: #000;

    p {
      max-width: 1100px;
      margin: 5px auto 0;
      font-size: 0.95rem;
      font-weight: 300;
    }
  }

  .logo {
    width: 100%;
    max-width: 600px;
    margin: 5px;

    :global(html[data-theme="dark"]) & {
      content: url(/images/cf_logo_white.svg);
    }
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 16px;
    padding: 0 15px;
    background-color: var(--accent);
    color: #fff;

    :global(html[data-theme="dark"]) & {
      background-color: #3e3e3e;
    }
  }

  section {
    padding: 10px;
  }

  h2 {
    margin-bottom: 5px;
    font-size: 0.9rem;
  }

  .columns :global(a) {
    color: #fff;
    font-weight: 600;
    text-decoration: underline;
  }

  .columns :global(ul) {
    margin: 10px 0 10px 15px;
  }

  .columns :global(li) {
    padding: 2px 0;
    list-style: circle;
  }

  .social {
    margin-top: 5px;
    font-size: 0.8rem;
  }

  .language-switcher {
    padding: 20px 20px 5px;
    text-align: center;
    color: silver;

    button {
      background: none;
      border: none;
      padding: 0;
      color: silver;
      font-weight: normal;
      font-size: 0.85rem;
      cursor: pointer;
      white-space: nowrap;

      &:not(:last-child)::after {
        content: ", ";
      }

      &.selected {
        font-weight: bold;
      }
    }
  }

  @media only screen and (max-width: 575px) {
    .columns {
      grid-template-columns: 1fr;
    }

    .logo {
      width: auto;
    }
  }
</style>
