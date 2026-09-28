<script>
  import { i18n } from "@/js/i18n.js";

  // Plain-language guide shown beside the Flight Feel table: the columns keep
  // their real names (Master Gain, I-Term Decay, I-Term Relax) and this says
  // what each one feels like in the air and which way to turn it. Always
  // visible rather than a tooltip, so it works on touch screens too.
  // `throttle` adds the Throttle (TPA) line (main loop only), `speed` the
  // GPS Speed (SPA) line.
  let { throttle = false, speed = false } = $props();

  let rows = $derived([
    { name: "profilesMasterGainColumn", text: "profilesFlightFeelGuideGain" },
    { name: "profilesItermDecayColumn", text: "profilesFlightFeelGuideDecay" },
    { name: "profilesBouncebackColumn", text: "profilesFlightFeelGuideRelax" },
    ...(throttle
      ? [
          {
            name: "controlAxisThrottle",
            text: "profilesFlightFeelGuideThrottle",
          },
        ]
      : []),
    ...(speed
      ? [{ name: "controlAxisSpeed", text: "profilesFlightFeelGuideSpeed" }]
      : []),
  ]);
</script>

<aside class="guide">
  <div class="guide-title">{$i18n.t("profilesFlightFeelGuideTitle")}</div>
  <dl>
    {#each rows as row (row.name)}
      <dt>{$i18n.t(row.name)}</dt>
      <dd>{$i18n.t(row.text)}</dd>
    {/each}
  </dl>
</aside>

<style lang="scss">
  .guide {
    flex: 1 1 260px;
    max-width: 460px;
    padding: 8px 12px;
    border-left: 2px solid var(--color-border);
    color: var(--color-text-soft);
    font-size: 0.8rem;
  }

  .guide-title {
    margin-bottom: 6px;
    font-weight: 600;
    color: var(--color-text);
  }

  dl {
    margin: 0;
  }

  dt {
    font-weight: 600;
    color: var(--color-text);
  }

  dd {
    margin: 0 0 8px 0;
  }
</style>
