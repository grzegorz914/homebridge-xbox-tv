'use strict';
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const xboxWebApi = require('xbox-webapi');
const XboxLocalApi = require('./src/xboxlocalapi.js');
const Mqtt = require('./src/mqtt.js');

const PLUGIN_NAME = 'homebridge-xbox-tv';
const PLATFORM_NAME = 'XboxTv';
const CONSTANS = require('./src/constans.json');

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
		this.devices = config.devices;
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			const devicesCount = this.devices.length;
			for (let i = 0; i < devicesCount; i++) {
				const device = this.devices[i];
				if (!device.name || !device.host || !device.xboxLiveId) {
					this.log.warn('Device Name, Host or Xbox Live ID Missing');
				} else {
					new XBOXDEVICE(this.log, this.api, device);
				}
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
		this.clientSecret = config.clientSecret || false;
		this.userToken = config.userToken;
		this.userHash = config.userHash;
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
		this.mqttEnabled = config.enableMqtt || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;
		this.mqttDebug = config.mqttDebug || false;

		//add configured inputs to the default inputs
		const inputsArr = new Array();
		const defaultInputsCount = CONSTANS.DefaultInputs.length;
		for (let i = 0; i < defaultInputsCount; i++) {
			inputsArr.push(CONSTANS.DefaultInputs[i]);
		}
		this.inputs = [...inputsArr, ...this.inputs];

		//device
		this.manufacturer = 'Microsoft';
		this.modelName = 'Model Name';
		this.serialNumber = this.xboxLiveId;
		this.firmwareRevision = 'Firmware Revision';
		this.devInfo = '';

		//setup variables
		this.webApiEnabled = false;

		this.inputsReference = new Array();
		this.inputsOneStoreProductId = new Array();
		this.inputsName = new Array();
		this.inputsTitleId = new Array();
		this.inputsType = new Array();

		this.power = false;
		this.volume = 0;
		this.mute = true;
		this.mediaState = 0;
		this.inputIdentifier = 0;

		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.authTokenFile = `${this.prefDir}/authToken_${this.host.split('.').join('')}`;
		this.devInfoFile = `${this.prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${this.prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${this.prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${this.prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) == false) {
			fs.mkdirSync(this.prefDir);
		}
		if (fs.existsSync(this.authTokenFile) == false) {
			fs.writeFileSync(this.authTokenFile, '');
		}
		if (fs.existsSync(this.devInfoFile) == false) {
			const obj = {
				'manufacturer': this.manufacturer,
				'modelName': this.modelName,
				'serialNumber': this.serialNumber,
				'firmwareRevision': this.firmwareRevision
			};
			const devInfo = JSON.stringify(obj, null, 2);
			fs.writeFileSync(this.devInfoFile, devInfo);
		}
		if (fs.existsSync(this.inputsFile) == false) {
			fs.writeFileSync(this.inputsFile, '');
		}
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fs.writeFileSync(this.inputsNamesFile, '');
		}
		if (fs.existsSync(this.inputsTargetVisibilityFile) == false) {
			fs.writeFileSync(this.inputsTargetVisibilityFile, '');
		}

		//mqtt client
		this.mqtt = new Mqtt({
			enabled: this.mqttEnabled,
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

		//web api client
		if (this.webApiControl) {
			this.xboxWebApi = xboxWebApi({
				clientId: this.clientId,
				clientSecret: this.clientSecret,
				userToken: this.userToken,
				uhs: this.userHash
			});
			this.getAuthorizationState();

			setInterval(() => {
				this.getAuthorizationState();
			}, 600000);
		};

		//xbox client
		this.xboxLocalApi = new XboxLocalApi({
			host: this.host,
			xboxLiveId: this.xboxLiveId,
			userToken: this.userToken,
			uhs: this.userHash,
			infoLog: this.disableLogInfo,
			debugLog: this.enableDebugMode
		});

		this.xboxLocalApi.on('connected', (message) => {
			this.log(`Device: ${this.host} ${this.name}, ${message}`);
		})
			.on('deviceInfo', async (firmwareRevision, locale) => {
				if (!this.disableLogDeviceInfo) {
					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', this.manufacturer);
					this.log('Model: %s', this.modelName);
					this.log('Serialnr: %s', this.serialNumber);
					this.log('Firmware: %s', firmwareRevision);
					this.log('----------------------------------');
				}

				try {
					const obj = {
						'manufacturer': this.manufacturer,
						'modelName': this.modelName,
						'serialNumber': this.serialNumber,
						'firmwareRevision': firmwareRevision,
						'locale': locale
					};
					const devInfo = JSON.stringify(obj, null, 2);
					const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, devInfo);
					const debug = this.enableDebugMode ? this.log(`Device: ${this.host} ${this.name}, debug saved Info: ${devInfo}`) : false;
					const mqtt = this.mqttEnabled ? this.mqtt.send('Info', devInfo) : false;
				} catch (error) {
					this.log.error('Device: %s %s, device info error: %s', this.host, this.name, error);
				};

				this.firmwareRevision = firmwareRevision;
			})
			.on('stateChanged', (power, titleId, inputReference, volume, mute, mediaState) => {
				const inputIdentifier = this.inputsReference.indexOf(inputReference) >= 0 ? this.inputsReference.indexOf(inputReference) : this.inputsTitleId.indexOf(titleId) >= 0 ? this.inputsTitleId.indexOf(titleId) : this.inputIdentifier;
				const obj = {
					'power': power,
					'titleId': titleId,
					'app': inputReference,
					'volume': volume,
					'mute': mute,
					'mediaState': mediaState,
				};

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
					if (this.volumeService && this.volumeControl == 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};
					if (this.volumeServiceFan && this.volumeControl == 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !mute);
					};
				};

				this.power = power;
				this.volume = volume;
				this.mute = mute;
				this.mediaState = mediaState;
				this.inputIdentifier = inputIdentifier;
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
			.on('mqtt', (topic, message) => {
				this.mqtt.send(topic, message);
			})
			.on('disconnected', (message) => {
				this.log(`Device: ${this.host} ${this.name}, ${message}`);
			});

		//start prepare accessory
		this.prepareAccessory();
	}

	async getAuthorizationState() {
		try {
			this.log.debug('Device: %s %s, requesting authorization state.', this.host, this.name);
			this.xboxWebApi._authentication._tokensFile = this.authTokenFile;
			await this.xboxWebApi.isAuthenticated();
			this.webApiEnabled = true;
			const debug = this.enableDebugMode ? this.log('Device: %s %s, Authorized and Web Api enabled.', this.host, this.name) : false;

			try {
				this.log.debug('Device: %s %s, requesting web api console data.', this.host, this.name);
				//await this.getWebApiConsolesList();
				//await this.getWebApiUserProfile();
				await this.getWebApiInstalledApps();
				//await this.getWebApiStorageDevices();
				await this.getWebApiConsoleStatus();
			} catch (error) {
				this.log.error('Device: %s %s, get web api console data error: %s.', this.host, this.name, error);
			};
		} catch (error) {
			this.webApiEnabled = false;
			this.log.error('Device: %s %s, not authorized, please use Authorization Manager.', this.host, this.name);
		};
	};

	getWebApiConsolesList() {
		return new Promise(async (resolve, reject) => {
			this.log.debug('Device: %s %s, requesting web api consoles list.', this.host, this.name);
			try {
				const getConsolesListData = await this.xboxWebApi.getProvider('smartglass').getConsolesList();
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug getConsolesListData, result: %s, %s', this.host, this.name, getConsolesListData.result[0], getConsolesListData.result[0].storageDevices[0]) : false;
				const consolesListData = getConsolesListData.result;

				this.consolesId = new Array();
				this.consolesName = new Array();
				this.consolesLocale = new Array();
				this.consolesRegion = new Array();
				this.consolesConsoleType = new Array();
				this.consolesPowerState = new Array();
				this.consolesDigitalAssistantRemoteControlEnabled = new Array();
				this.consolesConsoleStreamingEnabled = new Array();
				this.consolesRemoteManagementEnabled = new Array();
				this.consolesWirelessWarning = new Array();
				this.consolesOutOfHomeWarning = new Array();

				this.consolesStorageDeviceId = new Array();
				this.consolesStorageDeviceName = new Array();
				this.consolesIsDefault = new Array();
				this.consolesFreeSpaceBytes = new Array();
				this.consolesTotalSpaceBytes = new Array();
				this.consolesIsGen9Compatible = new Array();

				const consolesListCount = consolesListData.length;
				for (let i = 0; i < consolesListCount; i++) {
					const console = consolesListData[i];
					const id = console.id;
					const name = console.name;
					const locale = console.locale;
					const region = console.region;
					const consoleType = console.consoleType;
					const powerState = CONSTANS.ConsolePowerState[console.powerState]; // 0 - Off, 1 - On, 2 - ConnectedStandby, 3 - SystemUpdate
					const digitalAssistantRemoteControlEnabled = (console.digitalAssistantRemoteControlEnabled == true);
					const remoteManagementEnabled = (console.remoteManagementEnabled == true);
					const consoleStreamingEnabled = (console.consoleStreamingEnabled == true);
					const wirelessWarning = (console.wirelessWarning == true);
					const outOfHomeWarning = (console.outOfHomeWarning == true);

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

					const consolesStorageDevicesCount = console.storageDevices.length;
					for (let j = 0; j < consolesStorageDevicesCount; j++) {
						const consoleStorageDevice = console.storageDevices[j];
						const storageDeviceId = consoleStorageDevice.storageDeviceId;
						const storageDeviceName = consoleStorageDevice.storageDeviceName;
						const isDefault = (consoleStorageDevice.isDefault == true);
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
				resolve(true);
			} catch (error) {
				reject(error);
				this.log.error('Device: %s %s, get Consoles List error: %s.', this.host, this.name, error);
			};
		});
	}

	getWebApiUserProfile() {
		return new Promise(async (resolve, reject) => {
			this.log.debug('Device: %s %s, requesting web api user profile.', this.host, this.name);
			try {
				const getUserProfileData = await this.xboxWebApi.getProvider('profile').getUserProfile();
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug getUserProfileData, result: %s', this.host, this.name, getUserProfileData.profileUsers[0], getUserProfileData.profileUsers[0].settings[0]) : false;
				const userProfileData = getUserProfileData.profileUsers;

				this.userProfileId = new Array();
				this.userProfileHostId = new Array();
				this.userProfileIsSponsoredUser = new Array();

				this.userProfileSettingsId = new Array();
				this.userProfileSettingsValue = new Array();

				const profileUsersCount = userProfileData.length;
				for (let i = 0; i < profileUsersCount; i++) {
					const userProfile = userProfileData[i];
					const id = userProfile.id;
					const hostId = userProfile.hostId;
					const isSponsoredUser = userProfile.isSponsoredUser;

					this.userProfileId.push(id);
					this.userProfileHostId.push(hostId);
					this.userProfileIsSponsoredUser.push(isSponsoredUser);

					const profileUsersSettingsCount = userProfile.settings.length;
					for (let j = 0; j < profileUsersSettingsCount; j++) {
						const userProfileSettings = userProfileData[i].settings[j];
						const id = userProfileSettings.id;
						const value = userProfileSettings.value;

						this.userProfileSettingsId.push(id);
						this.userProfileSettingsValue.push(value);
					};
				};
				resolve(true);
			} catch (error) {
				reject(error);
				this.log.error('Device: %s %s, get User Profile error: %s.', this.host, this.name, error);
			};
		});
	}

	getWebApiInstalledApps() {
		return new Promise(async (resolve, reject) => {
			this.log.debug('Device: %s %s, requesting installed apps from your Xbox Live account.', this.host, this.name);
			try {
				const getInstalledAppsData = await this.xboxWebApi.getProvider('smartglass').getInstalledApps(this.xboxLiveId);
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug getInstalledAppsData: %s', this.host, this.name, getInstalledAppsData.result) : false;

				const inputsArr = new Array();
				const defaultInputsCount = CONSTANS.DefaultInputs.length;
				for (let i = 0; i < defaultInputsCount; i++) {
					inputsArr.push(CONSTANS.DefaultInputs[i]);
				};

				//get installed inputs/apps from web
				const inputsData = getInstalledAppsData.result;
				const inputsCount = inputsData.length;
				for (let i = 0; i < inputsCount; i++) {
					const input = inputsData[i];
					const oneStoreProductId = input.oneStoreProductId;
					const titleId = input.titleId;
					const aumid = input.aumid;
					const lastActiveTime = input.lastActiveTime;
					const isGame = (input.isGame == true);
					const name = input.name;
					const contentType = input.contentType;
					const instanceId = input.instanceId;
					const storageDeviceId = input.storageDeviceId;
					const uniqueId = input.uniqueId;
					const legacyProductId = input.legacyProductId;
					const version = input.version;
					const sizeInBytes = input.sizeInBytes;
					const installTime = input.installTime;
					const updateTime = input.updateTime;
					const parentId = input.parentId;
					const type = 'APPLICATION';

					const inputsObj = {
						'name': name,
						'titleId': titleId,
						'reference': aumid,
						'oneStoreProductId': oneStoreProductId,
						'type': type,
						'contentType': contentType
					};
					inputsArr.push(inputsObj);
				};
				const obj = JSON.stringify(inputsArr, null, 2);
				const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
				const debug1 = this.enableDebugMode ? this.log('Device: %s %s, saved inputs/apps list: %s', this.host, this.name, obj) : false;
				resolve(true);
			} catch (error) {
				reject(error);
				this.log.error('Device: %s %s, with liveId: %s, get Installed Apps error: %s.', this.host, this.name, this.xboxLiveId, error);
			};
		});
	}

	getWebApiStorageDevices() {
		return new Promise(async (resolve, reject) => {
			this.log.debug('Device: %s %s, requesting web api storage devices.', this.host, this.name);
			try {
				const getStorageDevicesData = await this.xboxWebApi.getProvider('smartglass').getStorageDevices(this.xboxLiveId);
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug getStorageDevicesData, result: %s', this.host, this.name, getStorageDevicesData) : false;

				const storageDeviceData = getStorageDevicesData.result;
				const deviceId = getStorageDevicesData.deviceId;
				const agentUserId = getStorageDevicesData.agentUserId;

				this.storageDeviceId = new Array();
				this.storageDeviceName = new Array();
				this.isDefault = new Array();
				this.freeSpaceBytes = new Array();
				this.totalSpaceBytes = new Array();
				this.isGen9Compatible = new Array();

				const storageDevicesCount = storageDeviceData.length;
				for (let i = 0; i < storageDevicesCount; i++) {
					const storageDevice = storageDeviceData[i];
					const storageDeviceId = storageDevice.storageDeviceId;
					const storageDeviceName = storageDevice.storageDeviceName;
					const isDefault = (storageDevice.isDefault == true);
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
				resolve(true);
			} catch (error) {
				reject(error);
				this.log.error('Device: %s %s, with liveId: %s, get Storage Devices error: %s.', this.host, this.name, this.xboxLiveId, error);
			};
		});
	}

	getWebApiConsoleStatus() {
		return new Promise(async (resolve, reject) => {
			this.log.debug('Device: %s %s, requesting device info from Web API.', this.host, this.name);
			try {
				const getConsoleStatusData = await this.xboxWebApi.getProvider('smartglass').getConsoleStatus(this.xboxLiveId);
				const debug = this.enableDebugMode ? this.log('Device: %s %s, debug getConsoleStatusData, status: %s result: %s', this.host, this.name, getConsoleStatusData.status, getConsoleStatusData) : false;
				const consoleStatusData = getConsoleStatusData;

				const id = consoleStatusData.id;
				const name = consoleStatusData.name;
				const locale = consoleStatusData.locale;
				const region = consoleStatusData.region;
				const consoleType = CONSTANS.ConsoleName[consoleStatusData.consoleType];
				const powerState = (CONSTANS.ConsolePowerState[consoleStatusData.powerState] == 1); // 0 - Off, 1 - On, 2 - InStandby, 3 - SystemUpdate
				const playbackState = (CONSTANS.ConsolePlaybackState[consoleStatusData.playbackState] == 1); // 0 - Stopped, 1 - Playng, 2 - Paused
				const loginState = consoleStatusData.loginState;
				const focusAppAumid = consoleStatusData.focusAppAumid;
				const isTvConfigured = (consoleStatusData.isTvConfigured == true);
				const digitalAssistantRemoteControlEnabled = (consoleStatusData.digitalAssistantRemoteControlEnabled == true);
				const consoleStreamingEnabled = (consoleStatusData.consoleStreamingEnabled == true);
				const remoteManagementEnabled = (consoleStatusData.remoteManagementEnabled == true);

				//this.serialNumber = id;
				this.modelName = consoleType;
				//this.power = powerState;
				//this.mediaState = playbackState;
				resolve(true);
			} catch (error) {
				reject(error);
				this.log.error('Device: %s %s, with liveId: %s, get Console Status error: %s.', this.host, this.name, this.xboxLiveId, error);
			};
		});
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');

		//accessory
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(this.xboxLiveId);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
		accessory.context.device = this.config.device;

		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = JSON.parse(readDevInfo);
			const debug = this.enableDebugMode ? this.log('Device: %s %s, debug devInfo: %s', this.host, this.name, devInfo) : false;

			const manufacturer = devInfo.manufacturer || 'Undefined';
			const modelName = devInfo.modelName || 'Undefined';
			const serialNumber = devInfo.serialNumber || 'Undefined';
			const firmwareRevision = devInfo.firmwareRevision || 'Undefined';

			//Pinformation service
			this.log.debug('prepareInformationService');
			accessory.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		} catch (error) {
			this.log.error('Device: %s %s, read devInfo error: %s', this.host, this.name, error);
		};

		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.power;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				try {
					const setPower = (state && !this.power) ? await this.xboxLocalApi.powerOn() : (!state && this.power) ? await this.xboxLocalApi.powerOff() : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power successful, %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s, set Power, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Input successful, input: %s, reference: %s, product Id: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputName = this.inputsName[inputIdentifier];
				const inputReference = this.inputsReference[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				const setDashboard = (inputOneStoreProductId === 'Dashboard' || inputOneStoreProductId === 'Settings' || inputOneStoreProductId === 'SettingsTv' || inputOneStoreProductId === 'Accessory' || inputOneStoreProductId === 'Screensaver' || inputOneStoreProductId === 'NetworkTroubleshooter' || inputOneStoreProductId === 'XboxGuide');
				const setTelevision = (inputOneStoreProductId === 'Television');
				const setApp = ((inputOneStoreProductId != undefined && inputOneStoreProductId != '0') && !setDashboard && !setTelevision);
				try {
					const setInput = (this.webApiEnabled) ? setApp ? await this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxLiveId, inputOneStoreProductId) : setDashboard ? await this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxLiveId) : setTelevision ? await this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxLiveId) : false : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Input successful, input: %s, reference: %s, product Id: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
				} catch (error) {
					this.log.error('Device: %s %s, set Input error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				let channelName;
				switch (command) {
					case Characteristic.RemoteKey.REWIND:
						command = 'rewind';
						channelName = 'systemMedia';
						break;
					case Characteristic.RemoteKey.FAST_FORWARD:
						command = 'fastForward';
						channelName = 'systemMedia';
						break;
					case Characteristic.RemoteKey.NEXT_TRACK:
						command = 'nextTrack';
						channelName = 'systemMedia';
						break;
					case Characteristic.RemoteKey.PREVIOUS_TRACK:
						command = 'prevTrack';
						channelName = 'systemMedia';
						break;
					case Characteristic.RemoteKey.ARROW_UP:
						command = 'up';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.ARROW_DOWN:
						command = 'down';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.ARROW_LEFT:
						command = 'left';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.ARROW_RIGHT:
						command = 'right';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.SELECT:
						command = 'a';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.BACK:
						command = 'b';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.EXIT:
						command = 'nexus';
						channelName = 'systemInput';
						break;
					case Characteristic.RemoteKey.PLAY_PAUSE:
						command = 'playpause';
						channelName = 'systemMedia';
						break;
					case Characteristic.RemoteKey.INFORMATION:
						command = this.infoButtonCommand;
						channelName = 'systemInput';
						break;
				};
				try {
					const sendCommand = this.power ? this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxLiveId, command) : await this.xboxLocalApi.sendCommand(channelName, command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, Remote Key command successful: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, set Remote Key command error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				//xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
				const value = [2, 0, 1, 3, 4][this.mediaState];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Current Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = [2, 0, 1, 3, 4][this.mediaState];
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Target Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				return value;
			})
			.onSet(async (value) => {
				try {
					const newMediaState = value;
					const setMediaState = this.power ? false : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Target Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				} catch (error) {
					this.log.error('Device: %s %s %s, set Target Media state error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				switch (command) {
					case Characteristic.PowerModeSelection.SHOW:
						command = 'nexus';
						break;
					case Characteristic.PowerModeSelection.HIDE:
						command = 'b';
						break;
				};
				try {
					const channelName = 'systemInput';
					const setPowerModeSelection = this.power ? this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxLiveId, command) : await this.xboxLocalApi.sendCommand(channelName, command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Power Mode Selection command successful: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, set Power Mode Selection command error: %s', this.host, accessoryName, error);
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
				switch (command) {
					case Characteristic.VolumeSelector.INCREMENT:
						command = 'volUp';
						break;
					case Characteristic.VolumeSelector.DECREMENT:
						command = 'volDown';
						break;
				};
				try {
					const channelName = 'tvRemote';
					const setVolume = (this.power && this.webApiEnabled) ? await this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxLiveId, command) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume command successful: %s', this.host, accessoryName, command);
				} catch (error) {
					this.log.error('Device: %s %s, set Volume command error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Volume successful: %s', this.host, accessoryName, volume);
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				};
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Volume successful: %s', this.host, accessoryName, volume);
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.mute;
				const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				return state;
			})
			.onSet(async (state) => {
				try {
					const toggleMute = (this.power && this.webApiEnabled) ? state ? await this.xboxWebApi.getProvider('smartglass').mute(this.xboxLiveId) : await this.xboxWebApi.getProvider('smartglass').unmute(this.xboxLiveId) : false;
					const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				} catch (error) {
					this.log.error('Device: %s %s, set Mute error: %s', this.host, accessoryName, error);
				};
			});

		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
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

			if (this.volumeControl == 2) {
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

		//Prepare inputs services
		this.log.debug('prepareInputServices');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		const debug = this.enableDebugMode ? this.log('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs) : false;

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		const debug1 = this.enableDebugMode ? this.log('Device: %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, savedInputsNames) : false;

		const savedTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		const debug2 = this.enableDebugMode ? this.log('Device: %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, savedTargetVisibility) : false;

		//check available inputs and filter costom inputs
		const allInputs = (this.getInputsFromDevice && savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsArr = new Array();
		const allInputsCount = allInputs.length;
		for (let i = 0; i < allInputsCount; i++) {
			const input = allInputs[i];
			const contentType = input.contentType;
			const filterGames = this.filterGames ? (contentType != 'Game') : true;
			const filterApps = this.filterApps ? (contentType != 'App') : true;
			const filterSystemApps = this.filterSystemApps ? (contentType != 'systemApp') : true;
			const filterDlc = this.filterDlc ? (contentType != 'Dlc') : true;
			const push = (this.getInputsFromDevice) ? (filterGames && filterApps && filterSystemApps && filterDlc) ? inputsArr.push(input) : false : inputsArr.push(input);
		}

		//check available inputs and possible inputs count (max 93)
		const inputs = inputsArr;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 93) ? inputsCount : 93;
		for (let j = 0; j < maxInputsCount; j++) {
			//get input 
			const input = inputs[j];

			//get title Id
			const inputTitleId = (input.titleId != undefined) ? input.titleId : undefined;

			//get input reference
			const inputReference = (input.reference != undefined) ? input.reference : undefined;

			//get input oneStoreProductId
			const inputOneStoreProductId = (input.oneStoreProductId != undefined) ? input.oneStoreProductId : undefined;

			//get input name
			const inputName = (savedInputsNames[inputTitleId] != undefined) ? savedInputsNames[inputTitleId] : (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : (savedInputsNames[inputOneStoreProductId] != undefined) ? savedInputsNames[inputOneStoreProductId] : input.name;

			//get input type
			const inputType = (input.type != undefined) ? CONSTANS.InputSourceTypes.indexOf(input.type) : 10;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const currentVisibility = (savedTargetVisibility[inputTitleId] != undefined) ? savedTargetVisibility[inputTitleId] : (savedTargetVisibility[inputReference] != undefined) ? savedTargetVisibility[inputReference] : (savedTargetVisibility[inputOneStoreProductId] != undefined) ? savedTargetVisibility[inputOneStoreProductId] : 0;
			const targetVisibility = currentVisibility;

			const inputService = new Service.InputSource(inputName, `Input ${j}`);
			inputService
				.setCharacteristic(Characteristic.Identifier, j)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, isConfigured)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, currentVisibility)
				.setCharacteristic(Characteristic.TargetVisibilityState, targetVisibility);

			inputService
				.getCharacteristic(Characteristic.ConfiguredName)
				.onSet(async (name) => {
					const nameIdentifier = (inputTitleId != undefined) ? inputTitleId : (inputReference != undefined) ? inputReference : (inputOneStoreProductId != undefined) ? inputOneStoreProductId : false;
					let newName = savedInputsNames;
					newName[nameIdentifier] = name;
					const newCustomName = JSON.stringify(newName, null, 2);
					try {
						const writeNewCustomName = nameIdentifier ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, saved new Input name successful, name: %s, product Id: %s', this.host, accessoryName, newCustomName, inputOneStoreProductId);
					} catch (error) {
						this.log.error('Device: %s %s, saved new Input Name error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					const targetVisibilityIdentifier = (inputTitleId != undefined) ? inputTitleId : (inputReference != undefined) ? inputReference : (inputOneStoreProductId != undefined) ? inputOneStoreProductId : false;
					let newState = savedTargetVisibility;
					newState[targetVisibilityIdentifier] = state;
					const newTargetVisibility = JSON.stringify(newState, null, 2);
					try {
						const writeNewTargetVisibility = targetVisibilityIdentifier ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, saved new Target Visibility successful, input: %s, state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, saved new Target Visibility error, input: %s, error: %s', this.host, accessoryName, inputName, error);
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

		//Prepare buttons services
		//check available buttons and possible buttons count (max 94)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const availableButtonshCount = 94 - maxInputsCount;
		const maxButtonsCount = (availableButtonshCount > 0) ? (availableButtonshCount >= buttonsCount) ? buttonsCount : availableButtonshCount : 0;
		if (maxButtonsCount > 0) {
			this.log.debug('prepareButtonServices');
			for (let i = 0; i < maxButtonsCount; i++) {
				//button 
				const button = buttons[i];

				//get button command
				const buttonCommand = (button.command != undefined) ? button.command : '';

				//get button name
				const buttonName = (button.name != undefined) ? button.name : buttonCommand;

				//get button display type
				const buttonDisplayType = (button.displayType != undefined) ? button.displayType : 0;

				//get button mode
				let buttonMode = 0;
				let channelName = '';
				let command = '';
				if (buttonCommand in CONSTANS.SystemMediaCommands) {
					buttonMode = 0;
					channelName = 'systemMedia';
					command = buttonCommand;
				} else if (buttonCommand in CONSTANS.SystemInputCommands) {
					buttonMode = 1;
					channelName = 'systemInput';
					command = buttonCommand;
				} else if (buttonCommand in CONSTANS.TvRemoteCommands) {
					buttonMode = 2;
					channelName = 'tvRemote';
				} else if (buttonCommand === 'recordGameDvr') {
					buttonMode = 3;
					command = buttonCommand;
				} else if (buttonCommand === 'reboot') {
					buttonMode = 4;
				} else if (buttonCommand === 'switchAppGame') {
					buttonMode = 5;
				};

				//get button inputOneStoreProductId
				const buttonOneStoreProductId = (button.oneStoreProductId != undefined) ? button.oneStoreProductId : '0';

				const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = false;
						const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, get Button state successful: %s', this.host, accessoryName, state);
						return state;
					})
					.onSet(async (state) => {
						const setDashboard = (buttonOneStoreProductId === 'Dashboard' || buttonOneStoreProductId === 'Settings' || buttonOneStoreProductId === 'SettingsTv' || buttonOneStoreProductId === 'Accessory' || buttonOneStoreProductId === 'Screensaver' || buttonOneStoreProductId === 'NetworkTroubleshooter' || buttonOneStoreProductId === 'XboxGuide');
						const setTelevision = (buttonOneStoreProductId === 'Television');
						const setApp = ((buttonOneStoreProductId != undefined && buttonOneStoreProductId != '0') && !setDashboard && !setTelevision);
						try {
							const setCommand = (this.power && state && this.webApiEnabled && buttonMode <= 2) ? await this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxLiveId, command) : false
							const recordGameDvr = (this.power && state && buttonMode == 3) ? await this.xboxLocalApi.recordGameDvr() : false;
							const rebootConsole = (this.power && state && this.webApiEnabled && buttonMode == 4) ? await this.xboxWebApi.getProvider('smartglass').reboot(this.xboxLiveId) : false;
							const setAppInput = (this.power && state && this.webApiEnabled && buttonMode == 5) ? setApp ? await this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxLiveId, buttonOneStoreProductId) : setDashboard ? await this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxLiveId) : setTelevision ? await this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxLiveId) : false : false;
							const logInfo = this.disableLogInfo ? false : this.log('Device: %s %s, set button successful, name: %s, command: %s', this.host, accessoryName, buttonName, buttonCommand);
							buttonService.updateCharacteristic(Characteristic.On, false);
						} catch (error) {
							this.log.error('Device: %s %s, set button error, name: %s, error: %s', this.host, accessoryName, buttonName, error);
							buttonService.updateCharacteristic(Characteristic.On, false);
						};
					});
				accessory.addService(buttonService);
			}
		}

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug3 = this.enableDebugMode ? this.log(`Device: ${this.host} ${accessoryName}, published as external accessory.`) : false;
	}
};