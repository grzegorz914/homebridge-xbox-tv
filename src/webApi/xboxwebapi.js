'use strict';
const EventEmitter = require('events');
const { v4: UuIdv4 } = require('uuid');
const Authentication = require('./authentication.js')
const HttpClient = require('./httpclient.js')
const Achievements = require('./providers/achievements.js');
const Catalog = require('./providers/catalog.js');
const Gameclips = require('./providers/gameclips.js');
const Messages = require('./providers/messages.js');
const People = require('./providers/people.js');
const Pins = require('./providers/pins.js');
const Screenshots = require('./providers/screenshots.js');
const Social = require('./providers/social.js');
const Titlehub = require('./providers/titlehub.js');
const UserPresence = require('./providers/userpresence.js');
const UserStats = require('./providers/userstats.js');
const CONSTANTS = require('../constans.json');

class XBOXWEBAPI extends EventEmitter {
    constructor(config) {
        super();
        this.xboxLiveId = config.xboxLiveId;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.debugLog = config.debugLog;

        //variables
        this.authorized = false;
        this.httpClient = new HttpClient();

        const authConfig = {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            tokensFile: config.tokensFile
        }
        this.authentication = new Authentication(authConfig);
        this.checkAuthorization();
    }

    async checkAuthorization() {
        try {
            const data = await this.authentication.checkAuthorization();
            const debug = this.debugLog ? this.emit('debug', `authorization headers: ${JSON.stringify(data.headers, null, 2)}, tokens: ${JSON.stringify(data.tokens, null, 2)}`) : false;
            this.headers = {
                'Authorization': data.headers,
                'Accept-Language': 'en-US',
                'x-xbl-contract-version': '4',
                'x-xbl-client-name': 'XboxApp',
                'x-xbl-client-type': 'UWA',
                'x-xbl-client-version': '39.39.22001.0',
                'skillplatform': 'RemoteManagement'
            }
            this.tokens = data.tokens;
            this.authorized = true;

            try {
                await this.xboxLiveData();
            } catch (error) {
                this.emit('error', JSON.stringify(error, null, 2));
            };
        } catch (error) {
            this.emit('error', error);
        };

        await new Promise(resolve => setTimeout(resolve, 900000));
        this.checkAuthorization();
    }

    xboxLiveData() {
        return new Promise(async (resolve, reject) => {
            try {
                const rmEnabled = await this.consoleStatus();
                const debug1 = !rmEnabled ? this.emit('message', `remote management not enabled, please check your console settings.`) : false;
                //await this.consolesList();
                await this.installedApps();
                //await this.storageDevices();
                //await this.userProfile();
                resolve();
            } catch (error) {
                reject(`get xbox live data error: ${error}`);
            };
        });
    };

    consoleStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `${CONSTANTS.WebApi.Url.Xccs}/consoles/${this.xboxLiveId}`;
                const getConsoleStatusData = await this.httpClient.request('GET', url, this.headers);
                const responseObject = JSON.parse(getConsoleStatusData);
                const debug = this.debugLog ? this.emit('debug', `getConsoleStatusData, result: ${JSON.stringify(responseObject, null, 2)}`) : false;

                //get console status
                const consoleStatusData = responseObject;
                const id = consoleStatusData.id;
                const name = consoleStatusData.name;
                const locale = consoleStatusData.locale;
                const region = consoleStatusData.region;
                const consoleType = CONSTANTS.WebApi.Console.Name[consoleStatusData.consoleType];
                const powerState = (CONSTANTS.WebApi.Console.PowerState[consoleStatusData.powerState] === 1); // 0 - Off, 1 - On, 2 - InStandby, 3 - SystemUpdate
                const playbackState = (CONSTANTS.WebApi.Console.PlaybackState[consoleStatusData.playbackState] === 1); // 0 - Stopped, 1 - Playng, 2 - Paused
                const loginState = consoleStatusData.loginState;
                const focusAppAumid = consoleStatusData.focusAppAumid;
                const isTvConfigured = (consoleStatusData.isTvConfigured === true);
                const digitalAssistantRemoteControlEnabled = consoleStatusData.digitalAssistantRemoteControlEnabled;
                const consoleStreamingEnabled = consoleStatusData.consoleStreamingEnabled;
                const remoteManagementEnabled = consoleStatusData.remoteManagementEnabled;

