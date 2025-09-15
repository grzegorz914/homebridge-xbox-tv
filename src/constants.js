export const PlatformName = "XboxTv";
export const PluginName = "homebridge-xbox-tv";

export const DefaultInputs = [
    {
        "oneStoreProductId": "Screensaver",
        "titleId": "851275400",
        "reference": "Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application",
        "isGame": false,
        "name": "Screensaver",
        "contentType": "Dashboard"
    },
    {
        "oneStoreProductId": "Dashboard",
        "titleId": "750323071",
        "reference": "Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application",
        "isGame": false,
        "name": "Dashboard",
        "contentType": "Dashboard"
    },
    {
        "oneStoreProductId": "Settings",
        "titleId": "1837352387",
        "reference": "Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application",
        "isGame": false,
        "name": "Settings",
        "contentType": "Dashboard"
    },
    {
        "oneStoreProductId": "Television",
        "titleId": "371594669",
        "reference": "Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application",
        "isGame": false,
        "name": "Television",
        "contentType": "systemApp"
    },
    {
        "oneStoreProductId": "SettingsTv",
        "titleId": "2019308066",
        "reference": "Microsoft.Xbox.TvSettings_8wekyb3d8bbwe!Microsoft.Xbox.TvSettings.Application",
        "isGame": false,
        "name": "Settings TV",
        "contentType": "Dashboard"
    },
    {
        "oneStoreProductId": "Accessory",
        "titleId": "758407307",
        "reference": "Microsoft.XboxDevices_8wekyb3d8bbwe!App",
        "isGame": false,
        "name": "Accessory",
        "contentType": "systemApp"
    },
    {
        "oneStoreProductId": "NetworkTroubleshooter",
        "titleId": "1614319806",
        "reference": "Xbox.NetworkTroubleshooter_8wekyb3d8bbwe!Xbox.NetworkTroubleshooter.Application",
        "isGame": false,
        "name": "Network Troubleshooter",
        "contentType": "systemApp"
    },
    {
        "oneStoreProductId": "MicrosoftStore",
        "titleId": "1864271209",
        "reference": "Microsoft.storify_8wekyb3d8bbwe!App",
        "isGame": false,
        "name": "Microsoft Store",
        "contentType": "Dashboard"
    },
    {
        "oneStoreProductId": "XboxGuide",
        "titleId": "1052052983",
        "reference": "Xbox.Guide_8wekyb3d8bbwe!Xbox.Guide.Application",
        "isGame": false,
        "name": "Xbox Guide",
        "contentType": "systemApp"
    }
];

export const InputSourceTypes = [
    "OTHER",
    "HOME_SCREEN",
    "TUNER",
    "HDMI",
    "COMPOSITE_VIDEO",
    "S_VIDEO",
    "COMPONENT_VIDEO",
    "DVI",
    "AIRPLAY",
    "USB",
    "APPLICATION"
];

export const WebApi = {
    "Url": {
        "oauth2": "https://login.live.com/oauth20_authorize.srf",
        "AccessToken": "https://login.live.com/oauth20_token.srf",
        "RefreshToken": "https://login.live.com/oauth20_token.srf",
        "UserToken": "https://user.auth.xboxlive.com/user/authenticate",
        "XstsToken": "https://xsts.auth.xboxlive.com/xsts/authorize",
        "Redirect": "http://localhost:8888/auth/callback",
        "Xccs": "https://xccs.xboxlive.com"
    },
    "Scopes": "XboxLive.signin XboxLive.offline_access",
    "ClientId": "a34ac209-edab-4b08-91e7-a4558d8da1bd",
    "Console": {
        "Name": {
            "XboxSeriesX": "Xbox Series X",
            "XboxSeriesS": "Xbox Series S",
            "XboxOne": "Xbox One",
            "XboxOneS": "Xbox One S",
            "XboxOneX": "Xbox One X"
        },
        "PowerState": {
            "Off": 0,
            "On": 1,
            "ConnectedStandby": 2,
            "SystemUpdate": 3,
            "Unknown": 4
        },
        "PlaybackState": {//0 - STOP, 1 - PLAY, 2 - PAUSE
            "Stopped": 0,
            "Playing": 1,
            "Paused": 2,
            "Unknown": 3
        },
        "PlaybackStateHomeKit": { //0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
            "Stopped": 2,
            "Playing": 0,
            "Paused": 1,
            "Unknown": 4
        }
    }
};

