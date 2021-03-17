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

Homebridge plugin for Microsoft game consoles. Tested with Xbox One X and Xbox Series X.

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
* Applications and games can only be read from the device, switching apps or games does not work with the current API.
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

Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to configure this plugin (strongly recomended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.
| Key | Description | 
| --- | --- |
| `xboxliveid` | on your console select Profile & system > Settings > System > Console info, listed as **Xbox Live device ID**. *You can only find the Xbox Live device ID in Settings on your console, this is different from your console serial number* |
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds |
| `volumeControl`| Select what a additional volume control mode You want to use (None, Slider, Fan) |
| `switchInfoMenu`| If `true` then the `I` button will toggle its behaviour in the Apple Remote in Control Center and `PowerModeSelection` in settings |
| `disableLogInfo`| If `true` then disable log info, all values and state will not be displayed in Homebridge log console |
| `inputs` | Configure apps/inputs which will be published to and appear in HomeKit app in the device tile as inputs list |
| `buttons` | same as inputs but appear in HomeKit.app as extra tile |
| `reference` | open log in homebridge, open app on console and look in the log |
| `manufacturer` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `modelName` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `serialNumber` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |

<p align="left">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/plugin settings.png" height="150"></a>
</p>

```json
{
	"platform": "XboxTv",
	"devices": [
		{
			"name": "Xbox One",
			"host": "192.168.1.6",
			"xboxliveid": "FD0000000000",
			"refreshInterval": 5,
			"disableLogInfo": false,
			"volumeControl": 0,
			"switchInfoMenu": false,
			"inputs": [
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
				},
				{
					"name": "Spotify",
					"reference": "SpotifyAB.SpotifyMusic-forXbox_zpdnekdrzrea0!App",
					"type": "APPLICATION"
				},
				{
					"name": "YouTube",
					"reference": "GoogleInc.YouTube_yfg5n0ztvskxp!App",
					"type": "APPLICATION"
				},
				{
					"name": "Netflix",
					"reference": "4DF9E0F8.Netflix_mcm4njqhnhss8!App",
					"type": "APPLICATION"
				},
				{
					"name": "Telewizja",
					"reference": "Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application",
					"type": "HDMI"
				},
				{
					"name": "Sklep",
					"reference": "Microsoft.WindowsStore_8wekyb3d8bbwe!App",
					"type": "APPLICATION"
				},
				{
					"name": "Microsoft Edge",
					"reference": "Microsoft.MicrosoftEdge_8wekyb3d8bbwe!MicrosoftEdge",
					"type": "APPLICATION"
				},
				{
					"name": "Airserver",
					"reference": "F3F176BD.53203526D8F6C_p8qzvses5c8me!AirServer",
					"type": "APPLICATION"
				},
				{
					"name": "Gears of War 5",
					"reference": "Microsoft.HalifaxBaseGame_8wekyb3d8bbwe!HalifaxGameShip",
					"type": "APPLICATION"
				},
				{
					"name": "Fortnite",
					"reference": "Fortnite_d5xxtpggmzx6p!AppFortnite",
					"type": "APPLICATION"
				},
				{
					"name": "Minecraft",
					"reference": "Microsoft.MinecraftUWPConsole_8wekyb3d8bbwe!App",
					"type": "APPLICATION"
				},
				{
					"name": "Plex",
					"reference": "CAF9E577.PlexforXbox_aam28m9va5cke!App",
					"type": "APPLICATION"
				},
				{
					"name": "Bluray",
					"reference": "Microsoft.BlurayPlayer_8wekyb3d8bbwe!Xbox.BlurayPlayer.Application",
					"type": "APPLICATION"
				},
				{
					"name": "COD WII",
					"reference": "shg2SubmissionENFR_ht1qfjb0gaftw!S2Boot",
					"type": "APPLICATION"
				},
				{
					"name": "COD WZ",
					"reference": "iw8Submission-EN-FR_ht1qfjb0gaftw!iw8",
					"type": "APPLICATION"
				},
				{
					"name": "GTA V",
					"reference": "GTA-V_vesz1v3mcwykm!GTAV",
					"type": "APPLICATION"
				},
				{
					"name": "All4",
					"reference": "CHANNELFOURTELEVISIONCOMP.All4_e1252dwpj85a4!vstest.executionengine.universal.App",
					"type": "APPLICATION"
				},
				{
					"name": "Amazon Prime",
					"reference": "AmazonVideo.AmazonVideoUK_pwbj9vvecjh7j!App",
					"type": "APPLICATION"
				},
				{
					"name": "Disney",
					"reference": "Disney.37853FC22B2CE_6rarf9sa4v8jt!App",
					"type": "APPLICATION"
				},
				{
					"name": "BBC iPlayer",
					"reference": "BBCMobileApps.BBCIPLAYER_wzgfedwv7gft2!App",
					"type": "APPLICATION"
				}
			],
			"buttons": [
                {
                    "name": "Disney",
                    "reference": "Disney.37853FC22B2CE_6rarf9sa4v8jt!App",
                },
                {
                    "name": "BBC iPlayer",
                    "reference": "BBCMobileApps.BBCIPLAYER_wzgfedwv7gft2!App",
                },
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
