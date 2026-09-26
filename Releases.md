# 0.0.28

Add the firmware's SYSTEM_STATUS (120) and SYSTEM_CONFIG (121) packed status sensors to the telemetry sensor picker's STATUS group for CRSF and S.Port, and remove the sensors the 0.0.28 firmware dropped: arming flags (90), PID/rates/battery/LED profile (95-98), TV profile (118) and GPS fix type (119).
IMPORTANT: updating the firmware keeps the model's saved telemetry sensor selection, which does not include SYSTEM_STATUS and SYSTEM_CONFIG, and the 0.0.28 Lua suites need them. After flashing, select them in the telemetry sensor picker, or run this in the CLI and save:
set telemetry_sensors = 3,4,5,6,15,43,50,52,58,59,60,89,91,99,120,121
New and reset configs use this list by default, with telemetry enabled, custom CRSF telemetry and SmartFuel in current mode.

Support 24 RC channels and 24 bus servos (MSP API 22.5): the Receiver and Status tabs show up to 24 channels, mixer inputs CH #19-#24 are inputs 30-35, and bus servos 19-24 are mixer outputs 31-36. Configuration requires MSP API 22.5 (0.0.28 firmware).
Add F.Bus and SBUS output channel count selectors to the Servos tab's Bus Servo Configuration section, each shown when a port has that output assigned. The bus servo table lists as many servos as the configured output drives (the larger count when both run).
Fix the Receiver tab's backup receiver section only showing when a CRSF Sensors port was configured.
Fix the GPS map not rendering in browser builds, and clarify the FBUS GPS unknown satellite count display.

Connect to and flash flight controllers shared through the Wingflight Remote Support tool (desktop build only). Remote ports are listed as "Remote - <name>".

# 0.0.27

Split the Receiver tab's Roll/Pitch Deadband into separate Roll Deadband and Pitch Deadband. Requires matching firmware (MSP_RC_CONFIG layout change); the firmware update resets the Channel Range settings to defaults.
Hide the GHOST, CPPM, FrSky Hub, MAVLink and LTM options, which the firmware no longer compiles in.

Add a type-to-filter search to the adjustment function picker.
Show the selected function in each adjustment's header, highlight adjustments that are currently live, and start newly added adjustments with their range handles apart so they can be dragged.
Fix adjustment range sliders overlapping their number inputs.

Only enable ESC programming manufacturers that match the configured ESC telemetry protocol, and redesign the manufacturer picker as logo cards.

Explain serial port open failures (usually the port is in use by another program or browser tab) and let a failed open be retried once the port is free.
Prompt for WebUSB DFU access mid-flash on the web build, so a first-time web flash of a USB board can continue.
Fix "Failed to load remote firmware" on the first online load in the web build.
Fix a config restore never saving when the backup replay hits CLI errors.

# 0.0.26

Add Nav Throttle, Altitude Damping and Turn Coordination to the GPS Navigation tab, and default Loiter Radius to 100 m, matching the reworked 0.0.26 firmware GPS Loiter/RTH. Note that the GPS Rescue failsafe now flies home at Nav Throttle; the Failsafe tab's throttle is used only while landing.

Add Failsafe Stage 2 settings (procedure, delay/off delay/throttle low delay/throttle/recovery delay, test switch mode) to the Failsafe tab, and a new GPS Navigation tab (RTH altitude, loiter radius/direction, min satellites, max bank/pitch angle, bearing/altitude gain), both requiring MSP API 22.4 firmware.
Remove the redundant GPS RESCUE switch; rewire to GPS RTH, which now drives the same return-to-home behavior. Relabel the RESC arming-disable flag and its tooltip to GPS_RTH.
Add GPS Fix to the CRSF/S.Port telemetry sensor picker.

Warn before leaving a pending firmware restore. Offer restore, backup-file save, stay or explicit leave actions; protect tab/wizard navigation and desktop close, with a browser unload warning. Failed restores automatically offer to save the buffered settings unless a backup file was already saved.

Retry complete online firmware downloads, including interrupted or empty response bodies, in both flashers. Abort stalled transfers after 60 seconds and retry once before reporting failure.

Support independent bank (10–90°) and pitch (10–75°) limits for ANGLE and TRAINER with MSP API 22.4 firmware; retain shared-limit controls for older firmware.
Show TRAINER in Modes and Conditions without Expert Mode. Make Trainer gain and angle limit available in Profiles without Expert Mode, and clarify how ANGLE, HORIZON and TRAINER differ.

