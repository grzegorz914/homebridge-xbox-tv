import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import XboxDevice from './src/xboxdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class XboxPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}`);
			return;
		}
		this.accessories = [];

		//create directory if it doesn't exist
		const prefDir = join(api.user.storagePath(), 'xboxTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {

				//check accessory is enabled
				const disableAccessory = device.disableAccessory || false;
				if (disableAccessory) {
					continue;
				}

				const deviceName = device.name;
				const host = device.host;
				const xboxLiveId = device.xboxLiveId;

				if (!deviceName || !host || !xboxLiveId) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, Host: ${host ? 'OK' : host}, Xbox Live ID: ${xboxLiveId ? 'OK' : xboxLiveId}, wrong or missing.`);
					continue;
				}

				//log config
				const logLevel = {
					debug: device.enableDebugMode,
					info: !device.disableLogInfo,
					success: !device.disableLogSuccess,
					warn: !device.disableLogWarn,
					error: !device.disableLogError,
					devInfo: !device.disableLogDeviceInfo,
				};
				if (logLevel.debug) log.info(`Device: ${host} ${deviceName}, did finish launching.`);

				const safeConfig = {
					...device,
					xboxLiveId: 'removed',
					webApiToken: 'removed',
					webApiClientSecret: 'removed',
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				if (logLevel.debug) log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(safeConfig, null, 2)}.`);

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
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${deviceName}, Prepare files error: ${error.message ?? error}`);
					continue;
				}

				//xbox device
				try {
					const xboxDevice = new XboxDevice(api, device, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile)
						.on('devInfo', (info) => logLevel.devInfo && log.info(info))
						.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${deviceName}, ${msg}`))
						.on('info', (msg) => logLevel.info && log.info(`Device: ${host} ${deviceName}, ${msg}`))
						.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${deviceName}, debug: ${msg}`))
						.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${deviceName}, ${msg}`))
						.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${deviceName}, ${msg}`));

					//create impulse generator
					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator.on('start', async () => {
						try {
							const accessory = await xboxDevice.start();
							if (accessory) {
								api.publishExternalAccessories(PluginName, [accessory]);
								if (logLevel.success) log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);

								await impulseGenerator.stop();
								await xboxDevice.startImpulseGenerator();
							}
						} catch (error) {
							if (logLevel.error) log.error(`Device: ${host} ${deviceName}, ${error.message ?? error}, trying again.`);
						}
					}).on('state', (state) => {
						if (logLevel.debug) log.info(`Device: ${host} ${deviceName}, Start impulse generator ${state ? 'started' : 'stopped'}`);
					});

					//start impulse generator
					await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${deviceName}, Did finish launching error: ${error.message ?? error}`);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, XboxPlatform);
};

