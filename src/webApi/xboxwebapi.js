import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import { v4 as UuIdv4 } from 'uuid';
import axios from 'axios';
import Authentication from './authentication.js';
import ImpulseGenerator from '../impulsegenerator.js';
import { WebApi } from '../constants.js';

class XboxWebApi extends EventEmitter {
    constructor(config) {
        super();
        this.xboxLiveId = config.xboxLiveId;
        this.webApiClientId = config.webApiClientId;
        this.webApiClientSecret = config.webApiClientSecret;
        this.inputsFile = config.inputsFile;
        this.enableDebugMode = config.enableDebugMode;

        //variables
        this.consoleAuthorized = false;
        this.rmEnabled = false;

        const authConfig = {
            webApiClientId: config.webApiClientId,
            webApiClientSecret: config.webApiClientSecret,
            tokensFile: config.tokensFile
        }
        this.authentication = new Authentication(authConfig);

        //impulse generator
        this.call = false;
        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkAuthorization', async () => {
            if (this.call) return;

            try {
                this.call = true;
                await this.checkAuthorization();
                this.call = false;
            } catch (error) {
                this.call = false;
                this.emit('error', `Inpulse generator error: ${error}`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Web Api monitoring started`) : this.emit('warn', `Web Api monitoring stopped`);
        });
    }

    async checkAuthorization() {
        try {
            const data = await this.authentication.checkAuthorization();
            const debug = this.enableDebugMode ? this.emit('debug', `Authorization headers: ${JSON.stringify(data.headers, null, 2)}, tokens: ${JSON.stringify(data.tokens, null, 2)}`) : false;

            const authorized = data.tokens?.xsts?.Token?.trim() || false;
            if (!authorized) {
                this.emit('warn', `not authorized`);
                return false;
            }
            this.tokens = data.tokens;
            this.consoleAuthorized = true;

            //check xbox live data
            try {
                //headers
                const headers = {
                    'Authorization': data.headers,
                    'Accept-Language': 'en-US',
                    'x-xbl-contract-version': '4',
                    'x-xbl-client-name': 'XboxApp',
                    'x-xbl-client-type': 'UWA',
                    'x-xbl-client-version': '39.39.22001.0',
                    'skillplatform': 'RemoteManagement',
                    'Content-Type': 'application/json'
                };
                this.headers = headers;

                //create axios instance
                this.axiosInstance = axios.create({
                    method: 'GET',
                    headers: headers
                });

                const rmEnabled = await this.consoleStatus();
                const debug1 = rmEnabled ? false : this.emit('warn', `Remote management not enabled, please check your console settings`);
                this.rmEnabled = rmEnabled;

                //await this.consolesList();
                await this.installedApps();
                //await this.storageDevices();
                //await this.userProfile();
            } catch (error) {
                this.emit('error', `Check xbox live data error: ${error}`);
            }

            return true;
        } catch (error) {
            throw new Error(`Check authorization error: ${error}`);
        }
    }

    async consoleStatus() {
        try {
            const url = `${WebApi.Url.Xccs}/consoles/${this.xboxLiveId}`;
            const getConsoleStatusData = await this.axiosInstance(url);
            const debug = this.enableDebugMode ? this.emit('debug', `Console status data: ${JSON.stringify(getConsoleStatusData.data, null, 2)}`) : false;

            //get console status
            const consoleStatusData = getConsoleStatusData.data;
            const id = consoleStatusData.id;
            const name = consoleStatusData.name;
            const locale = consoleStatusData.locale;
            const region = consoleStatusData.region;
            const consoleType = WebApi.Console.Name[consoleStatusData.consoleType];
            const powerState = WebApi.Console.PowerState[consoleStatusData.powerState] === 1; // 0 - Off, 1 - On, 2 - InStandby, 3 - SystemUpdate
            const playbackState = WebApi.Console.PlaybackState[consoleStatusData.playbackState] === 1; // 0 - Stopped, 1 - Playng, 2 - Paused
            const loginState = consoleStatusData.loginState;
            const focusAppAumid = consoleStatusData.focusAppAumid;
            const isTvConfigured = consoleStatusData.isTvConfigured === true;
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
            throw new Error(`Status error: ${error}`);
        }
    }

    async consolesList() {
        try {
            const url = `${WebApi.Url.Xccs}/lists/devices?queryCurrentDevice=false&includeStorageDevices=true`;
            const getConsolesListData = await this.axiosInstance(url);
            const debug = this.enableDebugMode ? this.emit('debug', `Consoles list data: ${getConsolesListData.data.result[0]}, ${getConsolesListData.data.result[0].storageDevices[0]}`) : false;

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
                const powerState = WebApi.Console.PowerState[console.powerState]; // 0 - Off, 1 - On, 2 - ConnectedStandby, 3 - SystemUpdate
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
        }
    }

    async installedApps() {
        try {
            const url = `${WebApi.Url.Xccs}/lists/installedApps?deviceId=${this.xboxLiveId}`;
            const getInstalledAppsData = await this.axiosInstance(url);
            const debug = this.enableDebugMode ? this.emit('debug', `Get installed apps data: ${JSON.stringify(getInstalledAppsData.data.result, null, 2)}`) : false;

            //get installed apps
            const appsArray = [];
            const apps = getInstalledAppsData.data.result;
            for (const app of apps) {
                if (!app?.name || !app?.aumid) continue;

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

                const input = {
                    'oneStoreProductId': oneStoreProductId,
                    'titleId': titleId,
                    'reference': aumid,
                    'isGame': isGame,
                    'name': name,
                    'contentType': contentType
                }
                appsArray.push(input);
            }

            //save inputs
            await this.saveData(this.inputsFile, appsArray);

            //emit apps
            this.emit('addRemoveOrUpdateInput', appsArray, false);

            //emit restFul and mqtt
            this.emit('restFul', 'apps', apps);
            this.emit('mqtt', 'Apps', apps);

            return true;
        } catch (error) {
            throw new Error(`Installed apps error: ${error}`);
        }
    }

    async storageDevices() {
        try {
            const url = `${WebApi.Url.Xccs}/lists/storageDevices?deviceId=${this.xboxLiveId}`;
            const getStorageDevicesData = await this.axiosInstance(url);
            const debug = this.enableDebugMode ? this.emit('debug', `Get storage devices data: ${JSON.stringify(getStorageDevicesData.data, null, 2)}`) : false;

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
            throw new Error(`storage devices error: ${error}`);
        }
    }

    async userProfile() {
        try {
            const url = `https://profile.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/profile/settings?settings=GameDisplayName,GameDisplayPicRaw,Gamerscore,Gamertag`;
            const getUserProfileData = await this.axiosInstance(url);
            const debug = this.enableDebugMode ? this.emit('debug', `Get user profile data: ${JSON.stringify(getUserProfileData.data.profileUsers[0], null, 2)}, ${JSON.stringify(getUserProfileData.data.profileUsers[0].settings[0], null, 2)}`) : false

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
                }
            }

            //emit restFul and mqtt
            this.emit('restFul', 'profile', profileUsers);
            this.emit('mqtt', 'Profile', profileUsers);

            return true;
        } catch (error) {
            throw new Error(`User profile error: ${error}`);
        }
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            const debug = this.enableDebugMode ? this.emit('debug', `Saved data: ${data}`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    };

