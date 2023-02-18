'use strict';
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const XboxWebApi = require('./src/webApi/xboxwebapi.js');
const XboxLocalApi = require('./src/localApi/xboxlocalapi.js');
const Mqtt = require('./src/mqtt.js');
const CONSTANS = require('./src/constans.json');

const PLUGIN_NAME = 'homebridge-xbox-tv';
const PLATFORM_NAME = 'XboxTv';

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, XBOXPLATFORM, true);
};

class XBOXPLATFORM {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log(`No configuration found for ${PLUGIN_NAME}`);
			return;
		}
		this.log = log;
		this.api = api;
		this.accessories = [];
		const devices = config.devices;

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (const device of devices) {
				if (!device.name || !device.host || !device.xboxLiveId) {
					this.log.warn('Device Name, Host or Xbox Live ID Missing');
					return;
				}
				new XBOXDEVICE(this.log, this.api, device);
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
	}
}

class XBOXDEVICE {
	constructor(log, api, config) {
		this.log = log;
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.xboxLiveId = config.xboxLiveId;
		this.webApiControl = config.webApiControl || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
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
		this.xboxWebApiToken = config.xboxWebApiToken || '';
		this.clientId = config.clientId || '5e5ead27-ed60-482d-b3fc-702b28a97404';
		this.clientSecret = config.clientSecret || '';
		this.userToken = config.userToken || '';
		this.uhs = config.uhs || '';
		this.enableDebugMode = config.enableDebugMode || false;
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.infoButtonCommand = config.infoButtonCommand || 'nexus';
		this.volumeControl = config.volumeControl >= 0 ? config.volumeControl : -1;
		this.mqttEnabled = config.enableMqtt || false;
		this.mqttDebug = config.mqttDebug || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;

		//add configured inputs to the default inputs
		this.inputs = [...CONSTANS.DefaultInputs, ...this.inputs];

		//device
		this.manufacturer = 'Microsoft';
		this.modelName = 'Model Name';
		this.serialNumber = this.xboxLiveId;
		this.firmwareRevision = 'Firmware Revision';

		//setup variables
		this.firstRun = true;

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

		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.authTokenFile = `${this.prefDir}/authToken_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;

		//check if the directory or files exists, if not then create it
		const object = JSON.stringify({});
		const array = JSON.stringify([]);

		if (!fs.existsSync(this.prefDir)) {
			fs.mkdirSync(this.prefDir);
		}
		if (!fs.existsSync(this.authTokenFile)) {
			fs.writeFileSync(this.authTokenFile, object);
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

		//mqtt client
		if (this.mqttEnabled) {
			this.mqtt = new Mqtt({
				host: this.mqttHost,
				port: this.mqttPort,
				prefix: this.mqttPrefix,
				topic: this.name,
				auth: this.mqttAuth,
				user: this.mqttUser,
				passwd: this.mqttPasswd,
				debug: this.mqttDebug
			});

			this.mqtt.on('connected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
				.on('error', (error) => {
					this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
				})
				.on('debug', (message) => {
					this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
				})
				.on('message', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				})
				.on('disconnected', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				});
		};

		//xbox client
		this.xboxLocalApi = new XboxLocalApi({
			host: this.host,
			xboxLiveId: this.xboxLiveId,
			userToken: this.userToken,
			uhs: this.uhs,
			infoLog: this.disableLogInfo,
			debugLog: this.enableDebugMode
		});

		this.xboxLocalApi.on('connected', (message) => {
			this.log(`Device: ${this.host} ${this.name}, ${message}`);
		})
			.on('deviceInfo', async (firmwareRevision) => {
				if (!this.disableLogDeviceInfo) {
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', this.manufacturer);
					this.log('Model: %s', this.modelName);
					this.log('Serialnr: %s', this.serialNumber);
					this.log('Firmware: %s', firmwareRevision);
					this.log('----------------------------------');
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
						.updateCharacteristic(Characteristic.MotionDetected, power)
				}

				if (this.sensorInputService) {
					const state = power ? (this.inputIdentifier !== inputIdentifier) : false;
					this.sensorInputService
						.updateCharacteristic(Characteristic.MotionDetected, state)
					this.sensorInputState = state;
				}

				if (this.sensorScreenSaverService) {
					const state = power ? (reference === 'Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application') : false;
					this.sensorScreenSaverService
						.updateCharacteristic(Characteristic.MotionDetected, state)
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
				const mqtt = this.mqttEnabled ? this.mqtt.send('State', JSON.stringify(obj, null, 2)) : false;
			})
			.on('error', (error) => {
				this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
			})
			.on('debug', (message) => {
				this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
			})
			.on('message', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			})
			.on('disconnected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			});

		//web api client
		if (this.webApiControl) {
			this.xboxWebApi = new XboxWebApi({
				xboxLiveId: this.xboxLiveId,
				clientId: this.clientId,
				clientSecret: this.clientSecret,
				userToken: this.userToken,
				uhs: this.uhs,
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

				const mqtt = this.mqttEnabled ? this.mqtt.send('Status', JSON.stringify(consoleStatusData, null, 2)) : false;
			})
				.on('consolesList', (consolesList) => {
					const mqtt = this.mqttEnabled ? this.mqtt.send('Consoles List', JSON.stringify(consolesList, null, 2)) : false;
				})
				.on('appsList', async (appsArray) => {
					try {
						const apps = JSON.stringify([...CONSTANS.DefaultInputs, ...appsArray], null, 2);
						await fsPromises.writeFile(this.inputsFile, apps);
						const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved apps: ${apps}`) : false;
						const mqtt = this.mqttEnabled ? this.mqtt.send('Apps', JSON.stringify(apps, null, 2)) : false;
					} catch (error) {
						this.log.error(`Device: ${this.host} ${this.name}, save apps error: ${error}`);
					};
				})
				.on('storageDevices', (storageDevices) => {
					const mqtt = this.mqttEnabled ? this.mqtt.send('Storages', JSON.stringify(storageDevices, null, 2)) : false;
				})
				.on('userProfile', (profileUsers) => {
					const mqtt = this.mqttEnabled ? this.mqtt.send('Profile', JSON.stringify(profileUsers, null, 2)) : false;
				})
				.on('error', (error) => {
					this.log.error(`Device: ${this.host} ${this.name}, ${error}`);
				})
				.on('debug', (message) => {
					this.log(`Device: ${this.host} ${this.name}, debug: ${message}`);
				})
				.on('message', (message) => {
					this.log(`Device: ${this.host} ${this.name}, ${message}`);
				});
		};

		this.start();
	}

	async start() {
		await new Promise(resolve => setTimeout(resolve, 2000));
		this.prepareAccessory();
	};


	//Prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		//accessory
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

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.getCharacteristic(Characteristic.ConfiguredName)
			.onGet(async () => {
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} Accessory Nane: ${accessoryName}.`);
				return accessoryName;
			})
			.onSet(async (value) => {
				try {
					this.name = value;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Accessory Name: ${value}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Brightness error: ${error}`);
				};
			});
		this.televisionService.getCharacteristic(Characteristic.SleepDiscoveryMode)
			.onGet(async () => {
				const state = 1;
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Discovery Mode: ${state ? 'Always Discoverable' : 'Not Discoverable'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Discovery Mode: ${state ? 'Always Discoverable' : 'Not Discoverable'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Discovery Mode error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.power;
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const setPower = state ? await this.xboxLocalApi.powerOn() : await this.xboxLocalApi.powerOff();
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Power, error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Input: ${inputName}, Reference: ${inputReference}, Product Id: ${inputOneStoreProductId}`);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
					const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];

					switch (inputOneStoreProductId) {
						case 'Dashboard': case 'Settings': case 'SettingsTv': case 'Accessory': case 'Screensaver': case 'NetworkTroubleshooter': case 'MicrosoftStore':
							await this.xboxWebApi.launchDashboard();
							break;
						case 'Television':
							await this.xboxWebApi.launchOneGuide();
							break;
						case 'XboxGuide':
							await this.xboxWebApi.openGuideTab();
							break;
						default:
							await this.xboxWebApi.launchApp(inputOneStoreProductId);
							break;
					}
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Input: ${inputName}, Reference: ${inputReference}, Product Id: ${inputOneStoreProductId}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Input error: ${JSON.stringify(error, null, 2)}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.RemoteKey.REWIND:
							command = 'rewind';
							break;
						case Characteristic.RemoteKey.FAST_FORWARD:
							command = 'fastForward';
							break;
						case Characteristic.RemoteKey.NEXT_TRACK:
							command = 'nextTrack';
							break;
						case Characteristic.RemoteKey.PREVIOUS_TRACK:
							command = 'prevTrack';
							break;
						case Characteristic.RemoteKey.ARROW_UP:
							command = 'up';
							break;
						case Characteristic.RemoteKey.ARROW_DOWN:
							command = 'down';
							break;
						case Characteristic.RemoteKey.ARROW_LEFT:
							command = 'left';
							break;
						case Characteristic.RemoteKey.ARROW_RIGHT:
							command = 'right';
							break;
						case Characteristic.RemoteKey.SELECT:
							command = 'a';
							break;
						case Characteristic.RemoteKey.BACK:
							command = 'b';
							break;
						case Characteristic.RemoteKey.EXIT:
							command = 'nexus';
							break;
						case Characteristic.RemoteKey.PLAY_PAUSE:
							command = 'playpause';
							break;
						case Characteristic.RemoteKey.INFORMATION:
							command = this.infoButtonCommand;
							break;
					};

					await this.xboxWebApi.sendButtonPress(command);
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Remote Key: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Remote Key error: ${JSON.stringify(error, null, 2)}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				//xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
				const value = [2, 0, 1, 3, 4][this.mediaState];
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Current Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = [2, 0, 1, 3, 4][this.mediaState];
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					const newMediaState = value;
					const setMediaState = this.power ? false : false;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Target Media: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName} set Target Media error: ${error}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = 'nexus';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'b';
							break;
					};

					const channelName = 'systemInput';
					await this.xboxWebApi.sendButtonPress(command);
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power Mode Selection: ${command === 'nexus' ? 'SHOW' : 'HIDE'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Power Mode Selection error: ${error}`);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
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
			.onSet(async (command) => {
				try {
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'volUp';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'volDown';
							break;
					};

					await this.xboxWebApi.sendButtonPress(command);
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume Selector: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Volume Selector error: ${error}`);
				};
			})

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Volume: ${volume}`);
				return volume;
			})
			.onSet(async (volume) => {
				if (volume === 0 || volume === 100) {
					volume = this.volume;
				};
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume: ${volume}`);
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, Mute: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const toggleMute = state ? await this.xboxWebApi.mute() : await this.xboxWebApi.unmute();
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Mute: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Mute error: ${error}`);
				};
			});

		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 0) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl === 0) {
				this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
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

				accessory.addService(this.volumeService);
			}

			if (this.volumeControl === 1) {
				this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
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

				accessory.addService(this.volumeServiceFan);
			}
		}

		//prepare sensor service
		if (this.sensorPower) {
			this.log.debug('prepareSensorPowerService')
			this.sensorPowerService = new Service.MotionSensor(`${accessoryName} Power Sensor`, `Power Sensor`);
			this.sensorPowerService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power;
					return state;
				});
			accessory.addService(this.sensorPowerService);
		};

		if (this.sensorInput) {
			this.log.debug('prepareSensorInputService')
			this.sensorInputService = new Service.MotionSensor(`${accessoryName} Input Sensor`, `Input Sensor`);
			this.sensorInputService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power ? this.sensorInputState : false;
					return state;
				});
			accessory.addService(this.sensorInputService);
		};

		if (this.sensorScreenSaver) {
			this.log.debug('prepareSensorScreenSaverService')
			this.sensorScreenSaverService = new Service.MotionSensor(`${accessoryName} Screen Saver Sensor`, `Screen Saver Sensor`);
			this.sensorScreenSaverService.getCharacteristic(Characteristic.MotionDetected)
				.onGet(async () => {
					const state = this.power ? this.sensorScreenSaverState : false;
					return state;
				});
			accessory.addService(this.sensorScreenSaverService);
		};

		//Prepare inputs services
		this.log.debug('prepareInputServices');
		const savedInputs = this.getInputsFromDevice ? fs.readFileSync(this.inputsFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsFile)) : this.inputs : this.inputs;
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs: ${JSON.stringify(savedInputs, null, 2)}`) : false;

		const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs Nnames: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

		const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 2 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs Target Visibility: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

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
		const maxInputsCount = inputsCount < 80 ? inputsCount : 80;
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
							const logDebug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Input Name: ${value}, Reference: ${nameIdentifier}.`) : false;
							inputService.setCharacteristic(Characteristic.Name, inputName);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, save Input Name error: ${error}`);
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
							const logDebug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, saved Input: ${inputName} Target Visibility: ${state ? 'HIDEN' : 'SHOWN'}`) : false;
							inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
						} catch (error) {
							this.log.error(`Device: ${this.host} ${accessoryName}, save Target Visibility error: ${error}`);
						}
					});

				this.inputsReference.push(inputReference);
				this.inputsOneStoreProductId.push(inputOneStoreProductId);
				this.inputsName.push(inputName);

				this.televisionService.addLinkedService(inputService);
				accessory.addService(inputService);
			} else {
				this.log(`Device: ${this.host} ${accessoryName}, Input Name: ${inputName ? inputName : 'Missing'}, Reference: ${inputReference ? inputReference : 'Missing'}.`);

			};
		}

		//prepare sonsor service
		const sensorInputs = this.sensorInputs;
		const sensorInputsCount = sensorInputs.length;
		const possibleSensorInputsCount = 80 - this.inputsReference.length;
		const maxSensorInputsCount = possibleSensorInputsCount > sensorInputsCount ? sensorInputsCount : possibleSensorInputsCount;
		if (maxSensorInputsCount > 0) {
			this.log.debug('prepareInputSensorServices');
			for (let i = 0; i < maxSensorInputsCount; i++) {
				//get sensor
				const sensorInput = sensorInputs[i];

				//get sensor name		
				const sensorInputName = sensorInput.name || 'Not set';

				//get sensor reference
				const sensorInputReference = sensorInput.reference || 'Not set';

				//get sensor display type
				const sensorInputDisplayType = sensorInput.displayType >= 0 ? sensorInput.displayType : -1;

				if (sensorInputDisplayType >= 0) {
					const serviceType = [Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][sensorInputDisplayType];
					const characteristicType = [Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][sensorInputDisplayType];
					const sensorInputService = new serviceType(`${accessoryName} ${sensorInputName}`, `Sensor ${i}`);
					sensorInputService.getCharacteristic(characteristicType)
						.onGet(async () => {
							const state = this.power ? (this.reference === sensorInputReference) : false;
							return state;
						});

					this.sensorInputsReference.push(sensorInputReference);
					this.sensorInputsDisplayType.push(sensorInputDisplayType);
					this.sensorInputsServices.push(sensorInputService);
					accessory.addService(this.sensorInputsServices[i]);
				}
			}
		}

		//Prepare buttons services
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const possibleButtonsCount = 80 - (this.inputsReference.length + this.sensorInputsServices.length);
		const maxButtonsCount = possibleButtonsCount >= buttonsCount ? buttonsCount : possibleButtonsCount;
		if (maxButtonsCount > 0) {
			this.log.debug('prepareInputsButtonService');
			for (let i = 0; i < maxButtonsCount; i++) {
				//get button
				const button = buttons[i];

				//get button name
				const buttonName = button.name || 'Not set';

				//get button command
				const buttonCommand = button.command || 'Not set';

				//get button inputOneStoreProductId
				const buttonOneStoreProductId = button.oneStoreProductId || 'Not set';

				//get button display type
				const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

				if (buttonDisplayType >= 0) {
					const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
					const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
					buttonService.getCharacteristic(Characteristic.On)
						.onGet(async () => {
							const state = false;
							const logDebug = this.disableLogInfo ? this.log(`Device: ${this.host} ${accessoryName}, Button state: ${state}`) : false;
							return state;
						})
						.onSet(async (state) => {
							try {
								if (state) {
									//get button mode
									let buttonMode = -1;
									if (buttonCommand in CONSTANS.SystemMediaCommands) {
										buttonMode = 0;
									} else if (buttonCommand in CONSTANS.SystemInputCommands) {
										buttonMode = 1;
									} else if (buttonCommand in CONSTANS.TvRemoteCommands) {
										buttonMode = 2;
									} else if (buttonCommand === 'recordGameDvr') {
										buttonMode = 3;
									} else if (buttonCommand === 'reboot') {
										buttonMode = 4;
									} else if (buttonCommand === 'switchAppGame') {
										buttonMode = 5;
									};

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
													await this.xboxWebApi.launchDashboard();
													break;
												case 'Television':
													await this.xboxWebApi.launchOneGuide();
													break;
												case 'XboxGuide':
													await this.xboxWebApi.openGuideTab();
													break;
												case 'Not set': case 'Web api disabled':
													this.log(`Device: ${this.host} ${accessoryName}, trying to launch App/Game with one store product id: ${buttonOneStoreProductId}.`);
													break;
												default:
													await this.xboxWebApi.launchApp(buttonOneStoreProductId);
													break;
											}
											break;
									}
									const logDebug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, set Button Name:  ${buttonName}, Command: ${buttonCommand}`) : false;
								}
								await new Promise(resolve => setTimeout(resolve, 300));
								const setChar = state ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
							} catch (error) {
								this.log.error(`Device: ${this.host} ${accessoryName}, set Button error: ${error}`);
							};
						});
					this.buttonsServices.push(buttonService);
					accessory.addService(this.buttonsServices[i]);
				}
			}
		}

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
	}
};
