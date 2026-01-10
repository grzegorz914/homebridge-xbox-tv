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
				const { name, host, xboxLiveId, displayType } = device;
				if (!name || !host || !xboxLiveId || !displayType) {
					log.warn(`Device: ${host || 'host missing'},  ${name || 'name missing'}, ${xboxLiveId || 'xbox live id missing'}${!displayType ? ', disply type disabled' : ''} in config, will not be published in the Home app`);
					continue;
				}

				//log config
				const logLevel = {
					devInfo: device.log?.deviceInfo,
					success: device.log?.success,
					info: device.log?.info,
					warn: device.log?.warn,
					error: device.log?.error,
					debug: device.log?.debug
				};
				if (logLevel.debug) log.info(`Device: ${host} ${name}, did finish launching.`);

				const safeConfig = {
					...device,
					xboxLiveId: 'removed',
					webApi: {
						token: 'removed',
						clientSecret: 'removed',
						clientId: 'removed',
					},
					mqtt: {
						auth: {
							...device.mqtt?.auth,
							passwd: 'removed',
						}
					},
				};
				if (logLevel.debug) log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}.`);

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
					if (logLevel.error) log.error(`Device: ${host} ${name}, Prepare files error: ${error.message ?? error}`);
					continue;
				}

				//xbox device
				try {
					//create impulse generator
					const impulseGenerator = new ImpulseGenerator()
						.on('start', async () => {
							try {
								const xboxDevice = new XboxDevice(api, device, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile)
									.on('devInfo', (info) => logLevel.devInfo && log.info(info))
									.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
									.on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
									.on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
									.on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
									.on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

								const accessory = await xboxDevice.start();
								if (accessory) {
									api.publishExternalAccessories(PluginName, [accessory]);
									if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

									await xboxDevice.startStopImpulseGenerator(true, [{ name: 'connect', sampling: 6000 }]);

									//stop impulse generator
									await impulseGenerator.state(false);
								}
							} catch (error) {
								if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
							}
						}).on('state', (state) => {
							if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}`);
						});

					//start impulse generator
					await impulseGenerator.state(true, [{ name: 'start', sampling: 120000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${error.message ?? error}`);
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

