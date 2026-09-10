/**
 * File: src/js/remap_fc/fixtures/matekf405.js
 * Canned CLI output for a MATEKF405 (Matek F405-WING) running Wingflight
 * with factory defaults, in the exact line formats cli.c prints (see
 * hardware_parser.js's header for the formats and where they come
 * from). Used by wiring_session.svelte.js in virtual mode, so the
 * wiring stage can be developed without hardware, and by the parser
 * tests in test/remap_fc/.
 *
 * Pin/function defaults come from the firmware target:
 *   src/main/target/MATEKF405/target.c  (timerHardware[]: S1 PC6 TIM3 CH1,
 *     S2 PC7 TIM8 CH2, S3 PC8 TIM8 CH3, S4 PC9 TIM8 CH4, S5 PA15 TIM2 CH1,
 *     S6 PA8 TIM1 CH1, S7 PB8 TIM4 CH3, LED PB6 TIM4 CH1, PPM PA3 TIM5 CH4,
 *     TX4 PA0 / RX4 PA1 TIM5, TX2 PA2 TIM9 CH1)
 *   src/main/target/MATEKF405/target.h  (UART1 A09/A10, UART2 A02/A03,
 *     UART3 C10/C11, UART4 A00/A01, UART5 C12/D02, I2C1 SCL B06 / SDA B07,
 *     Vbat C05, Curr C04, RSSI B01, BEEPER C13, LED0 B09, LED1 A14)
 * With MAX_SUPPORTED_MOTORS = 4 the first four TIM_USE_MOTOR entries become
 * MOTOR 1..4; there are no TIM_USE_SERVO entries, so every SERVO is NONE.
 * Timer AFs and DMA option indices were cross-checked against
 * MCU-all.json's STM32F40X data.
 */

export const MATEKF405_DUMP_HARDWARE = `dump hardware

# version
# Wingflight / MATEKF405 (MKF4) 4.6.0 Sep  1 2026 / 12:00:00 (abcdef1) MSP API: 22.2

# start the command batch
batch start

board_name MATEKF405
board_design
manufacturer_id MTKS

# resources
resource BEEPER 1 C13
resource MOTOR 1 C06
resource MOTOR 2 C07
resource MOTOR 3 C08
resource MOTOR 4 C09
resource SERVO 1 NONE
resource SERVO 2 NONE
resource SERVO 3 NONE
resource SERVO 4 NONE
resource SERVO 5 NONE
resource SERVO 6 NONE
resource SERVO 7 NONE
resource SERVO 8 NONE
resource PPM 1 A03
resource LED_STRIP 1 B06
resource SERIAL_TX 1 A09
resource SERIAL_TX 2 A02
resource SERIAL_TX 3 C10
resource SERIAL_TX 4 A00
resource SERIAL_TX 5 C12
resource SERIAL_TX 6 NONE
resource SERIAL_TX 7 NONE
resource SERIAL_TX 8 NONE
resource SERIAL_TX 9 NONE
resource SERIAL_TX 10 NONE
resource SERIAL_TX 11 NONE
resource SERIAL_TX 12 NONE
resource SERIAL_RX 1 A10
resource SERIAL_RX 2 A03
resource SERIAL_RX 3 C11
resource SERIAL_RX 4 A01
resource SERIAL_RX 5 D02
resource SERIAL_RX 6 NONE
resource SERIAL_RX 7 NONE
resource SERIAL_RX 8 NONE
resource SERIAL_RX 9 NONE
resource SERIAL_RX 10 NONE
resource SERIAL_RX 11 NONE
resource SERIAL_RX 12 NONE
resource I2C_SCL 1 B06
resource I2C_SCL 2 NONE
resource I2C_SCL 3 NONE
resource I2C_SDA 1 B07
resource I2C_SDA 2 NONE
resource I2C_SDA 3 NONE
resource LED 1 B09
resource LED 2 A14
resource LED 3 NONE
resource SPI_SCK 1 A05
resource SPI_SCK 2 NONE
resource SPI_SCK 3 B03
resource SPI_MISO 1 A06
resource SPI_MISO 2 NONE
resource SPI_MISO 3 B04
resource SPI_MOSI 1 A07
resource SPI_MOSI 2 NONE
resource SPI_MOSI 3 B05
resource ESCSERIAL 1 A03
resource ADC_BATT 1 C05
resource ADC_CURR 1 C04
resource ADC_RSSI 1 B01
resource ADC_BEC 1 NONE
resource ADC_BUS 1 NONE
resource ADC_EXT 1 NONE
resource SDCARD_CS 1 C01
resource SDCARD_DETECT 1 NONE
resource FLASH_CS 1 C00
resource GYRO_EXTI 1 C03
resource GYRO_CS 1 C02
resource FREQ 1 NONE
resource FREQ 2 NONE
resource FREQ 3 NONE
resource FREQ 4 NONE

# timer
timer A03 AF2
# pin A03: TIM5 CH4 (AF2)
timer C06 AF2
# pin C06: TIM3 CH1 (AF2)
timer C07 AF3
# pin C07: TIM8 CH2 (AF3)
timer C08 AF3
# pin C08: TIM8 CH3 (AF3)
timer C09 AF3
# pin C09: TIM8 CH4 (AF3)
timer A15 AF1
# pin A15: TIM2 CH1 (AF1)
timer A08 AF1
# pin A08: TIM1 CH1 (AF1)
timer B08 AF2
# pin B08: TIM4 CH3 (AF2)
timer B06 AF2
# pin B06: TIM4 CH1 (AF2)
timer A00 AF2
# pin A00: TIM5 CH1 (AF2)
timer A01 AF2
# pin A01: TIM5 CH2 (AF2)
timer A02 AF3
# pin A02: TIM9 CH1 (AF3)

# dma
dma SPI_MOSI 1 NONE
dma SPI_MOSI 2 NONE
dma SPI_MOSI 3 NONE
dma SPI_MISO 1 NONE
dma SPI_MISO 2 NONE
dma SPI_MISO 3 NONE
dma ADC 1 1
# ADC 1: DMA2 Stream 4 Channel 0
dma ADC 2 NONE
dma ADC 3 NONE
dma UART_TX 1 NONE
dma UART_TX 2 NONE
dma UART_TX 3 NONE
dma UART_TX 4 NONE
dma UART_TX 5 NONE
dma UART_RX 1 NONE
dma UART_RX 2 NONE
dma UART_RX 3 NONE
dma UART_RX 4 NONE
dma UART_RX 5 NONE
dma pin A03 NONE
dma pin C06 0
# pin C06: DMA1 Stream 4 Channel 5
dma pin C07 1
# pin C07: DMA2 Stream 3 Channel 7
dma pin C08 0
# pin C08: DMA2 Stream 2 Channel 0
dma pin C09 0
# pin C09: DMA2 Stream 7 Channel 7
dma pin A15 0
# pin A15: DMA1 Stream 5 Channel 3
dma pin A08 0
# pin A08: DMA2 Stream 6 Channel 0
dma pin B08 0
# pin B08: DMA1 Stream 7 Channel 2
dma pin B06 0
# pin B06: DMA1 Stream 0 Channel 2
dma pin A00 NONE
dma pin A01 NONE
dma pin A02 NONE

# master
set gyro_1_bustype = SPI
set gyro_1_spibus = 1
set gyro_1_sensor_align = CW180

# end the command batch
batch end

# `;

