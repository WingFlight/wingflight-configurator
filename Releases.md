# 0.0.14

Hide Thrust Vector wizard options when the feature is disabled.

# 0.0.13

Fix mixer rule dropdowns overflowing into the next column.
Keep hover tooltips inline with their field and inside their panel.
Add a manual refresh button to the Firmware Flasher release list, bypassing the hourly release-list cache.

# 0.0.12

Fix mixer rule differential being one-sided when Reverse is enabled.
Fix Discord link.

# 0.0.11

Add Thrust Vector configuration, mixer wizard support, and adjustment functions.
Add FBUS/S.Port Sensors diagnostics.
Improve Web Serial/WebUSB support, including Android compatibility, device filtering, and blackbox MSC reboot flow.
Improve mobile layouts for Profiles, Rates, Servos, firmware flashing, dialogs, headers, and Thrust Vector tables.
Remove OSD and CMS UI surfaces.
Link to WingFlight Driver Fixer for USB driver help.

# 0.0.10

Remove tail_rotor_mode; rename main/tail motor naming to motor1/motor2.
Add model-type picker to the Mixer tab (guided airframe presets: Regular Airplane, Flying Wing, V-Tail, Delta Wing, Rudder/Elevator Trainer, Custom).
Fix web-backend GUI global race causing "GUI is not defined" on startup.
Fix NW.js-only zoom call crashing on the web backend.
Move Master into the Development tab; footer wording tweak.

# 0.0.9

Add web-based configurator deployment (Web Serial/WebUSB/Web Bluetooth, PWA support, GitHub Pages hosting).
Add servo trim adjustments for roll/pitch/yaw.
Add effective PID gain preview in Master Gains section.
Reuse gain-curve pool for fixed-wing throttle attenuation (TPA).
Harden USB/serial device reconnect and port-picker behavior.

# 0.0.8

Version bump for release alignment; no configurator-relevant changes this cycle.

# 0.0.7

Fix arming confirmation dialog rendering raw HTML tags as literal text, and add button spacing.

# 0.0.6

Complete the Svelte rewrite of the configurator - all remaining tabs (Mixer, Rates, Profiles, Servos, Sensors, Status, Setup, Power, Logic/Conditions, and more) converted from legacy HTML/JS.
Add Mounting-surface Trim UI (manual entry and auto-detect wizard).
Add throttle range governor support.
Add ready-to-arm surface wiggle.
Add progressive row disclosure to the Conditions tab, matching Adjustments.
Improve Modes page with expert mode and contextual help.
Hide advanced Profiles and Board Alignment options behind expert mode.
Fix save bar not displaying and Profiles page save button.
Remove legacy API hooks.

# 0.0.5

Add AUTO TRIM mode display name.

# 0.0.4

Fix missing channel slot handling.
Add distinct manual and passthrough modes.
Add cross-axis relax configuration.
Add auto-hover flight mode support.
Remove atthold mode.
Improve mode and adjustment selection workflows.

# 0.0.3

ESC Programing
Improve telemetry conditions
IdleUP governor

# 0.0.2

Board Alignment
Remove collective from channel maps
Added in ability to set master gains on roll, pitch and yaw.

# 0.0.1

This is the first _development snapshot_ of the Wingflight Configurator.

## Notes

Wingflight is a fork of Rotorflight, refocused exclusively on fixed-wing 3D
and aerobatic aircraft. This is the first release under the Wingflight name,
starting a fresh release history independent of Rotorflight.

This version is intended to be used for beta-testing only. It may contain
incomplete features or stability issues and is not recommended for end-user
use.

For more information, please join the [Wingflight Discord](https://discord.gg/aEyyAJTXRw/) chat.

## Downloads

- [Wingflight Configurator](https://github.com/WingFlight/wingflight-configurator/releases/tag/snapshot/0.0.1)
- [Wingflight Firmware](https://github.com/WingFlight/wingflight-firmware/releases/tag/snapshot/0.0.1)
- [Wingflight Lua Suite for FrSky Ethos](https://github.com/WingFlight/wingflight-lua-ethos-suite/releases/tag/snapshot/0.0.1)
