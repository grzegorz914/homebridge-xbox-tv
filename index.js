'use strict';
const XboxDevice = require('./src/xboxdevice.js');
const CONSTANS = require('./src/constans.json');

class XboxPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log(`No configuration found for ${PLUGIN_NAME}`);
			return;
		}
		this.accessories = [];

		api.on('didFinishLaunching', () => {
			log.debug('didFinishLaunching');
			for (const device of config.devices) {
				if (!device.name || !device.host || !device.xboxLiveId) {
					this.log.warn('Device Name, Host or Xbox Live ID Missing');
					return;
				}

				//openwebif device
				const xboxDevice = new XboxDevice(log, api, device);
				xboxDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
					const debug = device.enableDebugMode ? log(`Device: ${device.host} ${device.name}, published as external accessory.`) : false;
				})
					.on('removeAccessory', (accessory) => {
						api.unregisterPlatformAccessories(CONSTANS.PluginName, CONSTANS.PlatformName, [accessory]);
						const debug = device.enableDebugMode ? log(`Accessory: ${accessory}, removed.`) : false;
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
	api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, XboxPlatform, true);
};
