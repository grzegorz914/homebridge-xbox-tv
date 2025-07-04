import { promises as fsPromises } from 'fs';
import EventEmitter from 'events';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import XboxWebApi from './webApi/xboxwebapi.js';
import XboxLocalApi from './localApi/xboxlocalapi.js';
import { DefaultInputs, LocalApi } from './constants.js';

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
        this.webApiPowerOnOff = this.webApiControl ? device.webApiPowerOnOff : false;
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
        this.allServices = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];
        this.inputsConfigured = [];
        this.inputIdentifier = 1;
        this.startPrepareAccessory = true;
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
        // Replace dots, colons, and semicolons inside words with a space
        str = str.replace(/(\w)[.:;]+(\w)/g, '$1 $2');

        // Remove remaining dots, colons, semicolons, plus, and minus anywhere in the string
        str = str.replace(/[.:;+\-]/g, '');

        // Replace all other invalid characters (anything not A-Z, a-z, 0-9, space, or apostrophe) with a space
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Trim leading and trailing spaces
        str = str.trim();

        return str;
    }

    async setOverExternalIntegration(integration, key, value) {
        try {
            let set = false
            switch (key) {
                case 'Power':
                    switch (this.consoleAuthorized && this.webApiPowerOnOff) {
                        case true:
                            switch (value) {
                                case true: //off
                                    set = await this.xboxWebApi.send('Power', 'WakeUp');
                                    break;
                                case false: //on
                                    set = await this.xboxWebApi.send('Power', 'TurnOff');
                                    break;
                            }
                            break;
                        case false:
                            switch (value) {
                                case true: //off
                                    set = await this.xboxLocalApi.powerOff();
                                    break;
                                case false: //on
                                    set = await this.xboxLocalApi.powerOn();
                                    break;
                            }
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
                });

                this.restFul1.on('connected', (message) => {
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
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
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
                });

                this.mqtt1.on('connected', (message) => {
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
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    });
            };

            return true;
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        }
    }

    async displayOrder() {
        try {
            switch (this.inputsDisplayOrder) {
                case 1:
                    this.inputsConfigured.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 2:
                    this.inputsConfigured.sort((a, b) => b.name.localeCompare(a.name));
                    break;
                case 3:
                    this.inputsConfigured.sort((a, b) => a.reference.localeCompare(b.reference));
                    break;
                case 4:
                    this.inputsConfigured.sort((a, b) => b.reference.localeCompare(a.reference));
                    break;
                default:
                    return;
            }
            const debug = this.enableDebugMode ? this.emit('debug', `Inputs display order: ${JSON.stringify(this.inputsConfigured, null, 2)}`) : false;

            const displayOrder = this.inputsConfigured.map(input => input.identifier);
            this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));
            return;
        } catch (error) {
            throw new Error(`Display order error: ${error}`);
        }
    }

    async prepareDataForAccessory() {
        try {
            //read dev info from file
            const savedInfo = await this.readData(this.devInfoFile);
            this.savedInfo = savedInfo.toString().trim() !== '' ? JSON.parse(savedInfo) : {};
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`);

            //read inputs file
            const savedInputs = await this.readData(this.inputsFile);
            this.savedInputs = savedInputs.toString().trim() !== '' ? JSON.parse(savedInputs) : this.inputs;
            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`);

            //read inputs names from file
            const savedInputsNames = await this.readData(this.inputsNamesFile);
            this.savedInputsNames = savedInputsNames.toString().trim() !== '' ? JSON.parse(savedInputsNames) : {};
            const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`);

            //read inputs visibility from file
            const savedInputsTargetVisibility = await this.readData(this.inputsTargetVisibilityFile);
            this.savedInputsTargetVisibility = savedInputsTargetVisibility.toString().trim() !== '' ? JSON.parse(savedInputsTargetVisibility) : {};
            const debug4 = !this.enableDebugMode ? false : this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`);

            return true;
        } catch (error) {
            throw new Error(`Prepare data for accessory error: ${error}`);
        }
    }

    async startImpulseGenerator() {
        try {
            //start web api impulse generator
            const startImpulseGenerator = this.consoleAuthorized ? await this.xboxWebApi.impulseGenerator.start([{ name: 'checkAuthorization', sampling: 900000 }]) : false;

            //start local api impulse generator 
            await this.xboxLocalApi.impulseGenerator.start([{ name: 'heartBeat', sampling: 10000 }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    //Prepare accessory
    async prepareAccessory() {
        try {
            //Accessory
            const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
            const accessoryName = this.name;
            const accessoryUUID = AccessoryUUID.generate(this.xboxLiveId);
            const accessoryCategory = Categories.TV_SET_TOP_BOX;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //Prepare information service
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'Microsoft')
                .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Xbox')
                .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber ?? this.xboxLiveId)
                .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision')
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);
            this.allServices.push(this.informationService);

            //Prepare television service
            const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
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
                        switch (this.consoleAuthorized && this.webApiPowerOnOff) {
                            case true:
                                switch (this.power) {
                                    case true: //off
                                        await this.xboxWebApi.send('Power', 'TurnOff');
                                        break;
                                    case false: //on
                                        await this.xboxWebApi.send('Power', 'WakeUp');
                                        break;
                                }
                                break;
                            case false:
                                switch (this.power) {
                                    case true: //off
                                        await this.xboxLocalApi.powerOff();
                                        break;
                                    case false: //on
                                        await this.xboxLocalApi.powerOn();
                                        break;
                                }
                        }

                        const logInfo = this.disableLogInfo ? false : this.emit('info', `set Power: ${state ? 'ON' : 'OFF'}`);
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
                        const input = this.inputsConfigured.find(i => i.identifier === activeIdentifier);
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
                        const logInfo = this.disableLogInfo ? false : this.emit('info', `set Input: ${name}, Reference: ${reference}, Product Id: ${oneStoreProductId}`);
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
                        const logInfo = this.disableLogInfo ? false : this.emit('info', `Remote Key: ${command}`);
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
                        const logInfo = this.disableLogInfo ? false : this.emit('info', `set Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
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
                        const logInfo = this.disableLogInfo ? false : this.emit('info', `set Power Mode Selection: ${powerModeSelection === 0 ? 'SHOW' : 'HIDE'}`);
                    } catch (error) {
                        this.emit('warn', `set Power Mode Selection error: ${error}`);
                    }
                });
            this.allServices.push(this.televisionService);

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
                            const logInfo = this.disableLogInfo ? false : this.emit('info', `set Volume Selector: ${volumeSelector ? 'Down' : 'UP'}`);
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
                        const logInfo = this.disableLogInfo ? false : this.emit('info', `set Volume: ${volume}`);
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
                            const logInfo = this.disableLogInfo ? false : this.emit('info', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('warn', `set Mute error: ${error}`);
                        }
                    });
                this.allServices.push(this.volumeServiceTvSpeaker);

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
                        this.allServices.push(this.volumeServiceLightbulb);
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
                        this.allServices.push(this.volumeServiceFan);
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
                        this.allServices.push(this.volumeServiceSpeaker);
                        break;
                }
            }

            //prepare inputs service
            const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs service`);

            //filter unnecessary inputs
            const filteredInputsArr = [];
            for (const input of this.savedInputs) {
                const contentType = input.contentType;
                const filterGames = this.filterGames ? (contentType === 'Game') : false;
                const filterApps = this.filterApps ? (contentType === 'App') : false;
                const filterSystemApps = this.filterSystemApps ? (contentType === 'systemApp') : false;
                const filterDlc = this.filterDlc ? (contentType === 'Dlc') : false;
                const push = this.getInputsFromDevice ? ((!filterGames && !filterApps && !filterSystemApps && !filterDlc) ? filteredInputsArr.push(input) : false) : filteredInputsArr.push(input);
            }

            //check possible inputs count (max 85)
            const inputs = filteredInputsArr;
            const inputsCount = inputs.length;
            const possibleInputsCount = 85 - this.allServices.length;
            const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
            for (let i = 0; i < maxInputsCount; i++) {
                //input
                const input = inputs[i];

                //get identifier
                const inputIdentifier = i + 1;

                //get input reference
                const inputReference = input.reference || input.titleId;
                input.reference = inputReference;

                //get input name
                const name = input.name ?? `Input ${inputIdentifier}`;

                //saved string
                const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                input.name = savedInputsNames ? savedInputsNames.substring(0, 64) : name.substring(0, 64);

                //get input type
                const inputSourceType = 0;

                //get input configured
                const isConfigured = 1;

                //get visibility
                input.visibility = this.savedInputsTargetVisibility[inputReference] ?? 0;

                //add identifier to the input
                input.identifier = inputIdentifier;

                //input service
                const sanitizedName = await this.sanitizeString(input.name);
                const inputService = accessory.addService(Service.InputSource, sanitizedName, `Input ${inputIdentifier}`);
                inputService
                    .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                    .setCharacteristic(Characteristic.Name, sanitizedName)
                    .setCharacteristic(Characteristic.InputSourceType, inputSourceType)
                    .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, input.visibility);

                inputService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => {
                        return sanitizedName;
                    })
                    .onSet(async (value) => {
                        try {
                            input.name = value;
                            this.savedInputsNames[inputReference] = value;
                            await this.saveData(this.inputsNamesFile, this.savedInputsNames);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input Name: ${value}, Reference: ${inputReference}`);

                            //sort inputs
                            const index = this.inputsConfigured.findIndex(input => input.reference === inputReference);
                            this.inputsConfigured[index].name = value;
                            await this.displayOrder();
                        } catch (error) {
                            this.emit('warn', `save Input Name error: ${error}`);
                        }
                    });

                inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                    .onGet(async () => {
                        return input.visibility;
                    })
                    .onSet(async (state) => {
                        try {
                            input.visibility = state,
                                this.savedInputsTargetVisibility[inputReference] = state;
                            await this.saveData(this.inputsTargetVisibilityFile, this.savedInputsTargetVisibility);
                            const debug = !this.enableDebugMode ? false : this.emit('debug', `Saved Input: ${input.name} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`);
                        } catch (error) {
                            this.emit('warn', `save Target Visibility error: ${error}`);
                        }
                    });
                this.inputsConfigured.push(input);
                this.televisionService.addLinkedService(inputService);
                this.allServices.push(inputService);
            }

            //prepare sensor service
            if (this.sensorPower) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                this.sensorPowerService = accessory.addService(Service.ContactSensor, `${accessoryName} Power Sensor`, `Power Sensor`);
                this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    });
                this.allServices.push(this.sensorPowerService);
            }

            if (this.sensorInput) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                this.sensorInputService = accessory.addService(Service.ContactSensor, `${accessoryName} Input Sensor`, `Input Sensor`);
                this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorInputState : false;
                        return state;
                    });
                this.allServices.push(this.sensorInputService);
            }

            if (this.sensorScreenSaver) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare screen saver sensor service`);
                this.sensorScreenSaverService = accessory.addService(Service.ContactSensor, `${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.power ? this.sensorScreenSaverState : false;
                        return state;
                    });
                this.allServices.push(this.sensorScreenSaverService);
            }

            //prepare sonsor service
            const possibleSensorInputsCount = 99 - this.allServices.length;
            const maxSensorInputsCount = this.sensorsInputsConfiguredCount >= possibleSensorInputsCount ? possibleSensorInputsCount : this.sensorsInputsConfiguredCount;
            if (maxSensorInputsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensors services`);
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
                    this.allServices.push(sensorInputService);
                    accessory.addService(sensorInputService);
                }
            }


            //Prepare buttons services
            const possibleButtonsCount = 99 - this.allServices.length;
            const maxButtonsCount = this.buttonsConfiguredCount >= possibleButtonsCount ? possibleButtonsCount : this.buttonsConfiguredCount;
            if (maxButtonsCount > 0) {
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare buttons services`);
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
                    this.allServices.push(buttonService);
                    accessory.addService(buttonService);
                }
            }

            //sort inputs list
            await this.displayOrder();

            return accessory;
        } catch (error) {
            throw new Error(error)
        };
    }

    //start
    async start() {
        try {
            //web api client
            try {
                this.xboxWebApi = new XboxWebApi({
                    xboxLiveId: this.xboxLiveId,
                    webApiClientId: this.webApiClientId,
                    webApiClientSecret: this.webApiClientSecret,
                    tokensFile: this.authTokenFile,
                    inputsFile: this.inputsFile,
                    enableDebugMode: this.enableDebugMode
                });

                this.xboxWebApi.on('consoleStatus', (consoleType) => {
                    if (this.informationService) {
                        this.informationService
                            .setCharacteristic(Characteristic.Model, consoleType)
                    }

                    //this.serialNumber = id;
                    this.modelName = consoleType;
                    //this.power = powerState;
                    //this.mediaState = playbackState;
                })
                    .on('success', (success) => {
                        this.emit('success', success);
                    })
                    .on('info', (info) => {
                        this.emit('info', info);
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('warn', (warn) => {
                        this.emit('warn', warn);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    })
                    .on('restFul', (path, data) => {
                        const restFul = this.restFulConnected ? this.restFul1.update(path, data) : false;
                    })
                    .on('mqtt', (topic, message) => {
                        const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                    });

                //check authorization
                this.consoleAuthorized = this.webApiControl ? await this.xboxWebApi.checkAuthorization() : false;
            } catch (error) {
                this.emit('error', `Start web api error: ${error}`);
            }

            //xbox local client
            this.xboxLocalApi = new XboxLocalApi({
                host: this.host,
                xboxLiveId: this.xboxLiveId,
                tokensFile: this.authTokenFile,
                devInfoFile: this.devInfoFile,
                disableLogInfo: this.disableLogInfo,
                enableDebugMode: this.enableDebugMode
            });

            this.xboxLocalApi.on('deviceInfo', (firmwareRevision, locale) => {
                this.emit('devInfo', `-------- ${this.name} --------`);
                this.emit('devInfo', `Manufacturer: Microsoft`);
                this.emit('devInfo', `Model: ${this.modelName ?? 'Xbox'}`);
                this.emit('devInfo', `Serialnr: ${this.xboxLiveId}`);
                this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                this.emit('devInfo', `Locale: ${locale}`);
                this.emit('devInfo', `----------------------------------`);
            })
                .on('stateChanged', (power, volume, mute, mediaState, titleId, reference) => {
                    const input = this.inputsConfigured.find(input => input.reference === reference || input.titleId === titleId) ?? false;
                    const inputIdentifier = input ? input.identifier : this.inputIdentifier;

                    this.inputIdentifier = inputIdentifier;
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;
                    this.mediaState = mediaState;

                    //update characteristics
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
                .on('success', (success) => {
                    this.emit('success', success);
                })
                .on('info', (info) => {
                    this.emit('info', info);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('restFul', (path, data) => {
                    const restFul = this.restFulConnected ? this.restFul1.update(path, data) : false;
                })
                .on('mqtt', (topic, message) => {
                    const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                });

            //connect to local api
            const connect = await this.xboxLocalApi.connect();
            if (!connect) {
                return false;
            }

            //start external integrations
            const startExternalIntegrations = this.mqtt.enable ? await this.externalIntegrations() : false;

            //prepare data for accessory
            await this.prepareDataForAccessory();

            //prepare accessory
            if (this.startPrepareAccessory) {
                const accessory = await this.prepareAccessory();
                this.emit('publishAccessory', accessory);
                this.startPrepareAccessory = false;
            }

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        }
    }
}
export default XboxDevice;
