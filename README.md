<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/xbox.png" height="140"></a>
</p>

<span align="center">

# Homebridge Xbox TV
 [![npm](https://badgen.net/npm/dt/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![npm](https://badgen.net/npm/v/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

## This plugin is in development phase and some functions not working correct.

Control Microsoft game consoles in HomeKit as TV service. Tested with Xbox One X. Present as TV service, change apps, volume/mute control, power control, RC control.

</span>

## Package

1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation

1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-xbox-tv using: `npm install -g homebridge-xbox-tv` 

## Configuration

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-xbox-tv"><img src="https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/graphics/ustawienia.png" height="100"></a>
</p>

1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.

```json
{
    "platform": "XboxTv",
    "devices": [
        {
            "name": "Xbox One",
            "host": "192.168.1.6",
            "xboxliveid": "FD0000000000",
            "switchInfoMenu": true,
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
