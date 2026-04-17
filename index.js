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

		const prefDir = join(api.user.storagePath(), 'xboxTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', () => {
			// Each device is set up independently — a failure in one does not
			// block the others. Promise.allSettled runs all in parallel.
			Promise.allSettled(
				config.devices.map(device =>
					this.setupDevice(device, prefDir, log, api)
				)
			).then(results => {
				results.forEach((result, i) => {
					if (result.status === 'rejected') {
						log.error(`Device[${i}] setup error: ${result.reason?.message ?? result.reason}`);
					}
				});
			});
		});
	}

	// ── Per-device setup ──────────────────────────────────────────────────────

	async setupDevice(device, prefDir, log, api) {
		const { name, host, xboxLiveId, displayType } = device;

		if (!name || !host || !xboxLiveId || !displayType) {
			log.warn(`Device: ${host || 'host missing'}, ${name || 'name missing'}, ${xboxLiveId || 'xbox live id missing'}${!displayType ? ', display type disabled' : ''} in config, will not be published in the Home app`);
			return;
		}

		const logLevel = {
			devInfo: device.log?.deviceInfo,
			success: device.log?.success,
			info: device.log?.info,
			warn: device.log?.warn,
			error: device.log?.error,
			debug: device.log?.debug,
		};

		if (logLevel.debug) {
			log.info(`Device: ${host} ${name}, did finish launching.`);
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
					},
				},
			};
			log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}.`);
		}

		// Resolve all file paths up front — before the impulse generator starts,
		// so a file-creation failure aborts early rather than inside the retry loop.
		const postFix = host.split('.').join('');
		const authTokenFile = `${prefDir}/authToken_${postFix}`;
		const devInfoFile = `${prefDir}/devInfo_${postFix}`;
		const inputsFile = `${prefDir}/inputs_${postFix}`;
		const inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
		const inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

		try {
			const files = [
				authTokenFile,
				devInfoFile,
				inputsFile,
				inputsNamesFile,
				inputsTargetVisibilityFile,
			];

			files.forEach(file => {
				if (!existsSync(file)) {
					writeFileSync(file, '');
				}
			});
		} catch (error) {
			if (logLevel.error) log.error(`Device: ${host} ${name}, Prepare files error: ${error.message ?? error}`);
			return;
		}

		// The startup impulse generator retries the full connect cycle
		// every 120 s until it succeeds, then hands off to the xboxDevice
		// impulse generator and stops itself.
		const impulseGenerator = new ImpulseGenerator()
			.on('start', async () => {
				try {
					await this.startDevice({
						device, name, host,
						authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile,
						logLevel, log, api, impulseGenerator,
					});
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
				}
			})
			.on('state', (state) => {
				if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
			});

		await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
	}

	// ── Connect and register a single Xbox device as a Homebridge accessory ───

	async startDevice({ device, name, host, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile, logLevel, log, api, impulseGenerator }) {
		const xboxDevice = new XboxDevice(api, device, authTokenFile, devInfoFile, inputsFile, inputsNamesFile, inputsTargetVisibilityFile)
			.on('devInfo', (info) => logLevel.devInfo && log.info(info))
			.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
			.on('info', (msg) => logLevel.info && log.info(`Device: ${host} ${name}, ${msg}`))
			.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
			.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${name}, ${msg}`))
			.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${name}, ${msg}`));

		const accessory = await xboxDevice.start();
		if (!accessory) return;

		api.publishExternalAccessories(PluginName, [accessory]);
		if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

		// Hand off to the xboxDevice impulse generator and stop the startup one.
		await xboxDevice.startStopImpulseGenerator(true, [{ name: 'connect', sampling: 6000 }]);
		await impulseGenerator.state(false);
	}

	// ── Homebridge accessory cache ────────────────────────────────────────────

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, XboxPlatform);
};