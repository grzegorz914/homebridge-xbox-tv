'use strict';
const fs = require('fs');
const fsPromises = fs.promises;
const QueryString = require('querystring');
const EventEmitter = require('events');
const { v4: UuIdv4 } = require('uuid');
const Authentication = require('./authentication.js')
const axios = require('axios');
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
const CONSTANTS = require('../constants.json');

class XBOXWEBAPI extends EventEmitter {
    constructor(config) {
        super();
        this.xboxLiveId = config.xboxLiveId;
        this.webApiClientId = config.webApiClientId;
        this.webApiClientSecret = config.webApiClientSecret;
        this.inputsFile = config.inputsFile;
        this.debugLog = config.debugLog;

        //variables
        this.authorized = false;

        const authConfig = {
            webApiClientId: config.webApiClientId,
            webApiClientSecret: config.webApiClientSecret,
            tokensFile: config.tokensFile
        }
        this.authentication = new Authentication(authConfig);
        this.checkAuthorization();
    }

    async checkAuthorization() {
        try {
            const data = await this.authentication.checkAuthorization();
            const debug = this.debugLog ? this.emit('debug', `authorization headers: ${JSON.stringify(data.headers, null, 2)}, tokens: ${JSON.stringify(data.tokens, null, 2)}`) : false;
            const headers = {
                'Authorization': data.headers,
                'Accept-Language': 'en-US',
                'x-xbl-contract-version': '4',
                'x-xbl-client-name': 'XboxApp',
                'x-xbl-client-type': 'UWA',
                'x-xbl-client-version': '39.39.22001.0',
                'skillplatform': 'RemoteManagement'
            }
            this.headers = headers;
            this.tokens = data.tokens;
            this.authorized = true;

            //create axios instance
            this.axiosInstance = axios.create({
                method: 'GET',
                headers: headers
            });

            try {
                await this.xboxLiveData();
            } catch (error) {
                this.emit('error', JSON.stringify(error, null, 2));
            };
        } catch (error) {
            throw new Error(error);
        };

        await new Promise(resolve => setTimeout(resolve, 900000));
        this.checkAuthorization();
    }

    async xboxLiveData() {
        try {
            const rmEnabled = await this.consoleStatus();
            const debug1 = !rmEnabled ? this.emit('message', `remote management not enabled, please check your console settings.`) : false;
            //await this.consolesList();
            await this.installedApps();
            //await this.storageDevices();
            //await this.userProfile();
            return true;;
        } catch (error) {
            throw new Error(`get xbox live data error: ${error}`);
        };
    };

    async consoleStatus() {
        try {
            const url = `${CONSTANTS.WebApi.Url.Xccs}/consoles/${this.xboxLiveId}`;
            const getConsoleStatusData = await this.axiosInstance(url);
            const debug = this.debugLog ? this.emit('debug', `getConsoleStatusData, result: ${JSON.stringify(getConsoleStatusData.data, null, 2)}`) : false;

            //get console status
            const consoleStatusData = getConsoleStatusData.data;
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

            //emit console type
            this.emit('consoleStatus', consoleType);

            //emit restFul and mqtt
            this.emit('restFul', 'status', consoleStatusData);
            this.emit('mqtt', 'status', consoleStatusData);

            return remoteManagementEnabled;
        } catch (error) {
            throw new Error(`get status error: ${error}`);
        };
    }

    async consolesList() {
        try {
            const url = `${CONSTANTS.WebApi.Url.Xccs}/lists/devices?queryCurrentDevice=false&includeStorageDevices=true`;
            const getConsolesListData = await this.axiosInstance(url);
            const debug = this.debugLog ? this.emit('debug', `getConsolesListData, result: ${getConsolesListData.data.result[0]}, ${getConsolesListData.data.result[0].storageDevices[0]}`) : false;

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

            const consolesList = getConsolesListData.data.result;
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

            //emit restFul and mqtt
            this.emit('restFul', 'consoleslist', consolesList);
            this.emit('mqtt', 'Consoles List', consolesList);

            return true;
        } catch (error) {
            throw new Error(`Consoles list error: ${error}`);
        };
    }

    async installedApps() {
        try {
            const url = `${CONSTANTS.WebApi.Url.Xccs}/lists/installedApps?deviceId=${this.xboxLiveId}`;
            const getInstalledAppsData = await this.axiosInstance(url);
            const debug = this.debugLog ? this.emit('debug', `getInstalledAppsData: ${JSON.stringify(getInstalledAppsData.data.result, null, 2)}`) : false;

            //get installed apps
            const appsArray = [];
            const apps = getInstalledAppsData.data.result;
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

            //save apps to the file
            await this.saveInputs(this.inputsFile, appsArray);

            //emit restFul and mqtt
            this.emit('restFul', 'apps', apps);
            this.emit('mqtt', 'Apps', apps);

            return true;
        } catch (error) {
            throw new Error(`get installed apps error: ${error}`);
        };
    }

