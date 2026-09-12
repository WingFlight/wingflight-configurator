/**
 * File: src/js/remap_fc/fixtures/vantac_rf007.js
 * Canned CLI output for the FrSky Vantac RF007, in the exact line
 * formats cli.c prints (see hardware_parser.js's header for the
 * formats and where they come from). Used by virtual mode, so the
 * wiring stage and the board drawing are developed against the shape
 * of hardware we actually ship for (tools/board-editor/REQUIREMENTS.md,
 * R9).
 *
 * Generated from the board's own entry in the unified catalogue,
 * configs/FRSK-VANTAC_RF007.config in WingFlight/wingflight-targets, a
 * copy of which is vendored at
 * test/boardview/fixtures/FRSK-VANTAC_RF007.config. So the pins,
 * timers and DMA here are the board's real ones, and a test checks the
 * two still agree. What is added on top is only what a config file
 * does not carry: the slots the firmware prints as NONE, and the
 * `dma show` / `timer show` / `status` output the wiring session reads
 * alongside the dump.
 *
 * Refresh it from the catalogue if the board's config changes.
 */

export const VANTAC_RF007_DUMP_HARDWARE = `dump hardware

# version
# Wingflight / STM32F7X2 (S7X2) 4.6.0 Sep  1 2026 / 12:00:00 (abcdef1) MSP API: 22.2

# start the command batch
batch start

board_name VANTAC_RF007
board_design
manufacturer_id FRSK

# resources
resource BEEPER 1 NONE
resource MOTOR 1 A09
resource MOTOR 2 NONE
resource MOTOR 3 NONE
resource MOTOR 4 NONE
resource SERVO 1 B04
resource SERVO 2 B05
resource SERVO 3 B00
resource SERVO 4 A15
resource SERVO 5 NONE
resource SERVO 6 NONE
resource SERVO 7 NONE
resource SERVO 8 NONE
resource FREQ 1 A02
resource FREQ 2 NONE
resource FREQ 3 NONE
resource FREQ 4 NONE
resource PPM 1 NONE
resource LED_STRIP 1 NONE
resource SERIAL_TX 1 B06
resource SERIAL_TX 2 NONE
resource SERIAL_TX 3 B10
resource SERIAL_TX 4 A00
resource SERIAL_TX 5 C12
resource SERIAL_TX 6 NONE
resource SERIAL_TX 7 NONE
resource SERIAL_TX 8 NONE
resource SERIAL_TX 9 NONE
resource SERIAL_TX 10 NONE
resource SERIAL_RX 1 B07
resource SERIAL_RX 2 A03
resource SERIAL_RX 3 B11
resource SERIAL_RX 4 A01
resource SERIAL_RX 5 NONE
resource SERIAL_RX 6 NONE
resource SERIAL_RX 7 NONE
resource SERIAL_RX 8 NONE
resource SERIAL_RX 9 NONE
resource SERIAL_RX 10 NONE
resource I2C_SCL 1 B08
resource I2C_SCL 2 NONE
resource I2C_SDA 1 B09
resource I2C_SDA 2 NONE
resource ADC_BATT 1 C00
resource ADC_CURR 1 NONE
resource ADC_RSSI 1 NONE
resource ADC_EXT 1 NONE
resource CAMERA_CONTROL 1 NONE
resource PINIO 1 NONE
resource PINIO 2 NONE
resource PINIO 3 NONE
resource PINIO 4 NONE
resource LED 1 C14
resource LED 2 C15
resource SPI_SCK 1 A05
resource SPI_SCK 2 B13
resource SPI_MISO 1 A06
resource SPI_MISO 2 B14
resource SPI_MOSI 1 A07
resource SPI_MOSI 2 B15
resource ADC_BEC 1 C01
resource ADC_BUS 1 C02
resource FLASH_CS 1 B12
resource GYRO_EXTI 1 B02
resource GYRO_CS 1 A04

# timer
timer A00 AF2
timer A01 AF2
timer A02 AF2
timer A03 AF3
timer A09 AF1
timer A15 AF1
timer B00 AF2
timer B01 AF2
timer B04 AF2
timer B05 AF2
timer B06 AF2
timer B07 AF2

# dma
dma pin A02 0
dma pin A09 0
dma pin A15 0
dma pin B00 0
dma pin B01 0
dma pin B04 0
dma pin B05 0
dma pin B06 0
dma pin B07 0

# master
set gyro_1_bustype = SPI
set gyro_1_spibus = 1
set gyro_1_sensor_align = CW90
set gyro_1_align_yaw = 900
set baro_hardware = AUTO
set baro_bustype = I2C
set baro_i2c_device = 1
set baro_i2c_address = 119
set mag_hardware = NONE
set mag_bustype = I2C
set mag_i2c_device = 2
set blackbox_device = SPIFLASH
set blackbox_rate_denom = 2
set flash_spi_bus = 2
set battery_meter = ADC
set current_meter = NONE
set vbat_scale = 2532
set vbat_divider = 102
set vbec_scale = 1216
set vbec_divider = 196
set vbus_scale = 850
set vbus_divider = 274
set pid_process_denom = 2
set motor_pwm_protocol = PWM
set motor_pwm_rate = 250
set use_unsynced_pwm = ON
set dshot_burst = OFF
set dshot_bidir = OFF
set dshot_bitbang = OFF
set serialrx_provider = FBUS
set serialrx_inverted = ON
set serialrx_halfduplex = ON
set position_baro_alt_lpf = 200
set position_vario_lpf = 100

# end the command batch
batch end

# `;