export const LocalApi = {
    "ParticipantId": {
        "Target": 0
    },
    "ClientId": "e8ff5828-5cce-4f90-89a4-117d127e3838",
    "Console": {
        "Name": {
            "1": "Xbox One",
            "2": "Xbox 360",
            "3": "Windows Desktop",
            "4": "Windows Store",
            "5": "Windows Phone",
            "6": "iPhone",
            "7": "iPad",
            "8": "Android"
        },
        "PairingState": {
            "0": "Not Paired",
            "1": "Paired"
        }
    },
    "Channels": {
        "System": {
            "Input": {
                "Id": 0,
                "Uuid": "fa20b8ca66fb46e0adb60b978a59d35f",
                "Commands": {
                    "unpress": 0,
                    "enroll": 1,
                    "nexus": 2,
                    "view": 4,
                    "menu": 8,
                    "a": 16,
                    "b": 32,
                    "x": 64,
                    "y": 128,
                    "up": 256,
                    "down": 512,
                    "left": 1024,
                    "right": 2048,
                    "leftShoulder": 4096,
                    "rightShoulder": 8192,
                    "leftThumbstick": 16384,
                    "rightThumbstick": 32768
                }
            },
            "TvRemote": {
                "Id": 1,
                "Uuid": "d451e3b360bb4c71b3dbf994b1aca3a7",
                "Commands": {
                    "volUp": "btn.vol_up",
                    "volDown": "btn.vol_down",
                    "volMute": "btn.vol_mute"
                },
                "MessageType": {
                    "Error": "Error",
                    "GetConfiguration": "GetConfiguration",
                    "GetHeadendInfo": "GetHeadendInfo",
                    "GetLiveTVInfo": "GetLiveTVInfo",
                    "GetProgramInfo": "GetProgramInfo",
                    "GetRecentChannels": "GetRecentChannels",
                    "GetTunerLineups": "GetTunerLineups",
                    "GetAppChannelData": "GetAppChannelData",
                    "GetAppChannelLineups": "GetAppChannelLineups",
                    "GetAppChannelProgramData": "GetAppChannelProgramData",
                    "SendKey": "SendKey",
                    "SetChannel": "SetChannel"
                }
            },
            "Media": {
                "Id": 2,
                "Uuid": "48a9ca24eb6d4e128c43d57469edd3cd",
                "Commands": {
                    "play": 2,
                    "pause": 4,
                    "playPause": 8,
                    "stop": 16,
                    "record": 32,
                    "nextTrack": 64,
                    "previousTrack": 128,
                    "fastForward": 256,
                    "rewind": 512,
                    "channelUp": 1024,
                    "channelDown": 2048,
                    "back": 4096,
                    "view": 8192,
                    "menu": 16384,
                    "seek": 32786
                }
            },
            "Text": {
                "Id": 3,
                "Uuid": "7af3e6a2488b40cba93179c04b7da3a0"
            },
            "Broadcast": {
                "Id": 4,
                "Uuid": "b6a117d8f5e245d7862e8fd8e3156476"
            },
            "Title": {
                "Id": 5,
                "Uuid": "00000000000000000000000000000000"
            }
        }
    },
    "Media": {
        "Types": {
            "0": "No Media",
            "1": "Music",
            "2": "Video",
            "3": "Image",
            "4": "Conversation",
            "5": "Game"
        },
        "PlaybackState": {
            "0": "Closed",
            "1": "Changing",
            "2": "Stopped",
            "3": "Playing",
            "4": "Paused"
        },
        "SoundLevel": {
            "0": "Muted",
            "1": "Low",
            "2": "Full"
        }
    },
    "Messages": {
        "Category": {
            "d00d": "message",
            "dd00": "simple",
            "dd01": "simple",
            "dd02": "simple",
            "cc00": "simple",
            "cc01": "simple"
        },
        "CategoryTypes": {
            "d00d": "message",
            "dd00": "discoveryRequest",
            "dd01": "discoveryResponse",
            "dd02": "powerOn",
            "cc00": "connectRequest",
            "cc01": "connectResponse",
        },
        "Types": {
            0x1: "acknowledge",
            0x2: "group",
            0x3: "localJoin",
            0x5: "stopActivity",
            0x19: "auxilaryStream",
            0x1A: "activeSurfaceChange",
            0x1B: "navigate",
            0x1C: "json",
            0x1D: "tunnel",
            0x1E: "consoleStatus",
            0x1F: "titleTextConfiguration",
            0x20: "titleTextInput",
            0x21: "titleTextSelection",
            0x22: "mirroringRequest",
            0x23: "titleLaunch",
            0x26: "channelStartRequest",
            0x27: "channelStartResponse",
            0x28: "channelStop",
            0x29: "system",
            0x2A: "disconnect",
            0x2E: "titleTouch",
            0x2F: "accelerometer",
            0x30: "gyrometer",
            0x31: "inclinometer",
            0x32: "compass",
            0x33: "orientation",
            0x36: "pairedIdentityStateChanged",
            0x37: "unsnap",
            0x38: "recordGameDvr",
            0x39: "powerOff",
            0xF00: "mediaControllerRemoved",
            0xF01: "mediaCommand",
            0xF02: "mediaCommandResult",
            0xF03: "mediaState",
            0xF0A: "gamepad",
            0xF2B: "systemTextConfiguration",
            0xF2C: "systemTextInput",
            0xF2E: "systemTouch",
            0xF34: "systemTextAck",
            0xF35: "systemTextDone"
        },
        "Flags": {
            acknowledge: Buffer.from('8001', 'hex'),
            0x2: "group",
            localJoin: Buffer.from('2003', 'hex'),
            0x5: "stopActivity",
            0x19: "auxilaryStream",
            0x1A: "activeSurfaceChange",
            0x1B: "navigate",
            json: Buffer.from('a01c', 'hex'),
            0x1D: "tunnel",
            consoleStatus: Buffer.from('a01e', 'hex'),
            0x1F: "titleTextConfiguration",
            0x20: "titleTextInput",
            0x21: "titleTextSelection",
            0x22: "mirroringRequest",
            0x23: "titleLaunch",
            channelStartRequest: Buffer.from('a026', 'hex'),
            channelStartResponse: Buffer.from('a027', 'hex'),
            0x28: "channelStop",
            0x29: "system",
            disconnect: Buffer.from('802a', 'hex'),
            0x2E: "titleTouch",
            0x2F: "accelerometer",
            0x30: "gyrometer",
            0x31: "inclinometer",
            0x32: "compass",
            0x33: "orientation",
            0x36: "pairedIdentityStateChanged",
            0x37: "unsnap",
            recordGameDvr: Buffer.from('a038', 'hex'),
            powerOff: Buffer.from('a039', 'hex'),
            0xF00: "mediaControllerRemoved",
            mediaCommand: Buffer.from('af01', 'hex'),
            mediaCommandResult: Buffer.from('af02', 'hex'),
            mediaState: Buffer.from('af03', 'hex'),
            gamepad: Buffer.from('8f0a', 'hex'),
            0xF2B: "systemTextConfiguration",
            0xF2C: "systemTextInput",
            0xF2E: "systemTouch",
            0xF34: "systemTextAck",
            0xF35: "systemTextDone"
        }
    }
};

export const DiacriticsMap = {
    // Polish
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
    'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',

    // German
    'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss',
    'Ä': 'A', 'Ö': 'O', 'Ü': 'U',

    // French
    'à': 'a', 'â': 'a', 'ç': 'c', 'é': 'e', 'è': 'e',
    'ê': 'e', 'ë': 'e', 'î': 'i', 'ï': 'i', 'ô': 'o',
    'û': 'u', 'ù': 'u', 'ü': 'u', 'ÿ': 'y',
    'À': 'A', 'Â': 'A', 'Ç': 'C', 'É': 'E', 'È': 'E',
    'Ê': 'E', 'Ë': 'E', 'Î': 'I', 'Ï': 'I', 'Ô': 'O',
    'Û': 'U', 'Ù': 'U', 'Ü': 'U', 'Ÿ': 'Y',

    // Spanish & Portuguese
    'á': 'a', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n',
    'Á': 'A', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N',

    // Scandinavian
    'å': 'a', 'Å': 'A', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE',

    // Other common
    'Š': 'S', 'š': 's', 'Ž': 'Z', 'ž': 'z'
};