    async storageDevices() {
        try {
            const url = `${CONSTANTS.WebApi.Url.Xccs}/lists/storageDevices?deviceId=${this.xboxLiveId}`;
            const getStorageDevicesData = await this.axiosInstance(url);
            const debug = this.debugLog ? this.emit('debug', `getStorageDevicesData, result: ${JSON.stringify(getStorageDevicesData.data, null, 2)}`) : false;

            //get console storages
            this.storageDeviceId = [];
            this.storageDeviceName = [];
            this.isDefault = [];
            this.freeSpaceBytes = [];
            this.totalSpaceBytes = [];
            this.isGen9Compatible = [];

            const storageDevices = getStorageDevicesData.data.result;
            const deviceId = getStorageDevicesData.data.deviceId;
            const agentUserId = getStorageDevicesData.data.agentUserId;
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

            //emit restFul and mqtt
            this.emit('restFul', 'storages', storageDevices);
            this.emit('mqtt', 'Storages', storageDevices);

            return true;
        } catch (error) {
            throw new Error(`get storage devices error: ${error}`);
        };
    }

    async userProfile() {
        try {
            const url = `https://profile.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/profile/settings?settings=GameDisplayName,GameDisplayPicRaw,Gamerscore,Gamertag`;
            const getUserProfileData = await this.axiosInstance(url);
            const debug = this.debugLog ? this.emit('debug', `getUserProfileData, result: ${JSON.stringify(getUserProfileData.data.profileUsers[0], null, 2)}, ${JSON.stringify(getUserProfileData.data.profileUsers[0].settings[0], null, 2)}`) : false

            //get user profiles
            this.userProfileId = [];
            this.userProfileHostId = [];
            this.userProfileIsSponsoredUser = [];
            this.userProfileSettingsId = [];
            this.userProfileSettingsValue = [];

            const profileUsers = getUserProfileData.data.profileUsers;
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

            //emit restFul and mqtt
            this.emit('restFul', 'profile', profileUsers);
            this.emit('mqtt', 'Profile', profileUsers);

            return true;
        } catch (error) {
            throw new Error(`User profile error: ${error}`);
        };
    }

    async saveInputs(path, appsArray) {
        try {
            const inputs = [...CONSTANTS.DefaultInputs, ...appsArray];

            //chack duplicated inputs
            const inputsArr = [];
            for (const input of inputs) {
                const inputName = input.name;
                const inputReference = input.reference;
                const duplicatedInput = inputsArr.some(input => input.reference === inputReference);
                const push = inputName && inputReference && !duplicatedInput ? inputsArr.push(input) : false;
            }

            //save inputs
            const allInputs = JSON.stringify(inputsArr, null, 2);
            await fsPromises.writeFile(path, allInputs);
            const debug = this.debugLog ? this.emit('debug', `Saved apps: ${allInputs}`) : false;

            return true;
        } catch (error) {
            throw new Error(error);
        }
    };

    async next() {
        try {
            await this.send('Media', 'Next');
            return true;;
        } catch (error) {
            throw new Error(error);
        };
    }

    async previous() {
        try {
            await this.send('Media', 'Previous');
            return true;;
        } catch (error) {
            throw new Error(error);
        };
    }

    async pause() {
        try {
            await this.send('Media', 'Pause');
            return true;;
        } catch (error) {
            throw new Error(error);
        };
    }

    async play() {
        try {
            await this.send('Media', 'Play');
            return true;;
        } catch (error) {
            throw new Error(error);
        };
    }

    async goBack() {
        try {
            await this.send('Shell', 'GoBack');
            return true;;
        } catch (error) {
            throw new Error(error);
        };
    }

    async send(commandType, command, payload) {
        if (!this.authorized) {
            throw new Error('not authorized.');
        };

        const sessionid = UuIdv4();
        const params = payload ?? [];
        const postParams = {
            "destination": 'Xbox',
            "type": commandType,
            "command": command,
            "sessionId": sessionid,
            "sourceId": 'com.microsoft.smartglass',
            "parameters": params,
            "linkedXboxId": this.xboxLiveId
        }
        const debug = this.debugLog ? this.emit('debug', `send, type: ${commandType}, command: ${command}, params: ${params}.`) : false;

        try {
            const stringifyPostParam = JSON.stringify(postParams);
            this.headers['Content-Length'] = stringifyPostParam.length;
            const headers = {
                headers: this.headers
            }
            const response = await axios.post(`${CONSTANTS.WebApi.Url.Xccs}/commands`, postParams, headers);
            const debug1 = this.debugLog ? this.emit('debug', `send command, result: ${JSON.stringify(response.data, null, 2)}`) : false;

            return true;
        } catch (error) {
            throw new Error(`send command type: ${commandType}, command: ${command}, params: ${params}, error: ${error}`);
        };
    }
}
module.exports = XBOXWEBAPI;