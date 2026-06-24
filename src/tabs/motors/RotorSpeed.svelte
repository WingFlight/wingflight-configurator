<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import Section from "@/components/Section.svelte";
  import Meter from "@/components/Meter.svelte";

  let speeds = $derived(
    Array.from({ length: FC.CONFIG.motorCount }, (_, i) =>
      Math.round(FC.MOTOR_TELEMETRY_DATA.rpm[i] ?? 0),
    ),
  );

  let speedMaxes = $state([]);

  $effect(() => {
    speeds.forEach((speed, i) => {
      if (speedMaxes[i] === undefined) {
        speedMaxes[i] = 1000;
      }
      if (speed > speedMaxes[i]) {
        speedMaxes[i] = Math.ceil((speed + 1000) / 1000) * 1000;
      }
    });
  });
</script>

<Section label="motorRotorSpeeds">
  <div class="container">
    {#each speeds as speed, i (i)}
      <Meter
        title={$i18n.t("motors.motor.heading", { index: i + 1 })}
        rightLabel={`${(speedMaxes[i] ?? 1000).toLocaleString()} RPM`}
        leftLabel={`${speed.toLocaleString()} RPM`}
        value={100 * (speed / (speedMaxes[i] ?? 1000))}
      />
    {/each}
  </div>
</Section>

<style lang="scss">
  .container {
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
