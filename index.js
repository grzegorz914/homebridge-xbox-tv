'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

const XboxWebApi = require('xbox-webapi');
const Smartglass = require('./src/smartglass');
const {
	format
} = require('path');

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
		'name': 'Screensaver',
		'titleId': '851275400',
		'reference': 'Xbox.IdleScreen_8wekyb3d8bbwe!Xbox.IdleScreen.Application',
		'oneStoreProductId': 'Screensaver',
		'type': 'HOME_SCREEN',
		'contentType': 'Dashboard'
	},
	{
		'name': 'Television',
		'titleId': '371594669',
		'reference': 'Microsoft.Xbox.LiveTV_8wekyb3d8bbwe!Microsoft.Xbox.LiveTV.Application',
		'oneStoreProductId': 'Television',
		'type': 'HDMI',
		'contentType': 'Television'
	},
	{
		'name': 'Settings TV',
		'titleId': '2019308066',
		'reference': 'Microsoft.Xbox.TvSettings_8wekyb3d8bbwe!Microsoft.Xbox.TvSettings.Application',
		'oneStoreProductId': 'Settings',
		'type': 'HOME_SCREEN',
		'contentType': 'Settings'
	},
	{
		'name': 'Dashboard',
		'titleId': '750323071',
		'reference': 'Xbox.Dashboard_8wekyb3d8bbwe!Xbox.Dashboard.Application',
		'oneStoreProductId': 'Dashboard',
		'type': 'HOME_SCREEN',
		'contentType': 'Dashboard'
	},
	{
		'name': 'Settings',
		'titleId': '1837352387',
		'reference': 'Microsoft.Xbox.Settings_8wekyb3d8bbwe!Xbox.Settings.Application',
		'oneStoreProductId': 'Settings',
		'type': 'HOME_SCREEN',
		'contentType': 'Settings'
	},
	{
		'name': 'Accessory',
		'titleId': '758407307',
		'reference': 'Microsoft.XboxDevices_8wekyb3d8bbwe!App',
		'oneStoreProductId': 'Accessory',
		'type': 'HOME_SCREEN',
		'contentType': 'systemApp'
	},
	{
		'name': 'Microsoft Store',
		'titleId': '1864271209',
		'reference': 'Microsoft.storify_8wekyb3d8bbwe!App',
		'oneStoreProductId': 'Accessory',
		'type': 'HOME_SCREEN',
		'contentType': 'systemApp'
	}
];

const SYSTEM_MEDIA_COMMANDS = {
	play: 2,
	pause: 4,
	playpause: 8,
	stop: 16,
	record: 32,
	nextTrack: 64,
	prevTrack: 128,
	fastForward: 256,
	rewind: 512,
	channelUp: 1024,
	channelDown: 2048,
	back: 4096,
	view: 8192,
	menu: 16384,
	seek: 32786
};

const SYSTEM_INPUTS_COMMANDS = {
	nexus: 2,
	view1: 4,
	menu1: 8,
	a: 16,
	b: 32,
	x: 64,
	y: 128,
	up: 256,
	down: 512,
	left: 1024,
	right: 2048
};

