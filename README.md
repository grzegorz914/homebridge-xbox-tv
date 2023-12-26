<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Xbox and controller" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/homebridge-xbox-tv.png" width="640"></a>
</p>

<span align="center">

# Homebridge Xbox TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv)
[![npm](https://badgen.net/npm/v/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv)
[![npm](https://img.shields.io/npm/v/homebridge-xbox-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-xbox-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

Homebridge plugin for Microsoft game Consoles. Tested with Xbox One X/S and Xbox Series X.

</span>

## Package Requirements
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [Xbox TV](https://www.npmjs.com/package/homebridge-xbox-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-xbox-tv/wiki) | Homebridge Plug-In | Required |

## About The Plugin
* Power ON/OFF short press tile in HomeKit app.
* Reboot Console with button, rquired `webApiControl` enabled.
* Record Game DVR with button, rquired `webApiControl` enabled.
* RC/Media/Volume control from RC app on iPhone/iPad and possible over web/local api.
* Speaker control from RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume/Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Apps, Inputs, Games can be switched if `webApiControl` is enabled and console is authorized.
* Siri can be used for all functions, some times need to be created legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need to be created legacy buttons/switches/sensors.
* RESTful server:
  * Request: `http//homebridge_ip_address:port/path`.
  * Path: `info`, `state`, `consoleslist`, `profile`, `apps`, `storages`, `status`.
  * Respone as JSON data.
* MQTT client:
  * Topic: `Info`, `State`, `Consoles List`, `Profile`, `Apps`, `Storages`, `Status`.
  * Publish as JSON data.

<p align="center">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Accessory tile in the HomeKit app" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/homekit.png" width="382" /></a> 
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Changing the accessory input" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/inputs.png" width="135" /></a>
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Arrow pointing to the remote control icon in the control center" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/rc1.png" width="135" /></a>
		<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Remote control interface" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/RC.png" width="135" /></a>
</p>

## Authorization Manager
* First of all please use built in Authorization Manager.
  * Start new authorization need remove old token first, to clear token use Authorization Manager GUI.
  * Make sure Your web browser do not block pop-up window, if Yes allow pop-up window for this app.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img alt="Authentication Manager" src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/config manager.png" width="540"></a>
</p>

## Configuration
* [Device must have Instant-on power mode enabled](https://support.xbox.com/help/hardware-network/power/learn-about-power-modes)
  * Profile & System > Settings > General > Power mode & startup
  * Console need to allow connect from any 3rd app. *Allow Connections from any device* should be enabled.
  * Profile & System > Settings > Devices & Connections > Remote features > Xbox app preferences.
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin. 
* The `sample-config.json` can be edited and used as an alternative (advanced users). 

<p align="center">
	<a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/settings.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of Console.|
| `xboxLiveId` | On your console select Profile > Settings > System > Console info, listed as **Xbox network device ID**. *You can only find the Xbox network device ID in Settings on your console, this is different from your console serial number*. |
| `getInputsFromDevice`| If enabled, apps will be loaded from device, only available if `webApiControl` enabled. |
| `filterGames` | If enabled, Games will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `filterApps` | If enabled, Apps will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `filterSystemApps` | If enabled, System Apps (Accessory, Microsoft Store, Television) will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `filterDlc` | If enabled, Dlc will be hidden and not displayed in the inputs list, only available if `webApiControl` enabled. |
| `inputs.name` | Here set *Input Name* which You want expose to the *Homebridge/HomeKit*, `Screensaver`, `Television`, `TV Settings`, `Dashboard`, `Accessory`, `Settings`, `Network Troubleshooter`, `Microsoft Store`, `Xbox Guide` are created by default. |
| `inputs.reference` | Required to identify current running app. |
| `inputs.oneStoreProductId` | Required to switch apps. |
| `inputs.contentType` | Here select from available content types. |
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttons.command` | Here select button control mode or command, `Reboot` and `Switch App/Game`- only possible if `webApiControl` enabled. |
| `buttons.oneStoreProductId` | Here set *Input oneStoreProductId*, only possible if `webApiControl` enabled. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`. |
| `sensorPower`| If enabled, then the Power will be exposed as a `Motion Sensor` (active on Power ON). |
| `sensorInput`| If enabled, then the Input will be exposed as a `Motion Sensor` (active on every Input change). |
| `sensorScreenSaver`| If enabled, then the Screen Saver will be exposed as a `Motion Sensor` (active on change to Screen Saver). |
| `sensorInputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `sensorInputs.reference` | Here set *Reference* like `Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application` to be exposed as sensor (active on switch to this Input). | 
| `sensorInputs.displayType` | Here select sensor type to be exposed in HomeKit app, possible `None/Disabled`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`. |
| `webApiControl` | This enable console control over Web Api. Additional functions are available in `Advanced Settings` section. |
| `webApiPowerOnOff` | This enable `Power` control over Web Api. |
| `webApiToken` | Required if `webApiControl` enabled, use Authorization Manager to get it. |
| `webApiClientId` | If You are created App on Azure AD then You can use your own Client Id. |
| `webApiClientSecret` | If You are created App on Azure AD then You can use own Client Secret. |
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (`None/Disabled`, `Lightbulb`, `Fan`), not working yet. |
| `enableRestFul` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFulPort` | Here set the listening `Port` for RESTful server. |
| `restFulDebug` | If enabled, deep log will be present in homebridge console for RESTFul server. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `mqttHost` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqttPort` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqttClientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqttPrefix` | Here set the`Prefix` for `Topic` or leave empty. |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the `User` for MQTT Broker. |
| `mqttPasswd` | Here set the `Password` for MQTT Broker. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `reference`, `oneStoreProductId` | If web Api enabled then all available in `./homebridge/xboxTv/inputs_xxxxxx` file. |
| `Volume Control` | -1 - `None/Disabled`, 0 - `Slider`, 1 - `Fan`. |
| `Display Type Inputs/Buttons` | -1 - `None/Disabled`, 0 - `Outlet`, 1 - `Switch`. |
| `Display Type Sensors` | -1 - `None/Disabled`, 0 - `Motion Sensor`, 1 - `Occupancy Sensor`, 2 - `Contact Sensor`. |

## Create App on Azure AD
* Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
* Register new *App* + *New registration*
  * Enter a name for your app
  * Set *Supported account types* to *Personal Microsoft accounts only*
  * Click register
  * Choose *Redirect URIs* -> *Add a Redirect URI*
  * Click *Add a platform* -> *Mobile and desktop applications*
  * Enter custom redirect URI *http://localhost:8888/auth/callback*
* From the overview of your app page, copy *Application (client) ID* to `webApiClientId`
* Save restart plugin and authorize console again and have fun.
