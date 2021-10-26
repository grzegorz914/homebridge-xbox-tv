'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

const XboxWebApi = require('xbox-webapi');
const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const TvRemoteChannel = require('xbox-smartglass-core-node/src/channels/tvremote');

const PLUGIN_NAME = 'homebridge-xbox-tv';
const PLATFORM_NAME = 'XboxTv';

const CONSOLES_NAME = {
	'XboxSeriesX': 'Xbox Series X',
	'XboxSeriesS': 'Xbox Series S',
	'XboxOne': 'Xbox One',
	'XboxOneS': 'Xbox One S',
	'XboxOneX': 'Xbox One X'
};
const CONSOLE_POWER_STATE = {
	'Off': 0,
	'On': 1,
	'ConnectedStandby': 2,
	'SystemUpdate': 3,
	'Unknown': 4
};
const CONSOLE_PLAYBACK_STATE = {
	'Stopped': 0,
	'Playing': 1,
	'Paused': 2,
	'Unknown': 3
};
const DEFAULT_INPUTS = [{
		'name': 'Television',
		'titleId': 'Television',
		'reference': 'Xbox.Television',
		'oneStoreProductId': 'Television',
		'type': 'HDMI',
		'contentType': 'systemApp'
	},
	{
		'name': 'Dashboard',
		'titleId': 'Dashboard',
		'reference': 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application',
		'oneStoreProductId': 'Dashboard',
		'type': 'HOME_SCREEN',
		'contentType': 'Dashboard'
	},
	{
		'name': 'Settings',
		'titleId': 'Settings',
		'reference': 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application',
		'oneStoreProductId': 'Settings',
		'type': 'HOME_SCREEN',
		'contentType': 'Settings'
	},
	{
		'name': 'Accessory',
		'titleId': 'Accessory',
		'reference': 'Microsoft.XboxDevices_8wekyb3d8bbwe!App',
		'oneStoreProductId': 'Accessory',
		'type': 'HOME_SCREEN',
		'contentType': 'systemApp'
	}
];

