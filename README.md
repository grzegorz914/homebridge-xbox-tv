<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/xbox.png" height="140"></a>
</p>

<span align="center">

# Homebridge Xbox TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) [![npm](https://badgen.net/npm/dt/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![npm](https://badgen.net/npm/v/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

Homebridge plugin to control Microsoft game consoles in HomeKit as TV service. Tested with Xbox One X.

</span>

## Info
0. This plugin is in development phase and some functions may be not working correct.
1. Volume/Mute and RC/Media control is possible after You go to RC app on iPhone/iPad.
2. Power ON/OFF short press tile in HomeKit app.
3. Inputs/Apps can be changed after loong press tile in HomeKit app and select from the list.
4. Volume/Mute can be changed using hardware buttons on iPhone/iPad `Speaker Service` or after enable `volumeControl` throught extra `lightbulb` (slider) or using Siri.
5. RC/Media control function available from RC app on iPhone/iPad.
6. Siri control.


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/homekit.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/RC.png" height="300"></a>
</p>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-xbox-tv using: `npm install -g homebridge-xbox-tv` or search for `Xbox TV` in Config UI X.

## Configuration console
1. [Device must be in Instant Power-ON Mode](https://support-origin.xbox.com/en-ZA/xbox-one/console/learn-about-power-modes)

## Configuration plugin
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. `xboxliveid` You can get this in the console settings.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/ustawienia.png" height="150"></a>
</p>

```json
{
    "platform": "XboxTv",
    "devices": [
        {
            "name": "Xbox One",
            "host": "192.168.1.6",
            "xboxliveid": "FD0000000000",
            "volumeControl": false,
            "switchInfoMenu": false,
            "apps": [
                {
                    "name": "TV",
                    "reference": "Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application"
                },
                {
                    "name": "Dashboard",
                    "reference": "Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application"
                },
                {
                    "name": "Spotify",
                    "reference": "SpotifyAB.SpotifyMusic-forXbox_zpdnekdrzrea0!App"
                },
                {
                    "name": "Youtube",
                    "reference": "GoogleInc.YouTube_yfg5n0ztvskxp!App"
                },
                {
                    "name": "Netflix",
                    "reference": "4DF9E0F8.Netflix_mcm4njqhnhss8!App"
                },
                {
                    "name": "Airserver",
                    "reference": "F3F176BD.53203526D8F6C_p8qzvses5c8me!AirServer"
                }
            ]
        }
    ]
}
```

## Whats new:
https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/CHANGELOG.md
