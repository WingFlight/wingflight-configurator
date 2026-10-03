<script>
  // Side view of a model (nose right) for the wizard's illustrations.
  // Decorative only: every scene is also described in the step's text.
  //  - "level": on the ground, level, with a spirit level above it;
  //  - "taildragger": sitting on main wheels and a tail wheel;
  //  - "tricycle": sitting level on its wheels;
  //  - "tailLift": nose on the ground, tail lifted 20 degrees;
  //  - "flying": in the air, level, with speed lines.
  let { scene = "level" } = $props();

  const GROUND = 66;
</script>

{#snippet plane()}
  <path
    class="body"
    d="M130 45 C128 39 118 38 104 38.5 L44 41 L28 40 L28 46 L104 50 C118 50.5 128 50 130 45 Z"
  />
  <path class="body" d="M44 41 L31 24 L38 24 L54 40.5 Z" />
  <path class="glass" d="M100 38.6 C104 33 114 33 118 38.4 Z" />
  <ellipse class="wing" cx="96" cy="44" rx="18" ry="2.6" />
  <ellipse class="wing" cx="37" cy="43" rx="9" ry="1.8" />
  <line class="prop" x1="132" y1="35" x2="132" y2="55" />
{/snippet}

<svg
  viewBox="0 4 160 68"
  class="plane-side"
  aria-hidden="true"
  focusable="false"
>
  {#if scene !== "flying"}
    <line class="ground" x1="6" y1={GROUND} x2="154" y2={GROUND} />
  {/if}

  {#if scene === "level"}
    <g transform="translate(0 16)">{@render plane()}</g>
    <rect class="vial" x="58" y="8" width="44" height="12" rx="6" />
    <line class="mark" x1="74" y1="8" x2="74" y2="20" />
    <line class="mark" x1="86" y1="8" x2="86" y2="20" />
    <circle class="bubble" cx="80" cy="14" r="3.4" />
  {:else if scene === "taildragger"}
    <g transform="rotate(-10.5 110 {GROUND})">
      {@render plane()}
      <line class="strut" x1="106" y1="49" x2="110" y2="58" />
      <circle class="wheel" cx="110" cy="61" r="5" />
      <line class="strut" x1="33" y1="46" x2="32" y2="49" />
      <circle class="wheel" cx="32" cy="49.5" r="2.5" />
    </g>
  {:else if scene === "tricycle"}
    {@render plane()}
    <line class="strut" x1="122" y1="49" x2="122" y2="56" />
    <circle class="wheel" cx="122" cy="61" r="5" />
    <line class="strut" x1="90" y1="49" x2="90" y2="56" />
    <circle class="wheel" cx="90" cy="61" r="5" />
  {:else if scene === "tailLift"}
    <line class="ref" x1="34" y1={GROUND} x2="130" y2={GROUND} />
    <g transform="rotate(20 130 {GROUND}) translate(0 16)">
      {@render plane()}
    </g>
    <path class="arc" d="M80 {GROUND} A50 50 0 0 1 83 48.9" />
    <text class="angle" x="62" y="61">20°</text>
  {:else if scene === "flying"}
    <g transform="translate(0 -4)">{@render plane()}</g>
    <line class="speed" x1="6" y1="30" x2="22" y2="30" />
    <line class="speed" x1="2" y1="40" x2="24" y2="40" />
    <line class="speed" x1="8" y1="50" x2="22" y2="50" />
    <line class="ref" x1="6" y1="68" x2="154" y2="68" />
  {/if}
</svg>

<style lang="scss">
  .plane-side {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .body {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .glass {
    fill: var(--color-border-soft);
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .wing {
    fill: var(--color-accent-500);
    stroke: none;
  }

  .prop,
  .strut {
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .wheel {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .ground {
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    opacity: 0.6;
  }

  .ref {
    stroke: currentColor;
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.6;
  }

  .arc {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.4;
  }

  .angle {
    fill: var(--color-accent-500);
    font-size: 10px;
    font-weight: 700;
  }

  .speed {
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    opacity: 0.5;
  }

  .vial {
    fill: var(--color-accent-soft);
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .mark {
    stroke: currentColor;
    stroke-width: 1;
    opacity: 0.6;
  }

  .bubble {
    fill: var(--color-accent-500);
  }
</style>
