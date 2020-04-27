'use strict'
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const TvRemoteChannel = require('xbox-smartglass-core-node/src/channels/tvremote');

let Accessory, Service, Characteristic, UUIDGen, Categories;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	Categories = homebridge.hap.Accessory.Categories;

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
		this.api.unregisterPlatformAccessories('homebridge-xbox-tv', 'XboxTv', [platformAccessory]);
	}
}

class xboxTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		// devices configuration
		this.name = device.name;
		this.host = device.host;
		this.xboxliveid = device.xboxliveid;
		this.volumeControl = device.volumeControl;
		this.switchInfoMenu = device.switchInfoMenu;
		this.apps = device.apps;

		//get Device info
		this.manufacturer = device.manufacturer || 'Microsoft';
		this.modelName = device.modelName || 'homebridge-xbox-tv';
		this.serialNumber = device.serialNumber || 'SN00000003';
		this.firmwareRevision = device.firmwareRevision || 'FW00000003';

		//setup variables
		this.appReferences = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentAppReference = null;
		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.appsFile = this.prefDir + '/' + 'apps_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'info_' + this.host.split('.').join('');

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			mkdirp(this.prefDir);
		}

		this.sgClient = Smartglass();

		// Start Smartglass Client
		setInterval(function () {
			var me = this;
			if (this.sgClient._connection_status == false) {
				this.sgClient = Smartglass();

				this.sgClient.connect(me.host).then(function () {
					me.log('Device: %s, name: %s, state: Online', me.host, me.name);
					me.connectionStatus = true;
					me.currentPowerState = true;

					this.sgClient.addManager('system_input', SystemInputChannel());
					this.sgClient.addManager('system_media', SystemMediaChannel());
					this.sgClient.addManager('tv_remote', TvRemoteChannel());
				}.bind(this), function (error) {
					if (error) {
						me.log('Device: %s, name: %s, state: Offline, error: %s', me.host, me.name, error);
						me.connectionStatus = false;
						me.currentPowerState = false;
					}
				});

				this.sgClient.on('_on_timeout', function (setInterval) {
					me.log('Device: %s, name: %s, state: Time OUT', me.host, me.name);
					me.connectionStatus = false;
				}.bind(this, setInterval));

				this.sgClient.on('_on_console_status', function (response, device, smartglass) {
					if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
						me.currentAppReference = response.packet_decoded.protected_payload.apps[0].aum_id;
					}
				}.bind(this));
			}
		}.bind(this), 5000);

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1000);
	}


	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		this.UUID = UUIDGen.generate(this.name)
		this.accessory = new Accessory(this.name, this.UUID, Categories.TELEVISION);

		this.televisionService = new Service.Television(this.name, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getApp.bind(this))
			.on('set', this.setApp.bind(this));

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.accessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

			this.accessory.addService(this.televisionService);
			this.prepareSpeakerService();
			this.prepareInputsService();
			if (this.volumeControl) {
				this.prepareVolumeService();
			}

		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-xbox-tv', [this.accessory]);
	}

	//Prepare speaker service
	prepareSpeakerService() {
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(this.name + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.setVolumeSelector.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);
	}

	//Prepare volume service
	prepareVolumeService() {
		this.log.debug('prepareVolumeService');
		this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', function (callback) {
				let mute = this.currentMuteState ? 0 : 1;
				callback(null, mute);
			});
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');
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
			if (appReference !== undefined && appReference !== null) {
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
								this.log('Device: %s, saved new App successful, name: %s reference: %s', this.host, newAppName, appReference);
							}
						});
						callback(null, newAppName);
					});
				this.accessory.addService(tempInput);
				this.televisionService.addLinkedService(tempInput);
				this.appReferences.push(appReference);
			}
		});
	}

	getPowerState(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log('Device: %s, get current Power state successful, state: %s', me.host, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setPowerState(state, callback) {
		var me = this;
		let smartglass = Smartglass();
		me.getPowerState(function (error, currentPowerState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (!currentPowerState) {
					smartglass.powerOn({ live_id: me.xboxliveid, tries: 4, ip: me.host }).then(function (data) {
						me.log('Device: %s booting, response: %s', me.host, data);
						callback(null, true);
					}, function (error) {
						me.log.debug('Device: %s booting failed, error: %s', me.host, error);
						callback(error);
					});
				} else {
					if (!state) {
						me.sgClient.powerOff().then(function (data) {
							me.log('Device: %s, set new Power state successful, new state: OFF', me.host);
							me.sgClient._connection_status = false;
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
		let state = me.currentMuteState;
		me.log('Device: %s, get current Mute state successful: %s', me.host, state ? 'ON' : 'OFF');
		me.currentMuteState = state;
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
					me.log('Device: %s, set new Mute state successful: %s', me.host, state ? 'ON' : 'OFF');
					me.currentMuteState = state;
					callback(null, state);
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log('Device: %s, get current Volume level successful: %s', me.host, volume);
		me.currentVolume = volume;
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		me.log('Device: %s, set new Volume level successful: %s', me.host, volume);
		me.currentVolume = volume;
		callback(null, volume);
	}

	getApp(callback) {
		var me = this;
		if (!me.connectionStatus) {
			callback(null, 0);
		} else {
			let appReference = me.currentAppReference;
			for (let i = 0; i < me.appReferences.length; i++) {
				if (appReference === me.appReferences[i]) {
					me.log('Device: %s, get current App successful: %s', me.host, appReference);
					me.currentAppReference = appReference;
					callback(null, i);
				}
			}
		}
	}

	setApp(inputIdentifier, callback) {
		var me = this;
		me.getApp(function (error, currentAppReference) {
			if (error) {
				me.log.debug('Device: %s, can not get current App. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				let appReference = me.inputReferences[inputIdentifier];
				if (appReference !== currentAppReference) {
					me.log('Device: %s, set new App successful, new App reference: %s', me.host, appReference);
					me.currentAppReference = appReference;
					callback(null, inputIdentifier);
				}
			}
		});
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		let command;
		let type;
		switch (remoteKey) {
			case Characteristic.PowerModeSelection.SHOW:
				command = me.switchInfoMenu ? 'nexus' : 'menu';
				type = 'system_input';
				break;
			case Characteristic.PowerModeSelection.HIDE:
				command = 'b';
				type = 'system_input';;
				break;
		}
		this.sgClient.getManager(type).sendCommand(command).then(function () { });
		me.log('Device: %s, setPowerModeSelection successful, state: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		let command;
		let type;
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
		this.sgClient.getManager(type).sendIrCommand(command).then(function () { });
		me.log('Device: %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}


	setRemoteKey(remoteKey, callback) {
		var me = this;
		let command;
		let type;
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
		this.sgClient.getManager(type).sendCommand(command).then(function () { });
		me.log('Device: %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}
};
