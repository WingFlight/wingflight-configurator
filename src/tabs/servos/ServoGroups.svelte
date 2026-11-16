<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    followChoices,
    followersWithRules,
    servoGroups,
  } from "@/js/servoGroups.js";

  import ServoBalance from "./ServoBalance.svelte";

  // Servos on one control surface: which servo each one follows, and the
  // balance tool for every primary that has followers. Changes are sent live;
  // the Servos tab saves them.
  let { servos, hold, release, onChange } = $props();

  let count = $derived(Math.min(servos.length, FC.SERVO_FOLLOW?.length ?? 0));
  let groups = $derived(servoGroups(FC.SERVO_FOLLOW, count));
  let ignoredRules = $derived(
    followersWithRules(FC.SERVO_FOLLOW, FC.MIXER_RULES, count),
  );

  async function setFollow(servo, value) {
    FC.SERVO_FOLLOW[servo] = Number(value);
    await mspHelper.sendServoFollow(servo);
    onChange?.();
  }

  function label(servo) {
    return $i18n.t("servoFollowServo", { 1: servo + 1 });
  }
</script>

<p class="intro">{$i18n.t("servoFollowIntro")}</p>

<div class="follows">
  {#each servos.slice(0, count) as servo (servo.index)}
    {@const choices = followChoices(FC.SERVO_FOLLOW, servo.index, count)}
    {@const current = FC.SERVO_FOLLOW[servo.index]}
    <label class="follow">
      <span class="name">{label(servo.index)}</span>
      <select
        value={current}
        disabled={choices.length === 0 && !current}
        onchange={(e) => setFollow(servo.index, e.target.value)}
      >
        <option value={0}>{$i18n.t("servoFollowNone")}</option>
        {#each choices as choice (choice)}
          <option value={choice + 1}>
            {$i18n.t("servoFollowOf", { 1: choice + 1 })}
          </option>
        {/each}
        <!-- A follow the list doesn't offer (set elsewhere), shown as it is -->
        {#if current && !choices.includes(current - 1)}
          <option value={current}>
            {$i18n.t("servoFollowOf", { 1: current })}
          </option>
        {/if}
      </select>
    </label>
  {/each}
</div>

{#if ignoredRules.length > 0}
  <div class="note">
    <p>
      {$i18n.t("servoFollowRulesIgnored", {
        1: ignoredRules.map((s) => s + 1).join(", "),
      })}
    </p>
  </div>
{/if}

{#if groups.length > 0}
  <h3>{$i18n.t("servoBalanceTitle")}</h3>
  <p class="intro">{$i18n.t("servoBalanceSteps")}</p>
  <div class="groups">
    {#each groups as group (group.primary)}
      <ServoBalance
        primary={group.primary}
        followers={group.followers}
        {hold}
        {release}
        {onChange}
        servoLabel={label}
      />
    {/each}
  </div>
{/if}

<style lang="scss">
  .intro {
    margin: 0;
    padding: 8px;
    max-width: 80ch;
    color: var(--color-text-soft);
  }

  h3 {
    margin: 12px 8px 0;
    font-weight: 600;
  }

  .follows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px 16px;
    padding: 8px;
  }

  .follow {
    display: flex;
    align-items: center;
    gap: 8px;

    select {
      flex: 1;
      min-width: 0;
    }
  }

  .name {
    min-width: 4.5em;
    font-weight: 500;
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px;
  }

  .note {
    margin: 8px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-accent);

    p {
      margin: 0;
    }
  }
</style>
