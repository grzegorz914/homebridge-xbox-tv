'use strict';
const Authentication = require('./authentication.js')
const EventEmitter = require('events');
const CONSTANS = require('../constans.json');
const providers = {
    achievements: require('./providers/achievements.js'),
    catalog: require('./providers/catalog.js'),
    gameclips: require('./providers/gameclips.js'),
    messages: require('./providers/messages.js'),
    people: require('./providers/people.js'),
    pins: require('./providers/pins.js'),
    profile: require('./providers/profile.js'),
    screenshots: require('./providers/screenshots.js'),
    smartglass: require('./providers/smartglass.js'),
    social: require('./providers/social.js'),
    titlehub: require('./providers/titlehub.js'),
    userpresence: require('./providers/userpresence.js'),
    userstats: require('./providers/userstats.js')
}

class XBOXWEBAPI extends EventEmitter {
    constructor(config) {
        super();

        const authenticationConfig = {
            clientId: config.clientId || '',
            clientSecret: config.clientSecret || '',
            userToken: config.userToken || '',
            uhs: config.uhs || '',
            tokensFile: config.tokensFile
        }
        this.authentication = new Authentication(authenticationConfig);
        this.xboxLiveId = config.xboxLiveId;
        this.infoLog = config.infoLog;
        this.debugLog = config.debugLog;
        this.getAuthorizationState();
    }

    async updateAuthorization() {
        await new Promise(resolve => setTimeout(resolve, 60000));
        this.getAuthorizationState();
    };

    async getAuthorizationState() {
        try {
            await this.authentication.isAuthenticated();
            this.emit('authenticated', true);

            try {
                const debug = this.debugLog ? this.emit(`message', 'authorized and web Api enabled.`) : false;
                const rmEnabled = await this.getWebApiConsoleStatus();
                const debug1 = !rmEnabled ? this.emit('message', `remote management not enabled, please check your console settings!!!.`) : false;
                //await this.getWebApiConsolesList();
                //await this.getWebApiUserProfile();
                await this.getWebApiInstalledApps();
                //await this.getWebApiStorageDevices();
                this.updateAuthorization();
            } catch (error) {
                this.emit('error', `get web api console data error: ${error}, recheck in 60se.`)
                this.updateAuthorization();
            };
        } catch (error) {
            this.emit('error', `check authorization state error: ${error}, recheck in 60se.`);
            this.emit('authenticated', false);
            this.updateAuthorization();
        };
    };

    getWebApiConsoleStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                const getConsoleStatusData = await this.getProvider('smartglass').getConsoleStatus(this.xboxLiveId);
                const debug = this.debugLog ? this.emit('debug', `getConsoleStatusData, result: ${JSON.stringify(getConsoleStatusData, null, 2)}`) : false

                //get console status
                const consoleStatusData = getConsoleStatusData;
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
                reject(`Console with liveId: ${this.xboxLiveId}, get status error: ${error}`);
            };
        });
    }

    getWebApiConsolesList() {
        return new Promise(async (resolve, reject) => {
            try {
                const getConsolesListData = await this.getProvider('smartglass').getConsolesList();
                const debug = this.debugLog ? this.emit('debug', `getConsolesListData, result: ${getConsolesListData.result[0]}, ${getConsolesListData.result[0].storageDevices[0]}`) : false

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

                const consolesList = getConsolesListData.result;
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

                this.emit('consolesList', getConsolesListData, consolesList);
                resolve(true);
            } catch (error) {
                reject(`get consoles list error: ${error}`);
            };
        });
    }

    getWebApiUserProfile() {
        return new Promise(async (resolve, reject) => {
            try {
                const getUserProfileData = await this.getProvider('profile').getUserProfile();
                const debug = this.debugLog ? this.emit('debug', `getUserProfileData, result: ${JSON.stringify(getUserProfileData.profileUsers[0], null, 2)}, ${JSON.stringify(getUserProfileData.profileUsers[0].settings[0], null, 2)}`) : false

                //get user profiles
                this.userProfileId = [];
                this.userProfileHostId = [];
                this.userProfileIsSponsoredUser = [];
                this.userProfileSettingsId = [];
                this.userProfileSettingsValue = [];

                const profileUsers = getUserProfileData.profileUsers;
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

                this.emit('userProfile', getUserProfileData, profileUsers);
                resolve(true);
            } catch (error) {
                reject(`get user profile error: ${error}`);
            };
        });
    }

    getWebApiInstalledApps() {
        return new Promise(async (resolve, reject) => {
            try {
                const getInstalledAppsData = await this.getProvider('smartglass').getInstalledApps(this.xboxLiveId);
                const debug = this.debugLog ? this.emit('debug', `getInstalledAppsData: ${JSON.stringify(getInstalledAppsData.result, null, 2)}`) : false

                //get installed apps
                const appsArr = [];
                const apps = getInstalledAppsData.result;
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
                        'contentType': contentType,
                        'type': 'APPLICATION'
                    };
                    appsArr.push(inputsObj);
                };

                this.emit('appsList', getInstalledAppsData, appsArr);
                resolve(true);
            } catch (error) {
                reject(`Console with liveId: ${this.xboxLiveId}, get installed apps error: ${error}`);
            };
        });
    }

    getWebApiStorageDevices() {
        return new Promise(async (resolve, reject) => {
            try {
                const getStorageDevicesData = await this.getProvider('smartglass').getStorageDevices(this.xboxLiveId);
                const debug = this.debugLog ? this.emit('debug', `getStorageDevicesData, result: ${JSON.stringify(getStorageDevicesData, null, 2)}`) : false

                //get console storages
                this.storageDeviceId = [];
                this.storageDeviceName = [];
                this.isDefault = [];
                this.freeSpaceBytes = [];
                this.totalSpaceBytes = [];
                this.isGen9Compatible = [];

                const storageDevices = getStorageDevicesData.result;
                const deviceId = getStorageDevicesData.deviceId;
                const agentUserId = getStorageDevicesData.agentUserId;
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

                this.emit('storageDevices', getStorageDevicesData, storageDevices);
                resolve(true);
            } catch (error) {
                reject(`Console with liveId: ${this.xboxLiveId}, get storage devices error: ${error}`);
            };
        });
    }

    getProvider(name) {
        if (providers[name] === undefined) {
            return false
        }
        return providers[name](this, name)
    }
}
module.exports = XBOXWEBAPI;