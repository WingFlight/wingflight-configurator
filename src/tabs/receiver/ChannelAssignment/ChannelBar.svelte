<script>
  import { FC } from "@/js/fc.svelte.js";

  import Meter from "@/components/Meter.svelte";

  import { CHANNELS, RC_COMMAND } from "../rc_command.svelte.js";

  let { channel } = $props();

  const min = 750;
  const max = 2250;

  let hue = $derived((channel * 20).toString());

  let axis = $derived(FC.RC_MAP.indexOf(channel));

  let width = $derived(
    ((100 * (FC.RX_CHANNELS[channel] - min)) / (max - min)).clamp(0, 100),
  );

  let percent = $derived.by(() => {
    switch (axis) {
      case CHANNELS.ROLL:
        return RC_COMMAND.roll?.percent ?? 0;
      case CHANNELS.PITCH:
        return RC_COMMAND.pitch?.percent ?? 0;
      case CHANNELS.YAW:
        return RC_COMMAND.yaw?.percent ?? 0;
      case CHANNELS.THROTTLE:
        return RC_COMMAND.throttle?.percent ?? 0;
    }
  });

  let rightLabel = $derived(
    Number.isFinite(percent) ? `${(100 * percent).toFixed(1)}%` : "",
  );

  // Compact lines showing each backup receiver's own value for this same
  // channel index, for every backup port that is configured and reporting
  // data - lets the links be compared per-channel here instead of needing a
  // separate full channel grid per backup.
  let backupValues = $derived(
    FC.RX_INPUT_BACKUP_STATUS.ports
      .map((port) => port.channels[channel])
      .filter((value) => value !== undefined),
  );
</script>

<div class="channel-meters">
  <Meter
    --fill-hue={hue}
    leftLabel={FC.RX_CHANNELS[channel]}
    value={width}
    {rightLabel}
  />
  {#each backupValues as backupValue, i (i)}
    <Meter
      --fill-hue={hue}
      leftLabel={backupValue}
      value={((100 * (backupValue - min)) / (max - min)).clamp(0, 100)}
      compact
    />
  {/each}
</div>

<style lang="scss">
  .channel-meters {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
