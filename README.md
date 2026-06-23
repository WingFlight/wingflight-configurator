# Wingflight Configurator

[Wingflight](https://github.com/WingFlight) is a Flight Control software suite designed for
fixed-wing aircraft. It consists of:

- Wingflight Flight Controller Firmware
- Wingflight Configurator, for flashing and configuring the flight controller (this repository)
- Wingflight Blackbox Explorer, for analyzing blackbox flight logs
- Wingflight LUA Scripts, for configuring the flight controller using a transmitter

Wingflight is a fixed-wing fork of [Rotorflight](https://github.com/rotorflight), which itself is
built on Betaflight 4.3. It's important to note that Wingflight is exclusively designed for
fixed-wing aircraft; it does _not_ target multi-rotor or helicopter use, unlike its parent project.


## Information

Tutorials, documentation, and flight videos can be found on the [Wingflight GitHub organization](https://github.com/WingFlight).


## Installation

Please download the latest version from [github](https://github.com/WingFlight/wingflight-configurator/releases/).


## Features

Wingflight has many features inherited from Rotorflight and Betaflight:

* Many receiver protocols: CRSF, S.BUS, F.Port, DSM, IBUS, XBUS, EXBUS, GHOST, CPPM
* Support for various telemetry protocols: CSRF, S.Port, HoTT, etc.
* ESC telemetry protocols: BLHeli32, Hobbywing, Scorpion, Kontronik, OMP Hobby, ZTW, APD, YGE
* Remote configuration and tuning with the transmitter
  - With knobs / switches assigned to functions
  - With LUA scripts on EdgeTX, OpenTX and Ethos
* Extra servo/motor outputs for AUX functions
* Fully customisable servo/motor mixer
* Sensors for battery voltage, current, BEC, etc.
* Advanced gyro filtering
  - Dynamic RPM based notch filters
  - Dynamic notch filters based on FFT
  - Dynamic LPF
* High-speed Blackbox logging
* Configuration profiles for changing various tuning parameters
* Rates profiles for changing the stick feel and agility
* Multiple ESC protocols: PWM, DSHOT, Multishot, etc.
* Configurable buzzer sounds
* Multi-color RGB LEDs
* GPS support

And many more...

> Note: this feature list is inherited from Rotorflight and hasn't yet been audited for what
> applies to fixed-wing aircraft specifically (e.g. heli-only features like rotor speed governor
> and tail torque assist have been dropped from the list above, but the remaining items still need
> a fixed-wing accuracy pass).


## Notes

#### Windows

Wingflight Configurator requires Windows 10 or later. Windows 7 is not supported.

Windows has sometimes issues with detecting the flight controller USB device correctly.
Impulse RC has created a _Driver Fixer_ software for fixing these issues. You can download it
[here](https://impulserc.com/pages/downloads).

#### Linux

In most Linux distributions your user won't have access to serial interfaces by default.
To add this access right type the following command in a terminal, then log out and log in again:

```
sudo usermod -aG dialout ${USER}
```

#### Graphics Issues

If you experience graphics display problems or smudged/dithered fonts display issues in Wingflight Configurator, try invoking the `wingflight-configurator` executable file with the `--disable-gpu` command line switch. This will switch off hardware graphics acceleration. Likewise, setting your graphics card antialiasing option to OFF (e.g. FXAA parameter on NVidia graphics cards) might be a remedy as well.


## Contributing

Wingflight is an open-source community project. Anybody can join in and help to make it better by:

* helping other users in [GitHub Discussions](https://github.com/WingFlight) or other online forums
* [reporting](https://github.com/WingFlight) bugs and issues, and suggesting improvements
* testing new software versions, new features and fixes; and providing feedback
* participating in discussions on new features
* contributing to the software development - fixing bugs, implementing new features and improvements
* translating Wingflight Configurator into a new language, or helping to maintain an existing translation


## Origins

Wingflight is software that is **open source** and is available free of charge without warranty.

Wingflight is forked from [Rotorflight](https://github.com/rotorflight), which in turn is forked from
[Betaflight](https://github.com/betaflight), which in turn is forked from [Cleanflight](https://github.com/cleanflight).

Big thanks to everyone who has contributed along the journey!


## Contact

Team Wingflight can be contacted via [GitHub Issues and Discussions](https://github.com/WingFlight).
