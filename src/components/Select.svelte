<script>
  let {
    id,
    value = $bindable(),
    options = [],
    disabled = false,
    // Number of rows to show at once. Omitted (undefined) gives the
    // normal collapsed dropdown; a value greater than 1 renders an
    // expanded, always-open listbox instead.
    size,
    onchange,
  } = $props();
</script>

<select {id} bind:value {disabled} {size} onchange={(e) => onchange?.(e)}>
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