// A factory-default board differs from its defaults in nothing, so the
// diff is just the version/board header with empty sections.
export const MATEKF405_DIFF_HARDWARE_DEFAULTS = `diff hardware defaults

# version
# Wingflight / MATEKF405 (MKF4) 4.6.0 Sep  1 2026 / 12:00:00 (abcdef1) MSP API: 22.2

# start the command batch
batch start

board_name MATEKF405
manufacturer_id MTKS

# end the command batch
batch end

# `;

// The same board after a user moved MOTOR 4 off S4 to make room for a
// servo on S4 (C09), put SERVO 1 there, and moved the LED strip onto
// S7 (B08). Every changed line carries its '#'-prefixed default.
export const MATEKF405_DIFF_HARDWARE_DEFAULTS_REMAPPED = `diff hardware defaults

# version
# Wingflight / MATEKF405 (MKF4) 4.6.0 Sep  1 2026 / 12:00:00 (abcdef1) MSP API: 22.2

# start the command batch
batch start

board_name MATEKF405
manufacturer_id MTKS

# resources
#resource MOTOR 4 C09
resource MOTOR 4 NONE
#resource SERVO 1 NONE
resource SERVO 1 C09
#resource LED_STRIP 1 B06
resource LED_STRIP 1 B08

# timer
#timer C09 AF3
timer C09 AF2
# pin C09: TIM3 CH4 (AF2)
timer B00 AF2
# pin B00: TIM3 CH3 (AF2)

# dma
#dma pin C09 0
dma pin C09 NONE
dma pin B00 0
# pin B00: DMA1 Stream 7 Channel 5

# end the command batch
batch end

# `;

export const MATEKF405_DMA_SHOW = `dma show

Currently active DMA:
--------------------
DMA1 Stream 0: LED_STRIP
DMA1 Stream 1: FREE
DMA1 Stream 2: FREE
DMA1 Stream 3: FREE
DMA1 Stream 4: MOTOR 1
DMA1 Stream 5: FREE
DMA1 Stream 6: FREE
DMA1 Stream 7: FREE
DMA2 Stream 0: SPI_MISO 1
DMA2 Stream 1: FREE
DMA2 Stream 2: MOTOR 3
DMA2 Stream 3: MOTOR 2
DMA2 Stream 4: ADC 1
DMA2 Stream 5: FREE
DMA2 Stream 6: FREE
DMA2 Stream 7: MOTOR 4

# `;

export const MATEKF405_TIMER_SHOW = `timer show

Currently active Timers:
-----------------------
TIM1: FREE
TIM2: FREE
TIM3:
    CH1 : MOTOR 1
TIM4:
    CH1 : LED_STRIP
TIM5: FREE
TIM8:
    CH2 : MOTOR 2
    CH3 : MOTOR 3
    CH4 : MOTOR 4
TIM9: FREE

# `;

export const MATEKF405_STATUS = `status

MCU F40X Clock=168MHz, Vref=3.30V, Core temp=41degC
Stack size: 2048, Stack address: 0x1000fff0
Configuration: CONFIGURED, size: 4132, max available: 16384
Devices detected: SPI:1, I2C:1
Gyro detected: gyro 1 locked dma
GYRO=MPU6000, ACC=MPU6000, BARO=BMP280
CPU:7%, cycle time: 250, GYRO rate: 4000, RX rate: 33, System rate: 10
Arming disable flags: RXLOSS CLI MSP

# `;

// FC.CONFIG values a virtual MATEKF405 reports over MSP.
export const MATEKF405_CONFIG = {
  targetName: "MATEKF405",
  boardName: "MATEKF405",
  boardDesign: "",
  manufacturerId: "MTKS",
  mcuTypeId: 1,
};
