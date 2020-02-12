const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const tcpp = require('tcp-ping');
const responseDelay = 1500;

const Smartglass = require('xbox-smartglass-core-node');
var SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
var SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
var TvRemoteChannel = require('xbox-smartglass-core-node/src/channels/tvremote');

var Accessory, Service, Characteristic, hap, UUIDGen;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	hap = homebridge.hap;

	homebridge.registerPlatform('homebridge-xbox-tv', 'XboxTv', xboxTvPlatform, true);
};


class xboxTvPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.tvAccessories = [];
		this.devices = config.devices || [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new xboxTvDevice(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		},
			(this.devices.length + 1) * responseDelay);
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
		this.getDeviceInfo();
		this.manufacturer = device.manufacturer || 'Microsoft';
		this.modelName = device.model || 'homebridge-xbox-tv';
		this.serialNumber = device.serialNumber || 'SN00000003';
		this.firmwareRevision = device.firmwareRevision || 'FW00000003';

		//setup variablee
		this.sgClient = Smartglass();
		this.connectionStatus = false;
		this.appReferences = new Array();
		this.prefDir = ppath('xboxTv/');
		this.appsFile = this.prefDir + 'apps_' + this.host.split('.').join('');

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			mkdirp(this.prefDir);
		}

		//Check net state of device
		setInterval(function () {
			var me = this;
			tcpp.probe(me.host, 80, (error, state) => {
				if (!state) {
					me.log('Device: %s, state: Offline.', me.host);
					me.connectionStatus = false;
				} else {
					if (me.connectionStatus) {
						me.log('Device: %s, state: Offline.', me.host);
						me.connectionStatus = false;
					} else {
						me.log('Device: %s, state: Online.', me.host);
						me.connectionStatus = true;
					}
				}
			});

			if (me.connectionStatus) {
				me.sgClient.addManager('system_input', SystemInputChannel());
				me.sgClient.addManager('system_media', SystemMediaChannel());
				me.sgClient.addManager('tv_remote', TvRemoteChannel());
			}

			me.log.debug('Device: %s, connection status: %s', me.host, me.sgClient._connection_status ? 'Connected' : 'Disconnected')
		}.bind(this), 5000);
		
		//Delay to wait for device info
		setTimeout(this.prepereTvService.bind(this), responseDelay);

		var deviceName = this.name;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-xbox-tv', [this.tvAccesory]);
	}

	getDeviceInfo() {
		var me = this;
		if (me.connectionStatus) {
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
		}
	}

	//Prepare TV service 
	prepereTvService() {
		this.log.debug('prepereTvService');
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
			.on('set', this.setPowerMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepereTvSpeakerService();
		this.prepareInputServices();
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
					.on('set', (name, callback) => {
						this.apps[appReference] = name;
						fs.writeFile(this.appsFile, JSON.stringify(this.apps), (error) => {
							if (error) {
								this.log.debug('Device: %s, can not write new App name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new App successfull, name: %s reference: %s', this.host, name, appReference);
							}
						});
						callback()
					});
				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.appReferences.push(appReference);
			}

		});
	}

	getPowerState(callback) {
		var me = this;
		if (me.connectionStatus) {
			var state = (me.sgClient._connection_status == true);
			me.log('Device: %s, get current Power state successfull, state: %s', me.host, state ? 'ON' : 'OFF');
			callback(null, state);
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			if (me.sgClient._connection_status != true) {
				me.sgClient.powerOn({
					live_id: me.xboxliveid,
					tries: 10,
					ip: me.host
				}).then(function (data) {
					me.log('Device: %s booting, response: %s', me.host, data);
					callback(null, true);
				}, function (error) {
					me.log.debug('Device: %s booting failed, error: %s', me.host, error);
					callback(error);
				});
			} else {
				if (state != true) {
					me.sgClient.powerOff().then(function (data) {
						me.log('Device: %s, set new Power state successfull, new state: %s', me.host, data ? 'ON' : 'OFF');
						me.sgClient._connection_status = false;
						callback(null, true);
					}, function (error) {
						me.log.debug('Device: %s, set new Power state error: %s', me.host, error);
						callback(error);
					});
				} else {
					callback(null, true);
				}
			}
		} else {
			me.log('Device: %s, set new Power state failed, not connected to network.', me.host);
		}
	}


	getMute(callback) {
		var me = this;
	}

	setMute(state, callback) {
		var me = this;
	}

	getVolume(callback) {
		var me = this;
	}

	setVolume(volume, callback) {
		var me = this;
	}

	getApp(callback) {
		var me = this;
		if (me.connectionStatus) {
			let appReference = this.sgClient._current_app;
			for (let i = 0; i < me.appReferences.length; i++) {
				if (appReference === me.appReferences[i]) {
					me.tvService
						.getCharacteristic(Characteristic.ActiveIdentifier)
						.updateValue(i);
					me.log('Device: %s, get current App successfull: %s', me.host, appReference);
				}
			}
			callback(null, appReference);
		} else {
			me.log('Device: %s, get current Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setApp(callback, appReference) {
		var me = this;
		if (me.connectionStatus) {
			me.getApp(function (error, currentAppReference) {
				if (error) {
					me.log.debug('Device: %s, can not get current App Reference. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					if (currentAppReference == appReference) {
						callback(null, appReference);
					} else {
						me.log('Device: %s, set new App successfull, new App reference: %s', me.host, appReference);
						callback(null, appReference);
					}
				}
			});
		} else {
			me.log('Device: %s, set new App failed, not connected to network.', me.host);
		}
	}

	setPowerMode(callback, state) {
		var me = this;
		if (me.connectionStatus) {
			var command = this.menuButton ? 'menu' : 'view';
			me.log('Device: %s, send command: %s', me.host, command);
			this.sgClient.getManager('system_input').sendCommand(command).then(function () { });
		} else {
			me.log('Device: %s, set new PowerModeState failed, not connected to network.', me.host);
		}
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
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
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}


	remoteKeyPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
			var command;
			var type;
			switch (state) {
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
					command = 'nexus';
					type = 'system_input';
					break;
			}
			me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
			this.sgClient.getManager(type).sendCommand(command).then(function () { });
		} else {
			me.log('Device: %s, set RemoteKey failed, not connected to network.', me.host);
		}
	}
};
