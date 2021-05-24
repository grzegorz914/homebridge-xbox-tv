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
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];

		//device
		this.manufacturer = config.manufacturer || 'Microsoft';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.inputsService = new Array();
		this.inputsName = new Array();
		this.inputsReference = new Array();
		this.inputsReferenceId = new Array();
		this.inputsType = new Array();
		this.installedAppsName = new Array();
		this.installedAppsAumId = new Array();
		this.installedAppsOneStoreProductId = new Array();
		this.buttonsService = new Array();
		this.buttonsName = new Array();
		this.buttonsReference = new Array();
		this.buttonsReferenceId = new Array();
		this.webApiEnabled = this.xboxWebApiEnabled ? this.webApiEnabled : false;
		this.xboxConnected = false;
		this.checkWebApiDeviceInfo = false;
		this.checkWebApiInstalledApps = false;
		this.checkDeviceInfo = false;
		this.checkDeviceState = false;
		this.setStartInput = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
		this.currentInputReferenceId = '';
		this.currentInputIdentifier = 0;
		this.setStartInputIdentifier = 0;
		this.currentMediaState = false;
		this.inputsLength = this.inputs.length;
		this.buttonsLength = this.buttons.length;
		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.authTokenFile = this.prefDir + '/' + 'ApiToken_' + this.host.split('.').join('') + '.json';
		this.installedAppsFile = this.prefDir + '/' + 'installedApps_' + this.host.split('.').join('');
		this.targetVisibilityInputsFile = this.prefDir + '/' + 'targetVisibilityInputs_' + this.host.split('.').join('');
		this.customInputsNameFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
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
		if (fs.existsSync(this.installedAppsFile) === false) {
			fsPromises.writeFile(this.installedAppsFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.customInputsNameFile) === false) {
			fsPromises.writeFile(this.customInputsNameFile, '');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.targetVisibilityInputsFile) === false) {
			fsPromises.writeFile(this.targetVisibilityInputsFile, '');
		}

		//Check net state
		setInterval(function () {
			if (!this.xboxConnected) {
				this.xbox = Smartglass();
				this.xbox.discovery(this.host).then(() => {
					this.log.debug('Device: %s %s, discovered.', this.host, this.name);
					this.connectToXbox();
				}).catch(() => {
					this.log.debug('Device: %s %s, discovering error: %s', this.host, this.name, error);
					this.currentPowerState = false;
				});

			} else {
				if (this.webApiEnabled && (this.checkWebApiDeviceInfo || this.checkWebApiInstalledApps)) {
					this.getWebApiDeviceInfo();
				}
				if (this.checkDeviceInfo) {
					this.getDeviceInfo();
				}
				if (!this.checkDeviceInfo && this.checkDeviceState) {
					this.updateDeviceState();
				}
			}
		}.bind(this), this.refreshInterval * 1000);

		const getWebApiToken = this.xboxWebApiEnabled ? this.getWebApiToken() : false;
		this.prepareAccessory();
	}

	connectToXbox() {
		this.xbox = Smartglass();
		this.xbox.connect(this.host).then(() => {
			this.log('Device: %s %s, connected.', this.host, this.name);
			this.xbox.addManager('system_input', SystemInputChannel());
			this.xbox.addManager('system_media', SystemMediaChannel());
			this.xbox.addManager('tv_remote', TvRemoteChannel());
			this.xboxConnected = true;
			this.currentPowerState = true;
			this.checkWebApiDeviceInfo = true;
			this.checkWebApiInstalledApps = true;
			this.checkDeviceInfo = true;
			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, true);
			}

			this.xbox.on('_on_timeout', () => {
				this.log('Device: %s %s, disconnected.', this.host, this.name);
				this.xboxConnected = false;
				this.currentPowerState = false;
				this.checkWebApiDeviceInfo = false;
				this.checkWebApiInstalledApps = false;
				this.checkDeviceInfo = false;
				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, false);
				}
			});
		}).catch(error => {
			this.log.debug('Device: %s %s, connection error: %s', this.host, this.name, error);
			this.xboxConnected = false;
			this.currentPowerState = false;
			this.checkWebApiDeviceInfo = false;
			this.checkWebApiInstalledApps = false;
			this.checkDeviceInfo = false;
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
		}).catch(() => {
			const oauth2URI = this.xboxWebApi._authentication.generateAuthorizationUrl();
			this.log('Device: %s %s, open the authentication URL and login to Your XboxLive account, next accept permision for this app, Open this URL: %s', this.host, this.name, oauth2URI);
			this.log('Device: %s %s, after accept permiosion for this app copy the part after the (?code=) from the response URL and paste it in to plugin config Settings >> Xbox Live and Web Api >> Web Api Token, save and restart the plugin again, done.', this.host, this.name);
			if (this.xboxWebApiToken !== undefined) {
				this.log('Device: %s %s, trying to authenticate with Web Api Token...', this.host, this.name, this.xboxWebApiToken);
				this.xboxWebApi._authentication.getTokenRequest(this.xboxWebApiToken).then((data) => {
					this.log('Device: %s %s, web api enabled.', this.host, this.name);
					this.log.debug('Device: %s %s, get oauth2 Web Api Token:', this.host, this.name, data);

					this.xboxWebApi._authentication._tokens.oauth = data;
					this.xboxWebApi._authentication.saveTokens();
					this.webApiEnabled = true;

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

	getWebApiDeviceInfo() {
		this.log.debug('Device: %s %s, requesting web api device info.', this.host, this.name);
		//get device info from xbox live account
		if (this.checkWebApiDeviceInfo) {
			this.xboxInfo = new Array();
			this.xboxWebApi.isAuthenticated().then(() => {
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
					const firmwareRevision = 'Unknown';

					const obj = { 'manufacturer': manufacturer, 'modelName': modelName, 'serialNumber': serialNumber, 'firmwareRevision': firmwareRevision };
					this.xboxInfo.push(obj);
					this.checkWebApiDeviceInfo = false;
				}).catch((error) => {
					this.log.debug('Device: %s %s, with liveid: %s, getConsoleStatus error: %s.', this.host, this.name, this.xboxliveid, error);
				});
			}).catch((error) => {
				this.log.debug('Device: %s %s, console not authenticated: %s', this.host, this.name, error);
			});
		}

		//get installed apps from xbox live account
		if (this.checkWebApiInstalledApps) {
			this.installedAppsArr = new Array();
			this.xboxWebApi.isAuthenticated().then(() => {
				this.xboxWebApi.getProvider('smartglass').getInstalledApps(this.xboxliveid).then((response) => {
					this.log.debug('Device: %s %s, debug status: %s, result: %s', this.host, this.name, response.status, response.result);

					const installedApps = response.result;
					const installedAppsLength = installedApps.length;
					for (let i = 0; i < installedAppsLength; i++) {
						const oneStoreProductId = installedApps[i].oneStoreProductId;
						const titleId = (installedApps[i].titleId);
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
						const obj = { 'name': name, 'reference': aumid, 'oneStoreProductId': oneStoreProductId };

						this.installedAppsOneStoreProductId.push(oneStoreProductId);
						this.installedAppsAumId.push(aumid);
						this.installedAppsName.push(name);
						this.installedAppsArr.push(obj);
					}

					const objApps = JSON.stringify(this.installedAppsArr, null, 2);
					const writeInstalledApps = fs.writeFileSync(this.installedAppsFile, objApps);
					this.log.debug('Device: %s %s, debug writeInstalledApps: %s', this.host, this.name, objApps);

					this.checkWebApiInstalledApps = false;
				}).catch((error) => {
					this.log.debug('Device: %s %s, getInstalledApps error: %s', this.host, this.name, error);
				});
			}).catch((error) => {
				this.log.debug('Device: %s %s, console not authenticated: %s', this.host, this.name, error);
			});
		}
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
					const manufacturer = this.webApiEnabled ? this.xboxInfo[0].manufacturer : this.manufacturer;
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
				}

				this.devInfoAndApps = devInfoAndApps;
				this.devConfig = devConfig;
				this.devNetConfig = devNetConfig;

				this.checkDeviceInfo = false;
				this.checkDeviceState = true;
			}
		}, function (error) {
			this.log.debug('Device: %s %s, _on_console_status error: %s', this.host, this.name, error);
		});
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, update device state.', this.host, this.name);
		const devInfoAndApps = this.devInfoAndApps;
		const devConfig = this.devConfig;
		this.log.debug('Device: %s %s, debug devInfoAndApps: %s, apps: %s, devConfig: %s', this.host, this.name, devInfoAndApps, devInfoAndApps.apps[0], devConfig);

		//chack current media state
		const mediaState = this.xbox.getManager('system_media').getState();
		this.log.debug('Device: %s %s, debug currentMediaState: %s', this.host, this.name, mediaState);
		const currentMediaState = (mediaState.title_id === 1);

		const powerState = this.xbox._connection_status;
		const inputReference = (devInfoAndApps.apps[0].aum_id !== undefined) ? devInfoAndApps.apps[0].aum_id : 0;
		const currentInputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
		const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
		const inputInstalledAppsIdentifier = (this.webApiEnabled && (this.installedAppsAumId.indexOf(inputReference) >= 0)) ? this.installedAppsAumId.indexOf(inputReference) : false;
		const inputReferenceId = (inputInstalledAppsIdentifier !== false) ? this.installedAppsOneStoreProductId[inputInstalledAppsIdentifier] : undefined;
		const inputName = (inputInstalledAppsIdentifier !== false) ? this.installedAppsName[inputInstalledAppsIdentifier] : this.inputsName[inputIdentifier];
		const volume = this.currentVolume;
		const mute = powerState ? this.currentMuteState : true;

		if (this.televisionService) {
			if (powerState) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, true)
				this.currentPowerState = true;
			}

			if (!powerState) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, false)
				this.currentPowerState = false;
			}

			const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
				this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
			this.setStartInput = (currentInputIdentifier === inputIdentifier) ? false : true;

			this.currentInputName = inputName;
			this.currentInputReference = inputReference;
			this.currentInputReferenceId = inputReferenceId;
			this.currentInputIdentifier = inputIdentifier;
		}

		if (this.speakerService) {
			this.speakerService
				.updateCharacteristic(Characteristic.Volume, volume)
				.updateCharacteristic(Characteristic.Mute, mute);
			if (this.volumeService && this.volumeControl === 1) {
				this.volumeService
					.updateCharacteristic(Characteristic.Brightness, volume)
					.updateCharacteristic(Characteristic.On, !mute);
			}
			if (this.volumeServiceFan && this.volumeControl === 2) {
				this.volumeServiceFan
					.updateCharacteristic(Characteristic.RotationSpeed, volume)
					.updateCharacteristic(Characteristic.On, !mute);
			}
			this.currentVolume = volume;
			this.currentMuteState = mute;
		}
		this.currentMediaState = currentMediaState;
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
				const state = this.currentPowerState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state && !this.currentPowerState) {
					const xbox = Smartglass();
					const setPowerOn = this.xboxWebApiEnabled ? this.xboxWebApi.getProvider('smartglass').powerOn(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, web api set power ON state successful', this.host, accessoryName);
						}
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true)
						this.currentPowerState = true;
					}).catch((error) => {
						this.log.error('Device: %s %s, web api set power ON, error: %s', this.host, accessoryName, error);
					}) : xbox.powerOn({ live_id: this.xboxliveid, tries: 15, ip: this.host }).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set power ON successful', this.host, accessoryName);
						}
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true)
						this.currentPowerState = true;
					}).catch(error => {
						this.log.error('Device: %s %s, set power ON, error: %s', this.host, accessoryName, error);
					});
				} else {
					if (!state && this.currentPowerState) {
						const setPowerOff = this.xboxWebApiEnabled ? this.xboxWebApi.getProvider('smartglass').powerOff(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, web api set power OFF successful', this.host, accessoryName);
							}
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false)
							this.currentPowerState = false;
						}).catch((error) => {
							this.log.error('Device: %s %s, set power OFF error: %s', this.host, accessoryName, error);
						}) : this.xbox.powerOff().then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set power OFF successful', this.host, accessoryName);
							}
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false)
							this.currentPowerState = false;
						}).catch(error => {
							this.log.error('Device: %s %s, set power OFF error: %s', this.host, accessoryName, error);
						});
					}
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.currentInputIdentifier;
				const inputName = this.currentInputName;
				const inputReference = this.currentInputReference;
				const inputReferenceId = this.currentInputReferenceId;
				if (!this.disableLogInfo && this.currentPowerState) {
					this.log('Device: %s %s, get current App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputReferenceId);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputReference = (this.inputsReference[inputIdentifier] !== undefined) ? this.inputsReference[inputIdentifier] : 0;
				const inputInstalledAppsIdentifier = (this.webApiEnabled && (this.installedAppsAumId.indexOf(inputReference) >= 0)) ? this.installedAppsAumId.indexOf(inputReference) : false;
				const inputReferenceId = (inputInstalledAppsIdentifier !== false) ? this.installedAppsOneStoreProductId[inputInstalledAppsIdentifier] : undefined;
				const inputName = (inputInstalledAppsIdentifier !== false) ? this.installedAppsName[inputInstalledAppsIdentifier] : this.inputsName[inputIdentifier];
				const setInput = this.webApiEnabled ? ((inputReference === 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application') || (inputReference === 'Microsoft.XboxDevices_8wekyb3d8bbwe!App') || (inputReference === 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application')) ? this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputReferenceId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set Dashboard error:', this.host, accessoryName, error);
				}) : (inputReferenceId === undefined) ? false : this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, inputReferenceId).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputReferenceId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set new App error:', this.host, accessoryName, error);
				}) : false;
				this.setStartInputIdentifier = inputIdentifier;
				this.setStartInput = this.currentPowerState ? false : true;
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
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
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
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
				const volume = this.currentVolume;
				if (!this.disableLogInfo && this.currentPowerState) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.currentVolume;
				}
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.currentPowerState ? this.currentMuteState : true;
				if (!this.disableLogInfo && this.currentPowerState) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (this.currentPowerState && (state !== this.currentMuteState)) {
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
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.currentPowerState ? !this.currentMuteState : false;
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
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.currentPowerState ? !this.currentMuteState : false;
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
		const inputs = this.inputs;

		const savedNames = ((fs.readFileSync(this.customInputsNameFile)).length > 0) ? JSON.parse(fs.readFileSync(this.customInputsNameFile)) : {};
		this.log.debug('Device: %s %s, read saved Apps name: %s', this.host, accessoryName, savedNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s, read target  state successful: %s', this.host, accessoryName, savedTargetVisibility);

		//check possible inputs count
		const inputsLength = (this.inputsLength > 96) ? 96 : this.inputsLength;
		for (let i = 0; i < inputsLength; i++) {

			//get input reference
			const inputReference = (inputs[i].reference !== undefined) ? inputs[i].reference : 0;

			//get input reference Id
			const inputInstalledAppsIdentifier = (this.webApiEnabled && (this.installedAppsAumId.indexOf(inputReference) >= 0)) ? this.installedAppsAumId.indexOf(inputReference) : false;
			const inputReferenceId = (inputInstalledAppsIdentifier !== false) ? this.installedAppsOneStoreProductId[inputInstalledAppsIdentifier] : undefined;

			//get input name		
			const inputName = (savedNames[inputReference] !== undefined) ? savedNames[inputReference] : (inputs[i].name !== undefined) ? inputs[i].name : inputs[i].reference;

			//get input type
			const inputType = 0;

			//get input configured
			const isConfigured = 1;

			//get input visibility state
			const targetVisibility = (savedTargetVisibility[inputReference] !== undefined) ? savedTargetVisibility[inputReference] : 0;
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
						let newName = savedNames;
						newName[inputReference] = name;
						const newCustomName = JSON.stringify(newName);
						const writeNewCustomName = await fsPromises.writeFile(this.customInputsNameFile, newCustomName);
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
			this.inputsReferenceId.push(inputReferenceId);
			this.inputsName.push(inputName);
			this.inputsType.push(inputType);

			this.inputsService.push(inputService);
			accessory.addService(this.inputsService[i]);
			this.televisionService.addLinkedService(this.inputsService[i]);
		}

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');
		const buttons = this.buttons;

		//check possible buttons count
		const buttonsLength = ((this.inputsLength + this.buttonsLength) > 96) ? 96 - this.inputsLength : this.buttonsLength;
		for (let i = 0; i < buttonsLength; i++) {

			//get button reference
			const buttonReference = (buttons[i].reference !== undefined) ? buttons[i].reference : 0;

			//get button referenceId
			const buttonInstalledAppsIdentifier = (this.webApiEnabled && (this.installedAppsAumId.indexOf(buttonReference) >= 0)) ? this.installedAppsAumId.indexOf(buttonReference) : false;
			const buttonReferenceId = (buttonInstalledAppsIdentifier !== false) ? this.installedAppsOneStoreProductId[buttonInstalledAppsIdentifier] : undefined;

			//get button name
			const buttonName = (buttons[i].name !== undefined) ? buttons[i].name : buttons[i].reference;

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
					if (state && this.currentPowerState) {
						const setInput = this.webApiEnabled ? ((buttonReferenceId === 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application') || (buttonReferenceId === 'Microsoft.XboxDevices_8wekyb3d8bbwe!App') || (buttonReferenceId === 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application')) ? this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Dashboard successful, name: %s, reference: %s', this.host, accessoryName, buttonName, buttonReferenceId);
							}
						}).catch((error) => {
							this.log.error('Device: %s %s, set Dashboard error:', this.host, accessoryName, error);
						}) : (buttonReferenceId === undefined) ? false : this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, buttonReferenceId).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new App successful, name: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, buttonName, buttonReference, buttonReferenceId);
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
			this.buttonsReferenceId.push(buttonReferenceId);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService)
			accessory.addService(this.buttonsService[i]);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
