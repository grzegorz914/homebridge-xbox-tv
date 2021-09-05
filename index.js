'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

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
		'name': 'Unconfigured input',
		'titleId': 'undefined',
		'reference': 'undefined',
		'oneStoreProductId': 'undefined',
		'type': 'undefined',
		'contentType': 'undefined'
	},
	{
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

let Accessory, Characteristic, Service, Categories, AccessoryUUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	AccessoryUUID = api.hap.uuid;
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
		this.log.debug('configurePlatformAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removePlatformAccessory');
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
				'name': this.inputs[1].name,
				'titleId': this.inputs[1].titleId,
				'reference': this.inputs[1].reference,
				'oneStoreProductId': this.inputs[1].oneStoreProductId,
				'type': this.inputs[1].type,
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
		this.connectedToDevice = false;
		this.checkDeviceInfo = false;
		this.webApiEnabled = false;

		this.inputsService = new Array();
		this.inputsReference = new Array();
		this.inputsOneStoreProductId = new Array();
		this.inputsName = new Array();
		this.inputsTitleId = new Array();
		this.inputsType = new Array();

		this.buttonsService = new Array();
		this.buttonsOneStoreProductId = new Array();
		this.buttonsName = new Array();

		this.powerState = false;
		this.volume = 0;
		this.muteState = false;
		this.mediaState = false;
		this.pictureMode = 0;

		this.setStartInput = false;
		this.setStartInputIdentifier = 0;
		this.inputIdentifier = 0;
		this.inputTitleId = '';
		this.inputReference = '';
		this.inputOneStoreProductId = '';
		this.inputName = '';
		this.inputType = 0;

		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.authTokenFile = this.prefDir + '/' + 'authToken_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.inputsNamesFile = this.prefDir + '/' + 'inputsNames_' + this.host.split('.').join('');
		this.targetVisibilityInputsFile = this.prefDir + '/' + 'targetVisibilityInputs_' + this.host.split('.').join('');

		this.xbox = Smartglass();

		this.xboxWebApi = XboxWebApi({
			clientId: this.clientID,
			clientSecret: this.clientSecret,
			userToken: this.userToken,
			uhs: this.uhs
		});

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) == false) {
			fsPromises.mkdir(this.prefDir);
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
		if (fs.existsSync(this.targetVisibilityInputsFile) == false) {
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

	connectToXbox() {
		this.xbox = Smartglass();
		this.xbox.connect(this.host).then(() => {
			this.log('Device: %s %s, connected.', this.host, this.name);
			this.xbox.addManager('system_input', SystemInputChannel());
			this.xbox.addManager('system_media', SystemMediaChannel());
			this.xbox.addManager('tv_remote', TvRemoteChannel());
			this.connectedToDevice = true;
			this.checkDeviceInfo = true;

			if (this.televisionService) {
				this.televisionService
					.updateCharacteristic(Characteristic.Active, true);
			}

			const getDeviceInfo = !this.webApiControl ? this.getDeviceInfo() : this.getWebApiToken();
		}).catch(error => {
			this.log.debug('Device: %s %s, connection error: %s', this.host, this.name, error);
		});

		this.xbox.on('_on_timeout', () => {
			this.log('Device: %s %s, disconnected.', this.host, this.name);
			this.connectedToDevice = false;
			this.checkDeviceInfo = false;
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
			this.getWebApiInstalledApps();
		}).catch(() => {
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
				this.xboxWebApi._authentication.getTokenRequest(this.xboxWebApiToken).then((data) => {
					this.log('Device: %s %s, web api enabled.', this.host, this.name);
					this.log.debug('Device: %s %s, get oauth2 Web Api Token:', this.host, this.name, data);

					this.xboxWebApi._authentication._tokens.oauth = data;
					this.xboxWebApi._authentication.saveTokens();
					this.webApiEnabled = true;
					this.getWebApiInstalledApps();
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

	getWebApiConsolesList() {
		this.log.debug('Device: %s %s, requesting web api consoles list.', this.host, this.name);
		this.xboxWebApi.getProvider('smartglass').getConsolesList().then((response) => {
			this.log.debug('Device: %s %s, debug getConsolesList, result: %s, %s', this.host, this.name, response.result[0], response.result[0].storageDevices[0]);
			const consolesListData = response.result;

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
		}).catch((error) => {
			this.log.error('Device: %s %s, get Consoles List error: %s.', this.host, this.name, error);
		});
	}

	getWebApiUserProfile() {
		this.log.debug('Device: %s %s, requesting web api user profile.', this.host, this.name);
		this.xboxWebApi.getProvider('profile').getUserProfile().then((response) => {
			this.log.debug('Device: %s %s, debug getUserProfile, result: %s', this.host, this.name, response.profileUsers[0], response.profileUsers[0].settings[0]);
			const userProfileData = response.profileUsers;

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
		}).catch((error) => {
			this.log.error('Device: %s %s, get User Profile error: %s.', this.host, this.name, error);
		});
	}

	getWebApiInstalledApps() {
		this.log.debug('Device: %s %s, requesting installed apps from xbox live account.', this.host, this.name);
		this.xboxWebApi.getProvider('smartglass').getInstalledApps(this.xboxliveid).then((response) => {
			this.log.debug('Device: %s %s, debug getInstalledApps: %s', this.host, this.name, response.result);
			const installedAppsData = response.result;

			const installedAppsArr = new Array();
			const installedAppsCount = installedAppsData.length;
			for (let i = 0; i < installedAppsCount; i++) {
				const oneStoreProductId = installedAppsData[i].oneStoreProductId;
				const titleId = installedAppsData[i].titleId;
				const aumid = installedAppsData[i].aumid;
				const lastActiveTime = installedAppsData[i].lastActiveTime;
				const isGame = (installedAppsData[i].isGame == true);
				const name = installedAppsData[i].name;
				const contentType = installedAppsData[i].contentType;
				const instanceId = installedAppsData[i].instanceId;
				const storageDeviceId = installedAppsData[i].storageDeviceId;
				const uniqueId = installedAppsData[i].uniqueId;
				const legacyProductId = installedAppsData[i].legacyProductId;
				const version = installedAppsData[i].version;
				const sizeInBytes = installedAppsData[i].sizeInBytes;
				const installTime = installedAppsData[i].installTime;
				const updateTime = installedAppsData[i].updateTime;
				const parentId = installedAppsData[i].parentId;
				const type = 'APPLICATION';

				const inputsObj = {
					'name': name,
					'titleId': titleId,
					'reference': aumid,
					'oneStoreProductId': oneStoreProductId,
					'type': type,
					'contentType': contentType
				};
				installedAppsArr.push(inputsObj);
			}

			this.installedAppsData = installedAppsData;
			this.installedAppsArr = installedAppsArr
			this.getWebApiStorageDevices();
		}).catch((error) => {
			if (error.status == 401) {
				this.getWebApiToken();
				this.log('Device: %s %s, with liveid: %s, get Installed Apps error, trying to reauthenticate.', this.host, this.name, this.xboxliveid);
			} else {
				this.log.error('Device: %s %s, with liveid: %s, get Installed Apps error: %s.', this.host, this.name, this.xboxliveid, error);
			}
		});
	}

	getWebApiStorageDevices() {
		this.log.debug('Device: %s %s, requesting web api storage devices.', this.host, this.name);
		this.xboxWebApi.getProvider('smartglass').getStorageDevices(this.xboxliveid).then((response) => {
			this.log.debug('Device: %s %s, debug storageDevices, result: %s', this.host, this.name, response);

			const storageDeviceData = response.result;
			const deviceId = response.deviceId;
			const agentUserId = response.agentUserId;

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
		}).catch((error) => {
			this.log.error('Device: %s %s, with liveid: %s, get Storage Devices error: %s.', this.host, this.name, this.xboxliveid, error);
		});
	}

	getWebApiConsoleStatus() {
		this.log.debug('Device: %s %s, requesting web api device info.', this.host, this.name);
		this.xboxWebApi.getProvider('smartglass').getConsoleStatus(this.xboxliveid).then((response) => {
			this.log.debug('Device: %s %s, debug getConsoleStatus, result: %s', this.host, this.name, response);
			const consoleStatusData = response;

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

			const getDeviceInfo = this.checkDeviceInfo ? this.getDeviceInfo() : false;
		}).catch((error) => {
			if (error.status == 401) {
				this.getWebApiToken();
				this.log('Device: %s %s, with liveid: %s, get Console Status error, trying to reauthenticate.', this.host, this.name, this.xboxliveid);
			} else {
				this.log.error('Device: %s %s, with liveid: %s, get Console Status error: %s.', this.host, this.name, this.xboxliveid, error);
			}
		});
	}

	getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting device info.', this.host, this.name);
		this.xbox.on('_on_console_status', (response, config, smartglass) => {
			this.log.debug('Device %s %s, debug _on_console_status response: %s, config: %s, smartglass: %s', this.host, this.name, response.packet_decoded.protected_payload.apps[0], config, smartglass);
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

				//get current media state
				const mediaStateData = this.xbox.getManager('system_media').getState();
				this.log.debug('Device: %s %s, debug data: %s', this.host, this.name, mediaStateData);
				const mediaState = (mediaStateData.title_id == 1);

				if (this.checkDeviceInfo) {
					//add installed inputs apps to the default inputs
					const inputsArr = new Array();
					const getInputsFromDevice = (this.getInputsFromDevice && this.webApiEnabled);
					const defaultInputsCount = getInputsFromDevice ? DEFAULT_INPUTS.length : 0;
					for (let i = 0; i < defaultInputsCount; i++) {
						inputsArr.push(DEFAULT_INPUTS[i]);
					}

					const inputsData = getInputsFromDevice ? this.installedAppsArr : this.inputs;
					const inputsCount = inputsData.length;
					for (let j = 0; j < inputsCount; j++) {
						inputsArr.push(inputsData[j]);
					}

					//save nputs to the file
					const obj = JSON.stringify(inputsArr, null, 2);
					const writeInputs = fsPromises.writeFile(this.inputsFile, obj);
					this.log.debug('Device: %s %s, save inputs succesful, inputs: %s', this.host, this.name, obj);

					//device info
					const manufacturer = this.manufacturer;
					const modelName = this.modelName;
					const serialNumber = this.webApiEnabled ? this.serialNumber : liveid;
					const firmwareRevision = major_version + '.' + minor_version + '.' + build_number;

					const devInfoObj = {
						'manufacturer': manufacturer,
						'modelName': modelName,
						'serialNumber': serialNumber,
						'firmwareRevision': firmwareRevision
					};
					const obj1 = JSON.stringify(devInfoObj, null, 2);
					const writeDevInfo = fsPromises.writeFile(this.devInfoFile, obj1);
					this.log.debug('Device: %s %s, debug writeDevInfo: %s', this.host, this.name, obj1);

					this.log('-------- %s --------', this.name);
					this.log('Manufacturer: %s', manufacturer);
					this.log('Model: %s', modelName);
					this.log('Serialnr: %s', serialNumber);
					this.log('Firmware: %s', firmwareRevision);
					this.log('----------------------------------');
				}

				this.titleId = titleId;
				this.inputReference = aumId;
				this.mediaState = mediaState;

				this.devInfoAndAppsData = devInfoAndAppsData;
				this.devConfigData = devConfigData;
				this.devNetConfigData = devNetConfigData;
				this.devNetConfigData = devNetConfigData;
				this.mediaStateData = mediaStateData;

				this.checkDeviceInfo = false;
				this.updateDeviceState();
			}
		}, function (error) {
			this.log.error('Device: %s %s, get Device Info error: %s', this.host, this.name, error);
			this.checkDeviceInfo = true;
		});
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, update device state.', this.host, this.name);
		try {
			//get variable data
			const xboxState = this.xbox._connection_status;
			const powerState = xboxState;
			const volume = this.volume;
			const muteState = powerState ? this.muteState : true;
			const mediaState = this.mediaState;

			const titleId = this.titleId
			const inputReference = this.inputReference;

			const currentInputIdentifier = this.inputsTitleId.indexOf(titleId) >= 0 ? this.inputsTitleId.indexOf(titleId) : this.inputsReference.indexOf(inputReference) >= 0 ? this.inputsReference.indexOf(inputReference) : 0;
			const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
			const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
			const inputName = this.inputsName[inputIdentifier];
			const inputType = this.inputsType.indexOf(inputIdentifier);

			if (this.televisionService) {
				if (powerState) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, true)
				} else {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, false)
					if (this.rebootService) {
						this.rebootService
							.updateCharacteristic(Characteristic.On, false);
					}
				}

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
			this.checkDeviceInfo = true;
		};
	}

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = AccessoryUUID.generate(this.xboxliveid);
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
			this.log.debug('Device: %s %s, debug prepareInformationService error: %s', this.host, accessoryName, error);
		};


		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'Television');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.onGet(async () => {
				const state = this.powerState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get Power state successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state && !this.powerState) {
					const xbox = Smartglass();
					const setPowerOn = this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass').powerOn(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, web api set Power ON state successful', this.host, accessoryName);
						}
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true)
						this.powerState = true;
					}).catch((error) => {
						this.log.error('Device: %s %s, web api set Power ON, error: %s', this.host, accessoryName, error);
					}) : xbox.powerOn({
						live_id: this.xboxliveid,
						tries: 15,
						ip: this.host
					}).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Power ON successful', this.host, accessoryName);
						}
						this.televisionService
							.updateCharacteristic(Characteristic.Active, true)
						this.powerState = true;
					}).catch(error => {
						this.log.error('Device: %s %s, set Power ON, error: %s', this.host, accessoryName, error);
					});
				} else {
					if (!state && this.powerState) {
						const setPowerOff = this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass').powerOff(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, web api set Power OFF successful', this.host, accessoryName);
							}
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false)
							this.powerState = false;
						}).catch((error) => {
							this.log.error('Device: %s %s, set Power OFF error: %s', this.host, accessoryName, error);
						}) : this.xbox.powerOff().then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Power OFF successful', this.host, accessoryName);
							}
							this.televisionService
								.updateCharacteristic(Characteristic.Active, false)
							this.powerState = false;
						}).catch(error => {
							this.log.error('Device: %s %s, set Power OFF error: %s', this.host, accessoryName, error);
						});
					}
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputReference = this.inputReference;
				const inputName = this.inputName;
				const inputOneStoreProductId = this.inputOneStoreProductId;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Input successful, input: %s, reference: %s, oneneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				const inputReference = this.inputsReference[inputIdentifier];
				const inputName = this.inputsName[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				const setInput = this.webApiEnabled ? ((inputOneStoreProductId == 'Dashboard') || (inputOneStoreProductId == 'Settings') || (inputOneStoreProductId == 'Accessory')) ? this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Input successful, input: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set Input error, input: %s, error: %s', this.host, accessoryName, inputName, error);
				}) : (inputOneStoreProductId == 'Television') ? this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxliveid).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Input successful, input: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set Input error, input: %s, error: %s', this.host, accessoryName, inputName, error);
				}) : (inputOneStoreProductId != undefined && inputOneStoreProductId != '0') ? this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, inputOneStoreProductId).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Input successful, input: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, set Input error, input: %s, error: %s', this.host, accessoryName, inputName, error);
				}) : false : false;
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
							command = this.webApiEnabled ? this.mediaState ? 'pause' : 'play' : 'playpause';
							type = 'system_media';
							break;
						case Characteristic.RemoteKey.INFORMATION:
							command = this.webApiEnabled ? this.switchInfoMenu ? 'menu' : 'view' : this.switchInfoMenu ? 'nexus' : 'view';
							type = 'system_input';
							break;
					}
					this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxliveid, command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set RemoteKey successful, command: %s', this.host, accessoryName, command);
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, can not set RemoteKey command, error: %s', this.host, accessoryName, error);
					}) : this.xbox.getManager(type).sendCommand(command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, setRemoteKey successful,  command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not set RemoteKey command, error: %s', this.host, accessoryName, error);
					});
				}
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				if (this.powerState) {
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.webApiEnabled ? this.switchInfoMenu ? 'menu' : 'view' : this.switchInfoMenu ? 'nexus' : 'view';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'b';
							break;
					}
					this.webApiEnabled ? this.xboxWebApi.getProvider('smartglass').sendButtonPress(this.xboxliveid, command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, can not set Power Mode Selection command, error: %s', this.host, accessoryName, error);
					}) : this.xbox.getManager('system_input').sendCommand(command).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Power Mode Selection successful, command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not set Power Mode Selection command, error: %s', this.host, accessoryName, error);
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
						this.log('Device: %s %s, set Picture Mode successful, command: %s', this.host, accessoryName, command);
					}
				}
			});

		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName, 'Speaker');
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
					'direction': (command),
					'amount': 1,
				}]).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Volume successful, command: %s', this.host, accessoryName, command);
					}
				}).catch((error) => {
					this.log.error('Device: %s %s, can not set Volume command, error: %s', this.host, accessoryName, error);
				}) : this.xbox.getManager('tv_remote').sendIrCommand(command).then(() => {
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
					}
				}).catch(error => {
					this.log.error('Device: %s %s, can not set Volume command, error: %s', this.host, accessoryName, error);
				});
			});

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.onGet(async () => {
				const volume = this.volume;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Volume level successful: %s', this.host, accessoryName, volume);
				}
				return volume;
			})
			.onSet(async (volume) => {
				if (volume == 0 || volume == 100) {
					volume = this.volume;
				}
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, set Volume level successful: %s', this.host, accessoryName, volume);
				}
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.powerState ? this.muteState : true;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (this.powerState && (state != this.muteState)) {
					const command = 'btn.vol_mute';
					const toggleMute = this.webApiEnabled ? (state) ? this.xboxWebApi.getProvider('smartglass').mute(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set Mute successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, set Mute, error: %s', this.host, accessoryName, error);
					}) : this.xboxWebApi.getProvider('smartglass').unmute(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, unset Mute successful, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, unset Mute, error: %s', this.host, accessoryName, error);
					}) : this.xbox.getManager('tv_remote').sendIrCommand(command).then(() => {
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
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'Volume');
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
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'Volume');
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
			this.rebootService = new Service.Switch(accessoryName + ' Reboot', 'Reboot');
			this.rebootService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					return state;
				})
				.onSet(async (state) => {
					const reboot = state && this.powerState ? this.xboxWebApi.getProvider('smartglass').reboot(this.xboxliveid).then(() => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, web api set Reboot successful', this.host, accessoryName);
						}
					}).catch((error) => {
						this.log.error('Device: %s %s, web api set Reboot, error: %s', this.host, accessoryName, error);
					}) : false;
					setTimeout(() => {
						this.rebootService
							.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});
			accessory.addService(this.rebootService);
		}

		//Prepare inputs services
		this.log.debug('prepareInputsService');

		const savedInputs = ((fs.readFileSync(this.inputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsFile)) : [];
		this.log.debug('Device: %s %s, read saved Inputs successful, inpits: %s', this.host, accessoryName, savedInputs)

		const savedInputsNames = ((fs.readFileSync(this.inputsNamesFile)).length > 0) ? JSON.parse(fs.readFileSync(this.inputsNamesFile)) : {};
		this.log.debug('Device: %s %s, read saved custom Inputs Names successful, names: %s', this.host, accessoryName, savedInputsNames)

		const savedTargetVisibility = ((fs.readFileSync(this.targetVisibilityInputsFile)).length > 0) ? JSON.parse(fs.readFileSync(this.targetVisibilityInputsFile)) : {};
		this.log.debug('Device: %s %s, read saved Target Visibility successful, states %s', this.host, accessoryName, savedTargetVisibility);

		//check available inputs and filter costom inputs
		const allInputs = (savedInputs.length > 0) ? savedInputs : this.inputs;
		const inputsArr = new Array();
		const allInputsCount = allInputs.length;
		const installedAppsArr = this.installedAppsArr;
		for (let i = 0; i < allInputsCount; i++) {
			const contentType = allInputs[i].contentType;
			const filterGames = this.filterGames ? (contentType != 'Game') : true;
			const filterApps = this.filterApps ? (contentType != 'App') : true;
			const filterSystemApps = this.filterSystemApps ? (contentType != 'systemApp') : true;
			const filterDlc = this.filterDlc ? (contentType != 'Dlc') : true;
			const push = (filterGames && filterApps && filterSystemApps && filterDlc) ? inputsArr.push(allInputs[i]) : false;
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

			const inputService = new Service.InputSource(accessoryName, 'Input ' + j);
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
						if (!this.disableLogInfo) {
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
						const writeNewTargetVisibility = (targetVisibilityIdentifier != false) ? await fsPromises.writeFile(this.targetVisibilityInputsFile, newTargetVisibility) : false;
						if (!this.disableLogInfo) {
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

			this.inputsService.push(inputService);
			this.televisionService.addLinkedService(this.inputsService[j]);
			accessory.addService(this.inputsService[j]);
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

			const buttonService = new Service.Switch(accessoryName + ' ' + buttonName, 'Button ' + i);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, get Button state successful: %s', this.host, accessoryName, state);
					}
					return state;
				})
				.onSet(async (state) => {
					if (state && this.powerState) {
						const setInput = this.webApiEnabled ? ((buttonOneStoreProductId == 'Dashboard') || (buttonOneStoreProductId == 'Settings') || (buttonOneStoreProductId == 'Accessory')) ? this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Input successful, input: %s, oneStoreProductId: %s', this.host, accessoryName, buttonName, buttonOneStoreProductId);
							}
						}).catch((error) => {
							this.log.error('Device: %s %s, set Dashboard error:', this.host, accessoryName, error);
						}) : (buttonOneStoreProductId == 'Television') ? this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxliveid).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Input successful, input: %s, oneStoreProductId: %s', this.host, accessoryName, buttonName, buttonOneStoreProductId);
							}
						}).catch((error) => {
							this.log.error('Device: %s %s, set Input error, input: %s, error: %s', this.host, accessoryName, buttonName, error);
						}) : (buttonOneStoreProductId != undefined && buttonOneStoreProductId != '0') ? this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveid, buttonOneStoreProductId).then(() => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set Input successful, input: %s, oneStoreProductId: %s', this.host, accessoryName, buttonName, buttonOneStoreProductId);
							}
						}).catch((error) => {
							this.log.error('Device: %s %s, set Input error, input: %s, error: %s', this.host, accessoryName, buttonName, error);
						}) : false : false;
					}
					setTimeout(() => {
						buttonService
							.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});
			this.buttonsOneStoreProductId.push(buttonOneStoreProductId);
			this.buttonsName.push(buttonName);

			this.buttonsService.push(buttonService)
			accessory.addService(this.buttonsService[i]);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};