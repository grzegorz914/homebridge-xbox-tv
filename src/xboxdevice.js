import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import XboxWebApi from './webApi/xboxwebapi.js';
import XboxLocalApi from './localApi/xboxlocalapi.js';
import Functions from './functions.js';
import { DefaultInputs, WebApi } from './constants.js';

let Accessory, Characteristic, Service, Categories, Encode, AccessoryUUID;

class XboxDevice extends EventEmitter {
    constructor(api, device, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        AccessoryUUID = api.hap.uuid;

        //device configuration
        this.device = device;
        this.name = device.name;
        this.liveId = device.xboxLiveId;
        this.displayType = device.displayType;
        this.webApiControl = device.webApi?.enable || false;
        this.getInputsFromDevice = device.webApi?.enable ? device.inputs?.getFromDevice : false;
        this.filterGames = device.inputs?.filterGames || false;
        this.filterApps = device.inputs?.filterApps || false;
        this.filterSystemApps = device.inputs?.filterSystemApps || false;
        this.filterDlc = device.inputs?.filterDlc || false;
        this.inputsDisplayOrder = device.inputs?.displayOrder || 0;
        this.inputs = (device.inputs?.data || []).filter(input => input.name && input.reference);
        this.buttons = (device.buttons ?? []).filter(button => (button.displayType ?? 0) > 0);
        this.sensors = Array.isArray(device.sensors) ? (device.sensors ?? []).filter(sensor => (sensor.displayType ?? 0) > 0 && (sensor.mode ?? -1) >= 0) : [];
        this.volumeControl = device.volume?.displayType || 0;
        this.volumeControlName = device.volume?.name || 'Volume';
        this.volumeControlNamePrefix = device.volume?.namePrefix || false;
        this.infoButtonCommand = device.infoButtonCommand || 'nexus';
        this.logInfo = device.log?.info || false;
        this.logWarn = device.log?.warn || false;
        this.logDebug = device.log?.debug || false;
        this.authTokenFile = authTokenFile;
        this.devInfoFile = devInfoFile;
        this.inputsFile = inputsFile;
        this.inputsNamesFile = inputsNamesFile;
        this.inputsTargetVisibilityFile = inputsTargetVisibilityFile;

        //external integrations
        this.restFul = device.restFul ?? {};
        this.restFulConnected = false;
        this.mqtt = device.mqtt ?? {};
        this.mqttConnected = false;
        this.functions = new Functions();

        //sensors
        for (const sensor of this.sensors) {
            sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensor.displayType];
            sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensor.displayType];
            sensor.state = false;
        }

        //buttons
        for (const button of this.buttons) {
            button.reference = [button.mediaCommand, button.gamePadCommand, button.tvRemoteCommand, button.consoleControlCommand, button.gameAppControlCommand][button.mode];
            button.serviceType = ['', Service.Outlet, Service.Switch][button.displayType];
            button.state = false;
        }

        //variable
        this.modelName = 'Xbox';
        this.inputIdentifier = 1;
        this.power = false;
        this.volume = 0;
        this.mute = false;
        this.playState = false;
        this.mediaState = 2;
        this.reference = '';
        this.screenSaver = false;
        this.consoleAuthorized = false;
    }

    async setOverExternalIntegration(integration, key, value) {
        if (!this.webApiControl && this.logWarn) {
            this.emit('warn', `set over external integration not possible, web api not enabled`);
            return;
        }

        try {
            let set = false
            switch (key) {
                case 'Power':
                    switch (value) {
                        case true: //off
                            set = await this.xboxWebApi.send('Power', 'WakeUp');
                            break;
                        case false: //on
                            set = await this.xboxWebApi.send('Power', 'TurnOff');
                            break;
                    }
                    break;
                case 'App':
                    const payload = [{ 'oneStoreProductId': value }];
                    set = await this.xboxWebApi.send('Shell', 'ActivateApplicationWithOneStoreProductId', payload);
                    break;
                case 'Volume':
                    switch (value) {
                        case 'up': //Up
                            set = await this.xboxWebApi.send('Volume', 'Up');
                            break;
                        case 'down': //Down
                            set = await this.xboxWebApi.send('Volume', 'Down');
                            break;
                    }
                    break;
                case 'Mute':
                    switch (value) {
                        case true: //Mute
                            set = await this.xboxWebApi.send('Audio', 'Mute');
                            break;
                        case false: //Unmute;
                            set = await this.xboxWebApi.send('Audio', 'Unmute');
                            break;
                    }
                    break;
                case 'RcControl':
                    set = await this.xboxWebApi.send('Shell', 'InjectKey', [{ 'keyType': value }]);
                    break;
                default:
                    if (this.logWarn) this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error}`);
        }
    }

    async externalIntegrations() {
        //RESTFul server
        const restFulEnabled = this.restFul.enable || false;
        if (restFulEnabled) {
            try {
                this.restFul1 = new RestFul({
                    port: this.restFul.port || 3000,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.restFulConnected = true;
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('RESTFul', key, value);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `RESTFul set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            } catch (error) {
                if (this.logWarn) this.emit('warn', `RESTFul integration start error: ${error}`);
            }
        }

        //mqtt client
        const mqttEnabled = this.mqtt.enable || false;
        if (mqttEnabled) {
            try {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `microsoft_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `microsoft_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `microsoft/${this.mqtt.prefix}/${this.name}` : `microsoft/${this.name}`,
                    user: this.mqtt.auth?.user,
                    passwd: this.mqtt.auth?.passwd,
                    logWarn: this.logWarn,
                    logDebug: this.logDebug
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.mqttConnected = true;
                    })
                    .on('subscribed', (message) => {
                        this.emit('success', message);
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('MQTT', key, value);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `MQTT set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            } catch (error) {
                if (this.logWarn) this.emit('warn', `MQTT integration start error: ${error}`);
            }
        };

        return true;
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            this.savedInfo = await this.functions.readData(this.devInfoFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            this.savedInputs = await this.functions.readData(this.inputsFile, true) ?? [];
            if (this.logDebug) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            this.savedInputsNames = await this.functions.readData(this.inputsNamesFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            this.savedInputsTargetVisibility = await this.functions.readData(this.inputsTargetVisibilityFile, true) ?? {};
            if (this.logDebug) this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startStopImpulseGenerator(state, timers = []) {
        try {
            //start web api impulse generator
            if (this.webApiControl) await this.xboxWebApi.impulseGenerator.state(true, [{ name: 'checkAuthorization', sampling: 900000 }]);

            //start impulse generator 
            await this.xboxLocalApi.impulseGenerator.state(state, timers)
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),
                2: (a, b) => b.name.localeCompare(a.name),
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];

            // Sort only if a valid function exists
            if (sortFn) {
                this.inputsServices.sort(sortFn);
            }

            // Debug
            if (this.logDebug) {
                const orderDump = this.inputsServices.map(svc => ({
                    name: svc.name,
                    reference: svc.reference,
                    identifier: svc.identifier,
                }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Always update DisplayOrder characteristic, even for "none"
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);

            return;
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            let updated = false;

            for (const input of inputs) {
                if (this.inputsServices.length >= 85 && !remove) continue;

                // Filter
                const contentType = input.contentType;
                const filterGames = this.filterGames && contentType === 'Game';
                const filterApps = this.filterApps && contentType === 'App';
                const filterSystemApps = this.filterSystemApps && contentType === 'systemApp';
                const filterDlc = this.filterDlc && contentType === 'Dlc';
                if (filterGames || filterApps || filterSystemApps || filterDlc) continue;

                const inputReference = input.reference;
                const savedName = this.savedInputsNames[inputReference] ?? input.name;
                const sanitizedName = await this.functions.sanitizeString(savedName);
                const inputMode = input.mode ?? 0;
                const inputTitleId = input.titleId;
                const inputOneStoreProductId = input.oneStoreProductId;
                const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                if (remove) {
                    const svc = this.inputsServices.find(s => s.reference === inputReference);
                    if (svc) {
                        if (this.logDebug) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                        this.accessory.removeService(svc);
                        this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                        updated = true;
                    }
                    continue;
                }

                let inputService = this.inputsServices.find(s => s.reference === inputReference);
                if (inputService) {
                    const nameChanged = inputService.name !== sanitizedName;
                    if (nameChanged) {
                        inputService.name = sanitizedName;
                        inputService
                            .updateCharacteristic(Characteristic.Name, sanitizedName)
                            .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName);
                        if (this.logDebug) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
                        updated = true;
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${inputReference}`);
                    inputService.identifier = identifier;
                    inputService.reference = inputReference;
                    inputService.name = sanitizedName;
                    inputService.mode = inputMode;
                    inputService.titleId = inputTitleId;
                    inputService.oneStoreProductId = inputOneStoreProductId;
                    inputService.visibility = inputVisibility;

                    inputService
                        .setCharacteristic(Characteristic.Identifier, identifier)
                        .setCharacteristic(Characteristic.Name, sanitizedName)
                        .setCharacteristic(Characteristic.ConfiguredName, sanitizedName)
                        .setCharacteristic(Characteristic.IsConfigured, 1)
                        .setCharacteristic(Characteristic.InputSourceType, inputMode)
                        .setCharacteristic(Characteristic.CurrentVisibilityState, inputVisibility)
                        .setCharacteristic(Characteristic.TargetVisibilityState, inputVisibility);

                    // ConfiguredName persistence
                    inputService.getCharacteristic(Characteristic.ConfiguredName)
                        .onSet(async (value) => {
                            try {
                                value = await this.functions.sanitizeString(value);
                                inputService.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.functions.saveData(this.inputsNamesFile, this.savedInputsNames);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);
                                await this.displayOrder();
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Input Name error: ${error}`);
                            }
                        });

                    // TargetVisibility persistence
                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onSet(async (state) => {
                            try {
                                inputService.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.functions.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                if (this.logDebug) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Save Target Visibility error: ${error}`);
                            }
                        });

                    this.inputsServices.push(inputService);
                    this.televisionService.addLinkedService(inputService);

                    if (this.logDebug) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
                    updated = true;
                }
            }

            // Only one time run
            if (updated) await this.displayOrder();

            return true;
        } catch (error) {
            throw new Error(`Add/Remove/Update input error: ${error}`);
        }
    }

    //Prepare accessory
    async prepareAccessory() {
        try {
            //Accessory
            if (this.logDebug) this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.liveId);
            const accessoryCategory = [Categories.OTHER, Categories.TELEVISION, Categories.TV_SET_TOP_BOX, Categories.TV_STREAMING_STICK, Categories.AUDIO_RECEIVER][this.displayType];
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //Prepare information service
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer)
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber ?? this.liveId)
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //Prepare television service
            if (this.logDebug) this.emit('debug', `Prepare television service`);
            this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
            this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
            this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

            this.televisionService.getCharacteristic(Characteristic.Active)
                .onGet(async () => {
                    const state = this.power;
                    return state;
                })
                .onSet(async (state) => {
                    if (!this.webApiControl && this.logWarn) {
                        this.emit('warn', `set power not possible, web api not enabled`);
                        return;
                    }

                    if (!!state === this.power) return;

                    try {
                        await this.xboxWebApi.send('Power', state ? 'WakeUp' : 'TurnOff');
                        if (this.logInfo) this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Power, error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => {
                    const inputIdentifier = this.inputIdentifier;
                    return inputIdentifier;
                })
                .onSet(async (activeIdentifier) => {
                    if (!this.webApiControl && this.logWarn) {
                        this.emit('warn', `set game/app not possible, web api not enabled`);
                        return;
                    }

                    try {
                        const input = this.inputsServices.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            if (this.logWarn) this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                            return;
                        }

                        if (!this.power) {
                            (async () => {
                                for (let attempt = 0; attempt < 20; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    if (this.power && this.inputIdentifier !== activeIdentifier) {
                                        if (this.logDebug) this.emit('debug', `TV powered on, retrying input switch`);
                                        this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                        break;
                                    }
                                }
                            })();

                            return;
                        }

                        const { oneStoreProductId: oneStoreProductId, name: name, reference: reference } = input;
                        let channelName;
                        let command;
                        let payload;
                        switch (oneStoreProductId) {
                            case 'Dashboard': case 'Settings': case 'SettingsTv': case 'Accessory': case 'Screensaver': case 'NetworkTroubleshooter': case 'MicrosoftStore':
                                channelName = 'Shell';
                                command = 'GoHome';
                                break;
                            case 'Television':
                                channelName = 'TV';
                                command = 'ShowGuide';
                                break;
                            case 'XboxGuide':
                                channelName = 'Shell';
                                command = 'ShowGuideTab';
                                payload = [{ 'tabName': 'Guide' }];
                                break;
                            default:
                                channelName = 'Shell';
                                command = 'ActivateApplicationWithOneStoreProductId';
                                payload = [{ 'oneStoreProductId': oneStoreProductId }];
                                break;
                        }

                        await this.xboxWebApi.send(channelName, command, payload);
                        if (this.logInfo) this.emit('info', `set Input: ${name}, Reference: ${reference}, Product Id: ${oneStoreProductId}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Input error: ${JSON.stringify(error, null, 2)}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                .onSet(async (remoteKey) => {
                    if (!this.webApiControl && this.logWarn) {
                        this.emit('warn', `set remote key not possible, web api not enabled`);
                        return;
                    }

                    try {
                        let channelName;
                        let command;

                        switch (remoteKey) {
                            case 0: //REWIND
                                channelName = 'Shell';
                                command = 'rewind';
                                break;
                            case 1: //FAST_FORWARD
                                channelName = 'Shell';
                                command = 'fastForward';
                                break;
                            case 2: //NEXT_TRACK
                                channelName = 'Shell';
                                command = 'nextTrack';
                                break;
                            case 3: //PREVIOUS_TRACK
                                channelName = 'Shell';
                                command = 'previousTrack';
                                break;
                            case 4: //ARROW_UP
                                channelName = 'Shell';
                                command = 'up';
                                break;
                            case 5: //ARROW_DOWN
                                channelName = 'Shell';
                                command = 'down';
                                break;
                            case 6: //ARROW_LEFT
                                channelName = 'Shell';
                                command = 'left';
                                break;
                            case 7: //ARROW_RIGHT
                                channelName = 'Shell';
                                command = 'right';
                                break;
                            case 8: //SELECT
                                channelName = 'Shell';
                                command = 'a';
                                break;
                            case 9: //BACK
                                channelName = 'Shell';
                                command = 'b';
                                break;
                            case 10: //EXIT
                                channelName = 'Shell';
                                command = 'nexus';
                                break;
                            case 11: //PLAY_PAUSE
                                channelName = 'Shell';
                                command = 'playPause';
                                break;
                            case 15: //INFORMATION
                                channelName = 'Shell';
                                command = this.infoButtonCommand;
                                break;
                        }

                        await this.xboxWebApi.send(channelName, 'InjectKey', [{ 'keyType': command }]);
                        if (this.logInfo) this.emit('info', `Remote Key: ${command}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Remote Key error: ${JSON.stringify(error, null, 2)}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                .onGet(async () => {
                    //apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                    //xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
                    const value = this.mediaState;
                    return value;
                });

            this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                .onGet(async () => {
                    //0 - PLAY, 1 - PAUSE, 2 - STOP
                    const value = this.mediaState;
                    return value;
                })
                .onSet(async (value) => {
                    try {
                        const newMediaState = value;
                        const setMediaState = this.power ? false : false;
                        if (this.logInfo) this.emit('info', `set Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Target Media error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                .onSet(async (powerModeSelection) => {
                    if (!this.webApiControl && this.logWarn) {
                        this.emit('warn', `set power mode selection not possible, web api not enabled`);
                        return;
                    }

                    try {
                        switch (powerModeSelection) {
                            case 0: //SHOW
                                await this.xboxWebApi.send('Shell', 'InjectKey', [{ 'keyType': 'nexus' }]);
                                break;
                            case 1: //HIDE
                                await this.xboxWebApi.send('Shell', 'InjectKey', [{ 'keyType': 'b' }]);
                                break;
                        };
                        if (this.logInfo) this.emit('info', `set Power Mode Selection: ${powerModeSelection === 0 ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        if (this.logWarn) this.emit('warn', `set Power Mode Selection error: ${error}`);
                    }
                });

            //prepare inputs service
            if (this.logDebug) this.emit('debug', `Prepare inputs service`);
            this.inputsServices = [];
            await this.addRemoveOrUpdateInput(this.savedInputs, false);

            //Prepare volume service
            if (this.volumeControl > 0) {
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                const volumeServiceNameTv = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;

                switch (this.volumeControl) {
                    case 1: //lightbulb
                        if (this.logDebug) this.emit('debug', `Prepare volume service lightbulb`);
                        this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                        this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });
                        break;
                    case 2: //fan
                        if (this.logDebug) this.emit('debug', `Prepare volume service fan`);
                        this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });
                        break;
                    case 3: // tv speaker
                        if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                        const volumeServiceName3 = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                        this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName3, 'TV Speaker');
                        this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName3);
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                            .onGet(async () => {
                                const state = 3;
                                return state;
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                            .onSet(async (volumeSelector) => {
                                if (!this.webApiControl && this.logWarn) {
                                    this.emit('warn', `set volume selector not possible, web api not enabled`);
                                    return;
                                }

                                try {
                                    switch (volumeSelector) {
                                        case 0: //Up
                                            await this.xboxWebApi.send('Volume', 'Up');
                                            break;
                                        case 1: //Down
                                            await this.xboxWebApi.send('Volume', 'Down');
                                            break;
                                    }
                                    if (this.logInfo) this.emit('info', `set Volume Selector: ${volumeSelector ? 'Down' : 'UP'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });
                        break;
                    case 4: // tv speaker + lightbulb
                        if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                        this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceNameTv, 'TV Speaker');
                        this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceNameTv);
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                            .onGet(async () => {
                                const state = 3;
                                return state;
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                            .onSet(async (volumeSelector) => {
                                if (!this.webApiControl && this.logWarn) {
                                    this.emit('warn', `set volume selector not possible, web api not enabled`);
                                    return;
                                }

                                try {
                                    switch (volumeSelector) {
                                        case 0: //Up
                                            await this.xboxWebApi.send('Volume', 'Up');
                                            break;
                                        case 1: //Down
                                            await this.xboxWebApi.send('Volume', 'Down');
                                            break;
                                    }
                                    if (this.logInfo) this.emit('info', `set Volume Selector: ${volumeSelector ? 'Down' : 'UP'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });

                        // lightbulb
                        if (this.logDebug) this.emit('debug', `Prepare volume service lightbulb`);
                        this.volumeServiceLightbulb = accessory.addService(Service.Lightbulb, volumeServiceName, 'Lightbulb Speaker');
                        this.volumeServiceLightbulb.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceLightbulb.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        this.volumeServiceLightbulb.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                            });
                        break;
                    case 5: // tv speaker + fan
                        if (this.logDebug) this.emit('debug', `Prepare television speaker service`);
                        this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceNameTv, 'TV Speaker');
                        this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceNameTv);
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => { });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                            .onGet(async () => {
                                const state = 3;
                                return state;
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                            .onSet(async (volumeSelector) => {
                                if (!this.webApiControl && this.logWarn) {
                                    this.emit('warn', `set volume selector not possible, web api not enabled`);
                                    return;
                                }

                                try {
                                    switch (volumeSelector) {
                                        case 0: //Up
                                            await this.xboxWebApi.send('Volume', 'Up');
                                            break;
                                        case 1: //Down
                                            await this.xboxWebApi.send('Volume', 'Down');
                                            break;
                                    }
                                    if (this.logInfo) this.emit('info', `set Volume Selector: ${volumeSelector ? 'Down' : 'UP'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume Selector error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Volume: ${value}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Volume error: ${error}`);
                                }
                            });
                        this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    if (this.logInfo) this.emit('info', `set Mute: ${!state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `set Mute error: ${error}`);
                                }
                            });

                        // fan
                        if (this.logDebug) this.emit('debug', `Prepare volume service fan`);
                        this.volumeServiceFan = accessory.addService(Service.Fan, volumeServiceName, 'Fan Speaker');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.power ? !this.mute : false;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, !state);
                            });
                        break;
                }
            }

            //prepare sonsor service
            const possibleSensorCount = 99 - this.accessory.services.length;
            const maxSensorCount = this.sensors.length >= possibleSensorCount ? possibleSensorCount : this.sensors.length;
            if (maxSensorCount > 0) {
                this.sensorServices = [];
                if (this.logDebug) this.emit('debug', `Prepare sensors services`);
                for (let i = 0; i < maxSensorCount; i++) {
                    const sensor = this.sensors[i];

                    //get sensor name		
                    const name = sensor.name || `Sensor ${i}`;

                    //get sensor name prefix
                    const namePrefix = sensor.namePrefix;

                    //get service type
                    const serviceType = sensor.serviceType;

                    //get characteristic type
                    const characteristicType = sensor.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const sensorService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensor.state;
                            return state;
                        });
                    this.sensorServices.push(sensorService);
                    accessory.addService(sensorService);
                }
            }

            //Prepare buttons services
            const possibleButtonsCount = 99 - this.accessory.services.length;
            const maxButtonsCount = this.buttons.length >= possibleButtonsCount ? possibleButtonsCount : this.buttons.length;
            if (maxButtonsCount > 0) {
                if (this.logDebug) this.emit('debug', `Prepare buttons services`);

                this.buttonsServices = [];
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttons[i];

                    //get button name
                    const buttonName = button.name || `Button ${i}`;

                    //get button command
                    const buttonMode = button.mode;

                    //get button command
                    const buttonCommand = button.reference;

                    //get button name prefix
                    const namePrefix = button.namePrefix;

                    //get service type
                    const serviceType = button.serviceType;

                    const serviceName = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                    const buttonService = new serviceType(serviceName, `Button ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    buttonService.getCharacteristic(Characteristic.On)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            if (!this.webApiControl && this.logWarn) {
                                this.emit('warn', `set button not possible, web api not enabled`);
                                return;
                            }

                            if (!this.power) {
                                if (this.logWarn) this.emit('warn', `console is off`);
                                return;
                            }

                            try {
                                switch (buttonMode) {
                                    case 0: case 1: case 2:
                                        const send = state ? await this.xboxWebApi.send('Shell', 'InjectKey', [{ 'keyType': buttonCommand }]) : false;
                                        break;
                                    case 3:
                                        switch (buttonCommand) {
                                            case 'reboot':
                                                const send = state ? await this.xboxWebApi.send('Power', 'Reboot') : false;
                                                break;
                                            case 'recordGameDvr':
                                                const send1 = state ? await this.xboxLocalApi.recordGameDvr() : false;
                                                break;
                                        }
                                        break;
                                    case 4:
                                        switch (buttonCommand) {
                                            case 'Dashboard': case 'Settings': case 'SettingsTv': case 'Accessory': case 'Screensaver': case 'NetworkTroubleshooter': case 'MicrosoftStore':
                                                const send3 = state ? await this.xboxWebApi.send('Shell', 'GoHome') : false;
                                                break;
                                            case 'Television':
                                                const send4 = state ? await this.xboxWebApi.send('TV', 'ShowGuide') : false;
                                                break;
                                            case 'XboxGuide':
                                                const send5 = state ? await this.xboxWebApi.send('Shell', 'ShowGuideTab', [{ 'tabName': 'Guide' }]) : false;
                                                break;
                                            default:
                                                const send6 = state ? await this.xboxWebApi.send('Shell', 'ActivateApplicationWithOneStoreProductId', [{ 'oneStoreProductId': buttonCommand }]) : false;
                                                break;
                                        }
                                        break;
                                }
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `set Button error: ${error}`);
                            }
                        });
                    this.buttonsServices.push(buttonService);
                    accessory.addService(buttonService);
                }
            }

            return accessory;
        } catch (error) {
            throw new Error(error)
        };
    }

    //start
    async start() {
        try {
            // Save inputs
            if (!this.getInputsFromDevice) {
                const inputs = [...DefaultInputs, ...this.inputs];
                await this.functions.saveData(this.inputsFile, inputs);
            }

            // Web api client
            if (this.webApiControl) {
                try {
                    this.xboxWebApi = new XboxWebApi(this.device, this.authTokenFile, this.inputsFile, this.channelsFile, this.mqtt.enable)
                        .on('consoleStatus', (status) => {
                            this.modelName = status.consoleType;
                            this.mediaState = WebApi.Console.PlaybackStateHomeKit[status.playbackState];
                            this.playState = this.mediaState === 0

                            this.informationService?.setCharacteristic(Characteristic.Model, this.modelName);
                            this.televisionService?.updateCharacteristic(Characteristic.CurrentMediaState, this.mediaState);
                        })
                        .on('installedApps', async (inputs, remove) => {
                            await this.addRemoveOrUpdateInput(inputs, remove);
                        })
                        .on('stateChanged', (power) => {
                            this.power = power;

                            // Update characteristics
                            this.televisionService?.updateCharacteristic(Characteristic.Active, power);

                            if (this.logInfo) {
                                this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                            }
                        })
                        .on('success', (success) => this.emit('success', success))
                        .on('info', (info) => this.emit('info', info))
                        .on('debug', (debug) => this.emit('debug', debug))
                        .on('warn', (warn) => this.emit('warn', warn))
                        .on('error', (error) => this.emit('error', error))
                        .on('restFul', (path, data) => {
                            if (this.restFulConnected) this.restFul1.update(path, data);
                        })
                        .on('mqtt', (topic, message) => {
                            if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                        });

                    // Check authorization
                    this.consoleAuthorized = await this.xboxWebApi.checkAuthorization();
                } catch (error) {
                    this.emit('error', `Start web api error: ${error}`);
                }
            }

            // Local api client
            this.xboxLocalApi = new XboxLocalApi(this.device, this.authTokenFile, this.devInfoFile, this.channelsFile, this.mqtt.enable)
                .on('deviceInfo', async (info) => {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer:  Microsoft`);
                    this.emit('devInfo', `Model: ${this.modelName}`);
                    this.emit('devInfo', `Serialnr: ${this.liveId}`);
                    this.emit('devInfo', `Firmware: ${info.firmwareRevision}`);
                    this.emit('devInfo', `Locale: ${info.locale}`);
                    this.emit('devInfo', `----------------------------------`);

                    const obj = {
                        manufacturer: 'Microsoft',
                        modelName: this.modelName,
                        serialNumber: this.liveId,
                        firmwareRevision: info.firmwareRevision,
                        locale: info.locale
                    };

                    // Save device info
                    await this.functions.saveData(this.devInfoFile, obj);

                    this.informationService
                        ?.setCharacteristic(Characteristic.Model, this.modelName)
                        .setCharacteristic(Characteristic.FirmwareRevision, info.firmwareRevision);
                })
                .on('stateChanged', async (power, titleId, reference, volume, mute, playState) => {
                    const input = this.inputsServices?.find(input => input.reference === reference || input.titleId === titleId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;

                    // Update characteristics
                    this.televisionService
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);

                    this.volumeServiceTvSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    const muteV = this.power ? !mute : false;
                    this.volumeServiceLightbulb
                        ?.updateCharacteristic(Characteristic.Brightness, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceFan
                        ?.updateCharacteristic(Characteristic.RotationSpeed, volume)
                        .updateCharacteristic(Characteristic.On, muteV);

                    this.volumeServiceSpeaker
                        ?.updateCharacteristic(Characteristic.Active, power)
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);

                    // sensors
                    const screenSaver = (reference === 'Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application');
                    const currentStateModeMap = {
                        0: reference,
                        1: power,
                        2: volume,
                        3: mute,
                        4: screenSaver,
                        6: playState
                    };

                    const previousStateModeMap = {
                        0: this.reference,
                        1: this.power,
                        2: this.volume,
                        3: this.mute,
                        4: this.screenSaver,
                        5: this.playState
                    };

                    for (let i = 0; i < this.sensors.length; i++) {
                        let state = false;

                        const sensor = this.sensors[i];
                        const currentValue = currentStateModeMap[sensor.mode];
                        const previousValue = previousStateModeMap[sensor.mode];
                        const pulse = sensor.pulse;
                        const reference = sensor.reference;
                        const level = sensor.level;
                        const characteristicType = sensor.characteristicType;
                        const isActiveMode = power;

                        if (pulse && currentValue !== previousValue) {
                            for (let step = 0; step < 2; step++) {
                                state = isActiveMode ? (step === 0) : false;
                                sensor.state = state;
                                this.sensorServices?.[i]?.updateCharacteristic(characteristicType, state);
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        } else {
                            if (isActiveMode) {
                                switch (sensor.mode) {
                                    case 0: // reference mode
                                        state = currentValue === reference;
                                        break;
                                    case 2: // volume mode
                                        state = currentValue === level;
                                        break;
                                    case 1: // power
                                    case 3: // mute
                                    case 4: // screenSaver
                                    case 5: // playState
                                        state = currentValue === true;
                                        break;
                                    default:
                                        state = false;
                                }
                            }

                            sensor.state = state;
                            this.sensorServices?.[i]?.updateCharacteristic(characteristicType, state);
                        }
                    }

                    //buttons
                    for (let i = 0; i < this.buttons.length; i++) {
                        const button = this.buttons[i];
                        const state = power ? button.reference === reference : false;
                        button.state = state;
                        this.buttonsServices?.[i]?.updateCharacteristic(Characteristic.On, state);
                    }

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;
                    this.screenSaver = screenSaver;
                    this.playState = playState;
                    if (this.logInfo) {
                        const name = input ? input.name : reference;
                        const productId = input ? input.oneStoreProductId : reference;
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Input Name: ${name}`);
                        this.emit('info', `Reference: ${reference}`);
                        this.emit('info', `Title Id: ${titleId}`);
                        this.emit('info', `Product Id: ${productId}`);
                        this.emit('info', `Volume: ${volume}%`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                        this.emit('info', `Media State: ${['PLAY', 'PAUSE', 'STOPPED', 'LOADING', 'INTERRUPTED'][this.mediaState]}`);
                    }
                })
                .on('success', (success) => this.emit('success', success))
                .on('info', (info) => this.emit('info', info))
                .on('debug', (debug) => this.emit('debug', debug))
                .on('warn', (warn) => this.emit('warn', warn))
                .on('error', (error) => this.emit('error', error))
                .on('restFul', (path, data) => {
                    if (this.restFulConnected) this.restFul1.update(path, data);
                })
                .on('mqtt', async (topic, message) => {
                    if (this.mqttConnected) await this.mqtt1.publish(topic, message);
                });

            // Connect to local api
            const connect = await this.xboxLocalApi.connect();
            if (!connect) return false;

            // Start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //prepare data for accessory
            await this.prepareDataForAccessory();

            // Prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}
export default XboxDevice;
