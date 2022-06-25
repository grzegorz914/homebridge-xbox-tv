# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### NOTE!!!
## After update to 2.x.x the plugin settings (xboxLiveId) need to be updated.

## [2.2.4] - (xx.04.2022)
## Changed
- fixed MQTT device info
- refactor send debug and info log
- refactor send mqtt message
- bump dependencies

## [2.2.2] - (09.03.2022)
## Changed
- MQTT Client connection process

## Fixed
- webApiControl switch state

## [2.2.0] - (27.02.2022)
## Added
- MQTT Client, publish all device data
- possibility to set custom command for Info button in RC

## Changes
- update dependencies
- code refactor

## [2.1.3] - (28.01.2022)
### Fixed
- offset out of range
- code refactor

## [2.1.2] - (21.01.2022)
### Fixed
- [#136](https://github.com/grzegorz914/homebridge-xbox-tv/issues/136)

## [2.1.1] - (21.01.2022)
### Changed
- refactor debug message logging
- update readme

### Fixed
- wrong variables
- removed unnecessary async
- report unknown message if power on fail

## [2.1.0] - (21.01.2022)
### Added
- check authorization state of console every 10 min. if powered ON and web api control enabled
- check cosole data and installed apps every 10 min. if powered ON and web api control enabled

### Changed
- send status message data only if changed
- debug message logging
- code refactor
- code cleanup
- stability and performance improvements

### Fixed
- unexpected set authorization to true however the console is not authorized
- data offset out of range [#133](https://github.com/grzegorz914/homebridge-xbox-tv/issues/133)
- incorrect client authorization on console

## [2.0.13] - (15.01.2022)

### Added
- Network Troubleshooter as defaul input

### Changed
- removed manual authorization method
- code cleanup
- redme update

### Fixed
- services calculation count

## [2.0.12] - (09.01.2022)
### Changed
-  code cleanup

## [2.0.10/11] - (08.01.2022)
### Changed
-  rebuild device info read and write

## [2.0.9] - (03.01.2022)
### Added
-  ability to disable log device info by every connections device to the network (Advanced Section)

### Fixed
- unexpected power on after power off

## [2.0.8] - 2021-12-29
### Added
- prevent load plugin if host or xboxLiveId not set
- prepare directory and files synchronously

## [2.0.6] - 2021-12-28
### Added
- better handle clientId if not defined in config

## [2.0.3] - 2021-12-28
### Added
- Selectable display type of buttons in HomeKit app

## [2.0.2] - 2021-12-28
### Changed
- Changed switches to buttons appear in HomeKit accessory

## [2.0.1] - 2021-12-26
### Fixed
- RC Control
## [2.0.0] - 2021-12-25
### Added
- Screensaver and Settings TV input as default
- Smartglass library (based on @unknownskl code) as standalone packet, completelly rebuilded
- Debug mode
- TV Remote control (buttons)
- Media control (buttons)
- Game Pad control (buttons)
- Clear web api token from plugin config menu

### Changes
- full code rebuild
- config.schema updated
- dependencies updated
- authorizatin manager updated
- removed bramnding

### Fixed
- memmory leak on some scenerious 
- protocol disconnect if send multiple command at once
- authorization manager

## [1.8.13] - 2021-12-01
### Fixed
- fix authorization UI Manager open URI

## [1.8.12] - 2021-12-01
### Fixed
- fix authorization UI Manager

## [1.8.8] - 2021-11-04
### Fixed
- fix some connect/disconnect case
- fix some remote command not send 

## [1.8.7] - 2021-11-01
### Changes
- performance improvement

## [1.8.6] - 2021-10-30
### Fixed
- fix powerOn

## [1.8.3] - 2021-10-30
### Fixed
- fix graphic in settings

## [1.8.2] - 2021-10-30
### Changes
- code optimize
- config.schema update
- redme update

## [1.8.1] - 2021-10-26
### Fixed
- fixed callback issue ([#105](https://github.com/grzegorz914/homebridge-xbox-tv/issues/105))

## [1.8.0] - 2021-10-26
### Changes
- added possibility Record Game DVR
- rebuild connection proces to console
- fixed Authorization Manager error on first run
- removed 'Undefined Input', not nedded any more
- code cleanup

## [1.7.9] - 2021-09-26
### Changes
- config.schema update

## [1.7.8] - 2021-09-24
### Changes
- update authorization manager
- code cleanup

## [1.7.5] - 2021-09-05
### Changes
- update config schema
- extend fiter possibility
- code cleanup

## [1.7.3] - 2021-09-03
### Changes
- update config schema

## [1.7.2] - 2021-09-03
### Changes
- added filter for Games, Apps, Dlc

## [1.7.1] - 2021-08-31
### Changes
- code refactorin
- added default inputs TV, Settings, Dashboard, Accessory, no need to create it in config
- many small changes and stability improvements

## [1.6.3] - 2021-08-05
### Changes
- added alternative check current running app if reference app is missing
- removed unnecessary reference property from buttons in config.json

## [1.6.2] - 2021-08-05
### Changes
- added possibility reboot console
- added possibility switch to Television input
- code and config reconfigured
- update config schema

## [1.6.0] - 2021-08-04
### Changes
- fixes

## [1.6.0] - 2021-08-04
### Changes
- added possibility load inputs list direct from device
- chenged config properties, please adapted config to latest one
- changed stored files names, may be need authenticate console again or just copy authentication Token to the new created file(authToken_xxxx)
- update dependencies
- code rebuild

## [1.5.0] - 2021-04-11
### Changes
- added control over Web Api
- code rebuild

## [1.4.0] - 2021-02-19
### Changes
- code rebuild, use Characteristic.onSet
- require Homebridge 1.3.x or above

## [1.3.10] - 2021-02-15
### Added and Fixed
- Add possibility disable log info, options available in config
- Fix memory leak

## [1.3.2] - 2021-01-18
### Fixed
- Fix log info regarding Input references ([#63](https://github.com/grzegorz914/homebridge-xbox-tv/issues/63))

## [1.3.1] - 2021-01-06
### Fixed
- Fix `getAppChannelLineups` data error.

## [1.3.0] - 2020-11-20
### Fixed
- Dependency bump ([#55](https://github.com/grzegorz914/homebridge-xbox-tv/issues/55))

## [1.2.41] - 2020-11-20
### Fixed
- Fix slow response on RC control.

## [1.2.1] - 2020-09-18
### Changes
- Updated device category to `TV_SET_TOP_BOX` ([#47](https://github.com/grzegorz914/homebridge-xbox-tv/pull/47))

## [1.2.0] - 2020-09-17
### Changes
- Fix send power on until successful ([#38](https://github.com/grzegorz914/homebridge-xbox-tv/issues/38))
- Fix remote control function ([#28](https://github.com/grzegorz914/homebridge-xbox-tv/issues/28))
- Add `refreshInterval` with a default of five seconds.
- Updated config layout.

## [1.1.0] - 2020-09-06
### Changes
- Completely reconfigured layout of the configuration schema.

## [1.0.0] - 2020-06-28
### Added
- Release version.

## [0.9.0] - 2020-05-23
### Added
- Add possibility to select what a type of extra volume control you want to use. None, Slider, Fan.

## [0.8.21] - 2020-05-23
### Changes
- Output app reference to log when opening app ([#22](https://github.com/grzegorz914/homebridge-xbox-tv/issues/22), [#26](https://github.com/grzegorz914/homebridge-xbox-tv/issues/26))
  - Used for discovering the value to use for `reference` when adding new inputs.

## [0.8.0] - 2020-05-20
### Added
- Add mute ON/OFF to the slider volume.

## [0.7.60] - 2020-05-18
### Fixed
- Fix bug in RC control.

## [0.7.35] - 2020-05-17
### Added 
- Add read console configuration after Homebridge restart and save to `/homebridge_folder/xboxTv/` file.

## [0.7.2] - 2020-05-14
### Added 
- Add descriptions in `config.schema.json`.

## [0.7.0] - 2020-05-14
### Added
- Revert back with defaults inputs.
- Add input type to inputs.
- Add other fixes in code to prevent app crash without configured inputs.

## [0.6.0] - 2020-05-14
### Breaking Changes
- Update your config.json: Add types to the inputs.

### Default Inputs
```json
"inputs": [
	{
		"name": "TV",
		"reference": "Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application",
		"type": "HDMI"
	},
	{
		"name": "Dashboard",
		"reference": "Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application",
		"type": "HOME_SCREEN"
	},
	{
		"name": "Settings",
		"reference": "Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application",
		"type": "OTHER"
	},
	{
		"name": "Accessory",
		"reference": "Microsoft.XboxDevices_8wekyb3d8bbwe!App",
		"type": "OTHER"
	}
]
```

## [0.5.0] - 2020-05-10
### Changes
- Code cleanup.
- Miscellaneous fixes and performance improvements.

## [0.4.0] - 2020-05-06
### Changes
- Adapted to HAP-Node JS lib.

## [0.3.12] - 2020-05-05
### Changes
- Cleanup code.

### Breaking Changes
- Update your config.json: replace `apps` with `inputs`.

## [0.3.12] - 2020-05-05
### Changes
- Fix and performance improvements.
- Corrected logging state.

## [0.3.9] - 2020-05-05
### Added
- Add real time read and write data for lightbulb slider volume value.

## [0.2.3] - 2020-04-27
### Added
- Add switch ON/OFF volume control.

## [0.2.1] - 2020-04-27
### Added
- Add Siri volume control.
- Add slider or Brightness volume control.

## [0.1.39] - 2020-04-21
- Different fixes.

## [0.1.12] - 2020-04-13
- Fix memory leak.

## [0.1.9] - 2020-04-07
- Fix store of position in HomeKit favorites.

## [0.1.6] - 2020-04-06
- Test 2.

## [0.1.5] - 2020-04-05
- Test 1.

## [0.1.2] - 2020-04-05
- Some improvements.

## [0.1.1] - 2020-04-05
- Update `README.md`.
- Update `sample-config.json`.

## [0.1.0] - 2020-03-29
- Fix crash if no device name defined.
- Fix `config.schema.json`.
- Fix store file inside the Homebridge directory.

## [0.0.118] - 2020-03-29
- Small fixes.

## [0.0.115] - 2020-03-21
- Corrections for Homebridge git.
- Performance improvements.

## [0.0.1] - 2020-02-05
- Initial release.
