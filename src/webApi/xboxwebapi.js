import EventEmitter from 'events';
import { v4 as UuIdv4 } from 'uuid';
import axios from 'axios';
import Authentication from './authentication.js';
import ImpulseGenerator from '../impulsegenerator.js';
import Functions from '../functions.js';
import { WebApi, DefaultInputs } from '../constants.js';

class XboxWebApi extends EventEmitter {
    constructor(config, authTokenFile, inputsFile) {
        super();
        this.liveId = config.xboxLiveId;
        this.getInputsFromDevice = config.inputs?.getFromDevice;
        this.logWarn = config.log?.warn;
        this.logError = config.log?.error;
        this.logDebug = config.log?.debug;
        this.inputsFile = inputsFile;

        // Variables
        this.consoleAuthorized = false;
        this.rmEnabled = false;
        this.functions = new Functions();

        const authConfig = {
            clientId: config.webApi?.clientId,
            clientSecret: config.webApi?.clientSecret,
            tokensFile: authTokenFile
        }
        this.authentication = new Authentication(authConfig);

        // Impulse generator
        this.call = false;
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkAuthorization', async () => {
                if (this.call) return;
                try {
                    this.call = true;
                    await this.checkAuthorization();
                } catch (error) {
                    if (this.logError) this.emit('error', `Web Api generator error: ${error}`);
                } finally {
                    this.call = false;
                }
            })
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Web Api monitoring ${state ? 'started' : 'stopped'}`);
            });
    }

    async checkAuthorization() {
        try {
            const data = await this.authentication.checkAuthorization();
            if (this.logDebug) this.emit('debug', `Authorization headers: ${JSON.stringify(data.headers, null, 2)}`);

            const authorized = data.tokens?.xsts?.Token?.trim() || false;
            if (!authorized) {
                if (this.logWarn) this.emit('warn', `Not authorized`);
                return false;
            }
            this.consoleAuthorized = true;

            // Axios instance with global timeout and retry
            this.axiosInstance = axios.create({
                baseURL: WebApi.Url.Xccs,
                timeout: 5000,
                headers: {
                    'Authorization': data.headers,
                    'Accept-Language': 'en-US',
                    'x-xbl-contract-version': '4',
                    'x-xbl-client-name': 'XboxApp',
                    'x-xbl-client-type': 'UWA',
                    'x-xbl-client-version': '39.39.22001.0',
                    'skillplatform': 'RemoteManagement',
                    'Content-Type': 'application/json'
                }
            });

            this.axiosInstance.interceptors.response.use(null, async (error) => {
                const config = error.config;
                if (!config || !config.retryCount) config.retryCount = 0;
                if (config.retryCount < 2 && (error.code === 'ECONNABORTED' || error.response?.status === 429)) {
                    config.retryCount += 1;
                    if (this.logDebug) this.emit('debug', `Retry ${config.retryCount} for ${config.url}`);
                    await new Promise(res => setTimeout(res, 1000));
                    return this.axiosInstance(config);
                }
                return Promise.reject(error);
            });

            // Check console data
            await this.consolesList();
            await this.consoleStatus();
            await this.installedApps();
            //await this.mediaState(data.tokens);

            return true;
        } catch (error) {
            throw new Error(`Check authorization error: ${error}`);
        }
    }

    async consolesList() {
        try {
            const { data } = await this.axiosInstance.get('/lists/devices?queryCurrentDevice=false&includeStorageDevices=true');
            if (this.logDebug) this.emit('debug', `Consoles list data: ${JSON.stringify(data, null, 2)}`);

            const console = data.result.find(c => c.id === this.liveId);
            const obj = {
                id: console.id,
                name: console.name,
                locale: console.locale,
                region: console.region,
                consoleType: WebApi.Console.Name[console.consoleType],
                powerState: WebApi.Console.PowerState[console.powerState],
                digitalAssistantRemoteControlEnabled: !!console.digitalAssistantRemoteControlEnabled,
                remoteManagementEnabled: !!console.remoteManagementEnabled,
                consoleStreamingEnabled: !!console.consoleStreamingEnabled,
                wirelessWarning: !!console.wirelessWarning,
                outOfHomeWarning: !!console.outOfHomeWarning,
                storageDevices: console.storageDevices.map(s => ({
                    id: s.storageDeviceId,
                    name: s.storageDeviceName,
                    isDefault: s.isDefault,
                    freeSpaceBytes: s.freeSpaceBytes,
                    totalSpaceBytes: s.totalSpaceBytes,
                    isGen9Compatible: s.isGen9Compatible
                }))
            };

            if (!obj.remoteManagementEnabled && this.logWarn) this.emit('warn', 'Remote management not enabled on console');
            this.rmEnabled = obj.remoteManagementEnabled;

            this.emit('restFul', 'consoleslist', data);
            this.emit('mqtt', 'Consoles List', data);

            return true;
        } catch (error) {
            throw new Error(`Consoles list error: ${error}`);
        }
    }

    async consoleStatus() {
        try {
            const url = `/consoles/${this.liveId}`;
            const { data } = await this.axiosInstance.get(url);
            if (this.logDebug) this.emit('debug', `Console status data: ${JSON.stringify(data, null, 2)}`);

            // Emit single console object
            const status = {
                id: data.id,
                name: data.name,
                locale: data.locale,
                region: data.region,
                consoleType: WebApi.Console.Name[data.consoleType],
                powerState: WebApi.Console.PowerState[data.powerState],
                playbackState: data.playbackState,
                loginState: data.loginState,
                focusAppAumid: data.focusAppAumid,
                isTvConfigured: !!data.isTvConfigured,
                digitalAssistantRemoteControlEnabled: !!data.digitalAssistantRemoteControlEnabled,
                remoteManagementEnabled: !!data.remoteManagementEnabled,
                consoleStreamingEnabled: !!data.consoleStreamingEnabled,
            };

            // Emit console type
            this.emit('consoleStatus', status);

            this.emit('restFul', 'status', data);
            this.emit('mqtt', 'Status', data);

            return true;
        } catch (error) {
            throw new Error(`Console status error: ${error}`);
        }
    }

    async installedApps() {
        if (!this.getInputsFromDevice) return true;

        try {
            const url = `/lists/installedApps?deviceId=${this.liveId}`;
            const { data } = await this.axiosInstance.get(url);
            if (this.logDebug) this.emit('debug', `Installed apps data: ${JSON.stringify(data, null, 2)}`);

            // Filter and map
            const apps = data.result.filter(a => a.name && a.aumid).map(a => ({
                name: a.name,
                oneStoreProductId: a.oneStoreProductId,
                reference: a.aumid,
                titleId: a.titleId,
                isGame: a.isGame,
                contentType: a.contentType,
                mode: 0,
            }));

            this.emit('restFul', 'apps', data);
            this.emit('mqtt', 'Apps', data);

            // Join inputs
            const inputs = [...DefaultInputs, ...apps];

            // Save inputs
            await this.functions.saveData(this.inputsFile, inputs);

            // Emit inputs
            this.emit('installedApps', inputs, false);

            return true;
        } catch (error) {
            throw new Error(`Installed apps error: ${error}`);
        }
    }

    async mediaState(tokens) {
        try {
            const url = `/users/xuid(${tokens.xsts.DisplayClaims.xui[0].xid})/devices/${this.liveId}/media`;
            const { data } = await this.axiosInstance.get(url);
            if (this.logDebug) this.emit('debug', `Media state data: ${JSON.stringify(data, null, 2)}`);

            // Emit single console object
            const state = {
                state: data.state, // Playing | Paused | Stopped
                title: data.title,
                artist: data.artist,
                album: data.album,
                position: data.position, //ms
                duration: data.duration, //ms
                canSeek: !!data.canSeek, // bool
                volume: data.volume, // 0.5
                muted: !!data.muted, // bool
            };

            // Emit console type
            this.emit('mediaState', state);

            this.emit('restFul', 'mediastate', data);
            this.emit('mqtt', 'Media State', data);

            return true;
        } catch (error) {
            throw new Error(`Media state error: ${error}`);
        }
    }

    async send(commandType, command, payload) {
        if (!this.consoleAuthorized || !this.rmEnabled) {
            if (this.logWarn) this.emit('warn', `Not authorized or remote management not enabled`);
            return;
        }

        const postParams = {
            destination: 'Xbox',
            type: commandType,
            command,
            sessionId: UuIdv4(),
            sourceId: 'com.microsoft.smartglass',
            parameters: payload ?? [],
            linkedXboxId: this.liveId
        };

        try {
            const response = await this.axiosInstance.post('/commands', postParams);
            if (this.logDebug) this.emit('debug', `Command ${command} result: ${JSON.stringify(response.data)}`);
            return true;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (command === 'WakeUp') this.emit('stateChanged', false);
            if (command === 'TurnOff') this.emit('stateChanged', true);
            throw new Error(`Failed to send command: type=${commandType}, command=${command}, error=${error.message}`);
        }
    }

    // Media / shell helpers
    async next() { return this.send('Media', 'Next'); }
    async previous() { return this.send('Media', 'Previous'); }
    async pause() { return this.send('Media', 'Pause'); }
    async play() { return this.send('Media', 'Play'); }
    async goBack() { return this.send('Shell', 'GoBack'); }
}

export default XboxWebApi;

