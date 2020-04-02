# homebridge-xbox-tv
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![npm](https://badgen.net/npm/v/homebridge-xbox-tv?color=purple)](https://www.npmjs.com/package/homebridge-xbox-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

Plugin to control Microsoft game consoles in HomeKit as TV service. Tested with Xbox One X. Present as TV service, change apps, volume/mute control, power control.

Homebridge: https://github.com/homebridge/homebridge

## Installation

1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Install homebridge-xbox-tv using: `npm install -g homebridge-xbox-tv`
3. Update your configuration file. See `sample-config.json` in this repository for a sample. 

## Configuration

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
                    "name": "Game",
                    "reference": ""
                },
                {
                    "name": "TV",
                    "reference": "Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application"
                },
                {
                    "name": "Dashboard",
                    "reference": "Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application"
                },
                {
                    "name": "App",
                    "reference": ""
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