Rename the HEADSPEED/TAILSPEED telemetry sensors to MOTOR1SPEED/MOTOR2SPEED ("Motor 1 RPM"/"Motor 2 RPM").
Rename the (currently hidden) Governor Headspeed adjustment function to Governor RPM.

# 0.0.25

Support the MSP API 22.3 layout, which removes the heli placeholder bytes from eight MSP messages.
Add a CRSF Sensors diagnostic tab.
Add cell count and cell voltages to battery profiles.
Allow negative flap compensation and diff thrust yaw adjustments.
Show SmartFuel Sag Gain in volts instead of percent.
Remove the VTX and sonar/rangefinder leftovers.

# 0.0.24

Show the live runtime servo trim (+N/-N) next to the adjustment badge on the Servos tab, read via the new MSP_SERVO_TRIM.
Add a Finished step to the Firmware Flasher wizard so it's clear when the update (and restore) is complete.
Show online and local firmware loading side by side on the Firmware step.
Fix Documentation page links to point at doc.wingflight.org, and drop the Betaflight and RC Groups entries from the Support panel.

# 0.0.23

Add AUTOHOVER throttle assist fields to the Auto Hover section of the profile UI.
Add servo balance curves to the Curves tab (new Servo category), plus a compare-curve viewer, and a curve indicator on the Servos tab that jumps straight to a servo's curve.
Unify RC channel naming to CH #N across the Mixer, Adjustments, Logic, and Auxiliary channel pickers, and resolve the Mixer's Roll/Pitch/Yaw/Throttle bypass inputs to the pilot's actual mapped channel instead of a fixed order.

# 0.0.22

Add mixer rule roles to the Mixer tab, along with flap-servo support and live-adjustment badges.
Rework the Firmware Flasher into a guided step wizard.
Surface the new BACKUP_RX arming disable flag on the Status tab.
Add a label/tooltip for the TRADITIONAL flight mode.
Add an Auto Hover roll deadband field to the Leveling Settings tab.
Hide the servo geometry correction field where it doesn't apply.
Fix colour styling on the Modes page.

# 0.0.21

Make the backup-before-flash / restore-after-flash wizard reliable across a full flash cycle: pace CLI defaults/save handling correctly, retry post-flash reconnects longer, add a "Select Port" recovery option, and default backups to Dump instead of Diff.
Fix Web Serial losing track of the flight controller's port after it reboots mid-restore, which made restoring fail every time on the web build (desktop was unaffected).
Fix a cached target config being reused even after its source was corrected, so a fixed board config could keep getting (re)flashed stale for up to two hours.

# 0.0.20

Add a CLI-based backup/restore wizard to the CLI tab and Firmware Flasher (Backup/Diff/Dump before flashing, with restore after).
Fix the flashing-completion callback being dropped when a serial flash falls back to DFU, so post-flash steps like restore never ran.

# 0.0.19

Add RX and ESC telemetry wiring auto-detect ("Detect Wiring") to the Receiver and Motors tabs, to help diagnose signal-inversion and pin-swap mismatches.
Refresh UI styling with CSS-variable-based border-radius and color theming for a more consistent look.

# 0.0.18

Add Thrust Vector profile tabs and TV Profile adjustment function.
Generalize the backup RX from SBUS-only into a provider-selectable input, recognizing FBUS, FPort, FPort2, Jeti EX Bus, and CRSF.
Fix ESC Telemetry Protocol tooltip for FBUS.

# 0.0.17

Add Thrust Vector Attitude Hold.
Add Serial Rx (Backup, SBUS) port option and diagnostics.
Split feature-branch development builds into their own tier on the Firmware Flasher tab.
Add "Clone PWM outputs to bus servos" toggle on the Servos tab.

# 0.0.16

Add XACT servo programming tab: scan and configure FrSky XACT servos over FBUS, with multi-servo discovery/selection, live Physical ID/App ID conflict detection, and a field set aligned to FrSky's own configuration tool.

# 0.0.15

Add support for Spektrum SRXL2 ESC.
Fix Flash Firmware button needing two clicks after loading online firmware.
Fix firmware flashing docs link on Firmware Flasher recovery text.

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
