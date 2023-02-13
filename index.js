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
		this.clientId = config.clientId || '5e5ead27-ed60-482d-b3fc-702b28a97404';
		this.clientSecret = config.clientSecret;
		this.userToken = config.userToken || '';
		this.uhs = config.uhs || '';
		this.xboxWebApiToken = config.xboxWebApiToken || '';
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.volumeControl = config.volumeControl || 0;
		this.infoButtonCommand = config.infoButtonCommand || 'nexus';
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
		this.mqttEnabled = config.enableMqtt || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;
		this.mqttDebug = config.mqttDebug || false;

		//add configured inputs to the default inputs
		this.inputs = [...CONSTANS.DefaultInputs, ...this.inputs];

		//device
		this.manufacturer = 'Microsoft';
		this.modelName = 'Model Name';
		this.serialNumber = this.xboxLiveId;
		this.firmwareRevision = 'Firmware Revision';

		//setup variables
		this.webApiEnabled = false;
		this.firstRun = true;

		this.inputsReference = [];
		this.inputsOneStoreProductId = [];
		this.inputsName = [];
		this.inputsTitleId = [];
		this.inputsType = [];

		this.sensorInputsReference = [];
		this.sensorInputsDisplayType = [];

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

		//check if the directory exists, if not then create it
		if (!fs.existsSync(this.prefDir)) {
			fs.mkdirSync(this.prefDir);
		}
		if (!fs.existsSync(this.authTokenFile)) {
			fs.writeFileSync(this.authTokenFile, JSON.stringify({}));
		}
		if (!fs.existsSync(this.inputsFile)) {
			fs.writeFileSync(this.inputsFile, JSON.stringify([]));
		}
		if (!fs.existsSync(this.inputsNamesFile)) {
			fs.writeFileSync(this.inputsNamesFile, JSON.stringify({}));
		}
		if (!fs.existsSync(this.inputsTargetVisibilityFile)) {
			fs.writeFileSync(this.inputsTargetVisibilityFile, JSON.stringify({}));
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
				const inputIdentifier = this.inputsReference.includes(reference) ? this.inputsReference.findIndex(index => index === reference) : this.inputsTitleId.includes(titleId) ? this.inputsTitleId.findIndex(index => index === titleId) : this.inputIdentifier;

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
					if (this.volumeService && this.volumeControl === 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};
					if (this.volumeServiceFan && this.volumeControl === 2) {
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
				infoLog: this.disableLogInfo,
				debugLog: this.enableDebugMode
			});
		};

		this.xboxWebApi.on('authenticated', (status) => {

			this.webApiEnabled = status;
		})
			.on('consoleStatus', (consoleStatusData, consoleType) => {
				if (this.informationService) {
					this.informationService
						.setCharacteristic(Characteristic.Model, consoleType)
				};

				//this.serialNumber = id;
				this.modelName = consoleType;
				//this.power = powerState;
				//this.mediaState = playbackState;

				//mqtt
				const mqtt = this.mqttEnabled ? this.mqtt.send('Status', JSON.stringify(consoleStatusData, null, 2)) : false;
			})
			.on('consolesList', (consolesList) => {

				//mqtt
				const mqtt = this.mqttEnabled ? this.mqtt.send('Consoles List', JSON.stringify(consolesList, null, 2)) : false;
			})
			.on('appsList', async (appsArray) => {
				try {
					const apps = JSON.stringify([...CONSTANS.DefaultInputs, ...appsArray], null, 2);
					await fsPromises.writeFile(this.inputsFile, apps);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, saved apps: ${apps}`) : false;

					//mqtt
					const mqtt = this.mqttEnabled ? this.mqtt.send('Apps', JSON.stringify(apps, null, 2)) : false;
				} catch (error) {
					this.log.error(`Device: ${this.host} ${this.name}, save apps error: ${error}`);
				};
			})
			.on('storageDevices', (storageDevices) => {

				//mqtt
				const mqtt = this.mqttEnabled ? this.mqtt.send('Storages', JSON.stringify(storageDevices, null, 2)) : false;
			})
			.on('userProfile', (profileUsers) => {

				//mqtt
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
		this.log.debug('prepareInformationService');
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		this.informationService = accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.power;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Power state successful: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const setPower = (state && !this.power) ? await this.xboxLocalApi.powerOn() : (!state && this.power) ? await this.xboxLocalApi.powerOff() : false;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power successful: ${state ? 'ON' : 'OFF'}`);
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
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, get Input successful, input: ${inputName}, reference: ${inputReference}, product Id: ${inputOneStoreProductId}`);
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
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Input successful, input: ${inputName},, reference: ${inputReference}, product Id: ${inputOneStoreProductId}`);
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

					const sendCommand = this.power && this.webApiEnabled ? await this.xboxWebApi.sendButtonPress(command) : false;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, Remote Key command successful: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Remote Key command error: ${JSON.stringify(error, null, 2)}`);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				//xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
				const value = [2, 0, 1, 3, 4][this.mediaState];
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, get Current Media state successful: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = [2, 0, 1, 3, 4][this.mediaState];
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, get Target Media state successful: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					const newMediaState = value;
					const setMediaState = this.power ? false : false;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Target Media state successful: ${['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName} set Target Media state error: ${error}`);
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
					const setPowerModeSelection = this.power ? this.webApiEnabled ? await this.xboxWebApi.sendButtonPress(command) : await this.xboxWebApi.sendButtonPress(command) : false;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Power Mode Selection command successful: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Power Mode Selection command error: ${error}`);
				};
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE)
			.getCharacteristic(Characteristic.VolumeSelector)
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

					const channelName = 'tvRemote';
					const setVolume = this.power && this.webApiEnabled ? await this.xboxWebApi.sendButtonPress(command) : false;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume command successful: ${command}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Volume command error: ${error}`);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, get Volume successful: ${volume}`);
				return volume;
			})
			.onSet(async (volume) => {
				if (volume === 0 || volume === 100) {
					volume = this.volume;
				};
				const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Volume successful: ${volume}`);
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${this.host} ${accessoryName}, get Mute successful: ${state ? 'ON' : 'OFF'}`);
				return state;
			})
			.onSet(async (state) => {
				try {
					const toggleMute = this.power && this.webApiEnabled ? state ? await this.xboxWebApi.mute() : await this.xboxWebApi.unmute() : false;
					const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set Mute successful: ${state ? 'ON' : 'OFF'}`);
				} catch (error) {
					this.log.error(`Device: ${this.host} ${accessoryName}, set Mute error: ${error}`);
				};
			});

		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl === 1) {
				this.volumeService = new Service.Lightbulb(`${accessoryName} Volume`, 'Volume');
				this.volumeService.getCharacteristic(Characteristic.Brightness)
					.onGet(async () => {
						const volume = this.volume;
						return volume;
					})
					.onSet(async (volume) => {
						const setVolume = this.power ? this.speakerService.setCharacteristic(Characteristic.Volume, volume) : false;
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.mute;
						return state;
					})
					.onSet(async (state) => {
						const setMute = this.power ? this.speakerService.setCharacteristic(Characteristic.Mute, !state) : false;
					});

				accessory.addService(this.volumeService);
			}

			if (this.volumeControl === 2) {
				this.volumeServiceFan = new Service.Fan(`${accessoryName} Volume`, 'Volume');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.onGet(async () => {
						const volume = this.volume;
						return volume;
					})
					.onSet(async (volume) => {
						const setVolume = this.power ? this.speakerService.setCharacteristic(Characteristic.Volume, volume) : false;
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.mute;
						return state;
					})
					.onSet(async (state) => {
						const setMute = this.power ? this.speakerService.setCharacteristic(Characteristic.Mute, !state) : false;
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
					const state = this.sensorInputState;
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

		const savedInputs = this.getInputsFromDevice ? fs.readFileSync(this.inputsFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsFile)) : this.inputs : this.inputs;
		const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs: ${JSON.stringify(savedInputs, null, 2)}`) : false;

		const savedInputsNames = fs.readFileSync(this.inputsNamesFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs names: ${JSON.stringify(savedInputsNames, null, 2)}`) : false;

		const savedInputsTargetVisibility = fs.readFileSync(this.inputsTargetVisibilityFile).length > 0 ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, read saved Inputs Target Visibility states: ${JSON.stringify(savedInputsTargetVisibility, null, 2)}`) : false;

		//check possible inputs and filter custom unnecessary inputs
		const filteredInputsArr = [];
		for (const input of savedInputs) {
			const contentType = input.contentType;
			const filterGames = this.filterGames ? (this.filterGames && contentType === 'Game') : false;
			const filterApps = this.filterApps ? (contentType === 'App') : false;
			const filterSystemApps = this.filterSystemApps ? (contentType === 'systemApp') : false;
			const filterDlc = this.filterDlc ? (contentType === 'Dlc') : false;
			const push = this.getInputsFromDevice ? (!filterGames && !filterApps && !filterSystemApps && !filterDlc) ? filteredInputsArr.push(input) : false : filteredInputsArr.push(input);
		}

		//check possible inputs and possible inputs count (max 80)
		const inputs = filteredInputsArr;
		const inputsCount = inputs.length;
		const maxInputsCount = inputsCount < 80 ? inputsCount : 80;
		for (let i = 0; i < maxInputsCount; i++) {
			//get input 
			const input = inputs[i];

			//get title Id
			const inputTitleId = input.titleId || 'undefined';

			//get input reference
			const inputReference = input.reference || 'undefined';

			//get input oneStoreProductId
			const inputOneStoreProductId = input.oneStoreProductId || 'undefined';

			//get input name
			const inputName = savedInputsNames[inputTitleId] ? savedInputsNames[inputTitleId] : savedInputsNames[inputReference] ? savedInputsNames[inputReference] : savedInputsNames[inputOneStoreProductId] ? savedInputsNames[inputOneStoreProductId] : input.name;

			//get input type
			const inputType = CONSTANS.InputSourceTypes.includes(input.type) ? CONSTANS.InputSourceTypes.findIndex(index => index === input.type) : 10;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = savedInputsTargetVisibility[inputTitleId] ? savedInputsTargetVisibility[inputTitleId] : savedInputsTargetVisibility[inputReference] ? savedInputsTargetVisibility[inputReference] : savedInputsTargetVisibility[inputOneStoreProductId] ? savedInputsTargetVisibility[inputOneStoreProductId] : 0;
			const targetVisibility = currentVisibility;

			const inputService = new Service.InputSource(inputName, `Input ${i}`);
			inputService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)
				.setCharacteristic(Characteristic.TargetVisibilityState, targetVisibility);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					try {
						const nameIdentifier = inputTitleId ? inputTitleId : inputReference ? inputReference : inputOneStoreProductId ? inputOneStoreProductId : false;
						savedInputsNames[nameIdentifier] = name;
						const newCustomName = JSON.stringify(savedInputsNames, null, 2);
						const writeNewCustomName = nameIdentifier ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, saved new Input name: ${name}, one store product id: ${inputOneStoreProductId}`);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, new Input name save error: ${error}`);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					try {
						const targetVisibilityIdentifier = inputTitleId ? inputTitleId : inputReference ? inputReference : inputOneStoreProductId ? inputOneStoreProductId : false;
						savedInputsTargetVisibility[targetVisibilityIdentifier] = state;
						const newTargetVisibility = JSON.stringify(savedInputsTargetVisibility, null, 2);
						const writeNewTargetVisibility = targetVisibilityIdentifier ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, saved new Input: ${inputName} target visibility state: ${state ? 'HIDEN' : 'SHOWN'}`);
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error(`Device: ${this.host} ${accessoryName}, new target visibility state save error: ${error}`);
					}
				});

			this.inputsTitleId.push(inputTitleId);
			this.inputsReference.push(inputReference);
			this.inputsOneStoreProductId.push(inputOneStoreProductId);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);

			this.televisionService.addLinkedService(inputService);
			accessory.addService(inputService);
		}

		//prepare sonsor service
		this.sensorInputsServices = [];
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
		this.buttonsServices = [];
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

				//get button display type
				const buttonDisplayType = button.displayType >= 0 ? button.displayType : -1;

				if (buttonDisplayType >= 0) {
					//get button mode
					let buttonMode = 0;
					let command = '';
					if (buttonCommand in CONSTANS.SystemMediaCommands) {
						buttonMode = 0;
						command = buttonCommand;
					} else if (buttonCommand in CONSTANS.SystemInputCommands) {
						buttonMode = 1;
						command = buttonCommand;
					} else if (buttonCommand in CONSTANS.TvRemoteCommands) {
						buttonMode = 2;
					} else if (buttonCommand === 'recordGameDvr') {
						buttonMode = 3;
						command = buttonCommand;
					} else if (buttonCommand === 'reboot') {
						buttonMode = 4;
					} else if (buttonCommand === 'switchAppGame') {
						buttonMode = 5;
					};

					//get button inputOneStoreProductId
					const buttonOneStoreProductId = (button.oneStoreProductId) ? button.oneStoreProductId : '0';

					const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
					const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
					buttonService.getCharacteristic(Characteristic.On)
						.onGet(async () => {
							const state = false;
							const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, get Button state successful: ${state}`);
							return state;
						})
						.onSet(async (state) => {
							try {
								if (this.power && state && this.webApiEnabled) {
									switch (buttonMode) {
										case 0: case 1: case 2:
											await this.xboxWebApi.sendButtonPress(command);
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
												default:
													await this.xboxWebApi.launchApp(buttonOneStoreProductId);
													break;
											}
											break;
									}
								}
								const logInfo = this.disableLogInfo || this.firstRun ? false : this.log(`Device: ${this.host} ${accessoryName}, set button successful, name:  ${buttonName}, command: ${buttonCommand}`);
								await new Promise(resolve => setTimeout(resolve, 300));
								const setChar = (state && this.power) ? buttonService.updateCharacteristic(Characteristic.On, false) : false;
							} catch (error) {
								this.log.error(`Device: ${this.host} ${accessoryName}, set button error, name: ${buttonName}, error: ${error}`);
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