'use strict';
const path = require('path');
const fs = require('fs');
const XboxDevice = require('./src/xboxdevice.js');
const ImpulseGenerator = require('./src/impulsegenerator.js');
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
				const host = device.host ?? false;
				const xboxLiveId = device.xboxLiveId ?? false;

				if (!deviceName || !host || !xboxLiveId) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, Host: ${host ? 'OK' : host}, Xbox Live ID: ${xboxLiveId ? 'OK' : xboxLiveId}, wrong or missing.`);
					return;
				}

				//debug config
				const enableDebugMode = device.enableDebugMode;
				const debug = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, Did finish launching.`) : false;
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
				const debug1 = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//check files exists, if not then create it
				const postFix = host.split('.').join('');
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
					log.error(`Device: ${host} ${deviceName}, Prepare files error: ${error}`);
					return;
				}

				//xbox device
				try {
					const xboxDevice = new XboxDevice(api, device, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile);
					xboxDevice.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
						log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
					})
						.on('devInfo', (devInfo) => {
							log.info(devInfo);
						})
						.on('success', (message) => {
							log.success(`Device: ${host} ${deviceName}, ${message}`);
						})
						.on('message', (message) => {
							log.info(`Device: ${host} ${deviceName}, ${message}`);
						})
						.on('debug', (debug) => {
							log.info(`Device: ${host} ${deviceName}, debug: ${debug}`);
						})
						.on('warn', (warn) => {
							log.warn(`warn: ${host} ${deviceName}, ${warn}`);
						})
						.on('error', (error) => {
							log.error(`Device: ${host} ${deviceName}, ${error}`);
						});

					//create impulse generator
					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator.on('start', async () => {
						try {
							await xboxDevice.start();
							impulseGenerator.stop();
						} catch (error) {
							const logError = disableLogConnectError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
						};
					}).on('state', (state) => {
						const debug = enableDebugMode ? state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`) : false;
					});

					//start impulse generator
					impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}`);
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
