<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Xbox and controller" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/homebridge-xbox-tv.png" width="640"></a>
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
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [Xbox TV](https://www.npmjs.com/package/homebridge-xbox-tv) | `npm install -g homebridge-xbox-tv` | Plug-In | Required |

## Note
* For homebridge-xbox-tv versions 1.4.0 and above the minimum required version of Homebridge is v1.3.x.
* Authorization Manager still in Test Phase.

## Know Issues
* If used with Hoobs, there is a possible configuration incompatibilty.

## Features and How To Use Them
* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan`.
* Apps, Inputs, Games can be switched if `webApiControl` and console is authorized
* Siri can be used to control Power, Legacy Volume, Mute and switch Games, Apps with created Buttons.
* Home automations and shortcuts can be used for all functions.

<p align="left">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Accessory tile in the HomeKit app" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/homekit.png" width="480" /></a> 
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Changing the accessory input" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/inputs.png" width="115" /></a>
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Remote control interface" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/RC.png" width="115" /></a>
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Arrow pointing to the remote control icon in the control center" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/rc1.png" width="115" /></a>
</p>

## Configuration Console
* [Device must have Instant-on power mode enabled](https://support.xbox.com/help/hardware-network/power/learn-about-power-modes)
  * Profile & System > Settings > General > Power mode & startup
* Console need to allow connect from any 3rd app. *Allow Connections from any device* should be enabled.
  * Profile & System > Settings > Devices & Connections > Remote features > Xbox app preferences.

## Authorization Manager
* First of all please use built in Authorization Manager, if this fail use Authorization Manual.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Authentication Manager" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/config manager.png" width="540"></a>
</p>

### Authorization Manual
* After enable `webApiControl` option, restart the plugin and go to Homebridge console log.
* Open the authorization URI and login to Your Xbox Live account, next accept permission for this app.
* After accept permission copy the part after `?code=` from the response URI and paste it in to the `xboxWebApiToken`.
* Next save and restart the plugin again, done.

## Configuration
Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) plugin to configure this plugin (Highly Recommended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/plugin settings.png" width="840"></a>
</p>

| Key | Description | 
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of Console.|
| `xboxliveid` | On your console select Profile > Settings > System > Console info, listed as **Xbox network device ID**. *You can only find the Xbox network device ID in Settings on your console, this is different from your console serial number*. |
| `clientID` | Optional, If You create app on Azure AD then You can use own ClientID. |
| `clientSecret` | Optional, If You create app on Azure AD then You can use own ClientSecret. |
| `userToken` | Optional alternate authorization method. |
| `uhs` | Optional alternate authorization method. |
| `webApiControl` | Optional, if enabled, the console can be controlled using Web Api and additional functions are available in `Advanced Settings` section. |
| `xboxWebApiToken` | Required if `webApiControl` enabled.|
| `refreshInterval` | Set the data refresh time in seconds, default is 5 seconds. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (None, Slider, Fan). |
| `switchInfoMenu` | If enabled, `I` button change its behaviour in RC app between Menu and INFO. |
| `getInputsFromDevice`| If enabled, apps will be loaded from device, only available if `webApiControl` enabled. |
| `filterGames` | If enabled, Games will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `filterApps` | If enabled, Apps will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `filterSystemApps` | If enabled, System Apps (Accessory, TV) will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `filterDlc` | If enabled, Dlc will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `rebootControl` | If enabled, reboot console will be possible, only available if `webApiControl` enabled. |
| `inputs.name` | Configure apps/inputs which will be published and appear in HomeKit app in the device tile as inputs list, `Television`, `Dashboard`, `Accessory`, `Settings` inputs are created by default. |
| `inputs.reference` | Required to identify current running app, open homebridge console and look in the log or if web Api enabled then all available in `/var/lib/homebridge/xboxTv/inputs_xxxxxx` file. |
| `inputs.oneStoreProductId` | Optional to switch apps, if web Api enabled then all available in `/var/lib/homebridge/xboxTv/inputs_xxxxxx` file. |
| `inputs.type` | Optional choice from available options. |
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttons.oneStoreProductId` | Here set *Input oneStoreProductId*. if web Api enabled then all available in `/var/lib/homebridge/xboxTv/inputs_xxxxxx` file. |
| `manufacturer`, `modelName`, `serialNumber`, `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app. |

```json
{
	"platform": "XboxTv",
	"devices": [
		{
			"name": "Xbox One",
			"host": "192.168.1.6",
			"xboxliveid": "FD0000000000",
			"clientID": "",
			"clientSecret": "",
			"userToken": "",
			"uhs": "",
			"xboxWebApiToken": "",
			"refreshInterval": 5,
			"webApiControl": false,
			"disableLogInfo": false,
			"volumeControl": 0,
			"switchInfoMenu": false,
			"getInputsFromDevice": false,
			"filterGames": false,
			"filterApps": false,
			"filterSystemApps": false,
			"filterDlc": false,
			"rebootControl": false,
			"inputs": [
						{
							"name": "A Way Out",
							"reference": "AWayOut_zwks512sysnyr!AppAWayOut",
							"oneStoreProductId": "",
							"type": "APPLICATION"
						},
						{
							"name": "Apple TV",
							"reference": "AppleInc.AppleTV_nzyj5cx40ttqa!App",
							"oneStoreProductId": "",
							"type": "APPLICATION"
						},
						{
							"name": "Battlefield 4",
							"reference": "BFX_8s70symrha4j2!BF.App",
							"oneStoreProductId": "",
							"type": "APPLICATION"
						},
						{
							"name": "Cities: Skylines",
							"reference": "ColossalOrder.CitiesSkylines_9dej7x9zwzxzc!App",
							"oneStoreProductId": "C4GH8N6ZXG5L",
							"type": "APPLICATION"
						}
					],
					"buttons": [
						{
							"name": "Don't Starve Together",
							"oneStoreProductId": ""
						},
						{
							"name": "EA Play Hub",
							"oneStoreProductId": ""
						},
						{
							"name": "AirServer Xbox Edition",
							"oneStoreProductId": ""
						},
						{
							"name": "Gears of War 4",
							"oneStoreProductId": ""
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

## Adding to HomeKit
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
4. Select Your accessory. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Limitations
* That maximum Services for 1 accessory is 100. If Services > 100, accessory stop responding.
* The Services in this accessory are:
  * Information.
  * Speaker.
  * Lightbulb.
  * Fan.
  * Television.
  * Inputs, which may range from 6 to 100 as each input is 1 service.
  * Buttons, which may range from 6 to 100 as each input is 1 service.

## [What's New](https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/CHANGELOG.md)

## Development
* Pull request and help in development highly appreciated.
