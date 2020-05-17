'use strict';

const fs = require('fs');
const path = require('path');

const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const TvRemoteChannel = require('xbox-smartglass-core-node/src/channels/tvremote');

const PLUGIN_NAME = 'homebridge-xbox-tv';
const PLATFORM_NAME = 'XboxTv';

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(PLATFORM_NAME, PLATFORM_NAME, xboxTvPlatform, true);
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
		this.accessories = [];

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
				this.accessories.push(new xboxTvDevice(this.log, deviceName, this.api));
			}
		}
	}
	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.accessories) {
			this.accessories.push(platformAccessory);
		}
	}
	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
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
		this.inputs = device.inputs;

		//get Device info
		this.manufacturer = device.manufacturer || 'Microsoft';
		this.modelName = device.modelName || PLUGIN_NAME;
		this.serialNumber = device.serialNumber || 'SN00000003';
		this.firmwareRevision = device.firmwareRevision || 'FW00000003';

		//setup variables
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputReference = null;
		this.currentInputName = null;
		this.mediaState = false;
		this.deviceInfoState = false;
		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.devConfigurationFile = this.prefDir + '/' + 'Configurationo_' + this.host.split('.').join('');
		this.devHeadendInfoFile = this.prefDir + '/' + 'HeadendInfo_' + this.host.split('.').join('');
		this.devLiveTVInfoFile = this.prefDir + '/' + 'LiveTVInfo_' + this.host.split('.').join('');
		this.devTunerLineupsFile = this.prefDir + '/' + 'TunerLineups_' + this.host.split('.').join('');
		this.devAppChannelLineupsFile = this.prefDir + '/' + 'AppChannelLineups_' + this.host.split('.').join('');

		let defaultInputs = [
			{
				name: 'No inputs configured',
				reference: 'No references configured',
				type: 'No types configured'
			}
		];

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				this.log.debug('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
			});
		}

		this.sgClient = Smartglass();

		//Check net state
		setInterval(function () {
			if (!this.sgClient._connection_status) {
				this.sgClient = Smartglass();

				this.sgClient.connect(this.host).then(response => {
					this.log('Device: %s %s, state: Online', this.host, this.name);
					this.sgClient.addManager('system_input', SystemInputChannel());
					this.sgClient.addManager('system_media', SystemMediaChannel());
					this.sgClient.addManager('tv_remote', TvRemoteChannel());
					this.getDeviceState();
				}).catch(error => {
					this.log.debug('Device: %s %s, error: %s', this.host, this.name, error);
					this.currentPowerState = false;
					return;
				});
			} else {
				let powerState = this.currentPowerState;
				if (this.televisionService) {
					this.televisionService.getCharacteristic(Characteristic.Active).updateValue(powerState);
					this.log.debug('Device: %s  %s, get current Power state successful: %s', this.host, this.name, powerState ? 'ON' : 'STANDBY');
				}
				if (!this.deviceInfoState) {
					this.getDeviceInfo();
				}
			}
		}.bind(this), 3000);

		this.sgClient.on('_on_timeout', (response) => {
			this.log.debug('Device: %s %s, state: Time OUT', this.host, this.name);
			this.sgClient._connection_status = false;
			this.currentPowerState = false;
		});


		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1500);
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		this.accessoryUUID = UUID.generate(this.name);
		this.accessory = new Accessory(this.name, this.accessoryUUID);
		this.accessory.category = Categories.TELEVISION;
		this.accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.televisionService = new Service.Television(this.name, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPower.bind(this))
			.on('set', this.setPower.bind(this));

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getInput.bind(this))
			.on('set', this.setInput.bind(this));

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, this.name);
		this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
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
			.on('get', this.getMuteSlider.bind(this));
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.inputsFile));
		} catch (err) {
			this.log.debug('Device: %s %s, Inputs file does not exist', this.host, this.name)
		}

		this.inputs.forEach((input, i) => {

			//get input name		
			let inputName = input.name;

			//get input reference
			let inputReference = input.reference;

			//get input type		
			let inputType = input.type;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (newAppName, callback) => {
					this.inputs[inputReference] = newAppName;
					fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
						if (error) {
							this.log.debug('Device: %s %s, can not write new App name, error: %s', this.host, this.name, error);
						} else {
							this.log('Device: %s %s, saved new App successful, name: %s reference: %s', this.host, this.name, newAppName, inputReference);
						}
					});
					callback(null);
				});
			this.accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);
		});
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		me.sgClient.getManager('tv_remote').getConfiguration().then((configuration) => {
			me.log.debug('Device: %s %s, getConfiguration successful: %s', me.host, me.name, configuration);
			fs.writeFile(me.devConfigurationFile, JSON.stringify(configuration), (error) => {
				if (error) {
					me.log.debug('Device: %s %s, could not write devConfigurationFile, error: %s', me.host, me.name, error);
				} else {
					me.log('Device: %s %s, devConfigurationFile saved successful.', me.host, me.name);
				}
			});
		}, (error) => {
			me.log.debug('Device: %s %s, getConfiguration error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getHeadendInfo().then((configuration) => {
			me.log.debug('Device: %s %s, getHeadendInfo configuration successful: %s', me.host, me.name, configuration);
			fs.writeFile(me.devHeadendInfoFile, JSON.stringify(configuration), (error) => {
				if (error) {
					me.log.debug('Device: %s %s, could not write devHeadendInfoFile, error: %s', me.host, me.name, error);
				} else {
					me.log('Device: %s %s, devHeadendInfoFile saved successful.', me.host, me.name);
				}
			});
		}, (error) => {
			me.log.debug('Device: %s %s, getHeadendInfo configuration error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getLiveTVInfo().then((configuration) => {
			me.log.debug('Device: %s %s, getLinveTVInfo configuration successful: %s', me.host, me.name, configuration);
			fs.writeFile(me.devLiveTVInfoFile, JSON.stringify(configuration), (error) => {
				if (error) {
					me.log.debug('Device: %s %s, could not write devLiveTVInfoFile, error: %s', me.host, me.name, error);
				} else {
					me.log('Device: %s %s, devLiveTVInfoFile saved successful.', me.host, me.name);
				}
			});
		}, (error) => {
			me.log.debug('Device: %s %s, getLiveTVInfo configuration error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getTunerLineups().then((configuration) => {
			me.log.debug('Device: %s %s, getTunerLineups configuration successful: %s', me.host, me.name, configuration);
			fs.writeFile(me.devTunerLineupsFile, JSON.stringify(configuration), (error) => {
				if (error) {
					me.log.debug('Device: %s %s, could not write devTunerLineupsFile, error: %s', me.host, me.name, error);
				} else {
					me.log('Device: %s %s, devTunerLineupsFile saved successful.', me.host, me.name);
				}
			});
		}, (error) => {
			me.log.debug('Device: %s %s, getTunerLineups configuration error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getAppChannelLineups().then((configuration) => {
			me.log.debug('Device: %s %s, getAppChannelLineups configuration successful: %s', me.host, me.name, configuration);
			fs.writeFile(me.devAppChannelLineupsFile, JSON.stringify(configuration), (error) => {
				if (error) {
					me.log.debug('Device: %s %s, could not write devAppChannelLineupsFile, error: %s', me.host, me.name, error);
				} else {
					me.log('Device: %s %s, devAppChannelLineupsFile saved successful.', me.host, me.name);
				}
			});
		}, (error) => {
			me.log.debug('Device: %s %s, getAppChannelLineups configuration error: %s', me.host, me.name, error);
		});

		me.deviceInfoState = true;
	}

	getDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
		me.sgClient.on('_on_console_status', (response, device, smartglass) => {
			if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
				if (me.televisionService) {
					me.televisionService.updateCharacteristic(Characteristic.Active, true);
					me.log('Device: %s %s, get current Power state successful: ON', me.host, me.name);
				}
				let inputReference = response.packet_decoded.protected_payload.apps[0].aum_id;
				if (me.televisionService && (inputReference !== me.currentInputReference)) {
					let inputIdentifier = me.inputReferences.indexOf(inputReference);
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					me.log('Device: %s %s, get current App successful: %s', me.host, me.name, inputReference);
					me.currentInputReference = inputReference;
				}
				let muteState = me.currentPowerState ? me.currentMuteState : true;
				let volume = me.currentVolume;
				if (me.speakerService && (muteState !== me.currentMuteState || volume !== me.currentVolume)) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, muteState);
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeControl && me.volumeService) {
						me.volumeService.updateCharacteristic(Characteristic.On, !muteState);
						me.volumeService.updateCharacteristic(Characteristic.Brightnes, volumes);
					}
					me.log('Device: %s %s, get current Mute state: %s', me.host, me.name, muteState ? 'ON' : 'OFF');
					me.log('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
					me.currentMuteState = muteState;
					me.currentVolume = volume;
				}
				me.currentPowerState = true;
			} else {
				me.currentPowerState = false;
			}
			let mediaState = me.sgClient.getManager('system_media').getState();
			me.mediaState = (mediaState.title_id !== 0);
			me.log('Device: %s %s, get current media state: %s', me.host, me.name, me.mediaState ? 'PLAY' : 'STOP');
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log('Device: %s %s, get current Power state successful, state: %s', me.host, me.name, state ? 'ON' : 'STANDBY');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		let smartglass = Smartglass();
		if (!me.currentPowerState && state) {
			smartglass.powerOn({ live_id: me.xboxliveid, tries: 4, ip: me.host }).then(data => {
				me.log('Device: %s %s, booting..., response: %s', me.host, me.name, data);
				callback(null);
			}).catch(error => {
				me.log.debug('Device: %s %s, booting failed, error: %s', me.host, me.name, error);
				callback(error);
			});
		} else {
			if (me.currentPowerState && !state) {
				me.sgClient.powerOff().then(data => {
					me.log('Device: %s %s, set new Power state successful, new state: STANDBY', me.host, me.name);
					me.currentPowerState = false;
					callback(null);
				}).catch(error => {
					me.log.debug('Device: %s %s, set new Power state error: %s', me.host, me.name, error);
					callback(error);
				});
			}
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	getMuteSlider(callback) {
		var me = this;
		let state = me.currentPowerState ? !me.currentMuteState : false;
		me.log.debug('Device: %s %s, get current Mute state successful: %s', me.host, me.name, !state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		if (state !== me.currentMuteState) {
			me.log('Device: %s %s, set new Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
			callback(null);
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log('Device: %s %s, get current Volume level successful: %s', me.host, me.name, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		me.log('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
		callback(null);
	}

	getInput(callback) {
		var me = this;
		let inputName = me.currentInputName;
		let inputReference = me.currentInputReference;
		if (!me.currentPowerState || inputReference === undefined || inputReference === null) {
			me.televisionService
				.updateCharacteristic(Characteristic.ActiveIdentifier, 0);
			callback(null);
		} else {
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				me.log.debug('Device: %s %s, get current App successful: %s', me.host, me.name, inputName, inputReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputReference = me.inputReferences[inputIdentifier];
		let inputName = me.inputNames[inputIdentifier];
		if (inputReference !== me.currentInputReference) {
			me.log('Device: %s %s, set new App successful, new App reference: %s %s', me.host, me.name, inputName, inputReference);
			callback(null);
		}
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '';
			let type = '';
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
			this.sgClient.getManager(type).sendCommand(command).then(data => { });
			me.log('Device: %s %s, setPowerModeSelection successful, state: %s, command: %s', me.host, me.name, remoteKey, command);
			callback(null);
		}
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '';
			let type = '';
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
			this.sgClient.getManager(type).sendIrCommand(command).then(data => { });
			me.log('Device: %s %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
			callback(null);
		}
	}


	setRemoteKey(remoteKey, callback) {
		var me = this;
		if (me.currentPowerState) {
			let command = '';
			let type = '';
			switch (remoteKey) {
				case Characteristic.RemoteKey.PLAY_PAUSE:
					if (me.mediaState) {
						command = 'pause';
					} else {
						command = 'play';
					}
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
			this.sgClient.getManager(type).sendCommand(command).then(data => { });
			me.log('Device: %s %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
			callback(null);
		}
	}
};
