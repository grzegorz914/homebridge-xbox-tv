'use strict';
const path = require('path');
const fs = require('fs');
const RestFul = require('./src/restful.js');
const Mqtt = require('./src/mqtt.js');
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
				const debug = debugMode ? log(`Device: ${deviceHost} ${deviceName}, did finish launching.`) : false;
				const config = {
					...device,
					xboxLiveId: 'removed',
					webApiToken: 'removed',
					webApiClientId: 'removed',
					webApiClientSecret: 'removed',
					mqttUser: 'removed',
					mqttPasswd: 'removed'
				};
				const debug1 = debugMode ? log(`Device: ${deviceHost} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				const restFulEnabled = device.enableRestFul || false;
				const restFulPort = device.restFulPort || 3000;
				const restFulDebug = device.restFulDebug || false;
				const mqttEnabled = device.enableMqtt || false;
				const mqttDebug = device.mqttDebug || false;
				const mqttHost = device.mqttHost;
				const mqttPort = device.mqttPort || 1883;
				const mqttClientId = device.mqttClientId || `Xbox_${Math.random().toString(16).slice(3)}`;
				const mqttPrefix = device.mqttPrefix;
				const mqttAuth = config.mqttAuth || false;
				const mqttUser = device.mqttUser;
				const mqttPasswd = device.mqttPasswd;

				//RESTFul server
				if (restFulEnabled) {
					this.restFulConnected = false;
					this.restFul = new RestFul({
						port: restFulPort,
						debug: restFulDebug
					});

					this.restFul.on('connected', (message) => {
						log(deviceHost, deviceName, message);
						this.restFulConnected = true;
					})
						.on('debug', (debug) => {
							log(`Device: ${deviceHost} ${deviceName}, debug: ${debug}`);
						})
						.on('error', (error) => {
							log.error(`Device: ${deviceHost} ${deviceName}, ${error}`);
						});
				}

				//MQTT client
				if (mqttEnabled) {
					this.mqttConnected = false;
					this.mqtt = new Mqtt({
						host: mqttHost,
						port: mqttPort,
						clientId: mqttClientId,
						user: mqttUser,
						passwd: mqttPasswd,
						prefix: `${mqttPrefix}/${deviceName}`,
						debug: mqttDebug
					});

					this.mqtt.on('connected', (message) => {
						log(deviceHost, deviceName, message);
						this.mqttConnected = true;
					})
						.on('debug', (debug) => {
							log(`Device: ${deviceHost} ${deviceName}, debug: ${debug}`);
						})
						.on('error', (error) => {
							log.error(`Device: ${deviceHost} ${deviceName}, ${error}`);
						});
				};

				//xbox device
				const xboxDevice = new XboxDevice(api, prefDir, device);
				xboxDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
					const debug = debugMode ? log(`Device: ${deviceHost} ${deviceName}, published as external accessory.`) : false;
				})
					.on('devInfo', (devInfo) => {
						log(devInfo);
					})
					.on('message', (message) => {
						log(`Device: ${deviceHost} ${deviceName}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Device: ${deviceHost} ${deviceName}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${deviceHost} ${deviceName}, ${error}`);
					})
					.on('restFul', (path, data) => {
						const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
					})
					.on('mqtt', (topic, data) => {
						const mqtt = this.mqttConnected ? this.mqtt.send(topic, data) : false;
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