                this.emit('consoleStatus', consoleStatusData, consoleType);
                resolve(remoteManagementEnabled);
            } catch (error) {
                reject(`get status error: ${error}`);
            };
        });
    }

    consolesList() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `${CONSTANTS.WebApi.Url.Xccs}/lists/devices?queryCurrentDevice=false&includeStorageDevices=true`;
                const getConsolesListData = await this.httpClient.request('GET', url, this.headers);
                const responseObject = JSON.parse(getConsolesListData);
                const debug = this.debugLog ? this.emit('debug', `getConsolesListData, result: ${responseObject.result[0]}, ${responseObject.result[0].storageDevices[0]}`) : false;

                //get consoles list
                this.consolesId = [];
                this.consolesName = [];
                this.consolesLocale = [];
                this.consolesRegion = [];
                this.consolesConsoleType = [];
                this.consolesPowerState = [];
                this.consolesDigitalAssistantRemoteControlEnabled = [];
                this.consolesConsoleStreamingEnabled = [];
                this.consolesRemoteManagementEnabled = [];
                this.consolesWirelessWarning = [];
                this.consolesOutOfHomeWarning = [];

                this.consolesStorageDeviceId = [];
                this.consolesStorageDeviceName = [];
                this.consolesIsDefault = [];
                this.consolesFreeSpaceBytes = [];
                this.consolesTotalSpaceBytes = [];
                this.consolesIsGen9Compatible = [];

                const consolesList = responseObject.result;
                for (const console of consolesList) {
                    const id = console.id;
                    const name = console.name;
                    const locale = console.locale;
                    const region = console.region;
                    const consoleType = console.consoleType;
                    const powerState = CONSTANTS.WebApi.Console.PowerState[console.powerState]; // 0 - Off, 1 - On, 2 - ConnectedStandby, 3 - SystemUpdate
                    const digitalAssistantRemoteControlEnabled = console.digitalAssistantRemoteControlEnabled;
                    const remoteManagementEnabled = console.remoteManagementEnabled;
                    const consoleStreamingEnabled = console.consoleStreamingEnabled;
                    const wirelessWarning = console.wirelessWarning;
                    const outOfHomeWarning = console.outOfHomeWarning;

                    this.consolesId.push(id);
                    this.consolesName.push(name);
                    this.consolesLocale.push(locale);
                    this.consolesRegion.push(region);
                    this.consolesConsoleType.push(consoleType);
                    this.consolesPowerState.push(powerState);
                    this.consolesDigitalAssistantRemoteControlEnabled.push(digitalAssistantRemoteControlEnabled);
                    this.consolesRemoteManagementEnabled.push(remoteManagementEnabled);
                    this.consolesConsoleStreamingEnabled.push(consoleStreamingEnabled);
                    this.consolesWirelessWarning.push(wirelessWarning);
                    this.consolesOutOfHomeWarning.push(outOfHomeWarning);

                    const consolesStorageDevices = console.storageDevices;
                    for (const consoleStorageDevice of consolesStorageDevices) {
                        const storageDeviceId = consoleStorageDevice.storageDeviceId;
                        const storageDeviceName = consoleStorageDevice.storageDeviceName;
                        const isDefault = (consoleStorageDevice.isDefault === true);
                        const freeSpaceBytes = consoleStorageDevice.freeSpaceBytes;
                        const totalSpaceBytes = consoleStorageDevice.totalSpaceBytes;
                        const isGen9Compatible = consoleStorageDevice.isGen9Compatible;

                        this.consolesStorageDeviceId.push(storageDeviceId);
                        this.consolesStorageDeviceName.push(storageDeviceName);
                        this.consolesIsDefault.push(isDefault);
                        this.consolesFreeSpaceBytes.push(freeSpaceBytes);
                        this.consolesTotalSpaceBytes.push(totalSpaceBytes);
                        this.consolesIsGen9Compatible.push(isGen9Compatible);
                    }
                }

                this.emit('consolesList', consolesList);
                resolve();
            } catch (error) {
                reject(`Consoles list error: ${error}`);
            };
        });
    }

    installedApps() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `${CONSTANTS.WebApi.Url.Xccs}/lists/installedApps?deviceId=${this.xboxLiveId}`;
                const getInstalledAppsData = await this.httpClient.request('GET', url, this.headers);
                const responseObject = JSON.parse(getInstalledAppsData);
                const debug = this.debugLog ? this.emit('debug', `getInstalledAppsData: ${JSON.stringify(responseObject.result, null, 2)}`) : false;

                //get installed apps
                const appsArray = [];
                const apps = responseObject.result;
                for (const app of apps) {
                    const oneStoreProductId = app.oneStoreProductId;
                    const titleId = app.titleId;
                    const aumid = app.aumid;
                    const lastActiveTime = app.lastActiveTime;
                    const isGame = app.isGame;
                    const name = app.name;
                    const contentType = app.contentType;
                    const instanceId = app.instanceId;
                    const storageDeviceId = app.storageDeviceId;
                    const uniqueId = app.uniqueId;
                    const legacyProductId = app.legacyProductId;
                    const version = app.version;
                    const sizeInBytes = app.sizeInBytes;
                    const installTime = app.installTime;
                    const updateTime = app.updateTime;
                    const parentId = app.parentId;

                    const inputsObj = {
                        'oneStoreProductId': oneStoreProductId,
                        'titleId': titleId,
                        'reference': aumid,
                        'isGame': isGame,
                        'name': name,
                        'contentType': contentType
                    };
                    appsArray.push(inputsObj);
                };

                this.emit('appsList', appsArray);
                resolve();
            } catch (error) {
                reject(`get installed apps error: ${error}`);
            };
        });
    }

    storageDevices() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `${CONSTANTS.WebApi.Url.Xccs}/lists/storageDevices?deviceId=${this.xboxLiveId}`;
                const getStorageDevicesData = await this.httpClient.request('GET', url, this.headers);
                const responseObject = JSON.parse(getStorageDevicesData);
                const debug = this.debugLog ? this.emit('debug', `getStorageDevicesData, result: ${JSON.stringify(responseObject, null, 2)}`) : false;

                //get console storages
                this.storageDeviceId = [];
                this.storageDeviceName = [];
                this.isDefault = [];
                this.freeSpaceBytes = [];
                this.totalSpaceBytes = [];
                this.isGen9Compatible = [];

                const storageDevices = responseObject.result;
                const deviceId = responseObject.deviceId;
                const agentUserId = responseObject.agentUserId;
                for (const storageDevice of storageDevices) {
                    const storageDeviceId = storageDevice.storageDeviceId;
                    const storageDeviceName = storageDevice.storageDeviceName;
                    const isDefault = storageDevice.isDefault;
                    const freeSpaceBytes = storageDevice.freeSpaceBytes;
                    const totalSpaceBytes = storageDevice.totalSpaceBytes;
                    const isGen9Compatible = storageDevice.isGen9Compatible;

                    this.storageDeviceId.push(storageDeviceId);
                    this.storageDeviceName.push(storageDeviceName);
                    this.isDefault.push(isDefault);
                    this.freeSpaceBytes.push(freeSpaceBytes);
                    this.totalSpaceBytes.push(totalSpaceBytes);
                    this.isGen9Compatible.push(isGen9Compatible);
                };

                this.emit('storageDevices', storageDevices);
                resolve();
            } catch (error) {
                reject(`get storage devices error: ${error}`);
            };
        });
    }

    userProfile() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://profile.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/profile/settings?settings=GameDisplayName,GameDisplayPicRaw,Gamerscore,Gamertag`;
                const getUserProfileData = await this.httpClient.request('GET', url, this.headers);
                const responseObject = JSON.parse(getUserProfileData);
                const debug = this.debugLog ? this.emit('debug', `getUserProfileData, result: ${JSON.stringify(responseObject.profileUsers[0], null, 2)}, ${JSON.stringify(responseObject.profileUsers[0].settings[0], null, 2)}`) : false

                //get user profiles
                this.userProfileId = [];
                this.userProfileHostId = [];
                this.userProfileIsSponsoredUser = [];
                this.userProfileSettingsId = [];
                this.userProfileSettingsValue = [];

                const profileUsers = responseObject.profileUsers;
                for (const userProfile of profileUsers) {
                    const id = userProfile.id;
                    const hostId = userProfile.hostId;
                    const isSponsoredUser = userProfile.isSponsoredUser;

                    this.userProfileId.push(id);
                    this.userProfileHostId.push(hostId);
                    this.userProfileIsSponsoredUser.push(isSponsoredUser);

                    const profileUsersSettings = userProfile.settings;
                    for (const userProfileSettings of profileUsersSettings) {
                        const id = userProfileSettings.id;
                        const value = userProfileSettings.value;

                        this.userProfileSettingsId.push(id);
                        this.userProfileSettingsValue.push(value);
                    };
                };

                this.emit('userProfile', profileUsers);
                resolve();
            } catch (error) {
                reject(`User profile error: ${error}`);
            };
        });
    }

    powerOn() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Power', 'WakeUp');
                resolve();
            } catch (error) {
                this.emit('powerOnError', false);
                reject(error);
            };
        });
    }

    powerOff() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Power', 'TurnOff');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    reboot() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Power', 'Reboot');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    mute() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Audio', 'Mute');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    unmute() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Audio', 'Unmute');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    volumeUp() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Volume', 'Up');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    volumeDown() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Volume', 'Down');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    next() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Media', 'Next');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    previous() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Media', 'Previous');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    pause() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Media', 'Pause');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    play() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Media', 'Play');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    goBack() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'GoBack');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }


    goHome() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'GoHome');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    launchApp(oneStoreProductId) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'ActivateApplicationWithOneStoreProductId', [{ 'oneStoreProductId': oneStoreProductId }]);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    showGuideTab() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'ShowGuideTab', [{
                    'tabName': 'Guide'
                }]);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    showTVGuide() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('TV', 'ShowGuide');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    sendButtonPress(button) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'InjectKey', [{ 'keyType': button }]);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    send(commandType, command, payload) {
        return new Promise(async (resolve, reject) => {
            if (!this.authorized) {
                reject('not authorized.');
                return;
            };

            const sessionid = UuIdv4();
            const params = payload ? payload : [];
            const postParams = {
                "destination": 'Xbox',
                "type": commandType,
                "command": command,
                "sessionId": sessionid,
                "sourceId": 'com.microsoft.smartglass',
                "parameters": params,
                "linkedXboxId": this.xboxLiveId
            }

            try {
                const postData = JSON.stringify(postParams);
                const response = await this.httpClient.request('POST', `${CONSTANTS.WebApi.Url.Xccs}/commands`, this.headers, postData);
                const responseObject = JSON.parse(response);
                const debug = this.debugLog ? this.emit('debug', `send command, result: ${JSON.stringify(responseObject, null, 2)}`) : false;

                resolve();
            } catch (error) {
                reject(`send command type: ${commandType}, command: ${command}, params: ${params}, error: ${error}`);
            };
        });
    }
}
module.exports = XBOXWEBAPI;