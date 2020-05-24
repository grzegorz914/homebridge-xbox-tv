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
			log('No data found for homebridge-xbox-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.devices = config.devices || [];
		this.accessories = [];

		if (api) {
			this.api = api;
			if (api.version < 2.1) {
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
	constructor(log, config, api) {
		this.log = log;
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.xboxliveid = config.xboxliveid;
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//device info
		this.manufacturer = config.manufacturer || 'Microsoft';
		this.modelName = config.modelName || PLUGIN_NAME;
		this.serialNumber = config.serialNumber || 'SN00000003';
		this.firmwareRevision = config.firmwareRevision || 'FW00000003';

		//setup variables
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.deviceInfoState = false;
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.currentMediaState = false; //play/pause
		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.devConfigurationFile = this.prefDir + '/' + 'Configurationo_' + this.host.split('.').join('');
		this.devHeadendInfoFile = this.prefDir + '/' + 'HeadendInfo_' + this.host.split('.').join('');
		this.devLiveTVInfoFile = this.prefDir + '/' + 'LiveTVInfo_' + this.host.split('.').join('');
		this.devTunerLineupsFile = this.prefDir + '/' + 'TunerLineups_' + this.host.split('.').join('');
		this.devAppChannelLineupsFile = this.prefDir + '/' + 'AppChannelLineups_' + this.host.split('.').join('');

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			let defaultInputs = [
				{
					name: 'No inputs configured',
					reference: 'No references configured',
					type: 'No types configured'
				}
			];
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.error('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				} else {
					this.log.debug('Device: %s %s, create directory successful: %s', this.host, this.name, this.prefDir);
				}
			});
		}

		this.sgClient = Smartglass();

		//Check net state
		setInterval(function () {
			if (!this.sgClient._connection_status) {
				this.sgClient = Smartglass();

				this.sgClient.connect(this.host).then(response => {
					this.log.info('Device: %s %s, state: Online.', this.host, this.name);
					this.sgClient.addManager('system_input', SystemInputChannel());
					this.sgClient.addManager('system_media', SystemMediaChannel());
					this.sgClient.addManager('tv_remote', TvRemoteChannel());
					this.getDeviceState();
				}).catch(error => {
					this.log.debug('Device: %s %s, state Offline.', this.host, this.name);
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
					setTimeout(this.getDeviceInfo.bind(this), 750);
				}
			}
		}.bind(this), 2500);

		this.sgClient.on('_on_timeout', (response) => {
			this.log.debug('Device: %s %s, state: Time OUT', this.host, this.name);
			this.sgClient._connection_status = false;
			this.currentPowerState = false;
		});


		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1500);
	}

	getDeviceInfo() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
		me.sgClient.getManager('tv_remote').getConfiguration().then(data => {
			if (fs.existsSync(me.devConfigurationFile) === false) {
				fs.writeFile(me.devConfigurationFile, JSON.stringify(data, null, 2), (error) => {
					if (error) {
						me.log.error('Device: %s %s, could not write devConfigurationFile, error: %s', me.host, me.name, error);
					} else {
						me.log.debug('Device: %s %s, devConfigurationFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
					}
				});
			}
		}).catch(error => {
			me.log.debug('Device: %s %s, getConfiguration error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getHeadendInfo().then(data => {
			if (fs.existsSync(me.devHeadendInfoFile) === false) {
				fs.writeFile(me.devHeadendInfoFile, JSON.stringify(data, null, 2), (error) => {
					if (error) {
						me.log.error('Device: %s %s, could not write devHeadendInfoFile, error: %s', me.host, me.name, error);
					} else {
						me.log.debug('Device: %s %s, devHeadendInfoFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
					}
				});
			}
		}).catch(error => {
			me.log.debug('Device: %s %s, getHeadendInfo data error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getLiveTVInfo().then(data => {
			if (fs.existsSync(me.devLiveTVInfoFile) === false) {
				fs.writeFile(me.devLiveTVInfoFile, JSON.stringify(data, null, 2), (error) => {
					if (error) {
						me.log.error('Device: %s %s, could not write devLiveTVInfoFile, error: %s', me.host, me.name, error);
					} else {
						me.log.debug('Device: %s %s, devLiveTVInfoFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
					}
				});
			}
		}).catch(error => {
			me.log.debug('Device: %s %s, getLiveTVInfo data error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getTunerLineups().then(data => {
			if (fs.existsSync(me.devTunerLineupsFile) === false) {
				fs.writeFile(me.devTunerLineupsFile, JSON.stringify(data, null, 2), (error) => {
					if (error) {
						me.log.error('Device: %s %s, could not write devTunerLineupsFile, error: %s', me.host, me.name, error);
					} else {
						me.log.debug('Device: %s %s, devTunerLineupsFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
					}
				});
			}
		}).catch(error => {
			me.log.debug('Device: %s %s, getTunerLineups data error: %s', me.host, me.name, error);
		});
		me.sgClient.getManager('tv_remote').getAppChannelLineups().then(data => {
			if (fs.existsSync(me.devAppChannelLineupsFile) === false) {
				fs.writeFile(me.devAppChannelLineupsFile, JSON.stringify(data, null, 2), (error) => {
					if (error) {
						me.log.debug('Device: %s %s, could not write devAppChannelLineupsFile, error: %s', me.host, me.name, error);
					} else {
						me.log.debug('Device: %s %s, devAppChannelLineupsFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
					}
				});
			}
		}).catch(error => {
			me.log.error('Device: %s %s, getAppChannelLineups data error: %s', me.host, me.name, error);
		});

		me.deviceInfoState = true;
	}

	getDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
		me.sgClient.on('_on_console_status', (response, config, smartglass) => {
			this.log.debug('Device %s %s, get device status data: %s', this.host, this.name, response);
			if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
				if (me.televisionService && !me.currentPowerState) {
					me.televisionService.updateCharacteristic(Characteristic.Active, true);
					me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, 'ON');
					me.currentPowerState = true;
				}

				let inputReference = response.packet_decoded.protected_payload.apps[0].aum_id;
				let inputIdentifier = me.inputReferences.indexOf(inputReference);
				let inputName = me.inputNames[inputIdentifier];
				if (me.televisionService && (inputReference !== me.currentInputReference)) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s, get current App successful: %s %s', me.host, me.name, inputName, inputReference);
				me.currentInputName = inputName;
				me.currentInputReference = inputReference;
				me.currentInputIdentifier = inputIdentifier;

				let muteState = me.currentPowerState ? me.currentMuteState : true;
				if (me.speakerService && (muteState !== me.currentMuteState)) {
					me.speakerService.updateCharacteristic(Characteristic.Mute, muteState);
					if (me.volumeService && me.volumeControl >= 1) {
						me.volumeService.updateCharacteristic(Characteristic.On, !muteState);
					}
				}
				me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, muteState ? 'ON' : 'OFF');
				me.currentMuteState = muteState;

				let volume = me.currentVolume;
				if (me.speakerService && (volume !== me.currentVolume)) {
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					if (me.volumeService && me.volumeControl == 1) {
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
					}
					if (me.volumeService && me.volumeControl == 2) {
						me.volumeService.updateCharacteristic(Characteristic.RotationSpeed, volume);
					}
				}
				me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
				me.currentVolume = volume;
			} else {
				if (me.televisionService && me.currentPowerState) {
					me.televisionService.updateCharacteristic(Characteristic.Active, false);
				}
				me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, 'OFF');
				me.currentPowerState = false;
			}

			let currentMediaState = me.sgClient.getManager('system_media').getState();
			me.currentMediaState = (currentMediaState.title_id !== 0);
			me.log.debug('Device: %s %s, get current media state: %s', me.host, me.name, me.currentMediaState);
		});
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		this.accessory = new Accessory(accessoryName, accessoryUUID);
		this.accessory.category = Categories.TELEVISION;

		this.accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
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
		if (this.volumeControl >= 1) {
			this.prepareVolumeService();
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
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
		if (this.volumeControl == 1) {
			this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.Brightness)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		if (this.volumeControl == 2) {
			this.volumeService = new Service.Fan(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.RotationSpeed)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', (callback) => {
				let state = !this.currentMuteState;
				callback(null, state);
			})
			.on('set', (state, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !state);
				callback(null);
			});

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (err) {
			this.log.debug('Device: %s %s, Inputs file does not exist', this.host, this.name)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = input.reference;

			//get input name		
			let inputName = input.name;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			//get input type		
			let inputType = input.type;

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					savedNames[inputReference] = name;
					fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
						if (error) {
							this.log.error('Device: %s %s, can not write new App name, error: %s', this.host, this.name, error);
						} else {
							this.log.info('Device: %s %s, saved new App successful, name: %s reference: %s', this.host, this.name, name, inputReference);
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

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log.info('Device: %s %s, get current Power state successful, state: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		let smartglass = Smartglass();
		if (state && !me.currentPowerState) {
			smartglass.powerOn({ live_id: me.xboxliveid, tries: 4, ip: me.host }).then(data => {
				me.log.info('Device: %s %s, set new Power state successful: %s, %s', me.host, me.name, 'ON', data);
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, booting failed, error: %s', me.host, me.name, error);
				callback(error);
			});
		} else {
			if (!state && me.currentPowerState) {
				setTimeout(() => {
					me.sgClient.powerOff().then(data => {
						me.log.info('Device: %s %s, set new Power state successful, new state: OFF', me.host, me.name);
						callback(null);
					}).catch(error => {
						me.log.error('Device: %s %s, set new Power state error: %s', me.host, me.name, error);
						callback(error);
					});
				}, 350);
			}
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.info('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		let command = 'btn.vol_mute';
		let type = 'tv_remote';
		if (me.currentPowerState && state !== me.currentMuteState) {
			me.sgClient.getManager(type).sendIrCommand(command).then(data => {
				me.log.info('Device: %s %s, set new Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
				callback(null);
			}).catch(error => {
				me.log.error('Device: %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
				callback(error);
			});
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log.info('Device: %s %s, get current Volume level successful: %s', me.host, me.name, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		if (volume == 0 || volume == 100) {
			volume = me.currentVolume;
		}
		me.log('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
		callback(null);
	}

	getInput(callback) {
		var me = this;
		let inputName = me.currentInputName;
		let inputReference = me.currentInputReference;
		let inputIdentifier = me.currentInputIdentifier;
		me.log.info('Device: %s %s, get current App successful: %s %s', me.host, me.name, inputName, inputReference);
		callback(null, inputIdentifier);
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		setTimeout(() => {
			let inputReference = me.inputReferences[inputIdentifier];
			let inputName = me.inputNames[inputIdentifier];
			if (inputReference !== me.currentInputReference) {
				me.log.info('Device: %s %s, set new App successful, new App reference: %s %s', me.host, me.name, inputName, inputReference);
				callback(null);
			}
		}, 250);
	}

	setPowerModeSelection(mode, callback) {
		var me = this;
		let command = null;
		let type = null;
		if (me.currentPowerState) {
			switch (mode) {
				case Characteristic.PowerModeSelection.SHOW:
					command = me.switchInfoMenu ? 'nexus' : 'menu';
					type = 'system_input';
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = 'b';
					type = 'system_input';;
					break;
			}
			me.sgClient.getManager(type).sendCommand(command).then(data => {
				me.log.info('Device: %s %s, setPowerModeSelection successful, command: %s', me.host, me.name, command);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
			});
			callback(null);
		}
	}

	setVolumeSelector(state, callback) {
		var me = this;
		let command = null;
		let type = null;
		if (me.currentPowerState) {
			switch (state) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'btn.vol_up';
					type = 'tv_remote';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'btn.vol_down';
					type = 'tv_remote';
					break;
			}
			me.sgClient.getManager(type).sendIrCommand(command).then(data => {
				me.log.info('Device: %s %s, setVolumeSelector successful, command: %s', me.host, me.name, command);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
			});
			callback(null);
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		let command = null;
		let type = null;
		if (me.currentPowerState) {
			switch (remoteKey) {
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
				case Characteristic.RemoteKey.BACK:
					command = 'b';
					type = 'system_input';
					break;
				case Characteristic.RemoteKey.EXIT:
					command = 'nexus';
					type = 'system_input';
					break;
				case Characteristic.RemoteKey.PLAY_PAUSE:
					command = 'playpause';
					type = 'system_media';
					break;
				case Characteristic.RemoteKey.INFORMATION:
					command = me.switchInfoMenu ? 'nexus' : 'view';
					type = 'system_input';
					break;
			}
			me.sgClient.getManager(type).sendCommand(command).then(data => {
				me.log.info('Device: %s %s, setRemoteKey successful,  command: %s', me.host, me.name, command);
			}).catch(error => {
				me.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', me.host, me.name, error);
			});
			callback(null);
		}
	}
};
