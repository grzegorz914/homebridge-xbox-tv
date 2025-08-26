import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import XboxWebApi from './webApi/xboxwebapi.js';
import XboxLocalApi from './localApi/xboxlocalapi.js';
import { DefaultInputs, LocalApi, DiacriticsMap } from './constants.js';

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
        this.name = device.name;
        this.host = device.host;
        this.xboxLiveId = device.xboxLiveId;
        this.webApiControl = device.webApiControl || false;
        this.getInputsFromDevice = this.webApiControl ? device.getInputsFromDevice : false;
        this.filterGames = device.filterGames || false;
        this.filterApps = device.filterApps || false;
        this.filterSystemApps = device.filterSystemApps || false;
        this.filterDlc = device.filterDlc || false;
        this.inputsDisplayOrder = device.inputsDisplayOrder || 0;
        this.inputs = device.inputs || [];
        this.buttons = device.buttons || [];
        this.sensorPower = device.sensorPower || false;
        this.sensorInput = device.sensorInput || false;
        this.sensorScreenSaver = device.sensorScreenSaver || false;
        this.sensorInputs = device.sensorInputs || [];
        this.webApiClientId = device.webApiClientId;
        this.webApiClientSecret = device.webApiClientSecret;
        this.infoButtonCommand = device.infoButtonCommand || 'nexus';
        this.volumeControl = device.volumeControl || false;
        this.volumeControlNamePrefix = device.volumeControlNamePrefix || false;
        this.volumeControlName = device.volumeControlName || 'Volume';
        this.enableDebugMode = device.enableDebugMode || false;
        this.disableLogInfo = device.disableLogInfo || false;
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


        //add configured inputs to the default inputs and chack duplicated inputs
        const tempInputs = [...DefaultInputs, ...this.inputs];
        const inputsArr = [];
        for (const input of tempInputs) {
            const inputName = input.name ?? false;
            const inputReference = input.reference ?? false;
            const duplicatedInput = inputsArr.some(input => input.reference === inputReference) ?? false;
            const push = inputName && inputReference && !duplicatedInput ? inputsArr.push(input) : false;
        }
        this.inputs = inputsArr;

        //sensors
        this.sensorsInputsConfigured = [];
        for (const sensor of this.sensorInputs) {
            const sensorInputName = sensor.name ?? false;
            const sensorInputReference = sensor.reference ?? false;
            const sensorInputDisplayType = sensor.displayType ?? 0;
            if (sensorInputName && sensorInputReference && sensorInputDisplayType > 0) {
                sensor.serviceType = ['', Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                sensor.characteristicType = ['', Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                sensor.state = false;
                this.sensorsInputsConfigured.push(sensor);
            } else {
                const log = sensorInputDisplayType === 0 ? false : this.emit('info', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}`);
            }
        }
        this.sensorsInputsConfiguredCount = this.sensorsInputsConfigured.length || 0;

        //buttons
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const buttonName = button.name ?? false;
            const buttonMode = button.mode ?? -1;
            const buttonReferenceCommand = [button.mediaCommand, button.gamePadCommand, button.tvRemoteCommand, button.consoleControlCommand, button.gameAppControlCommand][buttonMode] ?? false;
            const buttonDisplayType = button.displayType ?? 0;
            if (buttonName && buttonMode >= 0 && buttonReferenceCommand && buttonDisplayType > 0) {
                button.serviceType = ['', Service.Outlet, Service.Switch][buttonDisplayType];
                button.state = false;
                this.buttonsConfigured.push(button);
            } else {
                const log = buttonDisplayType === 0 ? false : this.emit('info', `Button Name: ${buttonName ? buttonName : 'Missing'}, ${buttonMode ? 'Command:' : 'Reference:'} ${buttonReferenceCommand ? buttonReferenceCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}`);
            }
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //variable
        this.modelName = 'Xbox';
        this.sensorsInputsServices = [];
        this.buttonsServices = [];
        this.inputIdentifier = 1;
        this.power = false;
        this.volume = 0;
        this.mute = false;
        this.mediaState = 0;
        this.reference = '';
        this.sensorScreenSaverState = false;
        this.sensorInputState = false;
        this.consoleAuthorized = false;
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        }
    }

    async sanitizeString(str) {
        if (!str) return '';

        // Replace diacritics using map
        str = str.replace(/[^\u0000-\u007E]/g, ch => DiacriticsMap[ch] || ch);

        // Replace separators between words with space
        str = str.replace(/(\w)[.:;+\-\/]+(\w)/g, '$1 $2');

        // Replace remaining standalone separators with space
        str = str.replace(/[.:;+\-\/]/g, ' ');

        // Remove remaining invalid characters (keep letters, digits, space, apostrophe)
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Collapse multiple spaces
        str = str.replace(/\s+/g, ' ');

        // Trim
        return str.trim();
    }

    async setOverExternalIntegration(integration, key, value) {
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
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error}`);
        }
    }

    async externalIntegrations() {
        try {
            //RESTFul server
            const restFulEnabled = this.restFul.enable || false;
            if (restFulEnabled) {
                this.restFul1 = new RestFul({
                    port: this.restFul.port || 3000,
                    debug: this.restFul.debug || false
                })
                    .on('connected', (message) => {
                        this.emit('success', message);
                        this.restFulConnected = true;
                    })
                    .on('set', async (key, value) => {
                        try {
                            await this.setOverExternalIntegration('RESTFul', key, value);
                        } catch (error) {
                            this.emit('warn', `RESTFul set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            }

            //mqtt client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `microsoft_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `microsoft_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `microsoft/${this.mqtt.prefix}/${this.name}` : `microsoft/${this.name}`,
                    user: this.mqtt.user,
                    passwd: this.mqtt.passwd,
                    debug: this.mqtt.debug || false
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
                            this.emit('warn', `MQTT set error: ${error}`);
                        }
                    })
                    .on('debug', (debug) => this.emit('debug', debug))
                    .on('warn', (warn) => this.emit('warn', warn))
                    .on('error', (error) => this.emit('error', error));
            };

            return true;
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            const savedInputsNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            if (this.enableDebugMode) this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startImpulseGenerator() {
        try {
            //start web api impulse generator
            if (this.consoleAuthorized) await this.xboxWebApi.impulseGenerator.start([{ name: 'checkAuthorization', sampling: 900000 }]);

            //start local api impulse generator 
            await this.xboxLocalApi.impulseGenerator.start([{ name: 'heartBeat', sampling: 10000 }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            const sortStrategies = {
                1: (a, b) => a.name.localeCompare(b.name),      // A → Z
                2: (a, b) => b.name.localeCompare(a.name),      // Z → A
                3: (a, b) => a.reference.localeCompare(b.reference),
                4: (a, b) => b.reference.localeCompare(a.reference),
            };

            const sortFn = sortStrategies[this.inputsDisplayOrder];
            if (!sortFn) return;

            // Sort inputs in memory
            this.inputsServices.sort(sortFn);

            // Debug dump
            if (this.enableDebugMode) {
                const orderDump = this.inputsServices.map(svc => ({ name: svc.name, reference: svc.reference, identifier: svc.identifier, }));
                this.emit('debug', `Inputs display order:\n${JSON.stringify(orderDump, null, 2)}`);
            }

            // Update DisplayOrder characteristic (base64 encoded)
            const displayOrder = this.inputsServices.map(svc => svc.identifier);
            const encodedOrder = Encode(1, displayOrder).toString('base64');
            this.televisionService.updateCharacteristic(Characteristic.DisplayOrder, encodedOrder);
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async addRemoveOrUpdateInput(inputs, remove = false) {
        try {
            if (!this.inputsServices) return;

            for (const input of inputs) {
                if (this.inputsServices.length >= 85 && !remove) continue;

                const contentType = input.contentType;
                const filterGames = this.filterGames && contentType === 'Game';
                const filterApps = this.filterApps && contentType === 'App';
                const filterSystemApps = this.filterSystemApps && contentType === 'systemApp';
                const filterDlc = this.filterDlc && contentType === 'Dlc';
                if (filterGames || filterApps || filterSystemApps || filterDlc) continue;

                const inputReference = input.reference;

                if (remove) {
                    const svc = this.inputsServices.find(s => s.reference === inputReference);
                    if (svc) {
                        if (this.enableDebugMode) this.emit('debug', `Removing input: ${input.name}, reference: ${inputReference}`);
                        this.accessory.removeService(svc);
                        this.inputsServices = this.inputsServices.filter(s => s.reference !== inputReference);
                        await this.displayOrder();
                    }
                    continue;
                }

                let inputService = this.inputsServices.find(s => s.reference === inputReference);

                const savedName = this.savedInputsNames[inputReference] ?? input.name;
                const sanitizedName = await this.sanitizeString(savedName);
                const inputMode = input.mode ?? 0;
                const inputTitleId = input.titleId;
                const inputOneStoreProductId = input.oneStoreProductId;
                const inputVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                if (inputService) {
                    const nameChanged = inputService.name !== sanitizedName;
                    if (nameChanged) {
                        inputService.name = sanitizedName;
                        inputService
                            .updateCharacteristic(Characteristic.Name, sanitizedName)
                            .updateCharacteristic(Characteristic.ConfiguredName, sanitizedName);
                        if (this.enableDebugMode) this.emit('debug', `Updated Input: ${input.name}, reference: ${inputReference}`);
                    }
                } else {
                    const identifier = this.inputsServices.length + 1;
                    inputService = this.accessory.addService(Service.InputSource, sanitizedName, `Input ${identifier}`);
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
                                value = await this.sanitizeString(value);
                                inputService.name = value;
                                this.savedInputsNames[inputReference] = value;
                                await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                                if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}`);
                                await this.displayOrder();
                            } catch (error) {
                                this.emit('warn', `Save Input Name error: ${error}`);
                            }
                        });

                    // TargetVisibility persistence
                    inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                        .onSet(async (state) => {
                            try {
                                inputService.visibility = state;
                                this.savedInputsTargetVisibility[inputReference] = state;
                                await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                                if (this.enableDebugMode) this.emit('debug', `Saved Input: ${input.name}, reference: ${inputReference}, target visibility: ${state ? 'HIDDEN' : 'SHOWN'}`);
                            } catch (error) {
                                this.emit('warn', `Save Target Visibility error: ${error}`);
                            }
                        });

                    this.inputsServices.push(inputService);
                    this.televisionService.addLinkedService(inputService);

                    if (this.enableDebugMode) this.emit('debug', `Added Input: ${input.name}, reference: ${inputReference}`);
                }
            }

            await this.displayOrder();
            return true;
        } catch (error) {
            throw new Error(`Add/Remove/Update input error: ${error}`);
        }
    }

    //Prepare accessory
    async prepareAccessory() {
        try {
            //Accessory
            if (this.enableDebugMode) this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.xboxLiveId);
            const accessoryCategory = Categories.TV_SET_TOP_BOX;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
            this.accessory = accessory;

            //Prepare information service
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer)
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName)
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber ?? this.xboxLiveId)
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //Prepare television service
            if (this.enableDebugMode) this.emit('debug', `Prepare television service`);
            this.televisionService = accessory.addService(Service.Television, `${accessoryName} Television`, 'Television');
            this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
            this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

            this.televisionService.getCharacteristic(Characteristic.Active)
                .onGet(async () => {
                    const state = this.power;
                    return state;
                })
                .onSet(async (state) => {
                    if (this.power == state) {
                        return;
                    }

                    try {
                        switch (this.power) {
                            case true: //off
                                await this.xboxWebApi.send('Power', 'TurnOff');
                                break;
                            case false: //on
                                await this.xboxWebApi.send('Power', 'WakeUp');
                                break;
                        }

                        if (!this.disableLogInfo) this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (error) {
                        this.emit('warn', `set Power, error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                .onGet(async () => {
                    const inputIdentifier = this.inputIdentifier;
                    return inputIdentifier;
                })
                .onSet(async (activeIdentifier) => {
                    try {
                        const input = this.inputsServices.find(i => i.identifier === activeIdentifier);
                        if (!input) {
                            this.emit('warn', `Input with identifier ${activeIdentifier} not found`);
                            return;
                        }

                        const { oneStoreProductId: oneStoreProductId, name: name, reference: reference } = input;

                        if (!this.power) {
                            // Schedule retry attempts without blocking Homebridge
                            this.emit('debug', `TV is off, deferring input switch to '${activeIdentifier}'`);

                            (async () => {
                                for (let attempt = 0; attempt < 10; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    if (this.power && this.inputIdentifier !== activeIdentifier) {
                                        this.emit('debug', `TV powered on, retrying input switch`);
                                        this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier);
                                        break;
                                    }
                                }
                            })();

                            return;
                        }

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
                        if (!this.disableLogInfo) this.emit('info', `set Input: ${name}, Reference: ${reference}, Product Id: ${oneStoreProductId}`);
                    } catch (error) {
                        this.emit('warn', `set Input error: ${JSON.stringify(error, null, 2)}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                .onSet(async (remoteKey) => {
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
                        if (!this.disableLogInfo) this.emit('info', `Remote Key: ${command}`);
                    } catch (error) {
                        this.emit('warn', `set Remote Key error: ${JSON.stringify(error, null, 2)}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                .onGet(async () => {
                    //apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                    //xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
                    const value = [2, 0, 1, 3, 4][this.mediaState];
                    return value;
                });

            this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                .onGet(async () => {
                    //0 - PLAY, 1 - PAUSE, 2 - STOP
                    const value = [2, 0, 1, 3, 4][this.mediaState];
                    return value;
                })
                .onSet(async (value) => {
                    try {
                        const newMediaState = value;
                        const setMediaState = this.power ? false : false;
                        if (!this.disableLogInfo) this.emit('info', `set Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                    } catch (error) {
                        this.emit('warn', `set Target Media error: ${error}`);
                    }
                });

            this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                .onSet(async (powerModeSelection) => {
                    try {
                        switch (powerModeSelection) {
                            case 0: //SHOW
                                await this.xboxWebApi.send('Shell', 'InjectKey', [{ 'keyType': 'nexus' }]);
                                break;
                            case 1: //HIDE
                                await this.xboxWebApi.send('Shell', 'InjectKey', [{ 'keyType': 'b' }]);
                                break;
                        };
                        if (!this.disableLogInfo) this.emit('info', `set Power Mode Selection: ${powerModeSelection === 0 ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        this.emit('warn', `set Power Mode Selection error: ${error}`);
                    }
                });

            //prepare inputs service
            if (this.enableDebugMode) this.emit('debug', `Prepare inputs service`);
            this.inputsServices = [];
            const inputs = this.getInputsFromDevice ? [...DefaultInputs, ...this.savedInputs] : this.inputs;
            await this.addRemoveOrUpdateInput(inputs, false);

            //Prepare volume service
            if (this.volumeControl > 0) {
                const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare television speaker service`) : false;
                const volumeServiceName = this.volumeControlNamePrefix ? `${accessoryName} ${this.volumeControlName}` : this.volumeControlName;
                this.volumeServiceTvSpeaker = accessory.addService(Service.TelevisionSpeaker, volumeServiceName, 'TV Speaker');
                this.volumeServiceTvSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                    });

                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeControlType)
                    .onGet(async () => {
                        const state = 3; //none, relative, relative with current, absolute
                        return state;
                    });

                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
                    .onSet(async (volumeSelector) => {
                        try {
                            switch (volumeSelector) {
                                case 0: //Up
                                    await this.xboxWebApi.send('Volume', 'Up');
                                    break;
                                case 1: //Down
                                    await this.xboxWebApi.send('Volume', 'Down');
                                    break;
                            }
                            if (!this.disableLogInfo) this.emit('info', `set Volume Selector: ${volumeSelector ? 'Down' : 'UP'}`);
                        } catch (error) {
                            this.emit('warn', `set Volume Selector error: ${error}`);
                        }
                    })

                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        return volume;
                    })
                    .onSet(async (volume) => {
                        if (!this.disableLogInfo) this.emit('info', `set Volume: ${volume}`);
                    });

                this.volumeServiceTvSpeaker.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            switch (state) {
                                case 0: //Mute
                                    await this.xboxWebApi.send('Audio', 'Mute');
                                    break;
                                case 1: //Unmute
                                    await this.xboxWebApi.send('Audio', 'Unmute');
                                    break;
                            }
                            if (!this.disableLogInfo) this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('warn', `set Mute error: ${error}`);
                        }
                    });

                //legacy control
                switch (this.volumeControl) {
                    case 1: //lightbulb
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare volume service lightbulb`) : false;
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
                    case 2: //fan
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare volume service fan`) : false;
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
                    case 3: // speaker
                        const debug2 = this.enableDebugMode ? this.emit('debug', `Prepare volume service speaker`) : false;
                        this.volumeServiceSpeaker = accessory.addService(Service.Speaker, volumeServiceName, 'Speaker');
                        this.volumeServiceSpeaker.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceSpeaker.setCharacteristic(Characteristic.ConfiguredName, volumeServiceName);
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Mute)
                            .onGet(async () => {
                                const state = this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Mute, state);
                            });
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => {
                            });
                        this.volumeServiceSpeaker.getCharacteristic(Characteristic.Volume)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (value) => {
                                this.volumeServiceTvSpeaker.setCharacteristic(Characteristic.Volume, value);
                            });
                        break;
                }
            }

            //prepare sensor service
            if (this.sensorPower) {
                if (this.enableDebugMode) this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${accessoryName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
            }

            if (this.sensorInput) {
                if (this.enableDebugMode) this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${accessoryName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorInputState : false;
                        return state;
                    });
            }

            if (this.sensorScreenSaver) {
                if (this.enableDebugMode) this.emit('debug', `Prepare screen saver sensor service`);
                this.sensorScreenSaverService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorScreenSaverState : false;
                        return state;
                    });
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.accessory.services.length.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                if (this.enableDebugMode) this.emit('debug', `Prepare inputs sensors services`);
                for (let i = 0; i < maxSensorInputsCount; i++) {
                    //get sensor
                    const sensorInput = this.sensorsInputsConfigured[i];

                    //get sensor name		
                    const sensorInputName = sensorInput.name;

                    //get sensor name prefix
                    const namePrefix = sensorInput.namePrefix || false;

                    //get service type
                    const serviceType = sensorInput.serviceType;

                    //get service type
                    const characteristicType = sensorInput.characteristicType;

                    const serviceName = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName;
                    const sensorInputService = new serviceType(serviceName, `Sensor ${i}`);
                    sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorInputService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorInputService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = sensorInput.state;
                            return state;
                        });
                    this.sensorsInputsServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }

            //Prepare buttons services
            const possibleButtonsCount = 99 - this.accessory.services.length.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                if (this.enableDebugMode) this.emit('debug', `Prepare buttons services`);
                for (let i = 0; i < maxButtonsCount; i++) {
                    //get button
                    const button = this.buttonsConfigured[i];

                    //get button name
                    const buttonName = button.name;

                    //get button command
                    const buttonMode = button.mode;

                    //get button command
                    const buttonCommand = [button.mediaCommand, button.gamePadCommand, button.tvRemoteCommand, button.consoleControlCommand, button.gameAppControlCommand][buttonMode];

                    //get button name prefix
                    const namePrefix = button.namePrefix ?? false;

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
                            if (!this.power) {
                                this.emit('warn', `console is off`);
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
                                this.emit('warn', `set Button error: ${error}`);
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
            // Web api client
            if (this.webApiControl) {
                try {
                    this.xboxWebApi = new XboxWebApi({
                        xboxLiveId: this.xboxLiveId,
                        webApiClientId: this.webApiClientId,
                        webApiClientSecret: this.webApiClientSecret,
                        tokensFile: this.authTokenFile,
                        inputsFile: this.inputsFile,
                        enableDebugMode: this.enableDebugMode
                    })
                        .on('consoleStatus', (status) => {
                            this.modelName = status.consoleType;
                            //this.power = status.powerState;
                            //this.mediaState = status.playbackState;
                        })
                        .on('addRemoveOrUpdateInput', async (inputs, remove) => {
                            await this.addRemoveOrUpdateInput(inputs, remove);
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

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Local api client
            this.xboxLocalApi = new XboxLocalApi({
                host: this.host,
                xboxLiveId: this.xboxLiveId,
                tokensFile: this.authTokenFile,
                devInfoFile: this.devInfoFile,
                inputsFile: this.inputsFile,
                disableLogInfo: this.disableLogInfo,
                enableDebugMode: this.enableDebugMode
            })
                .on('deviceInfo', async (info) => {
                    this.emit('devInfo', `-------- ${this.name} --------`);
                    this.emit('devInfo', `Manufacturer:  Microsoft`);
                    this.emit('devInfo', `Model: ${this.modelName}`);
                    this.emit('devInfo', `Serialnr: ${this.xboxLiveId}`);
                    this.emit('devInfo', `Firmware: ${info.firmwareRevision}`);
                    this.emit('devInfo', `Locale: ${info.locale}`);
                    this.emit('devInfo', `----------------------------------`);

                    const obj = {
                        manufacturer: 'Microsoft',
                        modelName: this.modelName,
                        serialNumber: this.xboxLiveId,
                        firmwareRevision: info.firmwareRevision,
                        locale: info.locale
                    };

                    // Save device info
                    await this.saveData(this.devInfoFile, obj);

                    this.informationService
                        ?.updateCharacteristic(Characteristic.Model, this.modelName)
                        .updateCharacteristic(Characteristic.FirmwareRevision, info.firmwareRevision);
                })
                .on('stateChanged', (power, titleId, reference, volume, mute, mediaState) => {
                    if (!this.inputsServices) return;

                    const input = this.inputsServices.find(input => input.reference === reference || input.titleId === titleId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;
                    this.mediaState = mediaState;

                    // Update characteristics
                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                    }

                    if (this.volumeServiceTvSpeaker) {
                        this.volumeServiceTvSpeaker
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.Volume, volume)
                            .updateCharacteristic(Characteristic.Mute, mute);
                    }

                    if (this.volumeServiceLightbulb) {
                        const muteV = this.power ? !mute : false;
                        this.volumeServiceLightbulb
                            .updateCharacteristic(Characteristic.Brightness, volume)
                            .updateCharacteristic(Characteristic.On, muteV);
                    }

                    if (this.volumeServiceFan) {
                        const muteV = this.power ? !mute : false;
                        this.volumeServiceFan
                            .updateCharacteristic(Characteristic.RotationSpeed, volume)
                            .updateCharacteristic(Characteristic.On, muteV);
                    }

                    if (this.volumeServiceSpeaker) {
                        this.volumeServiceSpeaker
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.Volume, volume)
                            .updateCharacteristic(Characteristic.Mute, mute);
                    }

                    if (this.sensorPowerService) {
                        this.sensorPowerService
                            .updateCharacteristic(Characteristic.ContactSensorState, power);
                    }

                    if (this.sensorInputService && reference !== this.reference) {
                        for (let i = 0; i < 2; i++) {
                            const state = power ? [true, false][i] : false;
                            this.sensorInputService
                                .updateCharacteristic(Characteristic.ContactSensorState, state);
                            this.sensorInputState = state;
                        }
                    }

                    if (this.sensorScreenSaverService) {
                        const state = power ? (reference === 'Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application') : false;
                        this.sensorScreenSaverService
                            .updateCharacteristic(Characteristic.ContactSensorState, state);
                        this.sensorScreenSaverState = state;
                    }

                    if (this.sensorsInputsServices) {
                        for (let i = 0; i < this.sensorsInputsConfiguredCount; i++) {
                            const sensorInput = this.sensorsInputsConfigured[i];
                            const state = power ? sensorInput.reference === reference : false;
                            sensorInput.state = state;
                            const characteristicType = sensorInput.characteristicType;
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }

                    //buttons
                    if (this.buttonsServices) {
                        for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                            const button = this.buttonsConfigured[i];
                            const state = this.power ? button.reference === reference : false;
                            button.state = state;
                            this.buttonsServices[i]
                                .updateCharacteristic(Characteristic.On, state);
                        }
                    }

                    if (!this.disableLogInfo) {
                        const name = input ? input.name : reference;
                        const productId = input ? input.oneStoreProductId : reference;
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Input Name: ${name}`);
                        this.emit('info', `Reference: ${reference}`);
                        this.emit('info', `Title Id: ${titleId}`);
                        this.emit('info', `Product Id: ${productId}`);
                        this.emit('info', `Volume: ${volume}%`);
                        this.emit('info', `Mute: ${mute ? 'ON' : 'OFF'}`);
                        this.emit('info', `Media State: ${['PLAY', 'PAUSE', 'STOPPED', 'LOADING', 'INTERRUPTED'][mediaState]}`);
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

            // Connect to local api
            const connect = await this.xboxLocalApi.connect();
            if (!connect) {
                return false;
            }

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