const TV_REMOTE_COMMANDS = {
	volUp: 'btn.vol_up',
	volDown: 'btn.vol_down',
	volMute: 'btn.vol_mute'
};

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
		this.xboxliveId = config.xboxliveid || '';
		this.xboxWebApiToken = config.xboxWebApiToken || '';
		this.xboxWebApiControl = config.webApiControl || false;
		this.refreshInterval = (config.refreshInterval * 1000) || 5;
		this.disableLogInfo = config.disableLogInfo || false;
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu || false;
		this.getInputsFromDevice = config.getInputsFromDevice || false;
		this.filterGames = config.filterGames || false;
		this.filterApps = config.filterApps || false;
		this.filterSystemApps = config.filterSystemApps || false;
		this.filterDlc = config.filterDlc || false;
		this.enableDebugMode = config.enableDebugMode || false;
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

		//setup variables
		this.checkDeviceInfo = false;
		this.xboxWebApiEnabled = false;

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

		this.xbox = new Smartglass({
			ip: this.host,
			liveId: this.xboxliveId,
			reconnect: this.refreshInterval
		});

		this.xboxWebApi = XboxWebApi({
			clientId: this.clientID,
			clientSecret: this.clientSecret,
			userToken: this.userToken,
			uhs: this.uhs
		});

		this.xbox.on('_on_connected', () => {
				this.powerState = true;
				this.checkDeviceInfo = true;

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, true)
				};

				this.getApp = setInterval(() => {
					const getWebApiInstalledApps = (this.xboxWebApiControl && this.xboxWebApiEnabled) ? this.getWebApiInstalledApps() : false;
				}, 60000);
			})
			.on('error', (error) => {
				this.log('Device: %s %s, %s', this.host, this.name, error);
			})
			.on('debug', (message) => {
				const debug = this.enableDebugMode ? this.log('Device: %s %s, %s', this.host, this.name, message) : false;
			})
			.on('message', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('_on_change', (decodedMessage, mediaState) => {
				const majorVersion = decodedMessage.majorVersion;
				const minorVersion = decodedMessage.minorVersion;
				const buildNumber = decodedMessage.buildNumber;

				const appsArray = new Array();
				const appsCount = decodedMessage.apps.length;
				for (let i = 0; i < appsCount; i++) {
					const titleId = decodedMessage.apps[i].titleId;
					const reference = decodedMessage.apps[i].aumId;
					const app = {
						titleId: titleId,
						reference: reference
					};
					appsArray.push(app);
				}
				const titleId = appsArray[appsCount - 1].titleId;
				const inputReference = appsArray[appsCount - 1].reference;

				//get states
				const volume = this.volume;
				const muteState = this.powerState ? this.muteState : true;

				const currentInputIdentifier = this.inputsReference.indexOf(inputReference) >= 0 ? this.inputsReference.indexOf(inputReference) : this.inputsTitleId.indexOf(titleId) >= 0 ? this.inputsTitleId.indexOf(titleId) : this.inputIdentifier;
				const inputIdentifier = this.setStartInput ? this.setStartInputIdentifier : currentInputIdentifier;
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				const inputName = this.inputsName[inputIdentifier];
				const inputType = this.inputsType.indexOf(inputIdentifier);

				//update characteristics
				if (this.televisionService) {
					const setUpdateCharacteristic = this.setStartInput ? this.televisionService.setCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier) :
						this.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					this.setStartInput = (currentInputIdentifier == inputIdentifier) ? false : true;
				};

				if (this.speakerService) {
					this.speakerService
						.updateCharacteristic(Characteristic.Volume, volume)
						.updateCharacteristic(Characteristic.Mute, muteState);
					if (this.volumeService && this.volumeControl == 1) {
						this.volumeService
							.updateCharacteristic(Characteristic.Brightness, volume)
							.updateCharacteristic(Characteristic.On, !muteState);
					};
					if (this.volumeServiceFan && this.volumeControl == 2) {
						this.volumeServiceFan
							.updateCharacteristic(Characteristic.RotationSpeed, volume)
							.updateCharacteristic(Characteristic.On, !muteState);
					};
				};

				this.majorVersion = majorVersion;
				this.minorVersion = minorVersion;
				this.buildNumber = buildNumber;

				this.inputTitleId = titleId;
				this.inputReference = inputReference;

				this.volume = volume;
				this.muteState = muteState;
				this.mediaState = mediaState;

				this.inputIdentifier = inputIdentifier;
				this.inputOneStoreProductId = inputOneStoreProductId;
				this.inputName = inputName;
				this.inputType = inputType;

				const getDeviceInfo = this.checkDeviceInfo ? this.getDeviceInfo() : false;
			})
			.on('_on_disconnected', () => {
				this.powerState = false;
				clearInterval(this.getApp);

				if (this.televisionService) {
					this.televisionService
						.updateCharacteristic(Characteristic.Active, false)
				};
			});

		const getWebApiToken = this.xboxWebApiControl ? this.getWebApiToken() : false;

		//start prepare accessory
		this.prepareAccessory();
	}

	async getWebApiToken() {
		this.log.debug('Device: %s %s, preparing web api.', this.host, this.name);
		try {
			this.xboxWebApi._authentication._tokensFile = this.authTokenFile;
			const isAuthenticated = await this.xboxWebApi.isAuthenticated();
			this.log('Device: %s %s, authenticated and web api enabled.', this.host, this.name);
			this.xboxWebApiEnabled = true;
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
					this.xboxWebApiEnabled = true;
					this.getWebApiInstalledApps();
				} catch (error) {
					this.log.debug('Device: %s %s, getTokenRequest error: %s:', this.host, this.name, error);
					this.xboxWebApiEnabled = false;
				};
			} else {
				this.log('Device: %s %s, web api disabled, token undefined.', this.host, this.name);
				this.xboxWebApiEnabled = false;
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
				};
			};

			this.getWebApiInstalledApps();
		} catch (error) {
			this.log.error('Device: %s %s, get User Profile error: %s.', this.host, this.name, error);
		};
	}

	async getWebApiInstalledApps() {
		this.log.debug('Device: %s %s, requesting installed apps from xbox live account.', this.host, this.name);
		try {
			const getInstalledAppsData = await this.xboxWebApi.getProvider('smartglass').getInstalledApps(this.xboxliveId);
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

			this.getWebApiStorageDevices();
		} catch (error) {
			if (error.status == 401) {
				this.getWebApiToken();
				this.log('Device: %s %s, with liveId: %s, get Installed Apps error, trying to reauthenticate.', this.host, this.name, this.xboxliveId);
			} else {
				this.log.error('Device: %s %s, with liveId: %s, get Installed Apps error: %s.', this.host, this.name, this.xboxliveId, error);
			};
		};
	}

	async getWebApiStorageDevices() {
		this.log.debug('Device: %s %s, requesting web api storage devices.', this.host, this.name);
		try {
			const getStorageDevicesData = await this.xboxWebApi.getProvider('smartglass').getStorageDevices(this.xboxliveId);
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
			};

			this.getWebApiConsoleStatus();
		} catch (error) {
			this.log.error('Device: %s %s, with liveId: %s, get Storage Devices error: %s.', this.host, this.name, this.xboxliveId, error);
		};
	}

	async getWebApiConsoleStatus() {
		this.log.debug('Device: %s %s, requesting web api device info.', this.host, this.name);
		try {
			const getConsoleStatusData = await this.xboxWebApi.getProvider('smartglass').getConsoleStatus(this.xboxliveId);
			this.log.debug('Device: %s %s, debug getConsoleStatusData, result: %s', this.host, this.name, getConsoleStatusData);
			const consoleStatusData = getConsoleStatusData;

			const id = consoleStatusData.id;
			const name = consoleStatusData.name;
			const locale = consoleStatusData.locale;
			const region = consoleStatusData.region;
			const consoleType = CONSOLES_NAME[consoleStatusData.consoleType];
			const powerState = (CONSOLE_POWER_STATE[consoleStatusData.powerState] != 0); // 0 - Off, 1 - On, 2 - InStandby, 3 - SystemUpdate
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
		} catch (error) {
			if (error.status == 401) {
				this.getWebApiToken();
				this.log('Device: %s %s, with liveId: %s, get Console Status error, trying to reauthenticate.', this.host, this.name, this.xboxliveId);
			} else {
				this.log.error('Device: %s %s, with liveId: %s, get Console Status error: %s.', this.host, this.name, this.xboxliveId, error);
			};
		};
	}

	async getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting device info.', this.host, this.name);
		//display device info
		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.xboxWebApiEnabled ? this.serialNumber : this.xboxliveId;
		const firmwareRevision = `${this.majorVersion}.${this.minorVersion}.${this.buildNumber}`;

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
		try {
			const obj = JSON.stringify(devInfoObj, null, 2);
			const writeDevInfo = await fsPromises.writeFile(this.devInfoFile, obj);
			this.log.debug('Device: %s %s, debug writeDevInfo: %s', this.host, this.name, obj);
			this.checkDeviceInfo = false
		} catch (error) {
			this.log.error('Device: %s %s, get Device Info error: %s', this.host, this.name, error);
			this.checkDeviceInfo = true;
		};
	};

	//Prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(this.xboxliveId);
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
					const setPower = (state && !this.powerState) ? await this.xbox.powerOn() : (!state && this.powerState) ? await this.xbox.powerOff() : false;
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set Power successful, %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					}
				} catch (error) {
					this.log.debug('Device: %s %s, set Power, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.onGet(async () => {
				const inputIdentifier = this.inputIdentifier;
				const inputReference = this.inputReference;
				const inputName = this.inputsName[inputIdentifier];
				const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Input successful, input: %s, reference: %s, oneneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputReference = this.inputsReference[inputIdentifier];
					const inputName = this.inputsName[inputIdentifier];
					const inputOneStoreProductId = this.inputsOneStoreProductId[inputIdentifier];
					const setDashboard = (inputOneStoreProductId === 'Dashboard') || (inputOneStoreProductId === 'Settings') || (inputOneStoreProductId === 'Accessory') || (inputOneStoreProductId === 'Screensaver');
					const setTelevision = (inputOneStoreProductId === 'Television');
					const setApp = (inputOneStoreProductId != undefined && inputOneStoreProductId != '0');
					const setInput = this.powerState ? this.xboxWebApiEnabled ? setDashboard ? await this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveId) : setTelevision ? await this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxliveId) : setApp ? await this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveId, inputOneStoreProductId) : false : false : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Input successful, input: %s, reference: %s, oneStoreProductId: %s', this.host, accessoryName, inputName, inputReference, inputOneStoreProductId);
					}
					this.setStartInputIdentifier = inputIdentifier;
					this.setStartInput = this.powerState ? false : true;
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
						this.invertMediaState = !this.invertMediaState;
						break;
					case Characteristic.RemoteKey.INFORMATION:
						command = this.switchInfoMenu ? 'nexus' : 'view';
						channelName = 'systemInput';
						break;
				};
				try {
					const sendCommand = this.powerState ? await this.xbox.sendCommand(command, channelName) : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, Remote Key command successful: %s', this.host, accessoryName, command);
					};
				} catch (error) {
					this.log.error('Device: %s %s, set Remote Key command error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.CurrentMediaState)
			.onGet(async () => {
				//apple, 0 - PLAY, 1 - PAUSE, 2 - STOP, 3 - LOADING, 4 - INTERRUPTED
				//xbox, 0 - STOP, 1 - PLAY, 2 - PAUSE
				const value = [2, 0, 1, 3, 4][this.mediaState];
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Current Media state successful: %s', this.host, accessoryName, ['PLAY', 'PAUSE', 'STOP', 'LOADING', 'INTERRUPTED'][value]);
				};
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
					};
				} catch (error) {
					this.log.error('Device: %s %s %s, set Target Media state error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				let channelName;
				switch (command) {
					case Characteristic.PowerModeSelection.SHOW:
						command = this.switchInfoMenu ? 'nexus' : 'view';
						channelName = 'systemInput';
						break;
					case Characteristic.PowerModeSelection.HIDE:
						command = 'b';
						channelName = 'systemInput';
						break;
				};
				try {
					const setPowerModeSelection = this.powerState ? await this.xbox.sendCommand(command, channelName) : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Power Mode Selection command successful: %s', this.host, accessoryName, command);
					};
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
					const setVolume = this.powerState ? await this.xbox.sendCommand(command, channelName) : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Volume command successful: %s', this.host, accessoryName, command);
					};
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
				};
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, set Volume successful: %s', this.host, accessoryName, volume);
				};
			});

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.onGet(async () => {
				const state = this.powerState ? this.muteState : true;
				if (!this.disableLogInfo && this.powerState) {
					this.log('Device: %s %s, get Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				};
				return state;
			})
			.onSet(async (state) => {
				try {
					const command = 'volMute';
					const channelName = 'tvRemote';
					const toggleMute = (this.powerState && state != this.muteState) ? await this.xbox.sendCommand(command, channelName) : false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, set Mute successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
					};
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
						const setVolume = this.powerState ? this.speakerService.setCharacteristic(Characteristic.Volume, volume) : false;
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						const setMute = this.powerState ? this.speakerService.setCharacteristic(Characteristic.Mute, !state) : false;
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
						const setVolume = this.powerState ? this.speakerService.setCharacteristic(Characteristic.Volume, volume) : false;
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.powerState ? !this.muteState : false;
						return state;
					})
					.onSet(async (state) => {
						const setMute = this.powerState ? this.speakerService.setCharacteristic(Characteristic.Mute, !state) : false;
					});

				accessory.addService(this.volumeServiceFan);
			}
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
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, saved new Input Name successful, name: %s, oneStoreProductId: %s', this.host, accessoryName, newCustomName, inputOneStoreProductId);
						};
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
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, saved new Target Visibility successful, input: %s, state: %s', this.host, accessoryName, inputName, state ? 'HIDEN' : 'SHOWN');
						};
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

			//get button command
			const buttonCommand = (buttons[i].command != undefined) ? buttons[i].command : '';

			//get button name
			const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttonCommand;

			//get button mode
			let buttonMode = 0;
			let channelName = '';
			if (buttonCommand in SYSTEM_MEDIA_COMMANDS) {
				buttonMode = 0;
				channelName = 'systemMedia';
			} else if (buttonCommand in SYSTEM_INPUTS_COMMANDS) {
				buttonMode = 1;
				channelName = 'systemInput';
			} else if (buttonCommand in TV_REMOTE_COMMANDS) {
				buttonMode = 2;
				channelName = 'tvRemote';
			} else if (buttonCommand === 'recordGameDvr') {
				buttonMode = 3;
			} else if (buttonCommand === 'reboot') {
				buttonMode = 4;
			} else if (buttonCommand === 'switchAppGame') {
				buttonMode = 5;
			};

			//get button inputOneStoreProductId
			const buttonOneStoreProductId = (buttons[i].oneStoreProductId != undefined) ? buttons[i].oneStoreProductId : '0';

			const buttonService = new Service.Switch(`${accessoryName} ${buttonName}`, `Button ${i}`);
			buttonService.getCharacteristic(Characteristic.On)
				.onGet(async () => {
					const state = false;
					if (!this.disableLogInfo && this.powerState) {
						this.log('Device: %s %s, get Button state successful: %s', this.host, accessoryName, state);
					};
					return state;
				})
				.onSet(async (state) => {
					try {
						const setDashboard = (buttonOneStoreProductId === 'Dashboard') || (buttonOneStoreProductId === 'Settings') || (buttonOneStoreProductId === 'Accessory') || (buttonOneStoreProductId === 'Screensaver');
						const setTelevision = (buttonOneStoreProductId === 'Television');
						const setApp = (buttonOneStoreProductId != undefined && buttonOneStoreProductId != '0');
						const setCommand = (this.powerState && state && buttonMode <= 2) ? await this.xbox.sendCommand(command, channelName) : false
						const recordGameDvr = (this.powerState && state && this.xboxWebApiControl && this.xboxWebApiEnabled && buttonMode == 3) ? await this.xbox.recordGameDvr() : false;
						const rebootConsole = (this.powerState && state && buttonMode == 4) ? await this.xboxWebApi.getProvider('smartglass').reboot(this.xboxliveId) : false;
						const setAppInput = (this.powerState && state && buttonMode == 5 && this.xboxWebApiEnabled && setApp) ? setDashboard ? await this.xboxWebApi.getProvider('smartglass').launchDashboard(this.xboxliveId) : setTelevision ? await this.xboxWebApi.getProvider('smartglass').launchOneGuide(this.xboxliveId) : await this.xboxWebApi.getProvider('smartglass').launchApp(this.xboxliveId, buttonOneStoreProductId) : false;
						if (!this.disableLogInfo && this.powerState) {
							this.log('Device: %s %s, set button successful, name: %s, command: %s', this.host, accessoryName, buttonName, buttonCommand);
						}
					} catch (error) {
						this.log.error('Device: %s %s, set button error, name: %s, error: %s', this.host, accessoryName, buttonName, error);
					};
					setTimeout(() => {
						buttonService.updateCharacteristic(Characteristic.On, false);
					}, 250);
				});

			accessory.addService(buttonService);
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};