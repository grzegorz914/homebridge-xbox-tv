'use strict';
const path = require('path');
const fs = require('fs');
const XboxDevice = require('./src/xboxdevice.js');
const CONSTANTS = require('./src/constans.json');

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

		api.on('didFinishLaunching', () => {
			for (const device of config.devices) {
				if (!device.name || !device.host || !device.xboxLiveId) {
					log.warn(`Device Name: ${device.name ? device.name : 'Missing'}, Host: ${device.host ? device.host : 'Missing'} or Xbox Live ID: ${device.xboxLiveId ? device.xboxLiveId : 'Missing'}.`);
					return;
				}
				const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, did finish launching.`) : false;

				//xbox device
				const xboxDevice = new XboxDevice(api, prefDir, device);
				xboxDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
					const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, published as external accessory.`) : false;
				})
					.on('devInfo', (devInfo) => {
						log(devInfo);
					})
					.on('message', (message) => {
						log(`Device: ${device.host} ${device.name}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Device: ${device.host} ${device.name}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${device.host} ${device.name}, ${error}`);
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
