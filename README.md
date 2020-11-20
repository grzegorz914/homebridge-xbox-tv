<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/xbox.png" height="140"></a>
</p>

<span align="center">

# Homebridge Xbox TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) [![npm](https://badgen.net/npm/dt/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![npm](https://badgen.net/npm/v/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

Homebridge plugin to control Microsoft game consoles in HomeKit as a TV service. Tested with XboxOne X and Xbox Series X.

</span>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-xbox-tv using: `npm install -g homebridge-xbox-tv` or search for `Xbox TV` in Config UI X.

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Info
1. Power ON/OFF short press tile in HomeKit app.
2. RC/Media control is possible after you go to the RC app on iPhone/iPad.
3. Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
4. Legacy volume and mute control is possible through extra `lightbulb` (slider) or using Siri `Volume Service`, not working with the current API.
5. Apps/Games can only be read from the device, switching apps/games does not work with the current API.
6. Siri control.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/homekit.png" height="300"></a> 
  </p>
  <p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/RC.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/rc1.png" height="300"></a>
</p>

## Configuration console
1. [Device must be in Instant Power-ON Mode](https://support-origin.xbox.com/en-ZA/xbox-one/console/learn-about-power-modes)
2. Console need to allow connect from any 3rd app - Settings > Devices & Connections > Remote Features > xBox app Preferences > xBox App should be set to "Allow Connections from any device".

## Configuration plugin
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. To find `xboxliveid`, on your console select Profile & system > Settings > System > Console info, listed as **Xbox Live device ID**. *You can only find the Xbox Live device ID in Settings on your console, this is different from your console serial number.*
3. In `refreshInterval` set the data refresh time in seconds, default 5sec.
4. In `volumeControl` You can select what a additional volume control mode You want to use (None, Slider, Fan).
5. If `switchInfoMenu` is enabled, `I` button change its behaviour in RC app between Menu and INFO.
6. To find more inputs `reference` open log in homebridge, open app on console and look in the log.
7. `manufacturer`, `model`, `serialNumber`, `firmwareRevision` - optional branding data displayed in Home.app

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-xbox-tv/master/graphics/ustawienia.png" height="150"></a>
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
            "manufacturer": "Manufacturer",
            "modelName": "Model",
            "serialNumber": "Serial Number",
            "firmwareRevision": "Firmware Revision"
        }
    ]
}
```

## Limitations
Due to HomeKit app limitation max. services for 1 accessory is 100. Over this value HomeKit app will no response. As services in this accessory are, (1.information service, 2.speaker service, 3.lightbulb service, 4.television service and inputs service 5-100(where every input = 1 service)). If all services are enabled possible inputs to use is 96.

## Whats new:
https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
