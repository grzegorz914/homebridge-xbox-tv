const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const dataDelay = 1000;

const Smartglass = require('xbox-smartglass-core-node')
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
			(this.devices.length + 1) * dataDelay);
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
		this.modelName = device.model || 'homebridge-xbox-tv';
		this.serialNumber = device.serialNumber || 'SN00000003';
		this.firmwareRevision = device.firmwareRevision || 'FW00000003';

		//setup variablee
		this.sgClient = Smartglass();
		this.connection_status = false;
		this.appReferences = new Array();

		this.appsDir = ppath('xboxTv/');
		this.appsFile = this.appsDir + 'apps_' + this.host.split('.').join('');

		//check if prefs directory ends with a /, if not then add it
		if (this.appsDir.endsWith('/') === false) {
			this.appsDir = this.appsDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.appsDir) === false) {
			mkdirp(this.appsDir);
		}

		//Start Smartglass Client
		var connect_client = function () {
			var me = this;
			if (this.sgClient._connection_status == false) {
				this.sgClient.connect(this.host).then(function () {
					me.log('Device: %s, succesfully connected!', me.host);
					me.connection_status = true;
					this.sgClient.addManager('system_input', SystemInputChannel())
					this.sgClient.addManager('system_media', SystemMediaChannel())
					this.sgClient.addManager('tv_remote', TvRemoteChannel())
				}.bind(this), function (error) {
					if (error) {
						me.log('Device: %s, failed to connect, state: %s', me.host, error);
					}
					me.connection_status = false;
				});

				this.sgClient.on('_on_timeout', function (message, xbox, remote, smartglass) {
					me.connection_status = false;
					me.log('Device: %s, connection timed out.', me.host)
				}.bind(this, connect_client))
			}
		}.bind(this)

		setInterval(connect_client, 5000)
		connect_client()

		//Delay to wait for device info
		setTimeout(this.prepereTvService.bind(this), dataDelay);

		var deviceName = this.name;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-xbox-tv', [this.tvAccesory]);
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
		if (this.sgClient._connection_status) {
			var state = this.sgClient._connection_status;
			me.log('Device: %s, get current Power state successfull, state: %s', me.host, state ? 'ON' : 'OFF');
			callback(null, true);
		} else {
			me.log('Device: %s, get current Power state successfull, state: %s', me.host, state ? 'ON' : 'OFF');
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		if (!this.sgClient._connection_status) {
			this.sgClient.powerOn({
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
			if (state != 1) {
				this.sgClient.powerOff().then(function (data) {
					me.log('Device: %s, set new Power state successfull: %s', me.host, data ? 'OFF' : 'ON');
					callback(null, true);
				}, function (error) {
					me.log.debug('Device: %s, set new Power state error: %s', me.host, error);
					callback(error);
				})
			}
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
		if (this.sgClient._connection_status) {
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
			me.log('Device: %s, not reachable or Power Setting not set to Instant ON', me.host);
			callback(null);
		}
	}

	setApp(callback, appReference) {
		var me = this;
		if (this.sgClient._connection_status) {
			me.getApp(function (error, currentAppReference) {
				if (error) {
					me.log.debug('Device: %s, can not get current App Reference. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					if (currentAppReference == appReference) {
						callback(null, appReference);
					} else {
						me.log('Device: %s, set new App successfull: %s', me.host, appReference);
						callback(null, appReference);
					}
				}
			});
		}
	}

	setPowerMode(callback, state) {
		var me = this;
		var command = this.menuButton ? 'menu' : 'view';
		me.log('Device: %s, send command: %s', me.host, command);
		this.sgClient.getManager('system_input').sendCommand(command).then(function () { });
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
		callback(null, scommand);
	}


	remoteKeyPress(remoteKey, callback) {
		var me = this;
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
		callback(null, command);
	}
};
