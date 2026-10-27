<script>
  import semver from "semver";

  import { FC } from "@/js/fc.svelte.js";
  import { isFbusMuxSerialPort } from "@/js/FbusMux.js";
  import { i18n } from "@/js/i18n.js";

  import {
    BAUD_RATE_OPTIONS,
    PORT_FUNCTIONS,
    PORT_NAMES_RF2,
    UART_NAMES,
    VCP_PORT_IDENTIFIER,
    getPortBaudrate,
    getPortExcl,
    getPortFunc,
    getPortType,
    setPortBaudrate,
  } from "./util.js";

  let ports = $derived(
    FC.SERIAL_CONFIG.ports.filter(
      (port) => port.identifier !== VCP_PORT_IDENTIFIER,
    ),
  );

  let usedExclMask = $derived(
    FC.SERIAL_CONFIG.ports.reduce(
      (mask, port) => mask | getPortExcl(port.functionMask),
      0,
    ),
  );

  function functionOptionsFor(port) {
    const exclFuncs = usedExclMask ^ getPortExcl(port.functionMask);
    const options = [];

    for (const func of PORT_FUNCTIONS) {
      if (
        func.minApiVersion &&
        semver.lt(FC.CONFIG.apiVersion, func.minApiVersion)
      ) {
        continue;
      }

      if (func.hide && func.id !== port.functionMask) {
        continue;
      }

      // A port already set to it stays editable, so the function can be removed
      const featureOff =
        func.feature &&
        func.id !== port.functionMask &&
        !FC.FEATURE_CONFIG.features.isEnabled(func.feature);
      const label = $i18n.t(`portsFunction_${func.name}`);

      options.push({
        value: func.id,
        label: featureOff
          ? $i18n.t("portsFunctionFeatureOff", {
              function: label,
              feature: func.feature,
            })
          : label,
        disabled: featureOff || !!(func.id & exclFuncs),
      });
    }

    if (!getPortFunc(port.functionMask)) {
      options.push({
        value: port.functionMask,
        label: $i18n.t("portsFunction_CUSTOM"),
      });
    }

    return options;
  }

  function baudrateOptionsFor(port) {
    const portType = getPortType(port.functionMask);
    const baudRate = getPortBaudrate(port, portType);
    const rates = BAUD_RATE_OPTIONS[portType];

    const options = rates.map((rate) => ({
      value: rate,
      label: $i18n.t(`baudrate_${rate}`, { defaultValue: rate }),
    }));

    if (!rates.includes(String(baudRate))) {
      options.push({
        value: baudRate,
        label: $i18n.t(`baudrate_${baudRate}`, {
          defaultValue: String(baudRate),
        }),
      });
    }

    return options;
  }

  function onFunctionChange(port, value) {
    port.functionMask = Number(value);
  }

  function onBaudrateChange(port, value) {
    setPortBaudrate(port, getPortType(port.functionMask), value);
  }

  function portLabel(port) {
    const names = PORT_NAMES_RF2[FC.CONFIG.boardDesign];
    return names
      ? (names[port.identifier] ?? UART_NAMES[port.identifier])
      : UART_NAMES[port.identifier];
  }

  function portUartLabel(port) {
    return PORT_NAMES_RF2[FC.CONFIG.boardDesign]
      ? `[${UART_NAMES[port.identifier]}]`
      : "";
  }
</script>

<table class="ports">
  <tbody>
    {#each ports as port (port.identifier)}
      <tr>
        <td class="identifier">
          <div class="portid">{portLabel(port)}</div>
          <div class="uartid">{portUartLabel(port)}</div>
        </td>
        <td>
          <!-- The FBUS mux FPGA's configuration port must stay without a
               function, or the mux stays off at the next boot. Locked
               while free; with a function on it, it stays editable so
               the function can be removed. -->
          {#if isFbusMuxSerialPort(FC.FBUS_MUX, port) && !port.functionMask}
            <select disabled>
              <option>{$i18n.t("portsFbusMuxReserved")}</option>
            </select>
          {:else}
            <select
              value={port.functionMask}
              onchange={(e) => onFunctionChange(port, e.target.value)}
            >
              {#each functionOptionsFor(port) as opt (opt.value)}
                <option value={opt.value} disabled={opt.disabled}
                  >{opt.label}</option
                >
              {/each}
            </select>
            {#if isFbusMuxSerialPort(FC.FBUS_MUX, port)}
              <div class="mux-warning">
                {$i18n.t("portsFbusMuxReservedWarning")}
              </div>
            {/if}
          {/if}
        </td>
        <td>
          <select
            value={getPortBaudrate(port, getPortType(port.functionMask))}
            onchange={(e) => onBaudrateChange(port, e.target.value)}
          >
            {#each baudrateOptionsFor(port) as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style lang="scss">
  .ports {
    width: 100%;
    border-collapse: collapse;

    td {
      padding: 5px 3px;
      vertical-align: middle;
    }

    tr + tr td {
      border-top: 1px dotted var(--color-border);
    }
  }

  .identifier {
    min-width: 60px;
    white-space: nowrap;
  }

  .portid {
    font-size: 0.8rem;
    font-weight: bold;
  }

  .uartid {
    font-size: 0.7rem;
    color: var(--color-text-soft);
  }

  select {
    width: 100%;
  }

  .mux-warning {
    margin-top: 3px;
    font-size: 0.75rem;
    color: var(--color-status-bad);
  }
</style>
