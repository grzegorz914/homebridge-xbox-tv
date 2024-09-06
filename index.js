'use strict';
const path = require('path');
const fs = require('fs');
const XboxDevice = require('./src/xboxdevice.js');
const CONSTANTS = require('./src/constants.json');

class XboxPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PLUGIN_NAME}`);
			return;
		}
		this.accessories = [];

		//create directory if it doesn't exist
		const prefDir = path.join(api.user.storagePath(), 'xboxTv');
		try {
			fs.mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const deviceName = device.name ?? false;
				const deviceHost = device.host ?? false;
				const xboxLiveId = device.xboxLiveId ?? false;

				if (!deviceName || !deviceHost || !xboxLiveId) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, Host: ${deviceHost ? 'OK' : deviceHost}, Xbox Live ID: ${xboxLiveId ? 'OK' : xboxLiveId}, wrong or missing.`);
					return;
				}

				//debug config
				const debugMode = device.enableDebugMode;
				const debug = debugMode ? log.info(`Device: ${deviceHost} ${deviceName}, did finish launching.`) : false;
				const config = {
					...device,
					xboxLiveId: 'removed',
					webApiToken: 'removed',
					webApiClientSecret: 'removed',
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = debugMode ? log.info(`Device: ${deviceHost} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//check files exists, if not then create it
				const postFix = deviceHost.split('.').join('');
				const authTokenFile = `${prefDir}/authToken_${postFix}`;
				const devInfoFile = `${prefDir}/devInfo_${postFix}`;
				const inputsFile = `${prefDir}/inputs_${postFix}`;
				const inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
				const inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

				// Create files if it doesn't exist
				try {
					const files = [
						authTokenFile,
						devInfoFile,
						inputsFile,
						inputsNamesFile,
						inputsTargetVisibilityFile,
					];

					files.forEach((file) => {
						if (!fs.existsSync(file)) {
							fs.writeFileSync(file, '');
						}
					});
				} catch (error) {
					log.error(`Device: ${deviceHost} ${deviceName}, prepare files error: ${error}`);
					return;
				}

				//xbox device
				try {
					const xboxDevice = new XboxDevice(api, device, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
					xboxDevice.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
						log.success(`Device: ${deviceHost} ${deviceName}, published as external accessory.`);
					})
						.on('devInfo', (devInfo) => {
							log.info(devInfo);
						})
						.on('success', (message) => {
							log.success(`Device: ${deviceHost} ${deviceName}, ${message}`);
						})
						.on('message', (message) => {
							log.info(`Device: ${deviceHost} ${deviceName}, ${message}`);
						})
						.on('debug', (debug) => {
							log.info(`Device: ${deviceHost} ${deviceName}, debug: ${debug}`);
						})
						.on('warn', (warn) => {
							log.warn(`warn: ${deviceHost} ${deviceName}, ${warn}`);
						})
						.on('error', (error) => {
							log.error(`Device: ${deviceHost} ${deviceName}, ${error}`);
						});

					await xboxDevice.start();
				} catch (error) {
					log.error(`Device: ${deviceHost} ${deviceName}, Did finish launching error: ${error}`);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
};

module.exports = (api) => {
	api.registerPlatform(CONSTANTS.PluginName, CONSTANTS.PlatformName, XboxPlatform, true);
};
