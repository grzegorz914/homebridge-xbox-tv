'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const XboxWebApi = require('xbox-webapi');
const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const TvRemoteChannel = require('xbox-smartglass-core-node/src/channels/tvremote');

const PLUGIN_NAME = 'homebridge-xbox-tv';
const PLATFORM_NAME = 'XboxTv';

const CONSOLES_NAME = { 'XboxSeriesX': 'Xbox Series X', 'XboxSeriesS': 'Xbox Series S', 'XboxOne': 'Xbox One', 'XboxOneS': 'Xbox One S', 'XboxOneX': 'Xbox One X' };
const DEFAULT_INPUTS = [
	{ 'name': 'Dashboard', 'reference': 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application', 'oneStoreProductId': '', 'type': 'HOME_SCREEN', 'isGame': false, 'contentType': 'Application' },
	{ 'name': 'Settings', 'reference': 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application', 'oneStoreProductId': '', 'type': 'HOME_SCREEN', 'isGame': false, 'contentType': 'Application' },
	{ 'name': 'Accessory', 'reference': 'Microsoft.XboxDevices_8wekyb3d8bbwe!App', 'oneStoreProductId': '', 'type': 'HOME_SCREEN', 'isGame': false, 'contentType': 'Application' }
];

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, xboxTvPlatform, true);
};


class xboxTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log('No data found for homebridge-xbox-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				const deviceName = device.name;
				if (!deviceName) {
					this.log.warn('Device Name Missing')
				} else {
					this.log.info('Adding new accessory:', deviceName);
					new xboxTvDevice(this.log, device, this.api);
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

class xboxTvDevice {
	constructor(log, config, api) {
		this.log = log;
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.clientID = config.clientID || '5e5ead27-ed60-482d-b3fc-702b28a97404';
		this.clientSecret = config.clientSecret || false;
		this.xboxliveid = config.xboxliveid;
		this.xboxWebApiToken = config.xboxWebApiToken;
		this.xboxWebApiEnabled = config.xboxWebApiEnabled || false;
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu;
		this.getInputsFromDevice = config.getInputsFromDevice;
		this.inputs = config.inputs || DEFAULT_INPUTS;
		this.buttons = config.buttons || [];

		//device
		this.manufacturer = config.manufacturer || 'Microsoft';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.connectedToDevice = false;
		this.checkDeviceInfo = false;
		this.webApiEnabled = false;
		this.startPrepareAccessory = true;

		this.inputsService = new Array();
		this.inputsName = new Array();
		this.inputsReference = new Array();
		this.inputsOneStoreProductId = new Array();
		this.inputsType = new Array();
		this.buttonsService = new Array();
		this.buttonsName = new Array();
		this.buttonsReference = new Array();
		this.buttonsOneStoreProductId = new Array();
		this.powerState = false;
		this.muteState = false;
		this.volume = 0;
		this.inputName = '';
		this.inputReference = '';
		this.inputIdentifier = 0;
		this.oneStoreProductId = '';
		this.setStartInput = false;
		this.setStartInputIdentifier = 0;
		this.mediaState = false;
		this.pictureMode = 0;

		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.authTokenFile = this.prefDir + '/' + 'authToken_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.inputsNamesFile = this.prefDir + '/' + 'inputsNames_' + this.host.split('.').join('');
		this.targetVisibilityInputsFile = this.prefDir + '/' + 'targetVisibilityInputs_' + this.host.split('.').join('');

		this.xbox = Smartglass();

		this.xboxWebApi = XboxWebApi({
			clientId: this.clientID,
			clientSecret: this.clientSecret
		});

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}
		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fsPromises.mkdir(this.prefDir);
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devInfoFile) === false) {
			fsPromises.writeFile(this.devInfoFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.authTokenFile) === false) {
			fsPromises.writeFile(this.authTokenFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsFile) === false) {
			fsPromises.writeFile(this.inputsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsNamesFile) === false) {
			fsPromises.writeFile(this.inputsNamesFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.targetVisibilityInputsFile) === false) {
			fsPromises.writeFile(this.targetVisibilityInputsFile, '');
		}

		//Check net state
		setInterval(function () {
			if (!this.connectedToDevice) {
				this.xbox = Smartglass();
				this.xbox.discovery(this.host).then(() => {
					this.log.debug('Device: %s %s, discovered.', this.host, this.name);
					this.connectToXbox();
				}).catch(() => {
					this.log.debug('Device: %s %s, discovering error: %s', this.host, this.name, error);
				});
			} else {
				if (this.checkDeviceInfo) {
					const getWebApiTokenOrDeviceInfo = this.xboxWebApiEnabled ? this.getWebApiToken() : this.getDeviceInfo();
				}
			}
		}.bind(this), this.refreshInterval * 1000);
	}

	connectToXbox() {
		this.xbox = Smartglass();
		this.xbox.connect(this.host).then(() => {
			this.log('Device: %s %s, connected.', this.host, this.name);
			this.xbox.addManager('system_input', SystemInputChannel());
			this.xbox.addManager('system_media', SystemMediaChannel());
			this.xbox.addManager('tv_remote', TvRemoteChannel());
			this.connectedToDevice = true;
			this.checkDeviceInfo = true;
			this.powerState = true;

			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, true);
			}
		}).catch(error => {
			this.log.debug('Device: %s %s, connection error: %s', this.host, this.name, error);
		});

		this.xbox.on('_on_timeout', () => {
			this.log('Device: %s %s, disconnected.', this.host, this.name);
			this.connectedToDevice = false;
			this.powerState = false;

			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, false);
			}
		});
	};

	getWebApiToken() {
		this.log.debug('Device: %s %s, preparing web api.', this.host, this.name);
		this.xboxWebApi._authentication._tokensFile = this.authTokenFile;
		this.xboxWebApi.isAuthenticated().then(() => {
			this.log('Device: %s %s, authenticated and web api enabled.', this.host, this.name);
			this.webApiEnabled = true;
			const getWebApiConsoleStatus = this.checkDeviceInfo ? this.getWebApiConsoleStatus() : false;
		}).catch(() => {
			const oauth2URI = this.xboxWebApi._authentication.generateAuthorizationUrl();
			this.log('----- Device: %s %s start authentication process -----', this.host, this.name,);
			this.log('1. Open the URI: %s', oauth2URI);
			this.log('2. Login to Your Xbox Live account and accept permission for this app.');
			this.log('3. After accept permission copy the part after the (?code=) from the response URL.');
			this.log('4. Paste it in to the plugin config, Settings >> Xbox Live and Web Api >> Web Api Token.');
			this.log('5. Save and restart the plugin again, done.')
			this.log('----------------------------------------------------------------------------------------');
			if (this.xboxWebApiToken !== undefined) {
				this.log('Device: %s %s, trying to authenticate with Web Api Token...', this.host, this.name, this.xboxWebApiToken);
				this.xboxWebApi._authentication.getTokenRequest(this.xboxWebApiToken).then((data) => {
					this.log('Device: %s %s, web api enabled.', this.host, this.name);
					this.log.debug('Device: %s %s, get oauth2 Web Api Token:', this.host, this.name, data);

					this.xboxWebApi._authentication._tokens.oauth = data;
					this.xboxWebApi._authentication.saveTokens();
					this.webApiEnabled = true;
					const getWebApiConsoleStatus = this.checkDeviceInfo ? this.getWebApiConsoleStatus() : false;
				}).catch((error) => {
					this.log.debug('Device: %s %s, getTokenRequest error: %s:', this.host, this.name, error);
					this.webApiEnabled = false;
				});
			} else {
				this.log('Device: %s %s, web api disabled, token undefined.', this.host, this.name);
				this.webApiEnabled = false;
			}
		});
	}

	getWebApiConsoleStatus() {
		this.log.debug('Device: %s %s, requesting web api device info.', this.host, this.name);
		this.xboxInfo = new Array();
		this.xboxWebApi.getProvider('smartglass').getConsoleStatus(this.xboxliveid).then((response) => {
			this.log.debug('Device: %s %s, debug getConsoleStatus, result: %s', this.host, this.name, response);

			const id = response.id;
			const name = response.name;
			const locale = response.locale;
			const consoleType = CONSOLES_NAME[response.consoleType];
			const powerState = (response.powerState === 'On');
			const playback = (response.playbackState !== 'Stopped');
			const loginState = response.loginState;
			const focusAppAumid = response.focusAppAumid;
			const isTvConfigured = (response.isTvConfigured === true);
			const digitalAssistantRemoteControlEnabled = (response.digitalAssistantRemoteControlEnabled === true);
			const consoleStreamingEnabled = (response.consoleStreamingEnabled === true);
			const remoteManagementEnabled = (response.remoteManagementEnabled === true);

			const manufacturer = this.manufacturer;
			const modelName = consoleType;
			const serialNumber = id;
			const firmwareRevision = this.firmwareRevision;

			const obj = { 'manufacturer': manufacturer, 'modelName': modelName, 'serialNumber': serialNumber, 'firmwareRevision': firmwareRevision };
			this.xboxInfo.push(obj);

			const getWebApiInstalledApps = this.checkDeviceInfo ? this.getWebApiInstalledApps() : false
		}).catch((error) => {
			this.log.debug('Device: %s %s, with liveid: %s, getConsoleStatus error: %s.', this.host, this.name, this.xboxliveid, error);
		});
	}

	getWebApiInstalledApps() {
		this.log.debug('Device: %s %s, requesting installed apps from xbox live account.', this.host, this.name);
		this.xboxWebApi.getProvider('smartglass').getInstalledApps(this.xboxliveid).then((response) => {
			this.log.debug('Device: %s %s, debug status: %s, result: %s', this.host, this.name, response.status, response.result);

			const installedApps = response.result;
			const installedAppsCount = installedApps.length;

			const defaultInputsArr = new Array();
			const defaultInputsCount = DEFAULT_INPUTS.length;
			for (let i = 0; i < defaultInputsCount; i++) {
				defaultInputsArr.push(DEFAULT_INPUTS[i]);
			}
			for (let i = 0; i < installedAppsCount; i++) {
				const oneStoreProductId = installedApps[i].oneStoreProductId;
				const titleId = installedApps[i].titleId;
				const aumid = installedApps[i].aumid;
				const lastActiveTime = installedApps[i].lastActiveTime;
				const isGame = (installedApps[i].isGame === true);
				const name = installedApps[i].name;
				const contentType = installedApps[i].contentType;
				const instanceId = installedApps[i].instanceId;
				const storageDeviceId = installedApps[i].storageDeviceId;
				const uniqueId = installedApps[i].uniqueId;
				const legacyProductId = installedApps[i].legacyProductId;
				const version = installedApps[i].version;
				const sizeInBytes = installedApps[i].sizeInBytes;
				const installTime = installedApps[i].installTime;
				const updateTime = installedApps[i].updateTime;
				const parentId = installedApps[i].parentId;
				const type = 'APPLICATION';

				const appsObj = { 'name': name, 'reference': aumid, 'oneStoreProductId': oneStoreProductId, 'type': type, 'isGame': isGame, 'contentType': contentType };
				defaultInputsArr.push(appsObj);
			}

			const inputsArr = defaultInputsArr;
			const obj = JSON.stringify(inputsArr, null, 2);
			const writeInputs = fsPromises.writeFile(this.inputsFile, obj);
			this.log.debug('Device: %s %s, write apps list: %s', this.host, this.name, obj);

			this.installedApps = installedApps;
			const getDeviceInfo = this.checkDeviceInfo ? this.getDeviceInfo() : false;
		}).catch((error) => {
			this.log.debug('Device: %s %s, getInstalledApps error: %s', this.host, this.name, error);
		});
	}

	getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting device info.', this.host, this.name);
		this.xbox.on('_on_console_status', (response, config, smartglass) => {
			this.log.debug('Device %s %s, debug _on_console_status response: %s, config: %s, smartglass: %s', this.host, this.name, response.packet_decoded.protected_payload, config, smartglass);
			if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
				const devInfoAndApps = response.packet_decoded.protected_payload;
				const devConfig = config;
				const devNetConfig = smartglass;

				const live_tv_provider = devInfoAndApps.live_tv_provider;
				const major_version = devInfoAndApps.major_version;
				const minor_version = devInfoAndApps.minor_version;
				const build_number = devInfoAndApps.build_number;
				const locale = devInfoAndApps.locale;

				const ip = devConfig._ip;
				const certificate = devConfig._certificate;
				const iv = devConfig._iv;
				const liveid = devConfig._liveid;
				const is_authenticated = devConfig._is_authenticated;
				const participantid = devConfig._participantid;
				const connection_status = devConfig._connection_status;
				const request_num = devConfig._request_num;
				const target_participant_id = devConfig._target_participant_id;
				const source_participant_id = devConfig._source_participant_id;
				const fragments = devConfig._fragments;

				const address = devNetConfig.address;
				const family = devNetConfig.family;
				const port = devNetConfig.port;
				const size = devNetConfig.size;

				if (this.checkDeviceInfo) {
					const manufacturer = this.manufacturer;
					const modelName = this.webApiEnabled ? this.xboxInfo[0].modelName : this.modelName;
					const serialNumber = this.webApiEnabled ? this.xboxInfo[0].serialNumber : liveid;
					const firmwareRevision = major_version + '.' + minor_version + '.' + build_number;

					const obj = { 'manufacturer': manufacturer, 'modelName': modelName, 'serialNumber': serialNumber, 'firmwareRevision': firmwareRevision };
					const devInfo = JSON.stringify(obj, null, 2);
					const writeDevInfo = fsPromises.writeFile(this.devInfoFile, devInfo);
					this.log.debug('Device: %s %s, debug writeDevInfo: %s', this.host, this.name, devInfo);

					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', manufacturer);
					this.log('Model: %s', modelName);
					this.log('Serialnr: %s', serialNumber);
					this.log('Firmware: %s', firmwareRevision);
					this.log('----------------------------------');

					//start prepare accessory
					const startPrepareAccessory = this.startPrepareAccessory ? this.prepareAccessory() : false;
				}
				this.devInfoAndApps = devInfoAndApps;
				this.devConfig = devConfig;
				this.devNetConfig = devNetConfig;

				this.checkDeviceInfo = false;
				this.updateDeviceState();
			}
		}, function (error) {
			this.log.debug('Device: %s %s, _on_console_status error: %s', this.host, this.name, error);
		});
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, update device state.', this.host, this.name);
		try {
			//get variable data
			const installedApps = this.installedApps;
			const devInfoAndApps = this.devInfoAndApps;
			const devConfig = this.devConfig;
			const devNetConfig = this.devNetConfig;
			this.log.debug('Device: %s %s, debug devInfoAndApps: %s, apps: %s, devConfig: %s, devNetConfig: %s, installedApps: %s', this.host, this.name, devInfoAndApps, devInfoAndApps.apps[0], devConfig, devNetConfig, installedApps);

			//get current media state
			const data = this.xbox.getManager('system_media').getState();
			this.log.debug('Device: %s %s, debug data: %s', this.host, this.name, data);
			const mediaState = (data.title_id === 1);

			const powerState = this.xbox._connection_status;
			const inputReference = devInfoAndApps.apps[0].aum_id;
			const currentInputIdentifier = this.inputsReference.indexOf(inputReference) >= 0 ? this.inputsReference.indexOf(inputReference) : 0;
			const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
			const oneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
			const inputName = this.inputsName[inputIdentifier];
			const volume = this.volume;
			const muteState = this.muteState;

			if (!this.disableLogInfo) {
				this.log('Device: %s %s, get current App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, this.name, inputName, inputReference, oneStoreProductId);
			}

			if (this.televisionService) {
				if (powerState) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, true)
				} else {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, false)
				}

				const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
					this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				this.setStartInput = (currentInputIdentifier === inputIdentifier) ? false : true;
			}

			if (this.speakerService) {
				this.speakerService
					.updateCharacteristic(Characteristic.Volume, volume)
					.updateCharacteristic(Characteristic.Mute, muteState);
				if (this.volumeService && this.volumeControl === 1) {
					this.volumeService
						.updateCharacteristic(Characteristic.Brightness, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
				if (this.volumeServiceFan && this.volumeControl === 2) {
					this.volumeServiceFan
						.updateCharacteristic(Characteristic.RotationSpeed, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
			}

			this.powerState = powerState;
			this.inputReference = inputReference;
			this.inputIdentifier = inputIdentifier;
			this.oneStoreProductId = oneStoreProductId;
			this.inputName = inputName;
			this.volume = volume;
			this.muteState = powerState ? muteState : true;
			this.mediaState = mediaState;
			this.checkDeviceInfo = false;
		} catch (error) {
			this.log.debug('Device: %s %s, update device state error: %s', this.host, this.name, error);
			this.checkDeviceInfo = false;
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = (readDevInfo !== undefined) ? JSON.parse(readDevInfo) : { 'manufacturer': this.manufacturer, 'modelName': this.modelName, 'serialNumber': this.serialNumber, 'firmwareRevision': this.firmwareRevision };
			this.log.debug('Device: %s %s, debug devInfo: %s', this.host, accessoryName, devInfo);

			const manufacturer = devInfo.manufacturer;
			const modelName = devInfo.modelName;
			const serialNumber = devInfo.serialNumber;
			const firmwareRevision = devInfo.firmwareRevision;

			accessory.removeService(accessory.getService(Service.AccessoryInformation));
			const informationService = new Service.AccessoryInformation(accessoryName);
			informationService
				.setCharacteristic(Characteristic.Name, accessoryName)
				.setCharacteristic(Characteristic.Manufacturer, manufacturer)
				.setCharacteristic(Characteristic.Model, modelName)
				.setCharacteristic(Characteristic.SerialNumber, serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
			accessory.addService(informationService);
		} catch (error) {
			this.log.debug('Device: %s %s, debug prepareInformationService error: %s', this.host, accessoryName, error);
		};


		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state && !this.powerState) {
					const xbox = Smartglass();
					const setPowerOn = this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass').powerOn(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, web api set power ON state successful', this.host, accessoryName);
						}
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true)
						this.powerState = true;
					}).catch((error) => {
						this.log.error('Device: %s %s, web api set power ON, error: %s', this.host, accessoryName, error);
					}) : xbox.powerOn({ live_id: this.xboxliveid, tries: 15, ip: this.host }).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set power ON successful', this.host, accessoryName);
						}
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true)
						this.powerState = true;
					}).catch(error => {
						this.log.error('Device: %s %s, set power ON, error: %s', this.host, accessoryName, error);
					});
				} else {
					if (!state && this.powerState) {
						const setPowerOff = this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass').powerOff(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, web api set power OFF successful', this.host, accessoryName);
							}
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false)
							this.powerState = false;
						}).catch((error) => {
							this.log.error('Device: %s %s, set power OFF error: %s', this.host, accessoryName, error);
						}) : this.xbox.powerOff().then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set power OFF successful', this.host, accessoryName);
							}
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false)
							this.powerState = false;
						}).catch(error => {
							this.log.error('Device: %s %s, set power OFF error: %s', this.host, accessoryName, error);
						});
					}
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputName = this.inputName;
				const inputReference = this.inputReference;
				const oneStoreProductId = this.oneStoreProductId;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get current App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, oneStoreProductId);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputReference = this.inputsReference[inputIdentifier];
				const inputName = this.inputsName[inputIdentifier];
				const oneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				const setInput = this.webApiEnabled ? ((inputReference === 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application') || (inputReference === 'Microsoft.XboxDevices_8wekyb3d8bbwe!App') || (inputReference === 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application')) ? this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, oneStoreProductId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set Dashboard error:', this.host, accessoryName, error);
				}) : (oneStoreProductId === undefined) ? false : this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, oneStoreProductId).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, oneStoreProductId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set new App error:', this.host, accessoryName, error);
				}) : false;
				this.setStartInputIdentifier = inputIdentifier;
				this.setStartInput = this.powerState ? false : true;
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				if (this.powerState) {
					let type;
					switch (command) {
						case Characteristic.RemoteKey.REWIND:
							command = 'rewind';
							type = 'system_media';
							break;
						case Characteristic.RemoteKey.FAST_FORWARD:
							command = 'fast_forward';
							type = 'system_media';
							break;
						case Characteristic.RemoteKey.NEXT_TRACK:
							command = 'next_track';
							type = 'system_media';
							break;
						case Characteristic.RemoteKey.PREVIOUS_TRACK:
							command = 'prev_track';
							type = 'system_media';
							break;
						case Characteristic.RemoteKey.ARROW_UP:
							command = 'up';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.ARROW_DOWN:
							command = 'down';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.ARROW_LEFT:
							command = 'left';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.ARROW_RIGHT:
							command = 'right';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.SELECT:
							command = 'a';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.BACK:
							command = 'b';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.EXIT:
							command = 'nexus';
							type = 'system_input';
							break;
						case Characteristic.RemoteKey.PLAY_PAUSE:
							command = 'playpause';
							type = 'system_media';
							break;
						case Characteristic.RemoteKey.INFORMATION:
							command = this.switchInfoMenu ? 'nexus' : 'view';
							type = 'system_input';
							break;
					}
					this.xbox.getManager(type).sendCommand(command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, setRemoteKey successful,  command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not setRemoteKey command, error: %s', this.host, accessoryName, error);
					});
				}
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				if (this.powerState) {
					let type;
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'nexus' : 'menu';
							type = 'system_input';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'b';
							type = 'system_input';;
							break;
					}
					this.xbox.getManager(type).sendCommand(command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not setPowerModeSelection command, error: %s', this.host, accessoryName, error);
					});
				}
			});

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.onGet(async () => {
				const pictureMode = this.pictureMode;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Picture mode: %s', this.host, accessoryName, pictureMode);
				}
				return pictureMode;
			})
			.onSet(async (command) => {
				if (this.powerState) {
					switch (command) {
						case Characteristic.PictureMode.OTHER:
							command = 'PVMOV';
							break;
						case Characteristic.PictureMode.STANDARD:
							command = 'PVSTD';
							break;
						case Characteristic.PictureMode.CALIBRATED:
							command = 'PVDAY';
							break;
						case Characteristic.PictureMode.CALIBRATED_DARK:
							command = 'PVNGT';
							break;
						case Characteristic.PictureMode.VIVID:
							command = 'PVVVD';
							break;
						case Characteristic.PictureMode.GAME:
							command = 'PVSTM';
							break;
						case Characteristic.PictureMode.COMPUTER:
							command = 'PVSTM';
							break;
						case Characteristic.PictureMode.CUSTOM:
							command = 'PVCTM';
							break;
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setPictureMode successful, command: %s', this.host, accessoryName, command);
					}
				}
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				switch (command) {
					case Characteristic.VolumeSelector.INCREMENT:
						command = this.webApiEnabled ? 'Up' : 'btn.vol_up';
						break;
					case Characteristic.VolumeSelector.DECREMENT:
						command = this.webApiEnabled ? 'Down' : 'btn.vol_down';
						break;
				}
				const setVolume = this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass')._sendCommand(this.xboxliveid, 'Audio', 'Volume', [{
					'direction': (command), 'amount': 1,
				}]).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, can not setVolumeSelector command, error: %s', this.host, accessoryName, error);
				}) : this.xbox.getManager('tv_remote').sendIrCommand(command).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
					}
				}).catch(error => {
					this.log.error('Device: %s %s, can not setVolumeSelector command, error: %s', this.host, accessoryName, error);
				});
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				}
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.powerState ? this.muteState : true;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (this.powerState && (state !== this.muteState)) {
					const type = 'tv_remote';
					const command = 'btn.vol_mute';
					const toggleMute = this.webApiEnabled ? (state === true) ? this.xboxWebApi.getProvider('smartglass').mute(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, toggle Mute successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, toggle Mute, error: %s', this.host, accessoryName, error);
					}) : this.xboxWebApi.getProvider('smartglass').unmute(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, toggle Mute successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, toggle Mute, error: %s', this.host, accessoryName, error);
					}) : this.xbox.getManager(type).sendIrCommand(command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, toggle Mute successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					}).catch(error => {
						this.log.error('Device: %s %s, toggle Mute, error: %s', this.host, accessoryName, error);
					});
				};
			});

		this.televisionService.addLinkedService(this.speakerService);
		accessory.addService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'volumeService');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		this.log.debug('Device: %s %s, read saved installed Apps: %s', this.host, accessoryName, savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s, read saved Apps name: %s', this.host, accessoryName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s, read target  state successful: %s', this.host, accessoryName, savedTargetVisibility);

		//check available inputs and possible inputs count (max 95)
		const inputs = (this.getInputsFromDevice && this.webApiEnabled) ? savedInputs : this.inputs;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount > 95) ? 95 : inputsCount;
		for (let i = 0; i < maxInputsCount; i++) {

			//get input reference
			const inputReference = inputs[i].reference !== undefined ? inputs[i].reference : '0';

			//get input name		
			const inputName = savedInputsNames[inputReference] !== undefined ? savedInputsNames[inputReference] : inputs[i].name !== undefined ? inputs[i].name : 'undefined';

			//get input type
			const inputType = inputs[i].type !== undefined ? inputs[i].type : 'APPLICATION';

			//get input oneStoreProductId
			const inputOneStoreProductId = inputs[i].oneStoreProductId !== undefined ? inputs[i].oneStoreProductId : '0';

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const targetVisibility = savedTargetVisibility[inputReference] !== undefined ? savedTargetVisibility[inputReference] : 0;
			const currentVisibility = targetVisibility;

			const inputService = new Service.InputSource(inputReference, 'input' + i);
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
						let newName = savedInputsNames;
						newName[inputReference] = name;
						const newCustomName = JSON.stringify(newName);
						const writeNewCustomName = await fsPromises.writeFile(this.inputsNamesFile, newCustomName);
						this.log.debug('Device: %s %s, saved new App name successful, name: %s', this.host, accessoryName, newCustomName);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, new App name saved successful, name: %s reference: %s', this.host, accessoryName, newCustomName, inputReference);
						}
					} catch (error) {
						this.log.error('Device: %s %s, new App name saved error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onGet(async () => {
					const state = targetVisibility;
					this.log.debug('Device: %s %s, App: %s, target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
					return state;
				})
				.onSet(async (state) => {
					try {
						let newState = savedTargetVisibility;
						newState[inputReference] = state;
						const newTargetVisibility = JSON.stringify(newState);
						const writeNewTargetVisibility = await fsPromises.writeFile(this.targetVisibilityInputsFile, newTargetVisibility);
						this.log.debug('Device: %s %s, App: %s, saved new target visibility state: %s', this.host, accessoryName, inputName, newTargetVisibility);
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, App: %s, saved new target visibility state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						}
						inputService.setCharacteristic(Characteristic.CurrentVisibilityState, state);
					} catch (error) {
						this.log.error('Device: %s %s, App: %s, saved new target visibility error: %s', this.host, accessoryName, error);
					}
				});

			this.inputsReference.push(inputReference);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);
			this.inputsOneStoreProductId.push(inputOneStoreProductId);

			this.inputsService.push(inputService);
			this.televisionService.addLinkedService(this.inputsService[i]);
			accessory.addService(this.inputsService[i]);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');

		//check available buttons and possible buttons count (max 95 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const maxButtonsCount = ((inputsCount + buttonsCount) > 95) ? 95 - inputsCount : buttonsCount;
		for (let i = 0; i < maxButtonsCount; i++) {

			//get button reference
			const buttonReference = (buttons[i].reference !== undefined) ? buttons[i].reference : '0';

			//get button oneStoreProductId
			const buttonOneStoreProductId = (buttons[i].oneStoreProductId !== undefined) ? buttons[i].oneStoreProductId : '0';

			//get button name
			const buttonName = (buttons[i].name !== undefined) ? buttons[i].name : 'undefinded';

			const buttonService = new Service.Switch(accessoryName + ' ' + buttonName, 'buttonService' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get current state successful: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					if (state && this.powerState) {
						const setInput = this.webApiEnabled ? ((buttonReference === 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application') || (buttonReference === 'Microsoft.XboxDevices_8wekyb3d8bbwe!App') || (buttonReference === 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application')) ? this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Dashboard successful, name: %s, reference: %s', this.host, accessoryName, buttonName, buttonReference);
							}
						}).catch((error) => {
							this.log.error('Device: %s %s, set Dashboard error:', this.host, accessoryName, error);
						}) : (buttonOneStoreProductId === undefined) ? false : this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, buttonOneStoreProductId).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, buttonName, buttonReference, buttonOneStoreProductId);
							}
						}).catch((error) => {
							this.log.error('Device: %s %s, set new App error:', this.host, accessoryName, error);
						}) : false;
						setTimeout(() => {
							buttonService
								.updateCharacteristic(Characteristic.On, false);
						}, 250);
					} else {
						setTimeout(() => {
							buttonService
								.updateCharacteristic(Characteristic.On, false);
						}, 250);
					}
				});
			this.buttonsReference.push(buttonReference);
			this.buttonsOneStoreProductId.push(buttonOneStoreProductId);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService)
			accessory.addService(this.buttonsService[i]);
		}

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
