<script>
  import { i18n } from "@/js/i18n.js";

  import {
    BAUD_RATE_OPTIONS,
    PORT_NAMES_RF2,
    UART_NAMES,
    getPortBaudrate,
    getPortExcl,
    getPortFunc,
    getPortType,
    setPortBaudrate,
  } from "./serial_ports.js";

  let { port, boardDesign, functionOptions, usedFunctionsMask } = $props();

  let portLabel = $derived(
    boardDesign in PORT_NAMES_RF2
      ? PORT_NAMES_RF2[boardDesign][port.identifier]
      : UART_NAMES[port.identifier],
  );
  let uartLabel = $derived(
    boardDesign in PORT_NAMES_RF2 ? `[${UART_NAMES[port.identifier]}]` : null,
  );

  let options = $derived.by(() => {
    const opts = functionOptions.map((func) => ({
      value: func.id,
      label: $i18n.t(`portsFunction_${func.name}`),
      disabled: (func.excl & exclFuncs) !== 0,
    }));

    if (!getPortFunc(port.functionMask)) {
      opts.push({
        value: port.functionMask,
        label: $i18n.t("portsFunction_CUSTOM"),
        disabled: false,
      });
    }

    return opts;
  });

  let portType = $derived(getPortType(port.functionMask));
  let exclFuncs = $derived(usedFunctionsMask ^ getPortExcl(port.functionMask));

  let baudrateOptions = $derived.by(() => {
    const current = getPortBaudrate(port, portType);
    const rates = [...BAUD_RATE_OPTIONS[portType]];
    if (!rates.includes(current)) {
      rates.push(current);
    }
    return rates.map((rate) => ({
      value: rate,
      label: $i18n.exists(`baudrate_${rate}`)
        ? $i18n.t(`baudrate_${rate}`)
        : rate,
    }));
  });

  function onFunctionChange(e) {
    port.functionMask = Number(e.target.value);
  }

  function onBaudrateChange(e) {
    setPortBaudrate(port, portType, e.target.value);
  }
</script>

<div class="port-row">
  <div class="port-identifier">
    <div class="port-name">{portLabel}</div>
    {#if uartLabel}
      <div class="uart-name">{uartLabel}</div>
    {/if}
  </div>
  <select value={port.functionMask} onchange={onFunctionChange}>
    {#each options as option (option.value)}
      <option value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    {/each}
  </select>
  <select value={getPortBaudrate(port, portType)} onchange={onBaudrateChange}>
    {#each baudrateOptions as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>

<style lang="scss">
  .port-row {
    display: grid;
    grid-template-columns: 90px 1fr 1fr;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;

    &:not(:last-child) {
      border-bottom: 1px dotted var(--color-border);
    }
  }

  .port-identifier {
    font-weight: 600;
    font-size: 0.8rem;
  }

  .uart-name {
    font-weight: 400;
    font-size: 0.7rem;
    color: var(--color-text-soft);
  }

  select {
    width: 100%;
  }
</style>
