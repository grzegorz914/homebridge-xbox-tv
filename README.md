# homebridge-denon-tv
[![npm](https://img.shields.io/npm/dt/homebridge-xbox-tv.svg)](https://www.npmjs.com/package/homebridge-xbox-tv) [![npm](https://img.shields.io/npm/v/homebridge-xbox-tv.svg)](https://www.npmjs.com/package/homebridge-xbox-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-xbox-tv.svg)](https://github.com/grzegorz914/homebridge-denon-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-config-ui-x.svg)](https://github.com/grzegorz914/homebridge-xbox-tv/issues)

Plugin to control Microsoft gamę consoles in HomeKit as TV service.
Tested with Xbox One X.
Present as TV service, schange inputs, volume/mute control, power control.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-denon-tv using: npm install -g homebridge-xbox-tv
3. Update your configuration file. See sample-config.json in this repository for a sample. 

# Configuration

 <pre>
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
</pre>

# Limitations:

# Whats new:
https://github.com/grzegorz914/homebridge-xbox-tv/blob/master/CHANGELOG.md