const INPUT_SOURCE_TYPES = ['OTHER', 'HOME_SCREEN', 'TUNER', 'HDMI', 'COMPOSITE_VIDEO', 'S_VIDEO', 'COMPONENT_VIDEO', 'DVI', 'AIRPLAY', 'USB', 'APPLICATION'];

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
			log('No configuration found for %s', PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				if (!device.name) {
					this.log.warn('Device Name Missing');
				} else {
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
		this.config = config;
		this.api = api;

		//device configuration
		this.name = config.name || 'Game console';
		this.host = config.host || '';
		this.clientID = config.clientID || '5e5ead27-ed60-482d-b3fc-702b28a97404';
		this.clientSecret = config.clientSecret || false;
		this.userToken = config.userToken || '';
		this.uhs = config.uhs || '';
		this.xboxliveid = config.xboxliveid || '';
		this.xboxWebApiToken = config.xboxWebApiToken || '';
		this.webApiControl = config.webApiControl || false;
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo || false;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.filterGames = config.filterGames || false;
		this.filterApps = config.filterApps || false;
		this.filterSystemApps = config.filterSystemApps || false;
		this.filterDlc = config.filterDlc || false;
		this.rebootControl = config.rebootControl || false;
		this.recordGameDvr = config.recordGameDvr || false;
		this.inputs = config.inputs || [];
		this.buttons = config.buttons || [];

		//add configured inputs to the default inputs
		const inputsArr = new Array();
		const defaultInputsCount = DEFAULT_INPUTS.length;
		for (let i = 0; i < defaultInputsCount; i++) {
			inputsArr.push(DEFAULT_INPUTS[i]);
		}
		const inputsCount = this.inputs.length;
		for (let j = 0; j < inputsCount; j++) {
			const obj = {
				'name': this.inputs[j].name,
				'titleId': this.inputs[j].titleId,
				'reference': this.inputs[j].reference,
				'oneStoreProductId': this.inputs[j].oneStoreProductId,
				'type': this.inputs[j].type,
				'contentType': 'Game'
			}
			inputsArr.push(obj);
		}
		this.inputs = inputsArr;

		//device
		this.manufacturer = config.manufacturer || 'Microsoft';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//web api and device data
		this.consolesListData = {};
		this.userProfileData = {};
		this.consoleStatusData = {};
		this.installedAppsData = {};
		this.storageDevicesData = {};
		this.devInfoAndAppsData = {};
		this.devConfigData = {};
		this.devNetConfigData = {};

		//setup variables
		this.deviceIsOnline = false;
		this.connectedToDevice = false;
		this.checkDeviceInfo = false;
		this.webApiEnabled = false;

		this.inputsReference = new Array();
		this.inputsOneStoreProductId = new Array();
		this.inputsName = new Array();
		this.inputsTitleId = new Array();
		this.inputsType = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = false;
		this.mediaState = 0;
		this.pictureMode = 0;
		this.brightness = 0;
		this.invertMediaState = false;

		this.setStartInput = false;
		this.setStartInputIdentifier = 0;
		this.inputIdentifier = 0;
		this.inputTitleId = '';
		this.inputReference = '';
		this.inputOneStoreProductId = '';
		this.inputName = '';
		this.inputType = 0;

		const prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.authTokenFile = `${prefDir}/authToken_${this.host.split('.').join('')}`;
		this.devInfoFile = `${prefDir}/devInfo_${this.host.split('.').join('')}`;
		this.inputsFile = `${prefDir}/inputs_${this.host.split('.').join('')}`;
		this.inputsNamesFile = `${prefDir}/inputsNames_${this.host.split('.').join('')}`;
		this.inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${this.host.split('.').join('')}`;

		//check if the directory exists, if not then create it
		if (fs.existsSync(prefDir) == false) {
			fsPromises.mkdir(prefDir);
		}
		if (fs.existsSync(this.authTokenFile) == false) {
			fsPromises.writeFile(this.authTokenFile, '');
		}
		if (fs.existsSync(this.devInfoFile) == false) {
			fsPromises.writeFile(this.devInfoFile, '');
		}
		if (fs.existsSync(this.inputsFile) == false) {
			fsPromises.writeFile(this.inputsFile, '');
		}
		if (fs.existsSync(this.inputsNamesFile) == false) {
			fsPromises.writeFile(this.inputsNamesFile, '');
		}
		if (fs.existsSync(this.inputsTargetVisibilityFile) == false) {
			fsPromises.writeFile(this.inputsTargetVisibilityFile, '');
		}

		this.xbox = Smartglass();

		this.xboxWebApi = XboxWebApi({
			clientId: this.clientID,
			clientSecret: this.clientSecret,
			userToken: this.userToken,
			uhs: this.uhs
		});

		setInterval(async function () {
			if (!this.connectedToDevice) {
				this.xbox = Smartglass();
				try {
					const discoveryData = await this.xbox.discovery(this.host);
					this.log.debug('Device: %s %s, debug discoveryData: %s.', this.host, this.name, discoveryData);

					const consolesArr = new Array();
					const consolesCount = discoveryData.length;
					if (consolesCount > 0) {
						for (let i = 0; i < consolesCount; i++) {
							const message = discoveryData[i].message;
							const addressIp = discoveryData[i].remote.address;
							const family = discoveryData[i].remote.family;
							const port = discoveryData[i].remote.port;
							const size = discoveryData[i].remote.size;

							const obj = {
								message: message,
								addressIp: addressIp,
								family: family,
								port: port,
								size: size
							}
							consolesArr.push(obj);
							this.log.debug('Device: %s %s, debug discovery obj: %s', this.host, this.name, obj);

						}
						this.deviceIsOnline = true;
						this.connectToXbox();
					}
				} catch (error) {
					this.log.debug('Device: %s %s, discovery error: %s', this.host, this.name, error);
					this.deviceIsOnline = false;
				};
			}

		}.bind(this), this.refreshInterval * 1000);

		setInterval(function () {
			if (this.connectedToDevice) {
				const getWebApiInstalledApps = this.webApiControl && this.webApiEnabled ? this.getWebApiInstalledApps() : false;
			}
		}.bind(this), 60000);

		const getWebApiToken = this.webApiControl ? this.getWebApiToken() : false;

		//start prepare accessory
		this.prepareAccessory();
	}

	async connectToXbox() {
		try {
			this.xbox = Smartglass();
			await this.xbox.connect(this.host);
			this.xbox.addManager('system_input', SystemInputChannel());
			this.xbox.addManager('system_media', SystemMediaChannel());
			this.xbox.addManager('tv_remote', TvRemoteChannel());
			this.connectedToDevice = true;
			this.checkDeviceInfo = true;

			this.xbox.on('_on_console_status', (response, config, smartglass) => {
				this.log.debug('Device %s %s, debug _on_console_status response: %s, apps: %s, config: %s, smartglass: %s', this.host, this.name, response.packet_decoded.protected_payload, response.packet_decoded.protected_payload.apps[0], config, smartglass);
				if (response.packet_decoded.protected_payload.apps[0] != undefined) {
					const devInfoAndAppsData = response.packet_decoded.protected_payload;
					const devConfigData = config;
					const devNetConfigData = smartglass;

					const live_tv_provider = devInfoAndAppsData.live_tv_provider;
					const major_version = devInfoAndAppsData.major_version;
					const minor_version = devInfoAndAppsData.minor_version;
					const build_number = devInfoAndAppsData.build_number;
					const locale = devInfoAndAppsData.locale;

					const titleId = devInfoAndAppsData.apps[0].title_id;
					const flags = devInfoAndAppsData.apps[0].flags;
					const productId = devInfoAndAppsData.apps[0].product_id;
					const sandboxId = devInfoAndAppsData.apps[0].sandbox_id;
					const aumId = devInfoAndAppsData.apps[0].aum_id;

					const ip = devConfigData._ip;
					const certificate = devConfigData._certificate;
					const iv = devConfigData._iv;
					const liveid = devConfigData._liveid;
					const is_authenticated = devConfigData._is_authenticated;
					const participantid = devConfigData._participantid;
					const connection_status = devConfigData._connection_status;
					const request_num = devConfigData._request_num;
					const target_participant_id = devConfigData._target_participant_id;
					const source_participant_id = devConfigData._source_participant_id;
					const fragments = devConfigData._fragments;


					const address = devNetConfigData.address;
					const family = devNetConfigData.family;
					const port = devNetConfigData.port;
					const size = devNetConfigData.size;

					this.devInfoAndAppsData = devInfoAndAppsData;
					this.devConfigData = devConfigData;
					this.devNetConfigData = devNetConfigData;

					this.titleId = titleId;
					this.inputReference = aumId;
					this.major_version = major_version;
					this.minor_version = minor_version;
					this.build_number = build_number;
					this.liveid = liveid;

					const getDeviceInfoUpdateDeviceState = this.checkDeviceInfo ? this.getDeviceInfo() : this.updateDeviceState();
				}
			}, function (error) {
				this.log.error('Device: %s %s, get Device Info error: %s', this.host, this.name, error);
				this.checkDeviceInfo = true;
			});

			this.xbox.on('_on_timeout', () => {
				this.log('Device: %s %s, Disconnected.', this.host, this.name);
				this.deviceIsOnline = false;
				this.connectedToDevice = false;
				this.checkDeviceInfo = false;
				this.updateDeviceState();
			});
		} catch (error) {
			this.log('Device: %s %s, connection error: %s', this.host, this.name, error);
		};
	};

	async getWebApiToken() {
		this.log.debug('Device: %s %s, preparing web api.', this.host, this.name);
		try {
			this.xboxWebApi._authentication._tokensFile = this.authTokenFile;
			const isAuthenticated = await this.xboxWebApi.isAuthenticated();
			this.log('Device: %s %s, authenticated and web api enabled.', this.host, this.name);
			this.webApiEnabled = true;
			this.getWebApiInstalledApps();
		} catch (error) {
			const oauth2URI = this.xboxWebApi._authentication.generateAuthorizationUrl();
			this.log('----- Device: %s %s start authentication process -----', this.host, this.name, );
			this.log('1. Open the URI: %s', oauth2URI);
			this.log('2. Login to Your Xbox Live account and accept permission for this app.');
			this.log('3. After accept permission copy the part after the (?code=) from the response URL.');
			this.log('4. Paste it in to the plugin config, Settings >> Xbox Live and Web Api >> Web Api Token.');
			this.log('5. Save and restart the plugin again, done.')
			this.log('----------------------------------------------------------------------------------------');
			if (this.xboxWebApiToken != undefined) {
				this.log('Device: %s %s, trying to authenticate with Web Api Token...', this.host, this.name, this.xboxWebApiToken);
				try {
					const authenticationData = await this.xboxWebApi._authentication.getTokenRequest(this.xboxWebApiToken);
					this.log('Device: %s %s, web api enabled.', this.host, this.name);
					this.log.debug('Device: %s %s, get oauth2 Web Api Token:', this.host, this.name, data);

					this.xboxWebApi._authentication._tokens.oauth = authenticationData;
					this.xboxWebApi._authentication.saveTokens();
					this.webApiEnabled = true;
					this.getWebApiInstalledApps();
				} catch (error) {
					this.log.debug('Device: %s %s, getTokenRequest error: %s:', this.host, this.name, error);
					this.webApiEnabled = false;
				};
			} else {
				this.log('Device: %s %s, web api disabled, token undefined.', this.host, this.name);
				this.webApiEnabled = false;
			}
		};
	}

	async getWebApiConsolesList() {
		this.log.debug('Device: %s %s, requesting web api consoles list.', this.host, this.name);
		try {
			const getConsolesListData = await this.xboxWebApi.getProvider('smartglass').getConsolesList();
			this.log.debug('Device: %s %s, debug getConsolesListData, result: %s, %s', this.host, this.name, getConsolesListData.result[0], getConsolesListData.result[0].storageDevices[0]);
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
				const id = consolesListData[i].id;
				const name = consolesListData[i].name;
				const locale = consolesListData[i].locale;
				const region = consolesListData[i].region;
				const consoleType = consolesListData[i].consoleType;
				const powerState = CONSOLE_POWER_STATE[consolesListData[i].powerState]; // 0 - Off, 1 - On, 2 - ConnectedStandby, 3 - SystemUpdate
				const digitalAssistantRemoteControlEnabled = (consolesListData[i].digitalAssistantRemoteControlEnabled == true);
				const remoteManagementEnabled = (consolesListData[i].remoteManagementEnabled == true);
				const consoleStreamingEnabled = (consolesListData[i].consoleStreamingEnabled == true);
				const wirelessWarning = (consolesListData[i].wirelessWarning == true);
				const outOfHomeWarning = (consolesListData[i].outOfHomeWarning == true);

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

				const consolesStorageDevicesCount = consolesListData[i].storageDevices.length;
				for (let j = 0; j < consolesStorageDevicesCount; j++) {
					const storageDeviceId = consolesListData[i].storageDevices[j].storageDeviceId;
					const storageDeviceName = consolesListData[i].storageDevices[j].storageDeviceName;
					const isDefault = (consolesListData[i].storageDevices[j].isDefault == true);
					const freeSpaceBytes = consolesListData[i].storageDevices[j].freeSpaceBytes;
					const totalSpaceBytes = consolesListData[i].storageDevices[j].totalSpaceBytes;
					const isGen9Compatible = consolesListData[i].storageDevices[j].isGen9Compatible;

					this.consolesStorageDeviceId.push(storageDeviceId);
					this.consolesStorageDeviceName.push(storageDeviceName);
					this.consolesIsDefault.push(isDefault);
					this.consolesFreeSpaceBytes.push(freeSpaceBytes);
					this.consolesTotalSpaceBytes.push(totalSpaceBytes);
					this.consolesIsGen9Compatible.push(isGen9Compatible);
				}
			}

			this.consolesListData = consolesListData;
			this.getWebApiUserProfile();
		} catch (error) {
			this.log.error('Device: %s %s, get Consoles List error: %s.', this.host, this.name, error);
		};
	}

	async getWebApiUserProfile() {
		this.log.debug('Device: %s %s, requesting web api user profile.', this.host, this.name);
		try {
			const getUserProfileData = await this.xboxWebApi.getProvider('profile').getUserProfile();
			this.log.debug('Device: %s %s, debug getUserProfileData, result: %s', this.host, this.name, getUserProfileData.profileUsers[0], getUserProfileData.profileUsers[0].settings[0]);
			const userProfileData = getUserProfileData.profileUsers;

			this.userProfileId = new Array();
			this.userProfileHostId = new Array();
			this.userProfileIsSponsoredUser = new Array();

			this.userProfileSettingsId = new Array();
			this.userProfileSettingsValue = new Array();

			const profileUsersCount = userProfileData.length;
			for (let i = 0; i < profileUsersCount; i++) {
				const id = userProfileData[i].id;
				const hostId = userProfileData[i].hostId;
				const isSponsoredUser = userProfileData[i].isSponsoredUser;

				this.userProfileId.push(id);
				this.userProfileHostId.push(hostId);
				this.userProfileIsSponsoredUser.push(isSponsoredUser);

				const profileUsersSettingsCount = userProfileData[i].settings.length;
				for (let j = 0; j < profileUsersSettingsCount; j++) {
					const id = userProfileData[i].settings[j].id;
					const value = userProfileData[i].settings[j].value;

					this.userProfileSettingsId.push(id);
					this.userProfileSettingsValue.push(value);
				}
			}

			this.userProfileData = userProfileData;
			this.getWebApiInstalledApps();
		} catch (error) {
			this.log.error('Device: %s %s, get User Profile error: %s.', this.host, this.name, error);
		};
	}

	async getWebApiInstalledApps() {
		this.log.debug('Device: %s %s, requesting installed apps from xbox live account.', this.host, this.name);
		try {
			const getInstalledAppsData = await this.xboxWebApi.getProvider('smartglass').getInstalledApps(this.xboxliveid);
			this.log.debug('Device: %s %s, debug getInstalledAppsData: %s', this.host, this.name, getInstalledAppsData.result);

			const inputsArr = new Array();
			const defaultInputsCount = DEFAULT_INPUTS.length;
			for (let i = 0; i < defaultInputsCount; i++) {
				inputsArr.push(DEFAULT_INPUTS[i]);
			}

			//get installed inputs/apps from web
			const inputsData = getInstalledAppsData.result;
			const inputsCount = inputsData.length;
			for (let i = 0; i < inputsCount; i++) {
				const oneStoreProductId = inputsData[i].oneStoreProductId;
				const titleId = inputsData[i].titleId;
				const aumid = inputsData[i].aumid;
				const lastActiveTime = inputsData[i].lastActiveTime;
				const isGame = (inputsData[i].isGame == true);
				const name = inputsData[i].name;
				const contentType = inputsData[i].contentType;
				const instanceId = inputsData[i].instanceId;
				const storageDeviceId = inputsData[i].storageDeviceId;
				const uniqueId = inputsData[i].uniqueId;
				const legacyProductId = inputsData[i].legacyProductId;
				const version = inputsData[i].version;
				const sizeInBytes = inputsData[i].sizeInBytes;
				const installTime = inputsData[i].installTime;
				const updateTime = inputsData[i].updateTime;
				const parentId = inputsData[i].parentId;
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
			}
			const obj = JSON.stringify(inputsArr, null, 2);
			const writeInputs = await fsPromises.writeFile(this.inputsFile, obj);
			this.log.debug('Device: %s %s, saved inputs/apps list: %s', this.host, this.name, obj);

			this.installedAppsData = inputsData;
			this.getWebApiStorageDevices();
		} catch (error) {
			if (error.status == 401) {
				this.getWebApiToken();
				this.log('Device: %s %s, with liveid: %s, get Installed Apps error, trying to reauthenticate.', this.host, this.name, this.xboxliveid);
			} else {
				this.log.error('Device: %s %s, with liveid: %s, get Installed Apps error: %s.', this.host, this.name, this.xboxliveid, error);
			}
		};
	}

	async getWebApiStorageDevices() {
		this.log.debug('Device: %s %s, requesting web api storage devices.', this.host, this.name);
		try {
			const getStorageDevicesData = await this.xboxWebApi.getProvider('smartglass').getStorageDevices(this.xboxliveid);
			this.log.debug('Device: %s %s, debug getStorageDevicesData, result: %s', this.host, this.name, getStorageDevicesData);

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
				const storageDeviceId = storageDeviceData[i].storageDeviceId;
				const storageDeviceName = storageDeviceData[i].storageDeviceName;
				const isDefault = (storageDeviceData[i].isDefault == true);
				const freeSpaceBytes = storageDeviceData[i].freeSpaceBytes;
				const totalSpaceBytes = storageDeviceData[i].totalSpaceBytes;
				const isGen9Compatible = storageDeviceData[i].isGen9Compatible;

				this.storageDeviceId.push(storageDeviceId);
				this.storageDeviceName.push(storageDeviceName);
				this.isDefault.push(isDefault);
				this.freeSpaceBytes.push(freeSpaceBytes);
				this.totalSpaceBytes.push(totalSpaceBytes);
				this.isGen9Compatible.push(isGen9Compatible);
			}
			this.storageDevicesData = storageDeviceData;
			this.getWebApiConsoleStatus();
		} catch (error) {
			this.log.error('Device: %s %s, with liveid: %s, get Storage Devices error: %s.', this.host, this.name, this.xboxliveid, error);
		};
	}

	async getWebApiConsoleStatus() {
		this.log.debug('Device: %s %s, requesting web api device info.', this.host, this.name);
		try {
			const getConsoleStatusData = await this.xboxWebApi.getProvider('smartglass').getConsoleStatus(this.xboxliveid);
			this.log.debug('Device: %s %s, debug getConsoleStatusData, result: %s', this.host, this.name, getConsoleStatusData);
			const consoleStatusData = getConsoleStatusData;

			const id = consoleStatusData.id;
			const name = consoleStatusData.name;
			const locale = consoleStatusData.locale;
			const region = consoleStatusData.region;
			const consoleType = CONSOLES_NAME[consoleStatusData.consoleType];
			const powerState = (CONSOLE_POWER_STATE[consoleStatusData.powerState] == 1); // 0 - Off, 1 - On, 2 - InStandby, 3 - SystemUpdate
			const playbackState = (CONSOLE_PLAYBACK_STATE[consoleStatusData.playbackState] == 1); // 0 - Stopped, 1 - Playng, 2 - Paused
			const loginState = consoleStatusData.loginState;
			const focusAppAumid = consoleStatusData.focusAppAumid;
			const isTvConfigured = (consoleStatusData.isTvConfigured == true);
			const digitalAssistantRemoteControlEnabled = (consoleStatusData.digitalAssistantRemoteControlEnabled == true);
			const consoleStreamingEnabled = (consoleStatusData.consoleStreamingEnabled == true);
			const remoteManagementEnabled = (consoleStatusData.remoteManagementEnabled == true);

			this.serialNumber = id;
			this.modelName = consoleType;
			//this.powerState = powerState;
			//this.mediaState = playbackState;
			this.consoleStatusData = consoleStatusData;
		} catch (error) {
			if (error.status == 401) {
				this.getWebApiToken();
				this.log('Device: %s %s, with liveid: %s, get Console Status error, trying to reauthenticate.', this.host, this.name, this.xboxliveid);
			} else {
				this.log.error('Device: %s %s, with liveid: %s, get Console Status error: %s.', this.host, this.name, this.xboxliveid, error);
			}
		};
	}

	async getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting device info.', this.host, this.name);
		try {
			//display device info
			const manufacturer = this.manufacturer;
			const modelName = this.modelName;
			const serialNumber = this.webApiEnabled ? this.serialNumber : this.liveid;
			const firmwareRevision = `${this.major_version}.${this.minor_version}.${this.build_number}`;

			this.log('Device: %s %s, Connected.', this.host, this.name);
			this.log('-------- %s --------', this.name);
			this.log('Manufacturer: %s', manufacturer);
			this.log('Model: %s', modelName);
			this.log('Serialnr: %s', serialNumber);
			this.log('Firmware: %s', firmwareRevision);
			this.log('----------------------------------');

			const devInfoObj = {
				'manufacturer': manufacturer,
				'modelName': modelName,
				'serialNumber': serialNumber,
				'firmwareRevision': firmwareRevision
			};
			const obj = JSON.stringify(devInfoObj, null, 2);
			const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, obj);
			this.log.debug('Device: %s %s, debug writeDevInfo: %s', this.host, this.name, obj);

			this.checkDeviceInfo = false
			this.updateDeviceState()
		} catch (error) {
			this.log.error('Device: %s %s, get Device Info error: %s', this.host, this.name, error);
			this.checkDeviceInfo = true;
		};
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, debug update device state.', this.host, this.name);
		try {
			//get variable data
			const powerState = this.xbox._connection_status;
			const volume = this.volume;
			const muteState = powerState ? this.muteState : true;

			const titleId = this.titleId
			const inputReference = this.inputReference;

			const currentInputIdentifier = this.inputsTitleId.indexOf(titleId) >= 0 ? this.inputsTitleId.indexOf(titleId) : this.inputsReference.indexOf(inputReference) >= 0 ? this.inputsReference.indexOf(inputReference) : this.inputIdentifier;
			const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
			const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
			const inputName = this.inputsName[inputIdentifier];
			const inputType = this.inputsType.indexOf(inputIdentifier);

			//get current media state
			const mediaStateData = this.xbox.getManager('system_media').getState();
			this.log.debug('Device: %s %s, debug mediaStateData: %s', this.host, this.name, mediaStateData);
			const mediaState = mediaStateData.title_id;

			//update characteristics
			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, powerState)

				const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
					this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;
			}

			if (this.speakerService) {
				this.speakerService
					.updateCharacteristic(Characteristic.Volume, volume)
					.updateCharacteristic(Characteristic.Mute, muteState);
				if (this.volumeService && this.volumeControl == 1) {
					this.volumeService
						.updateCharacteristic(Characteristic.Brightness, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
				if (this.volumeServiceFan && this.volumeControl == 2) {
					this.volumeServiceFan
						.updateCharacteristic(Characteristic.RotationSpeed, volume)
						.updateCharacteristic(Characteristic.On, !muteState);
				}
			}

			if (this.rebootService) {
				this.rebootService
					.updateCharacteristic(Characteristic.On, false);
			}

			if (this.recordGameDvrService) {
				this.recordGameDvrService
					.updateCharacteristic(Characteristic.On, false);
			}

			this.powerState = powerState;
			this.volume = volume;
			this.muteState = muteState;
			this.mediaState = mediaState;

			this.inputIdentifier = inputIdentifier;
			this.inputTitleId = titleId;
			this.inputReference = inputReference;
			this.inputOneStoreProductId = inputOneStoreProductId;
			this.inputName = inputName;
			this.inputType = inputType;
		} catch (error) {
			this.log.error('Device: %s %s, update device state error: %s', this.host, this.name, error);
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(this.xboxliveid);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
		accessory.context.device = this.config.device;

		//Prepare information service
		this.log.debug('prepareInformationService');
		try {
			const readDevInfo = await fsPromises.readFile(this.devInfoFile);
			const devInfo = (readDevInfo != undefined) ? JSON.parse(readDevInfo) : {
				'manufacturer': this.manufacturer,
				'modelName': this.modelName,
				'serialNumber': this.serialNumber,
				'firmwareRevision': this.firmwareRevision
			};
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
			this.log.debug('Device: %s %s, prepareInformationService error: %s', this.host, accessoryName, error);
		};


		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(`${accessoryName} Television`, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Power state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				try {
					const xbox = Smartglass();
					const options = {
						live_id: this.xboxliveid,
						tries: 15,
						ip: this.host
					};
					const setPowerOn = (this.deviceIsOnline = true && !this.powerState && state) ? this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass').powerOn(this.xboxliveid) : await xbox.powerOn(options) : false;
					const setPowerOff = (this.powerState && !state) ? this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass').powerOff(this.xboxliveid) : await this.xbox.powerOff() : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Power successful: %s.', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
				} catch (error) {
					this.log.debug('Device: %s %s, set Power error: %s', this.host, this.name, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputReference = this.inputsReference[inputIdentifier];
				const inputName = this.inputsName[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Input successful, input: %s, reference: %s, oneneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputReference = this.inputsReference[inputIdentifier];
				const inputName = this.inputsName[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				try {
					const setInput = this.powerState ? this.webApiEnabled ? ((inputOneStoreProductId == 'Dashboard') || (inputOneStoreProductId == 'Settings') || (inputOneStoreProductId == 'Accessory')) ? await this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid) : (inputOneStoreProductId == 'Television') ? await this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxliveid) : (inputOneStoreProductId != undefined && inputOneStoreProductId != '0') ? await this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, inputOneStoreProductId) : false : false : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Input successful, input: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
					}
					this.setStartInputIdentifier = inputIdentifier;
					this.setStartInput = this.powerState ? false : true;
					this.inputIdentifier = inputIdentifier;
				} catch (error) {
					this.log.error('Device: %s %s, set Input error: %s', this.host, accessoryName, error);
				};
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
						command = this.webApiEnabled ? this.invertMediaState ? 'pause' : 'play' : 'playpause';
						type = 'system_media';
						this.invertMediaState = !this.invertMediaState;
						break;
					case Characteristic.RemoteKey.INFORMATION:
						command = this.webApiEnabled ? this.switchInfoMenu ? 'menu' : 'view' : this.switchInfoMenu ? 'nexus' : 'view';
						type = 'system_input';
						break;
				}
				try {
					const setcommand = this.powerState ? this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxliveid, command) : await this.xbox.getManager(type).sendCommand(command) : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, Remote Key command successful: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, set Remote Key command error: %s', this.host, accessoryName, error);
				};
			});

		//optional television characteristics
		this.televisionService.getCharacteristic(Characteristic.Brightness)
			.onGet(async () => {
				const brightness = this.brightness;
				return brightness;
			})
			.onSet(async (value) => {
				try {
					const brightness = value;
					const setBrightness = this.powerState ? false : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Brightness successful: %s', this.host, accessoryName, value);
					}
					this.brightness = value;
				} catch (error) {
					this.log.error('Device: %s %s, set Brightness error: %s', this.host, accessoryName, error);
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ClosedCaptions)
			.onGet(async () => {
				const state = 0;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Closed Captions successful: %s', this.host, accessoryName, state);
				}
				return state;
			})
			.onSet(async (state) => {
				const setClosedCaption = this.powerState ? false : false;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, set Closed Captions successful: %s', this.host, accessoryName, state);
				}
			});

		//this.televisionService.getCharacteristic(Characteristic.DisplayOrder)
		//	.onGet(async () => {
		//		const tag = 0x02;
		//		const length = 0x01;
		//		const value = 0x01;
		//		const data = [tag, length, value];
		//		if (!this.disableLogInfo && this.powerState) {
		//			this.log('Device: %s %s, get display order successful: %s %', this.host, accessoryName, data);
		//		}
		//		return data;
		//	})
		//	.onSet(async (data) => {
		//		if (!this.disableLogInfo && this.powerState) {
		//			this.log('Device: %s %s, set display order successful: %s.', this.host, accessoryName, data);
		//		}
		//	});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				//xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
				const value = [2, 0, 1, 3, 4][this.mediaState];
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Current Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				}
				return value;
			});

		this.televisionService.getCharacteristic(Characteristic.TargetMediaState)
			.onGet(async () => {
				//0 - PLAY, 1 - PAUSE, 2 - STOP
				const value = [2, 0, 1, 3, 4][this.mediaState];
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Target Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				}
				return value;
			})
			.onSet(async (value) => {
				try {
					const newMediaState = value;
					const setMediaState = this.powerState ? false : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Target Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
					}
				} catch (error) {
					this.log.error('Device: %s %s %s, set Target Media state error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				switch (command) {
					case Characteristic.PowerModeSelection.SHOW:
						command = this.webApiEnabled ? this.switchInfoMenu ? 'menu' : 'view' : this.switchInfoMenu ? 'nexus' : 'view';
						break;
					case Characteristic.PowerModeSelection.HIDE:
						command = 'b';
						break;
				}
				try {
					const setPowerModeSelection = this.powerState ? this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxliveid, command) : await this.xbox.getManager('system_input').sendCommand(command) : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Power Mode Selection command successful: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, set Power Mode Selection command error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.onGet(async () => {
				const pictureMode = this.pictureMode;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Picture mode: %s', this.host, accessoryName, pictureMode);
				}
				return pictureMode;
			})
			.onSet(async (command) => {
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
				const setPictureMode = this.powerState ? false : false;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, set Picture Mode scommand uccessful: %s', this.host, accessoryName, command);
				}
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(`${accessoryName} Speaker`, 'Speaker');
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
				try {
					const payload = [{
						'direction': (command),
						'amount': 1,
					}]
					const setVolume = this.webApiEnabled ? await this.xboxWebApi.getProvider('smartglass')._sendCommand(this.xboxliveid, 'Audio', 'Volume', payload) : await this.xbox.getManager('tv_remote').sendIrCommand(command);
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Volume command successful: %s', this.host, accessoryName, command);
					}
				} catch (error) {
					this.log.error('Device: %s %s, set Volume command error: %s', this.host, accessoryName, error);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Volume successful: %s', this.host, accessoryName, volume);
				}
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				}
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, set Volume successful: %s', this.host, accessoryName, volume);
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.powerState ? this.muteState : true;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (this.powerState && (state != this.muteState)) {
					try {
						const command = 'btn.vol_mute';
						const toggleMute = this.webApiEnabled ? (state) ? await this.xboxWebApi.getProvider('smartglass').mute(this.xboxliveid) : await this.xboxWebApi.getProvider('smartglass').unmute(this.xboxliveid) : await this.xbox.getManager('tv_remote').sendIrCommand(command);
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, set Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					} catch (error) {
						this.log.error('Device: %s %s, set Mute error: %s', this.host, accessoryName, error);
					};
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
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});

				accessory.addService(this.volumeServiceFan);
			}
		}

		//Prepare power reboot services
		if (this.webApiControl && this.webApiEnabled && this.rebootControl) {
			this.rebootService = new Service.Switch(`${accessoryName} Reboot`, 'Reboot');
			this.rebootService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					return state;
				})
				.onSet(async (state) => {
					try {
						const reboot = (this.powerState && state) ? await this.xboxWebApi.getProvider('smartglass').reboot(this.xboxliveid) : false;
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, set Reboot successful: Rebooting', this.host, accessoryName);
						}
					} catch (error) {
						this.log.error('Device: %s %s, set Reboot error: %s', this.host, accessoryName, error);
					};
					setTimeout(() => {
						this.rebootService
							.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});

			accessory.addService(this.rebootService);
		}

		//Prepare record DVR
		if (this.recordGameDvr) {
			this.recordGameDvrService = new Service.Switch(`${accessoryName} Record Game`, 'Record Game');
			this.recordGameDvrService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					return state;
				})
				.onSet(async (state) => {
					try {
						const xbox = Smartglass();
						const recordGameDvr = (this.powerState && state) ? await xbox.recordGameDvr() : false;
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, record Game DVR start successful: Recording', this.host, accessoryName);
						}
					} catch (error) {
						this.log.error('Device: %s %s, record Game DVR error: %s', this.host, accessoryName, error);
					};
					setTimeout(() => {
						this.recordGameDvrService
							.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});

			accessory.addService(this.recordGameDvrService);
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		this.log.debug('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.inputsTargetVisibilityFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsTargetVisibilityFile)) : {};
		this.log.debug('Device: %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, savedTargetVisibility);

		//check available inputs and filter costom inputs
		const allInputs = (this.getInputsFromDevice && savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsArr = new Array();
		const allInputsCount = allInputs.length;
		for (let i = 0; i < allInputsCount; i++) {
			const contentType = allInputs[i].contentType;
			const filterGames = this.filterGames ? (contentType != 'Game') : true;
			const filterApps = this.filterApps ? (contentType != 'App') : true;
			const filterSystemApps = this.filterSystemApps ? (contentType != 'systemApp') : true;
			const filterDlc = this.filterDlc ? (contentType != 'Dlc') : true;
			const push = (this.getInputsFromDevice) ? (filterGames && filterApps && filterSystemApps && filterDlc) ? inputsArr.push(allInputs[i]) : false : inputsArr.push(allInputs[i]);
		}

		//check available inputs and possible inputs count (max 93)
		const inputs = inputsArr;
		const inputsCount = inputs.length;
		const maxInputsCount = (inputsCount < 93) ? inputsCount : 93;
		for (let j = 0; j < maxInputsCount; j++) {

			//get title Id
			const inputTitleId = (inputs[j].titleId != undefined) ? inputs[j].titleId : undefined;

			//get input reference
			const inputReference = (inputs[j].reference != undefined) ? inputs[j].reference : undefined;

			//get input oneStoreProductId
			const inputOneStoreProductId = (inputs[j].oneStoreProductId != undefined) ? inputs[j].oneStoreProductId : undefined;

			//get input name		
			const inputName = (savedInputsNames[inputTitleId] != undefined) ? savedInputsNames[inputTitleId] : (savedInputsNames[inputReference] != undefined) ? savedInputsNames[inputReference] : (savedInputsNames[inputOneStoreProductId] != undefined) ? savedInputsNames[inputOneStoreProductId] : inputs[j].name;

			//get input type
			const inputType = (inputs[j].type != undefined) ? INPUT_SOURCE_TYPES.indexOf(inputs[j].type) : 10;

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
					try {
						const nameIdentifier = (inputTitleId != undefined) ? inputTitleId : (inputReference != undefined) ? inputReference : (inputOneStoreProductId != undefined) ? inputOneStoreProductId : false;
						let newName = savedInputsNames;
						newName[nameIdentifier] = name;
						const newCustomName = JSON.stringify(newName);
						const writeNewCustomName = (nameIdentifier != false) ? await fsPromises.writeFile(this.inputsNamesFile, newCustomName) : false;
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, saved new Input Name successful, name: %s, oneStoreProductId: %s', this.host, accessoryName, newCustomName, inputOneStoreProductId);
						}
					} catch (error) {
						this.log.error('Device: %s %s, saved new Input Name error: %s', this.host, accessoryName, error);
					}
				});

			inputService
				.getCharacteristic(Characteristic.TargetVisibilityState)
				.onSet(async (state) => {
					try {
						const targetVisibilityIdentifier = (inputTitleId != undefined) ? inputTitleId : (inputReference != undefined) ? inputReference : (inputOneStoreProductId != undefined) ? inputOneStoreProductId : false;
						let newState = savedTargetVisibility;
						newState[targetVisibilityIdentifier] = state;
						const newTargetVisibility = JSON.stringify(newState);
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.inputsTargetVisibilityFile, newTargetVisibility) : false;
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, saved new Target Visibility successful, input: %s, state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						}
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

		//Prepare inputs button services
		this.log.debug('prepareInputsButtonService');

		//check available buttons and possible buttons count (max 93 - inputsCount)
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		const maxButtonsCount = ((inputsCount + buttonsCount) < 93) ? buttonsCount : 93 - inputsCount;
		for (let i = 0; i < maxButtonsCount; i++) {

			//get button inputOneStoreProductId
			const buttonOneStoreProductId = (buttons[i].oneStoreProductId != undefined) ? buttons[i].oneStoreProductId : '0';

			//get button name
			const buttonName = (buttons[i].name != undefined) ? buttons[i].name : 'Name undefined';

			const buttonService = new Service.Switch(`${accessoryName} ${buttonName}`, `Button ${i}`);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, get Button state successful: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					try {
						const setInput = (this.powerState && state) ? this.webApiEnabled ? ((buttonOneStoreProductId == 'Dashboard') || (buttonOneStoreProductId == 'Settings') || (buttonOneStoreProductId == 'Accessory')) ? await this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid) : (buttonOneStoreProductId == 'Television') ? await this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxliveid) : (buttonOneStoreProductId != undefined && buttonOneStoreProductId != '0') ? await this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, buttonOneStoreProductId) : false : false : false;
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, set Input successful, input: %s, oneStoreProductId: %s', this.host, accessoryName, buttonName, buttonOneStoreProductId);
						}
					} catch (error) {
						this.log.error('Device: %s %s, set Input error, input: %s, error: %s', this.host, accessoryName, buttonName, error);
					};
					setTimeout(() => {
						buttonService
							.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});

			accessory.addService(buttonService);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};