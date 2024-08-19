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

		//check if prefs directory exist
		const prefDir = path.join(api.user.storagePath(), 'xboxTv');
		if (!fs.existsSync(prefDir)) {
			fs.mkdirSync(prefDir);
		};

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

				//xbox device
				const xboxDevice = new XboxDevice(api, prefDir, device);
				xboxDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
					log.success(`Device: ${deviceHost} ${deviceName}, published as external accessory.`);
				})
					.on('devInfo', (devInfo) => {
						log.info(devInfo);
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
