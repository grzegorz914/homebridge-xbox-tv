'use strict'
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const TvRemoteChannel = require('xbox-smartglass-core-node/src/channels/tvremote');

let Accessory, Service, Characteristic, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform('homebridge-xbox-tv', 'XboxTv', xboxTvPlatform, true);
};


class xboxTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log('No configuration found for homebridge-xbox-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.devices = config.devices || [];
		this.tvAccessories = [];

		if (api) {
			this.api = api;

			if (this.version < 2.1) {
				throw new Error('Unexpected API version.');
			}
			this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
		}
	}

	didFinishLaunching() {
		this.log.debug('didFinishLaunching');
		for (let i = 0, len = this.devices.length; i < len; i++) {
			let deviceName = this.devices[i];
			if (!deviceName.name) {
				this.log.warn('Device Name Missing')
			} else {
				this.tvAccessories.push(new xboxTvDevice(this.log, deviceName, this.api));
			}
		}
	}
	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.tvAccessories) {
			this.tvAccessories.push(platformAccessory);
		}
	}
	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories('homebridge-openwebif-tv', 'OpenWebIfTv', [platformAccessory]);
	}
}

class xboxTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;

		// devices configuration
		this.device = device;
		this.name = device.name;
		this.host = device.host;
		this.xboxliveid = device.xboxliveid;
		this.switchInfoMenu = device.switchInfoMenu;
		this.apps = device.apps;

		//get Device info
		this.manufacturer = device.manufacturer || 'Microsoft';
		this.modelName = device.modelName || 'homebridge-xbox-tv';
		this.serialNumber = device.serialNumber || 'SN00000003';
		this.firmwareRevision = device.firmwareRevision || 'FW00000003';

		//setup variablee
		this.appReferences = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentAppReference = '';
		this.currentInfoMenuState = false;
		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.appsFile = this.prefDir + '/' + 'apps_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'info_' + this.host.split('.').join('');

		this.sgClient = false;
		this.sgClient = new Smartglass();

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			mkdirp(this.prefDir);
		}

		// Start Smartglass Client
		setInterval(function () {
			var me = this;
			if (this.sgClient._connection_status == false) {

				this.sgClient.connect(this.host).then(function () {
					me.log('Device: %s, name: %s, state: Online', me.host, me.name);
					me.connectionStatus = true;

					this.sgClient.addManager('system_input', SystemInputChannel());
					this.sgClient.addManager('system_media', SystemMediaChannel());
					this.sgClient.addManager('tv_remote', TvRemoteChannel());
				}.bind(this), function (error) {
					if (error) {
						me.log('Device: %s, name: %s, state: Offline, test error: %s', me.host, me.name, error);
					}
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
				});

				this.sgClient.on('_on_console_status', function (response, device, smartglass) {
					if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
						me.currentAppReference = response.packet_decoded.protected_payload.apps[0].aum_id;
					}
				}.bind(this));
			}
		}.bind(this), 10000);

		this.currentPowerState = this.sgClient._connection_status;

		//Delay to wait for device info before publish
		setTimeout(this.prepareTvService.bind(this), 1000);
	}


	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			//me.sgClient.getManager('tv_remote').getConfiguration().then(function (configuration) {
			//	me.log('Device: %s, get getConfiguration: %s', me.host, configuration)
			//}, function (error) {
			//	me.log('Device: %s, failed to get getConfiguration, error: %s', me.host, error)
			//});

			//me.sgClient.getManager('tv_remote').getHeadendInfo().then(function (configuration) {
			//	me.log('Device: %s, get getHeadendInfo: %s', me.host, configuration)
			//}, function (error) {
			//	me.log('Device: %s, failed to get getHeadendInfo, error: %s', me.host, error)
			//});

			//me.sgClient.getManager('tv_remote').getLiveTVInfo().then(function (configuration) {
			//	me.log('Device: %s, get getLiveTVInfo: %s', me.host, configuration)
			//}, function (error) {
			//	me.log('Device: %s, failed to get getLiveTVInfo, error: %s', me.host, error)
			//});

			//me.sgClient.getManager('tv_remote').getTunerLineups().then(function (configuration) {
			//	me.log('Device: %s, get getTunerLineups: %s', me.host, configuration)
			//}, function (error) {
			//	me.log('Device: %s, failed to get getTunerLineups, error: %s', me.host, error)
			//});

			//me.sgClient.getManager('tv_remote').getAppChannelLineups().then(function (configuration) {
			//	me.log('Device: %s, get getAppChannelLineups: %s', me.host, configuration)
			//}, function (error) {
			//	me.log('Device: %s, failed to get getAppChannelLineups, error: %s', me.host, error)
			//});
		}, 300);
	}

	//Prepare TV service 
	prepareTvService() {
		this.log.debug('prepereTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.host + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setApp(callback, this.appReferences[inputIdentifier]);
			})
			.on('get', this.getApp.bind(this));

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepereTvSpeakerService();
		this.prepareInputServices();

		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-xbox-tv', [this.tvAccesory]);
	}

	//Prepare speaker service
	prepereTvSpeakerService() {
		this.log.debug('prepereTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.volumeSelectorPress.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	//Prepare apps services
	prepareInputServices() {
		this.log.debug('prepareInputServices');
		if (this.apps === undefined || this.apps === null || this.apps.length <= 0) {
			return;
		}

		if (Array.isArray(this.apps) === false) {
			this.apps = [this.apps];
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.appsFile));
		} catch (err) {
			this.log.debug('Device: %s, apps file does not exist', this.host)
		}

		this.apps.forEach((app, i) => {

			//get app reference
			let appReference = null;

			if (app.reference !== undefined) {
				appReference = app.reference;
			} else {
				appReference = app;
			}

			//get app name		
			let appName = appReference;

			if (savedNames && savedNames[appReference]) {
				appName = savedNames[appReference];
			} else if (app.name) {
				appName = app.name;
			}

			//if reference not null or empty add the app
			if (appReference !== undefined && appReference !== null && appReference !== '') {
				appReference = appReference.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(appReference, 'app' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, appName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (newAppName, callback) => {
						this.apps[appReference] = newAppName;
						fs.writeFile(this.appsFile, JSON.stringify(this.apps), (error) => {
							if (error) {
								this.log.debug('Device: %s, can not write new App name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new App successfull, name: %s reference: %s', this.host, newAppName, appReference);
							}
						});
						callback();
					});
				this.tvAccesory.addService(tempInput);
				this.tvService.addLinkedService(tempInput);
				this.appReferences.push(appReference);
			}

		});
	}

	getPowerState(callback) {
		var me = this;
		var state = me.currentPowerState;
		me.log('Device: %s, get current Power state successfull, state: %s', me.host, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setPowerState(state, callback) {
		var me = this;
		var smartglass = Smartglass();
		me.getPowerState(function (error, currentPowerState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (!currentPowerState) {
					smartglass.powerOn({
						live_id: me.xboxliveid,
						tries: 10,
						ip: me.host
					}).then(function (data) {
						me.log('Device: %s booting, response: %s', me.host, data);
						me.currentPowerState = true;
						callback(null, true);
					}, function (error) {
						me.log.debug('Device: %s booting failed, error: %s', me.host, error);
						callback(error);
					});
				} else {
					if (!state) {
						me.sgClient.powerOff().then(function (data) {
							me.log('Device: %s, set new Power state successfull, new state: OFF', me.host);
							me.sgClient._connection_status = false;
							me.currentPowerState = false;
							callback(null, true);
						}.bind(this), function (error) {
							me.log.debug('Device: %s, set new Power state error: %s', me.host, error);
							callback(error);
						});
					} else {
						callback(null, true);
					}
				}
			}
		});
	}


	getMute(callback) {
		var me = this;
		var state = me.currentMuteState;
		me.log('Device: %s, get current Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		me.getMute(function (error, currentMuteState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute for new state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentMuteState) {
					me.log('Device: %s, set new Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
					callback(null, state);
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		var volume = me.currentVolume;
		me.log('Device: %s, get current Volume level successfull: %s', me.host, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		me.log('Device: %s, set new Volume level successfull: %s', me.host, volume);
		callback(null, volume);
	}

	getApp(callback) {
		var me = this;
		if (me.currentPowerState == false) {
			me.tvService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			var appReference = me.currentAppReference;
			for (let i = 0; i < me.appReferences.length; i++) {
				if (appReference == me.appReferences[i]) {
					me.tvService
						.getCharacteristic(Characteristic.ActiveIdentifier)
						.updateValue(i);
					me.log('Device: %s, get current App successfull: %s', me.host, appReference);
					me.currentAppReference = appReference;
				}
			}
			callback(null, appReference);
		}
	}

	setApp(callback, appReference) {
		var me = this;
		me.getApp(function (error, currentAppReference) {
			if (error) {
				me.log.debug('Device: %s, can not get current App. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (appReference !== currentAppReference) {
					me.log('Device: %s, set new App successfull, new App reference: %s', me.host, appReference);
					me.currentAppReference = appReference;
					callback(null, appReference);
				}
			}
		});
	}

	setPowerModeSelection(state, callback) {
		var me = this;
		var command;
		var type;
		if (me.currentInfoMenuState) {
			command = 'b';
			type = 'system_input';
		} else {
			command = me.switchInfoMenu ? 'nexus' : 'menu';
			type = 'system_input';
		}
		me.log('Device: %s, setPowerModeSelection successfull, state: %s, command: %s', me.host, me.currentInfoMenuState ? 'HIDDEN' : 'SHOW', command);
		this.sgClient.getManager(type).sendCommand(command).then(function () { });
		me.currentInfoMenuState = !me.currentInfoMenuState;
		callback(null, state);
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		var command;
		var type;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = 'btn.vol_up';
				type = 'tv_remote';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = 'btn.vol_down';
				type = 'tv_remote';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sgClient.getManager(type).sendIrCommand(command).then(function () { });
		callback(null, remoteKey);
	}


	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command;
		var type;
		switch (remoteKey) {
			case Characteristic.RemoteKey.PLAY_PAUSE:
				command = 'playpause';
				type = 'system_media';
				break;
			case Characteristic.RemoteKey.REWIND:
				command = 'rewind';
				type = 'system_media';
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				command = 'fast_forward';
				type = 'system_media';
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				command = 'next_track';
				type = 'system_media';
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				command = 'prev_track';
				type = 'system_media';
				break;
			case Characteristic.RemoteKey.ARROW_UP:
				command = 'up';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.ARROW_DOWN:
				command = 'down';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.ARROW_LEFT:
				command = 'left';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
				command = 'right';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.SELECT:
				command = 'a';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.EXIT:
				command = 'nexus';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.BACK:
				command = 'b';
				type = 'system_input';
				break;
			case Characteristic.RemoteKey.INFORMATION:
				command = me.switchInfoMenu ? 'nexus' : 'view';
				type = 'system_input';
				break;
		}
		me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
		this.sgClient.getManager(type).sendCommand(command).then(function () { });
		callback(null, remoteKey);
	}
};
