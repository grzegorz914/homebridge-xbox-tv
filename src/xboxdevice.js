"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const XboxWebApi = require('./webApi/xboxwebapi.js');
const XboxLocalApi = require('./localApi/xboxlocalapi.js');
const CONSTANTS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, UUID;

class XboxDevice extends EventEmitter {
    constructor(api, prefDir, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
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
        this.xboxLiveUser = config.xboxLiveUser;
        this.xboxLivePasswd = config.xboxLivePasswd;
        this.xboxWebApiToken = config.xboxWebApiToken;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
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
        this.mqttPrefix = config.mqttPrefix;
        this.mqttAuth = config.mqttAuth || false;
        this.mqttUser = config.mqttUser;
        this.mqttPasswd = config.mqttPasswd;

        //add configured inputs to the default inputs
        this.inputs = [...CONSTANTS.DefaultInputs, ...this.inputs];

        //device
        this.manufacturer = 'Microsoft';
        this.modelName = 'Model Name';
        this.serialNumber = this.xboxLiveId;
        this.firmwareRevision = 'Firmware Revision';

        //setup variables
        this.firstRun = true;
        this.restFulConnected = false;
        this.mqttConnected = false;

        this.services = [];
        this.inputsName = [];
        this.inputsReference = [];
        this.inputsOneStoreProductId = [];

        this.sensorInputsServices = [];
        this.sensorInputsReference = [];
        this.sensorInputsDisplayType = [];
        this.buttonsServices = [];


        this.power = false;
        this.volume = 0;
        this.mute = true;
        this.mediaState = 0;
        this.inputIdentifier = 0;
        this.reference = '';

        this.sensorScreenSaverState = false;
        this.sensorInputState = false;

        this.authTokenFile = `${prefDir}/authToken_${this.host.split('.').join('')}`;
        this.inputsFile = `${prefDir}/inputs_${this.host.split('.').join('')}`;
        this.inputsNamesFile = `${prefDir}/inputsNames_${this.host.split('.').join('')}`;
        this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;

        // Create files if it doesn't exist
        const object = JSON.stringify({});
        const array = JSON.stringify([]);
        const tokens = JSON.stringify({
            oauth: {},
            user: {},
            xsts: {}
        }, null, 2);

        if (!fs.existsSync(this.authTokenFile)) {
            fs.writeFileSync(this.authTokenFile, tokens);
        }
        if (!fs.existsSync(this.inputsFile)) {
            fs.writeFileSync(this.inputsFile, array);
        }
        if (!fs.existsSync(this.inputsNamesFile)) {
            fs.writeFileSync(this.inputsNamesFile, object);
        }
        if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
            fs.writeFileSync(this.inputsTargetVisibilityFile, object);
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
                prefix: `${this.mqttPrefix}/${this.name}`,
                auth: this.mqttAuth,
                user: this.mqttUser,
                passwd: this.mqttPasswd,
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
                xboxLiveUser: this.xboxLiveUser,
                xboxLivePasswd: this.xboxLivePasswd,
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                tokensFile: this.authTokenFile,
                debugLog: this.enableDebugMode
            });

            this.xboxWebApi.on('consoleStatus', (consoleStatusData, consoleType) => {
                if (this.informationService) {
                    this.informationService
                        .setCharacteristic(Characteristic.Model, consoleType)
                };

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
            .on('deviceInfo', (firmwareRevision, locale) => {
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `-------- ${this.name} --------'`);
                    this.emit('devInfo', `Manufacturer: ${this.manufacturer}`);
                    this.emit('devInfo', `Model: ${this.modelName}`);
                    this.emit('devInfo', `Serialnr: ${this.serialNumber}`);
                    this.emit('devInfo', `Firmware: ${firmwareRevision}`);
                    this.emit('devInfo', `Locale: ${locale}`);
                    this.emit('devInfo', `----------------------------------`);
                }

                if (this.informationService) {
                    this.informationService
                        .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                        .setCharacteristic(Characteristic.Model, this.modelName)
                        .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                        .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
                };

                this.firmwareRevision = firmwareRevision;
            })
            .on('stateChanged', (power, volume, mute, mediaState, titleId, reference) => {
                const inputIdentifier = this.inputsReference.includes(reference) ? this.inputsReference.findIndex(index => index === reference) : this.inputsReference.includes(titleId) ? this.inputsReference.findIndex(index => index === titleId) : this.inputIdentifier;

                //update characteristics
                if (this.televisionService) {
                    this.televisionService
                        .updateCharacteristic(Characteristic.Active, power)
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

                if (this.sensorInputService) {
                    const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
                    this.sensorInputService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorInputState = state;
                }

                if (this.sensorScreenSaverService) {
                    const state = power ? (reference === 'Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application') : false;
                    this.sensorScreenSaverService
                        .updateCharacteristic(Characteristic.ContactSensorState, state)
                    this.sensorScreenSaverState = state;
                }

                if (this.sensorInputsServices) {
                    const servicesCount = this.sensorInputsServices.length;
                    for (let i = 0; i < servicesCount; i++) {
                        const state = power ? (this.sensorInputsReference[i] === reference) : false;
                        const displayType = this.sensorInputsDisplayType[i];
                        const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                        this.sensorInputsServices[i]
                            .updateCharacteristic(characteristicType, state);
                    }
                }

                this.firstRun = false;
                this.power = power;
                this.volume = volume;
                this.mute = mute;
                this.mediaState = mediaState;
                this.reference = reference;
                this.inputIdentifier = inputIdentifier;

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

        this.start();
    }

    async start() {
        try {
            await new Promise(resolve => setTimeout(resolve, 2500));
            const accessory = await this.prepareAccessory();
            this.emit('publishAccessory', accessory);
        } catch (error) {
            this.emit('error', `prepare accessory error: ${error}`);
        };
    };


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
                    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                    .setCharacteristic(Characteristic.Model, this.modelName)
                    .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
                this.services.push(this.informationService);

                //Prepare television service
                const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare television service`);
                this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
                this.televisionService.getCharacteristic(Characteristic.ConfiguredName)
                    .onGet(async () => {
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Accessory Nane: ${accessoryName}.`);
                        return accessoryName;
                    })
                    .onSet(async (value) => {
                        try {
                            this.name = value;
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Accessory Name: ${value}`);
                        } catch (error) {
                            this.emit('error', `set Accessory Name error: ${error}`);
                        };
                    });
                this.televisionService.getCharacteristic(Characteristic.SleepDiscoveryMode)
                    .onGet(async () => {
                        const state = 1;
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Discovery Mode: ${state ? 'Always Discoverable' : 'Not Discoverable'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Discovery Mode: ${state ? 'Always Discoverable' : 'Not Discoverable'}`);
                        } catch (error) {
                            this.emit('error', `set Discovery Mode error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.power;
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            switch (this.webApiPowerOnOff) {
                                case true:
                                    switch (state) {
                                        case 0: //off
                                            const powerOff = this.power ? await this.xboxWebApi.powerOff() : false;
                                            break;
                                        case 1: //on
                                            const powerOn = !this.power ? await this.xboxWebApi.powerOn() : false;
                                            break;
                                    }
                                    break;
                                case false:
                                    switch (state) {
                                        case 0: //off
                                            const powerOff = this.power ? await this.xboxLocalApi.powerOff() : false;
                                            break;
                                        case 1: //on
                                            const powerOn = !this.power ? await this.xboxLocalApi.powerOn() : false;
                                            break;
                                    }
                            }
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Power: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Power, error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
                    .onGet(async () => {
                        const inputIdentifier = this.inputIdentifier;
                        const inputName = this.inputsName[inputIdentifier];
                        const inputReference = this.inputsReference[inputIdentifier];
                        const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Input: ${inputName}, Reference: ${inputReference}, Product Id: ${inputOneStoreProductId}`);
                        return inputIdentifier;
                    })
                    .onSet(async (inputIdentifier) => {
                        try {
                            const inputName = this.inputsName[inputIdentifier];
                            const inputReference = this.inputsReference[inputIdentifier];
                            const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];

                            switch (inputOneStoreProductId) {
                                case 'Dashboard': case 'Settings': case 'SettingsTv': case 'Accessory': case 'Screensaver': case 'NetworkTroubleshooter': case 'MicrosoftStore':
                                    await this.xboxWebApi.goHome();
                                    break;
                                case 'Television':
                                    await this.xboxWebApi.showTVGuide();
                                    break;
                                case 'XboxGuide':
                                    await this.xboxWebApi.showGuideTab();
                                    break;
                                default:
                                    await this.xboxWebApi.launchApp(inputOneStoreProductId);
                                    break;
                            }
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Input: ${inputName}, Reference: ${inputReference}, Product Id: ${inputOneStoreProductId}`);
                        } catch (error) {
                            this.emit('error', `set Input error: ${JSON.stringify(error, null, 2)}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.RemoteKey)
                    .onSet(async (remoteKey) => {
                        try {
                            let command;
                            switch (remoteKey) {
                                case 0: //REWIND
                                    command = 'rewind';
                                    break;
                                case 1: //FAST_FORWARD
                                    command = 'fastForward';
                                    break;
                                case 2: //NEXT_TRACK
                                    command = 'nextTrack';
                                    break;
                                case 3: //PREVIOUS_TRACK
                                    command = 'prevTrack';
                                    break;
                                case 4: //ARROW_UP
                                    command = 'up';
                                    break;
                                case 5: //ARROW_DOWN
                                    command = 'down';
                                    break;
                                case 6: //ARROW_LEFT
                                    command = 'left';
                                    break;
                                case 7: //ARROW_RIGHT
                                    command = 'right';
                                    break;
                                case 8: //SELECT
                                    command = 'a';
                                    break;
                                case 9: //BACK
                                    command = 'b';
                                    break;
                                case 10: //EXIT
                                    command = 'nexus';
                                    break;
                                case 11: //PLAY_PAUSE
                                    command = 'playPause';
                                    break;
                                case 15: //INFORMATION
                                    command = this.infoButtonCommand;
                                    break;
                            };

                            let channelId = command === 'playPause' ? 0 : 1;
                            channelId = CONSTANTS.Channels[channelId].ChannelId;
                            const sendRcCommand = this.webApiRcControl ? await this.xboxWebApi.sendButtonPress(command) : await this.xboxLocalApi.sendButtonPress(channelId, command);
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Remote Key: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Remote Key error: ${JSON.stringify(error, null, 2)}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
                    .onGet(async () => {
                        //apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
                        //xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
                        const value = [2, 0, 1, 3, 4][this.mediaState];
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Current Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        return value;
                    });

                this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
                    .onGet(async () => {
                        //0 - PLAY, 1 - PAUSE, 2 - STOP
                        const value = [2, 0, 1, 3, 4][this.mediaState];
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            const newMediaState = value;
                            const setMediaState = this.power ? false : false;
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
                        } catch (error) {
                            this.emit('error', `set Target Media error: ${error}`);
                        };
                    });

                this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
                    .onSet(async (powerModeSelection) => {
                        try {
                            let command;
                            switch (powerModeSelection) {
                                case 0: //SHOW
                                    command = 'nexus';
                                    break;
                                case 1: //HIDE
                                    command = 'b';
                                    break;
                            };

                            const channelId = CONSTANTS.Channels[1].ChannelId;
                            const sendRcCommand = this.webApiRcControl ? await this.xboxWebApi.sendButtonPress(command) : await this.xboxLocalApi.sendButtonPress(channelId, command);
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Power Mode Selection: ${command === 'nexus' ? 'SHOW' : 'HIDE'}`);
                        } catch (error) {
                            this.emit('error', `set Power Mode Selection error: ${error}`);
                        };
                    });

                this.services.push(this.televisionService);
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
                            let command;
                            switch (volumeSelector) {
                                case 0: //INCREMENT
                                    command = 'volUp';
                                    break;
                                case 1: //DECREMENT
                                    command = 'volDown';
                                    break;
                            };

                            const channelId = CONSTANTS.Channels[2].ChannelId;
                            const sendRcCommand = this.webApiVolumeControl ? await this.xboxWebApi.sendButtonPress(command) : await this.xboxLocalApi.sendButtonPress(channelId, command);
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Volume Selector: ${command}`);
                        } catch (error) {
                            this.emit('error', `set Volume Selector error: ${error}`);
                        };
                    })

                this.speakerService.getCharacteristic(Characteristic.Volume)
                    .onGet(async () => {
                        const volume = this.volume;
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `Volume: ${volume}`);
                        return volume;
                    })
                    .onSet(async (volume) => {
                        if (volume === 0 || volume === 100) {
                            volume = this.volume;
                        };
                        const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Volume: ${volume}`);
                    });

                this.speakerService.getCharacteristic(Characteristic.Mute)
                    .onGet(async () => {
                        const state = this.mute;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Mute: ${state ? 'ON' : 'OFF'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            switch (this.webApiVolumeControl) {
                                case true:
                                    switch (state) {
                                        case true: //mute
                                            const mute = this.power ? await this.xboxWebApi.mute() : false;
                                            break;
                                        case false: //unmute
                                            const unmute = this.power ? await this.xboxWebApi.unmute() : false;
                                            break;
                                    }
                                    break;
                                case false:
                                    const channelId = CONSTANTS.Channels[2].ChannelId;
                                    const toggleMute = this.power ? await this.xboxLocalApi.sendButtonPress(channelId, 'volMute') : false;
                                    break;
                            }
                            const logInfo = this.disableLogInfo || this.firstRun ? false : this.emit('message', `set Mute: ${state ? 'ON' : 'OFF'}`);
                        } catch (error) {
                            this.emit('error', `set Mute error: ${error}`);
                        };
                    });

                this.services.push(this.speakerService);
                accessory.addService(this.speakerService);

                //Prepare inputs services
                const debug3 = !this.enableDebugMode ? false : this.emit('debug', `Prepare input service`);

                const savedInputs = this.getInputsFromDevice ? fs.readFileSync(this.inputsFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsFile)) : this.inputs : this.inputs;
                const debug4 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs: ${JSON.stringify(savedInputs, null, 2)}`) : false;

                const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
                const debug5 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs Nnames: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

                const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
                const debug6 = this.enableDebugMode ? this.emit('debug', `Read saved Inputs Target Visibility: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

                //check possible inputs and filter custom unnecessary inputs
                const filteredInputsArr = [];
                for (const input of savedInputs) {
                    const contentType = input.contentType;
                    const filterGames = this.filterGames ? (contentType === 'Game') : false;
                    const filterApps = this.filterApps ? (contentType === 'App') : false;
                    const filterSystemApps = this.filterSystemApps ? (contentType === 'systemApp') : false;
                    const filterDlc = this.filterDlc ? (contentType === 'Dlc') : false;
                    const push = this.getInputsFromDevice ? ((!filterGames && !filterApps && !filterSystemApps && !filterDlc) ? filteredInputsArr.push(input) : false) : filteredInputsArr.push(input);
                }

                //check possible inputs and possible inputs count (max 80)
                const inputs = filteredInputsArr;
                const inputsCount = inputs.length;
                const possibleInputsCount = 90 - this.services.length;
                const maxInputsCount = inputsCount >= possibleInputsCount ? possibleInputsCount : inputsCount;
                for (let i = 0; i < maxInputsCount; i++) {
                    //get input 
                    const input = inputs[i];

                    //get input reference
                    const inputReference = input.reference || input.titleId;

                    //get input oneStoreProductId
                    const inputOneStoreProductId = input.oneStoreProductId;

                    //get input name
                    const inputName = savedInputsNames[inputReference] || savedInputsNames[inputOneStoreProductId] || input.name;

                    //get input type
                    const inputType = 0;

                    //get input configured
                    const isConfigured = 1;

                    //get input visibility state
                    const currentVisibility = savedInputsTargetVisibility[inputReference] || savedInputsTargetVisibility[inputOneStoreProductId] || 0;

                    if (inputReference && inputName) {
                        const inputService = new Service.InputSource(inputName, `Input ${i}`);
                        inputService
                            .setCharacteristic(Characteristic.Identifier, i)
                            .setCharacteristic(Characteristic.Name, inputName)
                            .setCharacteristic(Characteristic.InputSourceType, inputType)
                            .setCharacteristic(Characteristic.IsConfigured, isConfigured)
                            .setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)

                        inputService.getCharacteristic(Characteristic.ConfiguredName)
                            .onGet(async () => {
                                return inputName;
                            })
                            .onSet(async (value) => {
                                try {
                                    const nameIdentifier = inputReference || inputOneStoreProductId;
                                    savedInputsNames[nameIdentifier] = value;

                                    const newCustomName = JSON.stringify(savedInputsNames, null, 2);
                                    await fsPromises.writeFile(this.inputsNamesFile, newCustomName);
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input Name: ${value}, Reference: ${nameIdentifier}.`) : false;
                                    inputService.setCharacteristic(Characteristic.Name, value);
                                } catch (error) {
                                    this.emit('error', `save Input Name error: ${error}`);
                                }
                            });

                        inputService
                            .getCharacteristic(Characteristic.TargetVisibilityState)
                            .onGet(async () => {
                                return currentVisibility;
                            })
                            .onSet(async (state) => {
                                try {
                                    const targetVisibilityIdentifier = inputReference || inputOneStoreProductId;
                                    savedInputsTargetVisibility[targetVisibilityIdentifier] = state;

                                    const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);
                                    await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility);
                                    const debug = this.enableDebugMode ? this.emit('debug', `Saved Input: ${inputName} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
                                    inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
                                } catch (error) {
                                    this.emit('error', `save Target Visibility error: ${error}`);
                                }
                            });

                        this.inputsReference.push(inputReference);
                        this.inputsOneStoreProductId.push(inputOneStoreProductId);
                        this.inputsName.push(inputName);

                        this.televisionService.addLinkedService(inputService);
                        this.services.push(inputService);
                        accessory.addService(inputService);
                    } else {
                        this.emit('message', `Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);

                    };
                }

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

                        this.services.push(this.volumeService);
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

                        this.services.push(this.volumeServiceFan);
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

                    this.services.push(this.sensorPowerService);
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

                    this.services.push(this.sensorInputService);
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

                    this.services.push(this.sensorScreenSaverService);
                    accessory.addService(this.sensorScreenSaverService);
                };

                //prepare sonsor service
                const sensorInputs = this.sensorInputs;
                const sensorInputsCount = sensorInputs.length;
                const possibleSensorInputsCount = 99 - this.services.length;
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

                        if (sensorInputDisplayType >= 0) {
                            if (sensorInputName && sensorInputReference) {
                                const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
                                const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
                                const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
                                sensorInputService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                sensorInputService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${sensorInputName}`);
                                sensorInputService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = this.power ? (this.reference === sensorInputReference) : false;
                                        return state;
                                    });

                                this.sensorInputsReference.push(sensorInputReference);
                                this.sensorInputsDisplayType.push(sensorInputDisplayType);
                                this.sensorInputsServices.push(sensorInputService);
                                this.services.push(sensorInputService);
                                accessory.addService(this.sensorInputsServices[i]);
                            } else {
                                this.emit('message', `Sensor Name: ${sensorInputName ? sensorInputName : 'Missing'}, Reference: ${sensorInputReference ? sensorInputReference : 'Missing'}.`);
                            };
                        }
                    }
                }

                //Prepare buttons services
                const buttons = this.buttons;
                const buttonsCount = buttons.length;
                const possibleButtonsCount = 99 - this.services.length;
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
                        if (buttonCommand in CONSTANTS.SystemMediaCommands) {
                            mode = 0;
                        } else if (buttonCommand in CONSTANTS.SystemInputCommands) {
                            mode = 1;
                        } else if (buttonCommand in CONSTANTS.TvRemoteCommands) {
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

                        if (buttonDisplayType >= 0) {
                            if (buttonName && buttonCommand && buttonMode) {
                                const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
                                const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${buttonName}`);
                                buttonService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = false;
                                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Button state: ${state}`);
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        if (state) {
                                            try {
                                                switch (buttonMode) {
                                                    case 0: case 1: case 2:
                                                        await this.xboxWebApi.sendButtonPress(buttonCommand);
                                                        break;
                                                    case 3:
                                                        await this.xboxLocalApi.recordGameDvr();
                                                        break;
                                                    case 4:
                                                        await this.xboxWebApi.reboot();
                                                        break;
                                                    case 5:
                                                        switch (buttonOneStoreProductId) {
                                                            case 'Dashboard': case 'Settings': case 'SettingsTv': case 'Accessory': case 'Screensaver': case 'NetworkTroubleshooter': case 'MicrosoftStore':
                                                                await this.xboxWebApi.goGome();
                                                                break;
                                                            case 'Television':
                                                                await this.xboxWebApi.showTVGuide();
                                                                break;
                                                            case 'XboxGuide':
                                                                await this.xboxWebApi.showGuideTab();
                                                                break;
                                                            case 'Not set': case 'Web api disabled':
                                                                this.emit('message', `trying to launch App/Game with one store product id: ${buttonOneStoreProductId}.`);
                                                                break;
                                                            default:
                                                                await this.xboxWebApi.launchApp(buttonOneStoreProductId);
                                                                break;
                                                        }
                                                        break;
                                                }
                                                const logInfo = this.disableLogInfo ? false : this.emit('message', `set Button Name:  ${buttonName}, Command: ${buttonCommand}`);
                                            } catch (error) {
                                                this.emit('error', `set Button error: ${error}`);
                                            };
                                            await new Promise(resolve => setTimeout(resolve, 350));
                                            buttonService.updateCharacteristic(Characteristic.On, false);
                                        }
                                    });
                                this.buttonsServices.push(buttonService);
                                this.services.push(buttonService);
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