"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const XboxWebApi = require('./webApi/xboxwebapi.js');
const XboxLocalApi = require('./localApi/xboxlocalapi.js');
const CONSTANTS = require('./constans.json');

let Accessory, Characteristic, Service, Categories, Encode, UUID;

class XboxDevice extends EventEmitter {
    constructor(api, prefDir, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        Encode = api.hap.encode;
        UUID = api.hap.uuid;

        //device configuration
        this.name = config.name;
        this.host = config.host;
        this.xboxLiveId = config.xboxLiveId;
        this.webApiControl = config.webApiControl || false;
        this.webApiPowerOnOff = this.webApiControl ? config.webApiPowerOnOff : false;
        this.webApiRcControl = this.webApiControl ? config.webApiRcControl : false;
        this.webApiVolumeControl = this.webApiControl ? config.webApiVolumeControl : false;
        this.getInputsFromDevice = this.webApiControl ? config.getInputsFromDevice : false;
        this.filterGames = config.filterGames || false;
        this.filterApps = config.filterApps || false;
        this.filterSystemApps = config.filterSystemApps || false;
        this.filterDlc = config.filterDlc || false;
        this.inputs = config.inputs || [];
        this.buttons = config.buttons || [];
        this.sensorPower = config.sensorPower || false;
        this.sensorInput = config.sensorInput || false;
        this.sensorScreenSaver = config.sensorScreenSaver || false;
        this.sensorInputs = config.sensorInputs || [];
        this.webApiClientId = config.webApiClientId;
        this.webApiClientSecret = config.webApiClientSecret;
        this.enableDebugMode = config.enableDebugMode || false;
        this.disableLogInfo = config.disableLogInfo || false;
        this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
        this.infoButtonCommand = config.infoButtonCommand || 'nexus';
        this.volumeControl = config.volumeControl >= 0 ? config.volumeControl : -1;
        this.restFulEnabled = config.enableRestFul || false;
        this.restFulPort = config.restFulPort || 3000;
        this.restFulDebug = config.restFulDebug || false;
        this.mqttEnabled = config.enableMqtt || false;
        this.mqttDebug = config.mqttDebug || false;
        this.mqttHost = config.mqttHost;
        this.mqttPort = config.mqttPort || 1883;
        this.mqttClientId = config.mqttClientId || `mqtt_${Math.random().toString(16).slice(3)}`;
        this.mqttPrefix = config.mqttPrefix;
        this.mqttAuth = config.mqttAuth || false;
        this.mqttUser = config.mqttUser;
        this.mqttPasswd = config.mqttPasswd;

        //add configured inputs to the default inputs
        this.inputs = [...CONSTANTS.DefaultInputs, ...this.inputs];
        this.inputsConfigured = [];
        this.sensorInputs = [];

        //setup variables
        this.restFulConnected = false;
        this.mqttConnected = false;

        this.allServices = [];
        this.sensorsInputsServices = [];
        this.buttonsServices = [];

        this.power = false;
        this.volume = 0;
        this.mute = true;
        this.mediaState = 0;
        this.inputIdentifier = 1;
        this.reference = '';

        this.sensorScreenSaverState = false;
        this.sensorInputState = false;

        const postFix = this.host.split('.').join('');
        this.authTokenFile = `${prefDir}/authToken_${postFix}`;
        this.devInfoFile = `${prefDir}/devInfo_${postFix}`;
        this.inputsFile = `${prefDir}/inputs_${postFix}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

        // Create files if it doesn't exist
        try {
            const files = [
                this.authTokenFile,
                this.devInfoFile,
                this.inputsFile,
                this.inputsNamesFile,
                this.inputsTargetVisibilityFile,
            ];

            files.forEach((file) => {
                if (!fs.existsSync(file)) {
                    fs.writeFileSync(file, '');
                }
            });
        } catch (error) {
            this.emit('error', `prepare files error: ${error}`);
        }

        //RESTFul server
        if (this.restFulEnabled) {
            this.restFul = new RestFul({
                port: this.restFulPort,
                debug: this.restFulDebug
            });

            this.restFul.on('connected', (message) => {
                this.emit('message', `${message}`);
                this.restFulConnected = true;
            })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                });
        }

        //MQTT client
        if (this.mqttEnabled) {
            this.mqtt = new Mqtt({
                host: this.mqttHost,
                port: this.mqttPort,
                clientId: this.mqttClientId,
                user: this.mqttUser,
                passwd: this.mqttPasswd,
                prefix: `${this.mqttPrefix}/${this.name}`,
                debug: this.mqttDebug
            });

            this.mqtt.on('connected', (message) => {
                this.emit('message', message);
                this.mqttConnected = true;
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };

        //web api client
        if (this.webApiControl) {
            this.xboxWebApi = new XboxWebApi({
                xboxLiveId: this.xboxLiveId,
                webApiClientId: this.webApiClientId,
                webApiClientSecret: this.webApiClientSecret,
                tokensFile: this.authTokenFile,
                debugLog: this.enableDebugMode
            });

            this.xboxWebApi.on('consoleStatus', (consoleStatusData, consoleType) => {
                //this.serialNumber = id;
                this.modelName = consoleType;
                //this.power = powerState;
                //this.mediaState = playbackState;

                const restFul = this.restFulConnected ? this.restFul.update('status', consoleStatusData) : false;
                const mqtt = this.mqttConnected ? this.mqtt.send('Status', consoleStatusData) : false;
            })
                .on('consolesList', (consolesList) => {
                    const restFul = this.restFulConnected ? this.restFul.update('consoleslist', consolesList) : false;
                    const mqtt = this.mqttConnected ? this.mqtt.send('Consoles List', consolesList) : false;
                })
                .on('appsList', async (appsArray) => {
                    try {
                        const apps = [...CONSTANTS.DefaultInputs, ...appsArray];
                        const stringifyApps = JSON.stringify(apps, null, 2)
                        await fsPromises.writeFile(this.inputsFile, stringifyApps);
                        const debug = this.enableDebugMode ? this.emit('debug', `Saved apps: ${stringifyApps}`) : false;

                        const restFul = this.restFulConnected ? this.restFul.update('apps', apps) : false;
                        const mqtt = this.mqttConnected ? this.mqtt.send('Apps', apps) : false;
                    } catch (error) {
                        this.emit('error', `save apps error: ${error}`);
                    };
                })
                .on('storageDevices', (storageDevices) => {
                    const restFul = this.restFulConnected ? this.restFul.update('storages', storageDevices) : false;
                    const mqtt = this.mqttConnected ? this.mqtt.send('Storages', storageDevices) : false;
                })
                .on('userProfile', (profileUsers) => {
                    const restFul = this.restFulConnected ? this.restFul.update('profile', profileUsers) : false;
                    const mqtt = this.mqttConnected ? this.mqtt.send('Profile', profileUsers) : false;
                })
                .on('powerOnError', (power) => {
                    if (this.televisionService) {
                        this.televisionService
                            .updateCharacteristic(Characteristic.Active, power)
                    };
                    this.power = power;
                })
                .on('message', (message) => {
                    this.emit('message', message);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };

        //xbox local client
        this.xboxLocalApi = new XboxLocalApi({
            host: this.host,
            xboxLiveId: this.xboxLiveId,
            infoLog: this.disableLogInfo,
            tokensFile: this.authTokenFile,
            debugLog: this.enableDebugMode
        });

        this.xboxLocalApi.on('connected', (message) => {
            this.emit('message', message);
        })
            .on('deviceInfo', async (firmwareRevision, locale) => {
                try {
                    if (!this.disableLogDeviceInfo) {
                        this.emit('devInfo', `-------- ${this.name} --------'`);
                        this.emit('devInfo', `Manufacturer: Microsoft`);
                        this.emit('devInfo', `Model: ${this.modelName ?? 'Xbox'}`);
                        this.emit('devInfo', `Serialnr: ${this.xboxLiveId}`);
                        this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                        this.emit('devInfo', `Locale: ${locale}`);
                        this.emit('devInfo', `----------------------------------`);
                    }