    async next() {
        try {
            await this.send('Media', 'Next');
            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    async previous() {
        try {
            await this.send('Media', 'Previous');
            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    async pause() {
        try {
            await this.send('Media', 'Pause');
            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    async play() {
        try {
            await this.send('Media', 'Play');
            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    async goBack() {
        try {
            await this.send('Shell', 'GoBack');
            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    async send(commandType, command, payload) {
        if (!this.consoleAuthorized || !this.rmEnabled) {
            this.emit('warn', `not authorized or remote management not enabled`);
            return;
        }

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
        const debug = this.enableDebugMode ? this.emit('debug', `send, type: ${commandType}, command: ${command}, params: ${params}`) : false;

        try {
            const stringifyPostParam = JSON.stringify(postParams);
            this.headers['Content-Length'] = stringifyPostParam.length;
            const headers = {
                headers: this.headers
            }
            const response = await axios.post(`${WebApi.Url.Xccs}/commands`, postParams, headers);
            const debug1 = this.enableDebugMode ? this.emit('debug', `send command, result: ${JSON.stringify(response.data, null, 2)}`) : false;

            return true;
        } catch (error) {
            throw new Error(`send command type: ${commandType}, command: ${command}, params: ${params}, error: ${error}`);
        }
    }
}
export default XboxWebApi;
