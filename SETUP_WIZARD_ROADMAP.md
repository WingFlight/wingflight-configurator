# Setup Wizard and related work: roadmap

Ideas and open items from the session that produced the Setup Wizard tab
(`src/tabs/setup_wizard/`) and the MANUAL/GYRO OFF and SETUP mode changes in
the firmware. Kept here so later work starts from the same picture.

## Shipped

| Repo | PR | What |
|---|---|---|
| firmware | #181 | GYRO OFF (MANUAL) full-stick throw floored at 30% whatever F, rates or adjustments; I-term not integrated while GYRO OFF or SETUP drives the surfaces |
| firmware | #182 | MANUAL renamed GYRO OFF, PASSTHROUGH renamed SETUP (box IDs unchanged) |
| firmware | #183 | Comments give the real reason for the F minimum of 50 (stabilized flight needs it to reach the commanded rate) |
| configurator | #136 | New mode names; SETUP no longer behind Expert Mode |
| configurator | #137 | Setup Wizard tab (this branch) |
| lua-ethos-suite | #115, #116 | Mode names; "Setup" and "Gyro off" announcements in every voice |
| blackbox | #23 | Mode names in the log viewer |
| docs | #59, #60, #61 | Flight Dynamics M-3, Setup and Gyro Off page, F minimum reason |

## Setup Wizard: how it works now

Thirteen steps: sensors and level, airframe, servo type, motor, center,
direction, binding limits, throws, travel check, gyro direction, mode
switches, flying style, finish.

Each setting has one home, so throws don't compound across layers: Mid,
Reverse and Min/Max on the servo; throw in Axis Gain; up/down difference in
servo Scale; rule weights left as the model template set them. Throws are
set with the radio in SETUP mode, which the wizard switches on itself with a
temporary full-range mode slot that is never written to EEPROM.

## Round 2 (agreed, not started)

- **Trim handling** through adjustment functions.
- **Flight modes**: let the pilot choose which modes go on which switch
  (normal, GYRO OFF, ANGLE, Attitude Hold, ...), not only ARM, SETUP and
  GYRO OFF.
- **Gain channels**: which radio channels drive in-flight gain adjustments.

## Wizard ideas

- **Docs page**: write *Getting Started → Set Up Your Aircraft* in
  wingflight-docs with the same steps. The wizard's Help button already
  points at `getting-started/aircraft-setup`.
- **Bus servos and flaps**: the wizard covers PWM servos 1–8 driven by roll,
  pitch and yaw only.
- **Elevon / V-tail differential per function**: Fine-tune changes one
  servo side for every axis on that servo. Per-function differential needs
  rule weights, which only Custom models expose.
- **Existing models with throw in Scale**: detect a Scale far from default
  and offer to move that ratio into Axis Gain without changing the throw.
- **Throws and tune are coupled**: the PID output is a share of the throw.
  Warn on the Mixer and Servos tabs when Axis Gain or Scale changes on a
  model that already has a non-default tune.
- **Flying style values** (Trainer 150°/s 20% relax 3/30, Sport 250°/s 30%
  5/22, 3D 500°/s 60% 7/15) are starting points, not flight-proven. Other
  settings could follow the style too: ANGLE level strength and limit,
  trainer limits, Attitude Hold gain.
- **Tail-draggers**: the Configuration tab's Mounting Trim and accelerometer
  calibration prompts say "level"; they should say "flying attitude" and
  mention propping the tail up, as the wizard does.
- **Motor**: PWM ESCs may need throttle-range calibration; DShot ESCs could
  have direction reversed by command instead of swapping wires. Telemetry,
  OneShot and SRXL2 stay on the Motors tab on purpose.
- **Failsafe** was dropped from the wizard because the default cuts the
  motor. A GPS return-home choice could come back once GPS setup is in scope.
- **Checklist mode**: re-run one step later (for example throws) without
  walking the whole wizard.
- **Translations**: the new `setupWizard*` strings are English only.
- **Lua clients**: no wizard on the radio; decide whether any steps (mode
  switches, flying style) are worth offering there.

## Firmware ideas

- **A real "set mode" command**: the wizard forces SETUP with a temporary
  mode-range slot because MSP has no way to switch a mode. A RAM-only MSP
  command would be cleaner and couldn't run out of slots.
- **GYRO OFF and throttle attenuation**: GYRO OFF is not scaled by TPA/SPA,
  so in a prop-wash hover it can give several times stabilized flight's F
  throw. With the 30% floor in place it could take the attenuation safely.
- **Mode switch transitions**: switching into or out of GYRO OFF or SETUP is
  a hard step from the PID output; a short blend would remove the bump.
- **Virtual FC**: it doesn't evaluate mode ranges or report servo and motor
  positions, so SETUP switching, live bars, switch detection and the motor
  test can only be checked on hardware.

## Clean-ups

- Configurator `src/tabs/profiles/PidGains.svelte` and Ethos
  `src/wfsuite/lib/msp_pid_tuning.lua` still explain the F minimum with the
  old MANUAL reason (code comments only).

## Not yet checked on a real board

SETUP switching by the wizard, the live servo bars, switch detection in Mode
switches, and the motor spin test were exercised against the Virtual FC
only.