                    const data = await fsPromises.readFile(this.devInfoFile);
                    const savedInfo = data.length > 5 ? JSON.parse(data) : {};
                    const infoHasNotchanged =
                        'Microsoft' === savedInfo.manufacturer
                        && this.modelName === savedInfo.modelName
                        && firmwareRevision === savedInfo.firmwareRevision
                        && locale === savedInfo.locale;

                    if (infoHasNotchanged) {
                        return;
                    };

                    if (this.informationService) {
                        this.informationService
                            .setCharacteristic(Characteristic.Manufacturer, 'Microsoft')
                            .setCharacteristic(Characteristic.Model, this.modelName ?? 'Xbox')
                            .setCharacteristic(Characteristic.SerialNumber, this.xboxLiveId)
                            .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
                    };

                    const obj = {
                        manufacturer: 'Microsoft',
                        modelName: this.modelName,
                        serialNumber: this.xboxLiveId,
                        firmwareRevision: firmwareRevision,
                        locale: locale
                    };
                    const devInfo = JSON.stringify(obj, null, 2);
                    await fsPromises.writeFile(this.devInfoFile, devInfo);
                    const debug = this.enableDebugMode ? this.emit('debug', `Saved device info: ${devInfo}`) : false;
                } catch (error) {
                    this.emit('error', `save device info error: ${error}`);
                }
            })
            .on('stateChanged', (power, volume, mute, mediaState, titleId, reference) => {
                const indexR = this.inputsConfigured.findIndex(input => input.reference === reference) ?? -1;
                const indexT = this.inputsConfigured.findIndex(input => input.titleId === titleId) ?? this.inputIdentifier;
                const inputIdentifier = indexR !== -1 ? indexR : indexT;

                //update characteristics
                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power)
                };

                if (this.televisionService && inputIdentifier !== -1) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
                };

                if (this.speakerService) {
                    this.speakerService
                        .updateCharacteristic(Characteristic.Volume, volume)
                        .updateCharacteristic(Characteristic.Mute, mute);
                    if (this.volumeService) {
                        this.volumeService
                            .updateCharacteristic(Characteristic.Brightness, volume)
                            .updateCharacteristic(Characteristic.On, !mute);
                    };
                    if (this.volumeServiceFan) {
                        this.volumeServiceFan
                            .updateCharacteristic(Characteristic.RotationSpeed, volume)
                            .updateCharacteristic(Characteristic.On, !mute);
                    };
                };

                if (this.sensorPowerService) {
                    this.sensorPowerService
                        .updateCharacteristic(Characteristic.ContactSensorState, power)
                }

                if (this.sensorInputService && inputIdentifier !== -1) {
                    const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                }

                if (reference !== undefined) {
                    this.reference = reference;

                    if (this.sensorScreenSaverService) {
                        const state = power ? (reference === 'Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application') : false;
                        this.sensorScreenSaverService
                            .updateCharacteristic(Characteristic.ContactSensorState, state)
                        this.sensorScreenSaverState = state;
                    }

                    if (this.sensorsInputsServices) {
                        const servicesCount = this.sensorsInputsServices.length;
                        for (let i = 0; i < servicesCount; i++) {
                            const state = power ? (this.sensorInputs[i].reference === reference) : false;
                            const displayType = this.sensorInputs[i].displayType;
                            const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                            this.sensorsInputsServices[i]
                                .updateCharacteristic(characteristicType, state);
                        }
                    }
                }

                this.inputIdentifier = inputIdentifier;
                this.power = power;
                this.volume = volume;
                this.mute = mute;
                this.mediaState = mediaState;

                const obj = {
                    'power': power,
                    'titleId': titleId,
                    'app': reference,
                    'volume': volume,
                    'mute': mute,
                    'mediaState': mediaState,
                };
                const restFul = this.restFulConnected ? this.restFul.update('state', obj) : false;
                const mqtt = this.mqttConnected ? this.mqtt.send('State', obj) : false;
            })
            .on('prepareAccessory', async () => {
                try {

                    //read dev info from file
                    try {
                        const data = await fsPromises.readFile(this.devInfoFile);
                        this.savedInfo = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Info: ${JSON.stringify(this.savedInfo, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Info error: ${error}`);
                    };

                    //read inputs file
                    try {
                        const data = await fsPromises.readFile(this.inputsFile);
                        this.savedInputs = data.length > 0 ? JSON.parse(data) : this.inputs;
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(this.savedInputs, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Inputs error: ${error}`);
                    };

                    //read inputs names from file
                    try {
                        const data = await fsPromises.readFile(this.inputsNamesFile);
                        this.savedInputsNames = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs Names: ${JSON.stringify(this.savedInputsNames, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Inputs/Channels Names error: ${error}`);
                    };

                    //read inputs visibility from file
                    try {
                        const data = await fsPromises.readFile(this.inputsTargetVisibilityFile);
                        this.savedInputsTargetVisibility = data.length > 0 ? JSON.parse(data) : {};
                        const debug = this.enableDebugMode ? this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(this.savedInputsTargetVisibility, null, 2)}`) : false;
                    } catch (error) {
                        this.emit('error', `read saved Inputs/Channels Target Visibility error: ${error}`);
                    };

                    await new Promise(resolve => setTimeout(resolve, 2500));
                    const accessory = await this.prepareAccessory();
                    this.emit('publishAccessory', accessory)
                } catch (error) {
                    this.emit('error', `prepare accessory error: ${error}`);
                };
            })
            .on('message', (message) => {
                this.emit('message', message);
            })
            .on('debug', (debug) => {
                this.emit('debug', debug);
            })
            .on('error', (error) => {
                this.emit('error', error);
            })
            .on('disconnected', (message) => {
                this.emit('message', message);
            });
    }


    //Prepare accessory
    prepareAccessory() {
        return new Promise((resolve, reject) => {
            try {
                //prepare accessory
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
                const accessoryName = this.name;
                const accessoryUUID = UUID.generate(this.xboxLiveId);
                const accessoryCategory = Categories.TV_SET_TOP_BOX;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //Pinformation service
                this.informationService = accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.savedInfo.manufacturer ?? 'Microsoft')
                    .setCharacteristic(Characteristic.Model, this.savedInfo.modelName ?? 'Xbox')
                    .setCharacteristic(Characteristic.SerialNumber, this.savedInfo.serialNumber ?? this.xboxLiveId)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.savedInfo.firmwareRevision ?? 'Firmware Revision');
                this.allServices.push(this.informationService);

                //Prepare television service
                const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
                this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
                this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

                this.televisionService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        if (this.power == state) {
                            return;
                        }

                        try {
                            let channelName;
                            let command;

                            switch (this.webApiPowerOnOff) {
                                case true:
                                    switch (this.power) {
                                        case true: //off
                                            channelName = 'Power';
                                            command = 'TurnOff';
                                            break;
                                        case false: //on
                                            channelName = 'Power';
                                            command = 'WakeUp';
                                            break;
                                    }

                                    await this.xboxWebApi.send(channelName, command);
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

                            const logInfo = this.disableLogInfo ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Power, error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;
                        const index = this.inputsConfigured.findIndex(input => input.identifier === inputIdentifier);
                        const inputOneStoreProductId = this.inputsConfigured[index].oneStoreProductId;
                        const inputReference = this.inputsConfigured[index].reference;
                        const inputName = this.inputsConfigured[index].name;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Input: ${inputName}, Reference: ${inputReference}, Product Id: ${inputOneStoreProductId}`);
                        return inputIdentifier;
                    })
                    .onSet(async (activeIdentifier) => {
                        try {
                            const index = this.inputsConfigured.findIndex(input => input.identifier === activeIdentifier);
                            const inputOneStoreProductId = this.inputsConfigured[index].oneStoreProductId;
                            const inputReference = this.inputsConfigured[index].reference;
                            const inputName = this.inputsConfigured[index].name;

                            let channelName;
                            let command;
                            let payload;
                            switch (this.power) {
                                case false:
                                    await new Promise(resolve => setTimeout(resolve, 4000));
                                    const tryAgain = this.power ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, activeIdentifier) : false;
                                    break;
                                case true:
                                    switch (inputOneStoreProductId) {
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
                                            payload = [{ 'oneStoreProductId': inputOneStoreProductId }];
                                            break;
                                    }

                                    await this.xboxWebApi.send(channelName, command, payload);
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `set Input: ${inputName}, Reference: ${inputReference}, Product Id: ${inputOneStoreProductId}`);
                                    break;
                            }
                        } catch (error) {
                            this.emit('error', `set Input error: ${JSON.stringify(error, null, 2)}`);
                        };
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
                            };

                            await this.xboxWebApi.send(channelName, 'InjectKey', [{ 'keyType': command }]);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `Remote Key: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Remote Key error: ${JSON.stringify(error, null, 2)}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                    .onGet(async () => {
                        //apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                        //xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
                        const value = [2, 0, 1, 3, 4][this.mediaState];
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Current Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        return value;
                    });

                this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                    .onGet(async () => {
                        //0 - PLAY, 1 - PAUSE, 2 - STOP
                        const value = [2, 0, 1, 3, 4][this.mediaState];
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            const newMediaState = value;
                            const setMediaState = this.power ? false : false;
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `set Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        } catch (error) {
                            this.emit('error', `set Target Media error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                    .onSet(async (powerModeSelection) => {
                        try {
                            let channelName;
                            let command;
                            switch (powerModeSelection) {
                                case 0: //SHOW
                                    channelName = 'Shell';
                                    command = 'nexus';
                                    break;
                                case 1: //HIDE
                                    channelName = 'Shell';
                                    command = 'b';
                                    break;
                            };

                            await this.xboxWebApi.send(channelName, 'InjectKey', [{ 'keyType': command }]);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `set Power Mode Selection: ${powerModeSelection === 0 ? 'SHOW' : 'HIDE'}`);
                        } catch (error) {
                            this.emit('error', `set Power Mode Selection error: ${error}`);
                        };
                    });

                this.allServices.push(this.televisionService);
                accessory.addService(this.televisionService);

                //Prepare speaker service
                const debug2 = !this.enableDebugMode ? false : this.emit('debug', `Prepare speaker service`);
                this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
                this.speakerService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        return state;
                    })
                    .onSet(async (state) => {
                    });

                this.speakerService.getCharacteristic(Characteristic.VolumeControlType)
                    .onGet(async () => {
                        const state = 3; //none, relative, relative with current, absolute
                        return state;
                    });

                this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
                    .onSet(async (volumeSelector) => {
                        try {
                            let channelName;
                            let command;
                            switch (volumeSelector) {
                                case 0: //Up
                                    channelName = 'Volume';
                                    command = 'Up';
                                    break;
                                case 1: //Down
                                    channelName = 'Volume';
                                    command = 'Down';
                                    break;
                            }

                            await this.xboxWebApi.send(channelName, command);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `set Volume Selector: ${volumeSelector ? 'Down' : 'UP'}`);
                        } catch (error) {
                            this.emit('error', `set Volume Selector error: ${error}`);
                        };
                    })

                this.speakerService.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Volume: ${volume}`);
                        return volume;
                    })
                    .onSet(async (volume) => {
                        if (volume === 0 || volume === 100) {
                            volume = this.volume;
                        };
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `set Volume: ${volume}`);
                    });

                this.speakerService.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Mute: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            let channelName;
                            let command;
                            switch (volumeSelector) {
                                case 0: //Mute
                                    channelName = 'Audio';
                                    command = 'Mute';
                                    break;
                                case 1: //Unmute
                                    channelName = 'Audio';
                                    command = 'Unmute';
                                    break;
                            }

                            await this.xboxWebApi.send(channelName, command);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Mute error: ${error}`);
                        };
                    });

                this.allServices.push(this.speakerService);
                accessory.addService(this.speakerService);

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
                    input.identifier = i + 1;

                    //get input reference
                    const inputReference = input.reference || input.titleId || input.oneStoreProductId;

                    //get input name
                    const name = input.name ?? 'App/Input';
                    const savedInputsNames = this.savedInputsNames[inputReference] ?? false;
                    const inputName = !savedInputsNames ? name : savedInputsNames;
                    input.name = inputName;

                    //get visibility
                    const currentVisibility = this.savedInputsTargetVisibility[inputReference] ?? 0;
                    input.visibility = currentVisibility;

                    this.inputsConfigured.push(input);
                }

                //sort inputs list
                switch (this.inputsDisplayOrder) {
                    case 0:
                        this.inputsConfigured = this.inputsConfigured;
                        break;
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
                }

                for (const input of this.inputsConfigured) {
                    //get identifier
                    const inputIdentifier = input.identifier;

                    //get input name
                    const inputName = input.name;

                    //get input reference
                    const inputReference = input.reference;

                    //get input type
                    const inputType = 0;

                    //get input configured
                    const isConfigured = 1;

                    //get input visibility state
                    const currentVisibility = input.visibility;
                    const targetVisibility = currentVisibility;

                    if (inputReference && inputName) {
                        const inputService = new Service.InputSource(`${inputName} ${inputIdentifier}`, `Input ${inputIdentifier}`);
                        inputService
                            .setCharacteristic(Characteristic.Identifier, inputIdentifier)
                            .setCharacteristic(Characteristic.Name, inputName)
                            .setCharacteristic(Characteristic.InputSourceType, inputType)
                            .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                            .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                        inputService.getCharacteristic(Characteristic.ConfiguredName)
                            .onGet(async () => {
                                return inputName;
                            })
                            .onSet(async (value) => {
                                if (value === inputName) {
                                    return;
                                }

                                try {
                                    this.savedInputsNames[inputReference] = value;
                                    await fsPromises.writeFile(this.inputsNamesFile, JSON.stringify(this.savedInputsNames, null, 2));
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input Name: ${value}, Reference: ${nameIdentifier}.`) : false;
                                    inputService.updateCharacteristic(Characteristic.Name, value);
                                } catch (error) {
                                    this.emit('error', `save Input Name error: ${error}`);
                                }
                            });

                        inputService.getCharacteristic(Characteristic.TargetVisibilityState)
                            .onGet(async () => {
                                return targetVisibility;
                            })
                            .onSet(async (state) => {
                                if (state === targetVisibility) {
                                    return;
                                }

                                try {
                                    this.savedInputsTargetVisibility[inputReference] = state;
                                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, JSON.stringify(this.savedInputsTargetVisibility, null, 2));
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input: ${inputName} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                    inputService.updateCharacteristic(Characteristic.CurrentVisibilityState, state);
                                } catch (error) {
                                    this.emit('error', `save Target Visibility error: ${error}`);
                                }
                            });

                        this.televisionService.addLinkedService(inputService);
                        this.allServices.push(inputService);
                        accessory.addService(inputService);
                    } else {
                        this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);

                    };
                }

                //sort inputs list
                const displayOrder = this.inputsConfigured.map(input => input.identifier);
                this.televisionService.setCharacteristic(Characteristic.DisplayOrder, Encode(1, displayOrder).toString('base64'));

                //Prepare volume service
                if (this.volumeControl >= 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare volume service`);
                    if (this.volumeControl === 0) {
                        this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
                        this.volumeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeService.getCharacteristic(Characteristic.Brightness)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                this.speakerService.setCharacteristic(Characteristic.Volume, volume);
                            });
                        this.volumeService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = !this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.speakerService.setCharacteristic(Characteristic.Mute, !state);
                            });

                        this.allServices.push(this.volumeService);
                        accessory.addService(this.volumeService);
                    }

                    if (this.volumeControl === 1) {
                        this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
                        this.volumeServiceFan.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.volumeServiceFan.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Volume`);
                        this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
                            .onGet(async () => {
                                const volume = this.volume;
                                return volume;
                            })
                            .onSet(async (volume) => {
                                this.speakerService.setCharacteristic(Characteristic.Volume, volume);
                            });
                        this.volumeServiceFan.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = !this.mute;
                                return state;
                            })
                            .onSet(async (state) => {
                                this.speakerService.setCharacteristic(Characteristic.Mute, !state);
                            });

                        this.allServices.push(this.volumeServiceFan);
                        accessory.addService(this.volumeServiceFan);
                    }
                }

                //prepare sensor service
                if (this.sensorPower) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare power sensor service`);
                    this.sensorPowerService = new Service.ContactSensor(`${accessoryName} Power Sensor`, `Power Sensor`);
                    this.sensorPowerService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorPowerService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Power Sensor`);
                    this.sensorPowerService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power;
                            return state;
                        });

                    this.allServices.push(this.sensorPowerService);
                    accessory.addService(this.sensorPowerService);
                };

                if (this.sensorInput) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare input sensor service`);
                    this.sensorInputService = new Service.ContactSensor(`${accessoryName} Input Sensor`, `Input Sensor`);
                    this.sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Input Sensor`);
                    this.sensorInputService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.sensorInputState : false;
                            return state;
                        });

                    this.allServices.push(this.sensorInputService);
                    accessory.addService(this.sensorInputService);
                };

                if (this.sensorScreenSaver) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare screen saver sensor service`);
                    this.sensorScreenSaverService = new Service.ContactSensor(`${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
                    this.sensorScreenSaverService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.sensorScreenSaverService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Screen Saver Sensor`);
                    this.sensorScreenSaverService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = this.power ? this.sensorScreenSaverState : false;
                            return state;
                        });

                    this.allServices.push(this.sensorScreenSaverService);
                    accessory.addService(this.sensorScreenSaverService);
                };

                //prepare sonsor service
                const sensorInputs = this.sensorInputs;
                const sensorInputsCount = sensorInputs.length;
                const possibleSensorInputsCount = 99 - this.allServices.length;
                const maxSensorInputsCount = sensorInputsCount >= possibleSensorInputsCount ? possibleSensorInputsCount : sensorInputsCount;
                if (maxSensorInputsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare inputs sensor service`);
                    for (let i = 0; i < maxSensorInputsCount; i++) {
                        //get sensor
                        const sensorInput = sensorInputs[i];

                        //get sensor name		
                        const sensorInputName = sensorInput.name;

                        //get sensor reference
                        const sensorInputReference = sensorInput.reference;

                        //get sensor display type
                        const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

                        //get sensor name prefix
                        const namePrefix = sensorInput.namePrefix ?? false;

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const name = namePrefix ? `${accessoryName} ${sensorInputName}` : sensorInputName;
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, name);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (this.reference === sensorInputReference) : false;
                                        return state;
                                    });

                                this.sensorInputs.push(sensorInput);
                                this.sensorsInputsServices.push(sensorInputService);
                                this.allServices.push(sensorInputService);
                                accessory.addService(this.sensorsInputsServices[i]);
                            } else {
                                this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //Prepare buttons services
                const buttons = this.buttons;
                const buttonsCount = buttons.length;
                const possibleButtonsCount = 99 - this.allServices.length;
                const maxButtonsCount = buttonsCount >= possibleButtonsCount ? possibleButtonsCount : buttonsCount;
                if (maxButtonsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare buttons service`);
                    for (let i = 0; i < maxButtonsCount; i++) {
                        //get button
                        const button = buttons[i];

                        //get button name
                        const buttonName = button.name;

                        //get button command
                        const buttonCommand = button.command;

                        //get button mode
                        let mode;
                        if (buttonCommand in CONSTANTS.LocalApi.Channels.System.Media.Commands) {
                            mode = 0;
                        } else if (buttonCommand in CONSTANTS.LocalApi.Channels.System.Input.Commands) {
                            mode = 1;
                        } else if (buttonCommand in CONSTANTS.LocalApi.Channels.System.TvRemote.Commands) {
                            mode = 2;
                        } else if (buttonCommand === 'recordGameDvr') {
                            mode = 3;
                        } else if (buttonCommand === 'reboot') {
                            mode = 4;
                        } else if (buttonCommand === 'switchAppGame') {
                            mode = 5;
                        };
                        const buttonMode = mode >= 0 ? mode : -1;

                        //get button inputOneStoreProductId
                        const buttonOneStoreProductId = button.oneStoreProductId;

                        //get button display type
                        const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

                        //get button name prefix
                        const namePrefix = button.namePrefix ?? false;

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonCommand && buttonMode) {
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const name = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                                const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, name);
                                buttonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = false;
                                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Button state: ${state}`);
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        if (state) {
                                            try {
                                                let channelName;
                                                let command;
                                                let payload;

                                                switch (buttonMode) {
                                                    case 0: case 1: case 2:
                                                        channelName = 'Shell';
                                                        command = 'InjectKey';
                                                        payload = [{ 'keyType': buttonCommand }];
                                                        break;
                                                    case 3:
                                                        channelName = 'TV';
                                                        command = 'ShowGuide';
                                                        await this.xboxLocalApi.recordGameDvr();
                                                        break;
                                                    case 4:
                                                        channelName = 'Power';
                                                        command = 'Reboot';
                                                        break;
                                                    case 5:
                                                        switch (buttonOneStoreProductId) {
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
                                                            case 'Not set': case 'Web api disabled':
                                                                this.emit('message', `trying to launch App/Game with one store product id: ${buttonOneStoreProductId}.`);
                                                                break;
                                                            default:
                                                                channelName = 'Shell';
                                                                command = 'ActivateApplicationWithOneStoreProductId';
                                                                payload = [{ 'oneStoreProductId': buttonOneStoreProductId }];
                                                                break;
                                                        }
                                                        break;
                                                }

                                                const send = buttonMode !== 3 ? await this.xboxWebApi.send(channelName, command, payload) : false;
                                                const logInfo = this.disableLogInfo ? false : this.emit('message', `set Button Name:  ${buttonName}, Command: ${buttonCommand}`);
                                            } catch (error) {
                                                this.emit('error', `set Button error: ${error}`);
                                            };
                                            await new Promise(resolve => setTimeout(resolve, 350));
                                            buttonService.updateCharacteristic(Characteristic.On, false);
                                        }
                                    });
                                this.buttonsServices.push(buttonService);
                                this.allServices.push(buttonService);
                                accessory.addService(this.buttonsServices[i]);
                            } else {
                                this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, Command: ${buttonCommand ? buttonCommand : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}.`);
                            };
                        }
                    }
                }

                resolve(accessory);
            } catch (error) {
                reject(error)
            };
        });
    }
};
module.exports = XboxDevice;