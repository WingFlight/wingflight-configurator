<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WingFlight/wingflight-landing-page/master/logos/wf_logo_dark_white.svg">
    <img src="https://raw.githubusercontent.com/WingFlight/wingflight-landing-page/master/logos/wf_logo_dark.svg" alt="Wingflight" width="420">
  </picture>
</p>

# Wingflight Configurator

The Configurator flashes [Wingflight](https://github.com/WingFlight/wingflight-firmware) onto a
flight controller and sets it up: receiver, mixer, servos, motors, flight modes, tuning and
logging. Wingflight is open-source flight controller firmware for fixed-wing aircraft.

**[Open in the browser](https://cfg.wingflight.org)** ·
**[Desktop downloads](https://github.com/WingFlight/wingflight-configurator/releases)** ·
**[Documentation](https://doc.wingflight.org/configurator/)** ·
**[Discord](https://discord.gg/aEyyAJTXRw)**

![The Configurator's Status tab](https://raw.githubusercontent.com/WingFlight/wingflight-docs/main/docs/assets/images/configurator-status.png)


## Using it

**In the browser.** Open [cfg.wingflight.org](https://cfg.wingflight.org) in Chrome, Edge, Brave or
Opera. There is nothing to install and it is always the current version. Firefox and Safari do not
work: they have no WebSerial or WebUSB.

**On the desktop.** Download the build for Windows, macOS or Linux from the
[releases page](https://github.com/WingFlight/wingflight-configurator/releases). Use it offline, or
with [Remote Support](#remote-support).

New to Wingflight? Follow [Getting Started](https://doc.wingflight.org/getting-started/).


## What it does

* Flashes firmware, choosing the right build and board configuration for the flight controller
* A setup wizard that takes a new model from servo directions and centers to limits and throws
* A tab for each part of the setup: receiver, failsafe, mixer, servos, motors, curves, power, GPS,
  LEDs and beepers
* Flight tuning: PID and rate profiles, gyro filters and thrust vectoring
* Flight modes on transmitter switches, in-flight adjustments and logic conditions
* ESC programming, and sensor tools for FBUS/S.Port and CRSF devices
* Blackbox setup and log download
* Backup and restore of the whole configuration, and a CLI

Every tab has a page in the [documentation](https://doc.wingflight.org/configurator/).


## Notes

#### Windows

The desktop app needs Windows 10 or later.

If Windows does not detect the flight controller in bootloader (DFU) mode, run
[Wingflight Driver Fixer](https://github.com/WingFlight/wingflight-driver-fixer/releases). It
finds the board, reboots it into DFU mode if needed and installs the USB driver.

#### Linux

On most distributions your user has no access to serial ports by default. Add it to the `dialout`
group, then log out and in again:

```
sudo usermod -aG dialout ${USER}
```

#### Remote Support

The desktop app can use a flight controller plugged into someone else's computer, for flashing,
MSP and the CLI, through the
[Wingflight Remote Support](https://github.com/WingFlight/wingflight-remote-support) tool. Start
the tool, join the session with the code the pilot gives you, and the pilot's ports appear in the
port list as `remote:…`.

#### Graphics issues

If the desktop app shows display problems or smudged fonts, start `wingflight-configurator` with
the `--disable-gpu` switch to turn off hardware acceleration. Turning off antialiasing in the
graphics driver (for example FXAA on NVIDIA cards) can also help.


## Development

```
nvm install             # Node.js
npm install -g pnpm
make init               # dependencies
pnpm start              # run the desktop app from source
pnpm build:web          # build the web app into bundle/
```

See [HOWTO.md](HOWTO.md) for building and packaging, [WEB_DEPLOYMENT.md](WEB_DEPLOYMENT.md) for the
web app, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.


## Contributing

Wingflight is a community project. You can help by:

* testing new versions and [reporting bugs](https://github.com/WingFlight/wingflight-configurator/issues)
* helping other pilots on [Discord](https://discord.gg/aEyyAJTXRw)
* translating the Configurator, or keeping a translation up to date
* fixing bugs and adding features


## Origins

Wingflight is open source and free of charge, with no warranty.

The Configurator is a fork of the [Rotorflight](https://github.com/rotorflight) Configurator, which
is a fork of the [Betaflight](https://github.com/betaflight) Configurator, which is a fork of the
[Cleanflight](https://github.com/cleanflight) Configurator. Thank you to everyone who contributed
along the way.
