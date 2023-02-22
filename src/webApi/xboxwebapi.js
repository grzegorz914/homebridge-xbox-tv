'use strict';
const EventEmitter = require('events');
const Uuid4 = require('uuid4');

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
const CONSTANS = require('../constans.json');
class XBOXWEBAPI extends EventEmitter {
    constructor(config) {
        super();
        this.xboxLiveId = config.xboxLiveId;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.userToken = config.userToken;
        this.userHash = config.userHash;
        this.debugLog = config.debugLog;

        const authConfig = {
            xboxLiveUser: config.xboxLiveUser,
            xboxLivePasswd: config.xboxLivePasswd,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            userToken: config.userToken,
            userHash: config.userHash,
            tokensFile: config.tokensFile
        }
        this.authentication = new Authentication(authConfig);
        this.httpClient = new HttpClient();

        this.getAuthorizationState();
    }

    async updateAuthorization() {
        await new Promise(resolve => setTimeout(resolve, 60000));
        this.getAuthorizationState();
    };

    async getAuthorizationState() {
        try {
            const authorized = await this.authentication.checkAuthorization();
            if (!authorized) {
                this.emit(`message', 'not authorized, please use authorization manager first.`)
                this.auhorized = false;
                return;
            }

            try {
                this.auhorized = true;
                this.headers = {
                    'Authorization': (this.userToken && this.userHash) ? `XBL3.0 x=${this.userHash};${this.userToken}` : `XBL3.0 x=${this.authentication.user.uhs};${this.authentication.tokens.xsts}`,
                    'Accept-Language': 'en-US',
                    'x-xbl-contract-version': '4',
                    'x-xbl-client-name': 'XboxApp',
                    'x-xbl-client-type': 'UWA',
                    'x-xbl-client-version': '39.39.22001.0'
                }
                const debug = this.debugLog ? this.emit(`message', 'authorized and web Api enabled.`) : false;
                const rmEnabled = await this.consoleStatus();
                const debug1 = !rmEnabled ? this.emit('message', `remote management not enabled, please check your console settings.`) : false;
                //await this.consolesList();
                await this.installedApps();
                //await this.storageDevices();
                //await this.userProfile();
                this.updateAuthorization();
            } catch (error) {
                this.emit('error', `web api data error: ${error}, recheck in 60se.`)
                this.updateAuthorization();
            };
        } catch (error) {
            this.emit('error', `check authorization state error: ${error}, recheck in 60se.`);
            this.emit('authenticated', false);
            this.updateAuthorization();
        };
    };

    consoleStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['skillplatform'] = 'RemoteManagement';
                const url = `https://xccs.xboxlive.com/consoles/${this.xboxLiveId}`;
                const getConsoleStatusData = await this.httpClient.get(url, this.headers);
                const responseObject = JSON.parse(getConsoleStatusData);
                const debug = this.debugLog ? this.emit('debug', `getConsoleStatusData, result: ${JSON.stringify(responseObject, null, 2)}`) : false

                if (responseObject.status.errorCode !== 'OK') {
                    reject(responseObject.status);
                    return;
                }

                //get console status
                const consoleStatusData = responseObject;
                const id = consoleStatusData.id;
                const name = consoleStatusData.name;
                const locale = consoleStatusData.locale;
                const region = consoleStatusData.region;
                const consoleType = CONSTANS.ConsoleName[consoleStatusData.consoleType];
                const powerState = (CONSTANS.ConsolePowerState[consoleStatusData.powerState] === 1); // 0 - Off, 1 - On, 2 - InStandby, 3 - SystemUpdate
                const playbackState = (CONSTANS.ConsolePlaybackState[consoleStatusData.playbackState] === 1); // 0 - Stopped, 1 - Playng, 2 - Paused
                const loginState = consoleStatusData.loginState;
                const focusAppAumid = consoleStatusData.focusAppAumid;
                const isTvConfigured = (consoleStatusData.isTvConfigured === true);
                const digitalAssistantRemoteControlEnabled = consoleStatusData.digitalAssistantRemoteControlEnabled;
                const consoleStreamingEnabled = consoleStatusData.consoleStreamingEnabled;
                const remoteManagementEnabled = consoleStatusData.remoteManagementEnabled;

