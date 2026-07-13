<script>
  import { FC } from "@/js/fc.svelte.js";
  import { RateCurve } from "@/js/RateCurve.js";

  import Section from "@/components/Section.svelte";

  let {
    currentRates,
    maxAngularVel,
    maxAngularRoll,
    maxAngularPitch,
    maxAngularYaw,
    liveSetpoints,
  } = $props();

  const RATES_TYPE_WINGFLIGHT = 0;
  const SUPER_EXPO = true;
  const DEADBAND = 0;

  const rateCurve = new RateCurve();

  let curveCanvas;
  let stickCanvas;

  function drawAxes(context, width, height) {
    context.strokeStyle = "#000000";
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();

    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(width / 2, height);
    context.stroke();
  }

  function drawCurve(rate, rcRate, rcExpo, colour, yOffset, context) {
    context.save();
    context.strokeStyle = colour;
    context.translate(0, yOffset);
    rateCurve.draw(
      RATES_TYPE_WINGFLIGHT,
      rate,
      rcRate,
      rcExpo,
      SUPER_EXPO,
      DEADBAND,
      undefined,
      maxAngularVel,
      context,
    );
    context.restore();
  }

  function redrawCurve() {
    if (!curveCanvas) {
      return;
    }

    const context = curveCanvas.getContext("2d");
    const width = curveCanvas.width;
    const height = curveCanvas.height;
    const lineScale = context.canvas.width / context.canvas.clientWidth;

    context.clearRect(0, 0, width, height);
    drawAxes(context, width, height);

    context.lineWidth = 2 * lineScale;

    drawCurve(
      currentRates.yaw_srate,
      currentRates.yaw_rc_rate,
      currentRates.yaw_rc_expo,
      "#0000ff",
      4,
      context,
    );
    drawCurve(
      currentRates.roll_srate,
      currentRates.roll_rc_rate,
      currentRates.roll_rc_expo,
      "#ff0000",
      -2,
      context,
    );
    drawCurve(
      currentRates.pitch_srate,
      currentRates.pitch_rc_rate,
      currentRates.pitch_rc_expo,
      "#00ff00",
      2,
      context,
    );
  }

  function drawStickPosition(context, color, rcPos, value, maxValue) {
    const DEFAULT_SIZE = 60;
    const rateScaling = context.canvas.height / 2 / maxValue;

    context.save();
    context.fillStyle = color;

    context.translate(context.canvas.width / 2, context.canvas.height / 2);
    context.beginPath();
    context.arc(
      rcPos,
      -rateScaling * value,
      context.canvas.height / DEFAULT_SIZE,
      0,
      2 * Math.PI,
    );
    context.fill();
    context.restore();
  }

  function drawAxisLabel(context, axisLabel, x, y, align, color) {
    context.fillStyle = color || "#000000";
    context.textAlign = align || "center";
    context.fillText(axisLabel, x, y);
  }

  // Draws a rounded "speech balloon" label pointing at (x, y), nudging
  // itself up/down to avoid overlapping any balloon already drawn this
  // frame (tracked via the `dirty` accumulator).
  function drawBalloonLabel(context, axisLabel, x, y, align, colors, dirty) {
    const DEFAULT_OFFSET = 125;
    const DEFAULT_RADIUS = 10;
    const DEFAULT_MARGIN = 5;

    const fontSize = parseInt(context.font, 10);

    const width = context.measureText(axisLabel).width * 1.2;
    const height = fontSize * 1.5;
    const pointerY = y;

    context.fillStyle = colors.color || "#ffffff";
    context.strokeStyle = colors.border || "#000000";

    x *= context.canvas.clientWidth / context.canvas.clientHeight;

    x +=
      (align === "right" ? -(width + DEFAULT_OFFSET) : 0) +
      (align === "left" ? DEFAULT_OFFSET : 0);
    y -= height / 2;
    if (y < 0) y = 0;
    else if (y > context.height) y = context.height;

    for (let i = 0; i < dirty.length; i++) {
      if (
        (x >= dirty[i].left && x <= dirty[i].right) ||
        (x + width >= dirty[i].left && x + width <= dirty[i].right)
      ) {
        if (
          (y >= dirty[i].top && y <= dirty[i].bottom) ||
          (y + height >= dirty[i].top && y + height <= dirty[i].bottom)
        ) {
          if (
            y <= (dirty[i].bottom - dirty[i].top) / 2 &&
            dirty[i].top - height > 0
          ) {
            y = dirty[i].top - height;
          } else {
            y = dirty[i].bottom;
          }
        }
      }
    }

    dirty.push({
      left: x,
      right: x + width,
      top: y - DEFAULT_MARGIN,
      bottom: y + height + DEFAULT_MARGIN,
    });

    const pointerLength = (height - 2 * DEFAULT_RADIUS) / 6;

    context.beginPath();
    context.moveTo(x + DEFAULT_RADIUS, y);
    context.lineTo(x + width - DEFAULT_RADIUS, y);
    context.quadraticCurveTo(x + width, y, x + width, y + DEFAULT_RADIUS);

    if (align === "right") {
      context.lineTo(x + width, y + DEFAULT_RADIUS + pointerLength);
      context.lineTo(x + width + DEFAULT_OFFSET, pointerY);
      context.lineTo(x + width, y + height - DEFAULT_RADIUS - pointerLength);
    }
    context.lineTo(x + width, y + height - DEFAULT_RADIUS);

    context.quadraticCurveTo(
      x + width,
      y + height,
      x + width - DEFAULT_RADIUS,
      y + height,
    );
    context.lineTo(x + DEFAULT_RADIUS, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - DEFAULT_RADIUS);

    if (align === "left") {
      context.lineTo(x, y + height - DEFAULT_RADIUS - pointerLength);
      context.lineTo(x - DEFAULT_OFFSET, pointerY);
      context.lineTo(x, y + DEFAULT_RADIUS - pointerLength);
    }
    context.lineTo(x, y + DEFAULT_RADIUS);

    context.quadraticCurveTo(x, y, x + DEFAULT_RADIUS, y);
    context.closePath();

    context.fill();
    context.stroke();

    drawAxisLabel(
      context,
      axisLabel,
      x + width / 2,
      y + (height + fontSize) / 2 - 4,
      "center",
      colors.text,
    );
  }

  const BALLOON_COLORS = {
    roll: {
      color: "rgba(255,128,128,0.4)",
      border: "rgba(255,128,128,0.6)",
      text: "#000000",
    },
    pitch: {
      color: "rgba(128,255,128,0.4)",
      border: "rgba(128,255,128,0.6)",
      text: "#000000",
    },
    yaw: {
      color: "rgba(128,128,255,0.4)",
      border: "rgba(128,128,255,0.6)",
      text: "#000000",
    },
  };

  function redrawStick() {
    if (!stickCanvas || !maxAngularVel) {
      return;
    }

    const context = stickCanvas.getContext("2d");
    const width = stickCanvas.width;
    const height = stickCanvas.height;
    const windowScale = 400 / context.canvas.clientHeight;
    const rateScale = height / 2 / maxAngularVel;
    const lineScale = context.canvas.width / context.canvas.clientWidth;
    const textScale = context.canvas.clientHeight / context.canvas.clientWidth;

    context.save();
    context.clearRect(0, 0, width, height);

    context.font =
      (windowScale <= 1 ? 24 : 24 * windowScale) +
      "pt Verdana, Arial, sans-serif";

    drawStickPosition(
      context,
      "#FF8080",
      FC.RC_COMMAND[0],
      liveSetpoints.roll,
      maxAngularVel,
    );
    drawStickPosition(
      context,
      "#80FF80",
      FC.RC_COMMAND[1],
      liveSetpoints.pitch,
      maxAngularVel,
    );
    drawStickPosition(
      context,
      "#8080FF",
      FC.RC_COMMAND[2],
      liveSetpoints.yaw,
      maxAngularVel,
    );

    context.lineWidth = lineScale;
    context.scale(textScale, 1);

    drawAxisLabel(
      context,
      maxAngularVel.toFixed(0) + "°/s",
      (width / 2 - 10) / textScale,
      parseInt(context.font, 10) * 1.2,
      "right",
    );

    let balloonsDirty = [];

    const maxValBalloons = [
      { value: maxAngularYaw, color: BALLOON_COLORS.yaw },
      { value: maxAngularRoll, color: BALLOON_COLORS.roll },
      { value: maxAngularPitch, color: BALLOON_COLORS.pitch },
    ];
    maxValBalloons
      .sort((a, b) => b.value - a.value)
      .forEach((balloon) => {
        drawBalloonLabel(
          context,
          balloon.value.toFixed(0) + "°/s",
          width,
          rateScale * (maxAngularVel - balloon.value),
          "right",
          balloon.color,
          balloonsDirty,
        );
      });

    drawBalloonLabel(
      context,
      liveSetpoints.roll.toFixed(0) + "°/s",
      10,
      150,
      "none",
      BALLOON_COLORS.roll,
      balloonsDirty,
    );
    drawBalloonLabel(
      context,
      liveSetpoints.pitch.toFixed(0) + "°/s",
      10,
      250,
      "none",
      BALLOON_COLORS.pitch,
      balloonsDirty,
    );
    drawBalloonLabel(
      context,
      liveSetpoints.yaw.toFixed(0) + "°/s",
      10,
      350,
      "none",
      BALLOON_COLORS.yaw,
      balloonsDirty,
    );

    context.restore();
  }

  $effect(() => {
    void currentRates;
    void maxAngularVel;
    redrawCurve();
  });

  $effect(() => {
    void liveSetpoints;
    void maxAngularVel;
    void maxAngularRoll;
    void maxAngularPitch;
    void maxAngularYaw;
    redrawStick();
  });
</script>

<Section label="rateSetupRatesCurve" summary="rateSetupRatesCurveTip">
  <div class="rate-curve">
    <canvas bind:this={curveCanvas} width="1000" height="1000"></canvas>
    <canvas bind:this={stickCanvas} width="1000" height="1000"></canvas>
  </div>
</Section>

<style lang="scss">
  .rate-curve {
    position: relative;
    height: 288px;
    min-width: 200px;

    background-color: var(--color-surface);
  }

  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
</style>