// A factory-default board differs from its defaults in nothing, so the
// diff is just the version/board header with empty sections.
export const VANTAC_RF007_DIFF_HARDWARE_DEFAULTS = `diff hardware defaults

# version
# Wingflight / STM32F7X2 (S7X2) 4.6.0 Sep  1 2026 / 12:00:00 (abcdef1) MSP API: 22.2

# start the command batch
batch start

board_name VANTAC_RF007
manufacturer_id FRSK

# end the command batch
batch end

# `;

export const VANTAC_RF007_DMA_SHOW = `dma show

Currently active DMA:
--------------------
DMA1 Stream 0: FREE
DMA1 Stream 1: FREE
DMA1 Stream 2: FREE
DMA1 Stream 3: FREE
DMA1 Stream 4: FREE
DMA1 Stream 5: FREE
DMA1 Stream 6: FREE
DMA1 Stream 7: FREE
DMA2 Stream 0: FREE
DMA2 Stream 1: FREE
DMA2 Stream 2: FREE
DMA2 Stream 3: FREE
DMA2 Stream 4: FREE
DMA2 Stream 5: FREE
DMA2 Stream 6: FREE
DMA2 Stream 7: FREE

# `;

export const VANTAC_RF007_TIMER_SHOW = `timer show

Currently active Timers:
-----------------------
TIM1:
    CH2 : MOTOR 1
TIM2:
    CH1 : SERVO 4
TIM3:
    CH3 : SERVO 3
    CH1 : SERVO 1
    CH2 : SERVO 2
TIM4:
    CH1 : SERIAL_TX 1
    CH2 : SERIAL_RX 1
TIM5:
    CH1 : SERIAL_TX 4
    CH2 : SERIAL_RX 4
    CH3 : FREQ 1
TIM9:
    CH2 : SERIAL_RX 2

# `;

export const VANTAC_RF007_STATUS = `status

MCU F7X2 Clock=216MHz, Vref=3.30V, Core temp=39degC
Stack size: 2048, Stack address: 0x2003fff0
Configuration: CONFIGURED, size: 4132, max available: 16384
Devices detected: SPI:2, I2C:1
Gyro detected: gyro 1 locked dma
GYRO=ICM42688P, ACC=ICM42688P, BARO=NONE
CPU:9%, cycle time: 250, GYRO rate: 4000, RX rate: 33, System rate: 10
Arming disable flags: RXLOSS CLI MSP

# `;

/** What the board reports over MSP_BOARD_INFO. */
export const VANTAC_RF007_CONFIG = {
  targetName: "STM32F7X2",
  boardName: "VANTAC_RF007",
  boardDesign: "",
  manufacturerId: "FRSK",
  mcuTypeId: 4,
};
