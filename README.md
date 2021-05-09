<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Xbox and controller" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/homebridge-xbox-tv.png" height="280"></a>
</p>

<span align="center">

# Homebridge Xbox TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv)
[![npm](https://badgen.net/npm/v/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

Homebridge plugin for Microsoft game consoles. Tested with Xbox One X/S and Xbox Series X.

</span>

## Package Requirements
| Package Link | Required |
| --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | Required | 
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) | Highly Recommended |

## Note
- For homebridge-xbox-tv versions 1.4.0 and above the minimum required version of Homebridge is v1.3.x.

## Know issues
- If used with Hoobs, there is a possible configuration incompatibilty.

## Installation Instructions
1. Follow the step-by-step instructions at [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions at [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-xbox-tv using: `npm install -g homebridge-xbox-tv` or search for `Xbox Tv` in Config UI X.

## HomeKit Pairing
1. Each accessories needs to be manually paired.
2. Open the Home <img alt="" src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px" /> app on your device.
3. Tap the Home tab, then tap <img alt="plus button" src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px" />.
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*.
5. You should now see your Xbox, select it
6. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Features and How To Use Them
* Power ON/OFF short press tile in HomeKit app.
* Remote/media control is possible after you go to the RC app on iOS or iPadOS.
* Speaker control is possible after you go to RC app on iOS or iPadOS as a `Speaker Service`.
* Legacy volume and mute control is possible through extra `lightbulb` dimmer slider or using Siri `Volume Service`, not working with the current API.
* Apps, inputs and games can be controled and switched if `xboxWebApiEnabled` and the console is authenticated. In other case the current apps, inputs, games can be displayed.
* Siri control.

<p align="left">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Accessory tile in the HomeKit app" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/homekit.png" height="300" /></a> 
</p>

<p align="left">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Changing the accessory input" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/inputs.png" height="300" /></a>
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Remote control interface" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/RC.png" height="300" /></a>
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Arrow pointing to the remote control icon in the control center" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/rc1.png" height="300" /></a>
</p>

## Configuration console
1. [Device must have Instant-on power mode enabled](https://support.xbox.com/help/hardware-network/power/learn-about-power-modes)
  * Profile & system > Settings > General > Power mode & startup
2. Console need to allow connect from any 3rd app. *Allow Connections from any device* should be enabled.
  * Profile & system > Settings > Devices & connections > Remote features > Xbox app preferences.

## Configuration and enable web API control
1. After enable `xboxWebApiEnabled` option, restart the plugin and go to Homebridge console log.
2. Open the authentication URL and login to Your XboxLive account, next accept permision for this app.
3. After accept permiosion for this app copy the part after `?code=` from the response URL and paste it in to the `xboxWebApiToken` in plugin config, save and restart the plugin again, done.

Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to configure this plugin (strongly recomended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.
| Key | Description | 
| --- | --- |
| `name` | Name of Your console |
| `host` | Address IP of Your console |
| `xboxliveid` | on your console select Profile & system > Settings > System > Console info, listed as **Xbox Live device ID**. *You can only find the Xbox Live device ID in Settings on your console, this is different from your console serial number* |
| `clientID` | Optional free-form for future use |
| `clientSecret` | Optional free-form for future use |
| `xboxWebApiToken` | Required if `xboxWebApiEnabled` enabled.|
| `xboxWebApiEnabled` | Optional, if enabled the console can be controlled using Web Api |
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds |
| `volumeControl`| Select what a additional volume control mode You want to use (None, Slider, Fan) |
| `switchInfoMenu`| If `true` then the `I` button will toggle its behaviour in the Apple Remote in Control Center and `PowerModeSelection` in settings |
| `disableLogInfo`| If `true` then disable log info, all values and state will not be displayed in Homebridge log console |
| `inputs` | Configure apps/inputs which will be published to and appear in HomeKit app in the device tile as inputs list |
| `buttons` | same as inputs but appear in HomeKit.app as extra tile |
| `reference` | Required to identify current running app, open homebridge console and look in the log or if web Api enabled then all available in `/var/lib/homebridge/xboxTv/installedApps` file. |
| `referenceId` | Optional to switch app, if web Api enabled the plugin check its `referenceId` itself, also all available in `/var/lib/homebridge/xboxTv/installedApps` file under `oneStoreProductId`. |
| `type` | Optional choice from available options |
| `manufacturer` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `modelName` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `serialNumber` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |

<p align="left">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/plugin settings.png" height="170"></a>
</p>

```json
{
	"platform": "XboxTv",
	"devices": [
		{
			"name": "Xbox One",
			"host": "192.168.1.6",
			"xboxliveid": "FD0000000000",
			"xboxWebApiToken": "M.R5_BAU.be1c3729-8ae5-d62b-5abd-4323c9c96383",
			"clientID": "",
			"clientSecret": "",
			"refreshInterval": 5,
			"xboxWebApiEnabled": false,
			"disableLogInfo": false,
			"volumeControl": 0,
			"switchInfoMenu": false,
			"inputs": [
						{
							"name": "Dashboard",
							"reference": "Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application",
							"referenceId": "xxxxxxxxxx",
							"type": "HOME_SCREEN"
						},
						{
							"name": "Settings",
							"reference": "Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application",
							"referenceId": "xxxxxxxxxx",
							"type": "OTHER"
						},
						{
							"name": "A Way Out",
							"reference": "AWayOut_zwks512sysnyr!AppAWayOut",
							"referenceId": "xxxxxxxxxx",
							"type": "APPLICATION"
						},
						{
							"name": "Apple TV",
							"reference": "AppleInc.AppleTV_nzyj5cx40ttqa!App",
							"referenceId": "xxxxxxxxxx",
							"type": "APPLICATION"
						},
						{
							"name": "Battlefield 4",
							"reference": "BFX_8s70symrha4j2!BF.App",
							"referenceId": "xxxxxxxxxx",
							"type": "APPLICATION"
						},
						{
							"name": "Cities: Skylines",
							"reference": "ColossalOrder.CitiesSkylines_9dej7x9zwzxzc!App",
							"referenceId": "xxxxxxxxxx",
							"type": "APPLICATION"
						}
					],
					"buttons": [
						{
							"name": "Don't Starve Together",
							"referenceId": "xxxxxxxxxx",
						},
						{
							"name": "EA Play Hub",
							"referenceId": "xxxxxxxxxx",
						},
						{
							"name": "AirServer Xbox Edition",
							"referenceId": "xxxxxxxxxx",
						},
						{
							"name": "Gears of War 4",
							"referenceId": "xxxxxxxxxx",
						}
					],
			"manufacturer": "Microsoft Corporation",
			"modelName": "Model",
			"serialNumber": "Serial Number",
			"firmwareRevision": "Firmware Revision"
		}
	]
}
```

## Limitations
* Due to a HomeKit limitation, that maximum services for 1 accessory is 100. Acessories containing services above this value in the HomeKit app will not respond.
* If all services are enabled possible inputs to use is 96. The services in this accessory are:
  * Information service.
  * Speaker service.
  * Lightbulb service.
  * Television service.
  * Inputs service which may range from 5 to 100 as each input is 1 service.

## Whats new
https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/CHANGELOG.md

## Development
* Pull request and help in development highly appreciated.