                this.emit('consoleStatus', consoleStatusData, consoleType);
                resolve(remoteManagementEnabled);
            } catch (error) {
                reject(`Console: ${this.xboxLiveId}, get status error: ${error}`);
            };
        });
    }

    consolesList() {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['skillplatform'] = 'RemoteManagement';
                const url = `https://xccs.xboxlive.com/lists/devices?queryCurrentDevice=false&includeStorageDevices=true`;
                const getConsolesListData = await this.httpClient.get(url, this.headers);
                const responseObject = JSON.parse(getConsolesListData);
                const debug = this.debugLog ? this.emit('debug', `getConsolesListData, result: ${responseObject.result[0]}, ${responseObject.result[0].storageDevices[0]}`) : false

                if (responseObject.status.errorCode !== 'OK') {
                    reject(responseObject.status);
                    return;
                }

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
                    const powerState = CONSTANS.ConsolePowerState[console.powerState]; // 0 - Off, 1 - On, 2 - ConnectedStandby, 3 - SystemUpdate
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
                resolve(true);
            } catch (error) {
                reject(`Consoles list error: ${error}`);
            };
        });
    }

    installedApps() {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['skillplatform'] = 'RemoteManagement';
                const url = `https://xccs.xboxlive.com/lists/installedApps?deviceId=${this.xboxLiveId}`;
                const getInstalledAppsData = await this.httpClient.get(url, this.headers);
                const responseObject = JSON.parse(getInstalledAppsData);
                const debug = this.debugLog ? this.emit('debug', `getInstalledAppsData: ${JSON.stringify(responseObject.result, null, 2)}`) : false

                if (responseObject.status.errorCode !== 'OK') {
                    reject(responseObject.status);
                    return;
                }

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
                resolve(true);
            } catch (error) {
                reject(`Console: ${this.xboxLiveId}, get installed apps error: ${error}`);
            };
        });
    }

    storageDevices() {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['skillplatform'] = 'RemoteManagement';
                const url = `https://xccs.xboxlive.com/lists/storageDevices?deviceId=${this.xboxLiveId}`;
                const getStorageDevicesData = await this.httpClient.get(url, this.headers);
                const responseObject = JSON.parse(getStorageDevicesData);
                const debug = this.debugLog ? this.emit('debug', `getStorageDevicesData, result: ${JSON.stringify(responseObject, null, 2)}`) : false

                if (responseObject.status.errorCode !== 'OK') {
                    reject(responseObject.status);
                    return;
                }

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
                resolve(true);
            } catch (error) {
                reject(`Console: ${this.xboxLiveId}, get storage devices error: ${error}`);
            };
        });
    }

    userProfile() {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['x-xbl-contract-version'] = '3';
                const url = `https://profile.xboxlive.com/users/xuid(${this.authentication.user.xid})/profile/settings?settings=GameDisplayName,GameDisplayPicRaw,Gamerscore,Gamertag}`;
                const getUserProfileData = await this.httpClient.get(url, this.headers);
                const responseObject = JSON.parse(getUserProfileData);
                const debug = this.debugLog ? this.emit('debug', `getUserProfileData, result: ${JSON.stringify(responseObject.profileUsers[0], null, 2)}, ${JSON.stringify(responseObject.profileUsers[0].settings[0], null, 2)}`) : false

                if (responseObject.status.errorCode !== 'OK') {
                    reject(responseObject.status);
                    return;
                }

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
                resolve(true);
            } catch (error) {
                reject(`User profile error: ${error}`);
            };
        });
    }

    powerOn() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Power', 'WakeUp')
                resolve(true);
            } catch (error) {
                reject(`power on error: ${error}`);
            };
        });
    }

    powerOff() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Power', 'TurnOff')
                resolve(true);
            } catch (error) {
                reject(`power off error: ${error}`);
            };
        });
    }

    reboot() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Power', 'Reboot')
                resolve(true);
            } catch (error) {
                reject(`reboot error: ${error}`);
            };
        });
    }

    mute() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Audio', 'Mute')
                resolve(true);
            } catch (error) {
                reject(`mute error: ${error}`);
            };
        });
    }

    unmute() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Audio', 'Unmute')
                resolve(true);
            } catch (error) {
                reject(`unmute error: ${error}`);
            };
        });
    }

    launchApp(oneStoreProductId) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'ActivateApplicationWithOneStoreProductId', [{
                    'oneStoreProductId': oneStoreProductId
                }])
                resolve(true);
            } catch (error) {
                reject(`launch app error: ${error}`);
            };
        });
    }

    launchDashboard() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'GoHome')
                resolve(true);
            } catch (error) {
                reject(`launch dashboard error: ${error}`);
            };
        });
    }

    openGuideTab() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'ShowGuideTab', [{
                    'tabName': 'Guide'
                }])
                resolve(true);
            } catch (error) {
                reject(`open guide tab error: ${error}`);
            };
        });
    }

    launchOneGuide() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('TV', 'ShowGuide')
                resolve(true);
            } catch (error) {
                reject(`launch one guide error: ${error}`);
            };
        });
    }

    sendButtonPress(button) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.send('Shell', 'InjectKey', [{
                    'keyType': button
                }])
                resolve(true);
            } catch (error) {
                reject(`send button error: ${error}`);
            };
        });
    }

    send(commandType, command, params) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.auhorized) {
                    reject('not authorized.');
                    return;
                };

                const sessionid = Uuid4();
                const postParams = {
                    "destination": "Xbox",
                    "type": commandType,
                    "command": command,
                    "sessionId": sessionid,
                    "sourceId": "com.microsoft.smartglass",
                    "parameters": params = params || [],
                    "linkedXboxId": this.xboxLiveId,
                }

                this.headers['skillplatform'] = 'RemoteManagement';
                const url = `https://xccs.xboxlive.com/commands`;
                const postData = JSON.stringify(postParams);
                await this.httpClient.post(url, this.headers, postData);
                resolve(true);
            } catch (error) {
                reject(`send command type: ${commandType}, command: ${command}, data: ${params}, error: ${error}.`);
            };
        });
    }
}
module.exports = XBOXWEBAPI;