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
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, xboxTvPlatform, true);
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
		this.api = api;
		this.devices = config.devices || [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				let deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					new xboxTvDevice(this.log, deviceName, this.api);
				}
			}
		});
	}

	configureAccessory(platformAccessory) {
		this.log.debug('configurePlatformAccessory');
	}

	removeAccessory(platformAccessory) {
		this.log.debug('removePlatformAccessory');
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
		this.refreshInterval = config.refreshInterval || 5;
		this.disableLogInfo = config.disableLogInfo;
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//device info
		this.manufacturer = config.manufacturer || 'Microsoft';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.checkDeviceInfo = true;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
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

		this.xbox = Smartglass();

		//Check net state
		setInterval(function () {
			if (!this.xbox._connection_status) {
				this.xbox = Smartglass();
				this.xbox.connect(this.host).then(response => {
					this.xbox.addManager('system_input', SystemInputChannel());
					this.xbox.addManager('system_media', SystemMediaChannel());
					this.xbox.addManager('tv_remote', TvRemoteChannel());
					this.currentPowerState = true;
					this.checkDeviceInfo = true;
				}).catch(error => {
					this.log.debug('Device: %s %s, state Offline.', this.host, this.name);
					this.currentPowerState = false;
					if (this.televisionService) {
						this.televisionService.updateCharacteristic(Characteristic.Active, 0);
					}
				});
			} else {
				this.currentPowerState = true;
				if (this.televisionService) {
					this.televisionService.updateCharacteristic(Characteristic.Active, 1);
				}
			}
			if (this.checkDeviceInfo) {
				this.getDeviceInfo();
			}
		}.bind(this), this.refreshInterval * 1000);
	}

	getDeviceInfo() {
		var me = this;
		if (me.currentPowerState) {
			me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
			me.xbox.getManager('tv_remote').getConfiguration().then(response => {
				if (fs.existsSync(me.devConfigurationFile) === false) {
					fs.writeFile(me.devConfigurationFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write devConfigurationFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, devConfigurationFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			}).catch(error => {
				me.log.debug('Device: %s %s, getConfiguration error: %s', me.host, me.name, error);
			});
			me.xbox.getManager('tv_remote').getHeadendInfo().then(response => {
				if (fs.existsSync(me.devHeadendInfoFile) === false) {
					fs.writeFile(me.devHeadendInfoFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write devHeadendInfoFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, devHeadendInfoFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			}).catch(error => {
				me.log.debug('Device: %s %s, getHeadendInfo data error: %s', me.host, me.name, error);
			});
			me.xbox.getManager('tv_remote').getLiveTVInfo().then(response => {
				if (fs.existsSync(me.devLiveTVInfoFile) === false) {
					fs.writeFile(me.devLiveTVInfoFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write devLiveTVInfoFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, devLiveTVInfoFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			}).catch(error => {
				me.log.debug('Device: %s %s, getLiveTVInfo data error: %s', me.host, me.name, error);
			});
			me.xbox.getManager('tv_remote').getTunerLineups().then(response => {
				if (fs.existsSync(me.devTunerLineupsFile) === false) {
					fs.writeFile(me.devTunerLineupsFile, JSON.stringify(response, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write devTunerLineupsFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, devTunerLineupsFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
						}
					});
				}
			}).catch(error => {
				me.log.debug('Device: %s %s, getTunerLineups data error: %s', me.host, me.name, error);
			});
			//me.xbox.getManager('tv_remote').getAppChannelLineups().then(response => {
			//	if (fs.existsSync(me.devAppChannelLineupsFile) === false) {
			//		fs.writeFile(me.devAppChannelLineupsFile, JSON.stringify(response, null, 2), (error) => {
			//			if (error) {
			//				me.log.debug('Device: %s %s, could not write devAppChannelLineupsFile, error: %s', me.host, me.name, error);
			//			} else {
			//				me.log.debug('Device: %s %s, devAppChannelLineupsFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(response, null, 2));
			//			}
			//		});
			//	}
			//}).catch(error => {
			//	me.log.error('Device: %s %s, getAppChannelLineups data error: %s', me.host, me.name, error);
			//});
			me.log('Device: %s %s, state: Online.', me.host, me.name);
			let manufacturer = me.manufacturer;
			let modelName = me.modelName;
			let serialNumber = me.serialNumber;
			let firmwareRevision = me.firmwareRevision;
			me.log('-------- %s --------', me.name);
			me.log('Manufacturer: %s', manufacturer);
			me.log('Model: %s', modelName);
			me.log('Serialnr: %s', serialNumber);
			me.log('Firmware: %s', firmwareRevision);
			me.log('----------------------------------');

			me.checkDeviceInfo = false;
			me.updateDeviceState();
		}
	}

	updateDeviceState() {
		var me = this;
		if (me.currentPowerState) {
			me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
			me.xbox.on('_on_console_status', (response, config, smartglass) => {
				me.log.debug('Device %s %s, get device status data: %s', me.host, me.name, response);
				if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
					let powerState = me.currentPowerState;
					if (me.televisionService) {
						me.televisionService.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
					}
					let inputReference = response.packet_decoded.protected_payload.apps[0].aum_id;
					let inputIdentifier = 0;
					if (me.inputReferences.indexOf(inputReference) >= 0) {
						inputIdentifier = me.inputReferences.indexOf(inputReference);
					}
					let inputName = me.inputNames[inputIdentifier];
					if (me.televisionService && (inputReference !== me.currentInputReference)) {
						me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					}
					me.log.debug('Device: %s %s, get current App successful: %s %s', me.host, me.name, inputName, inputReference);
					me.currentInputReference = inputReference;
					me.currentInputIdentifier = inputIdentifier;
					me.currentInputName = inputName;

					let mute = powerState ? me.currentMuteState : true;
					let volume = me.currentVolume;
					if (me.speakerService) {
						me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
						me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
						if (me.volumeService && me.volumeControl == 1) {
							me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
							me.volumeService.updateCharacteristic(Characteristic.On, !mute);
						}
						if (me.volumeServiceFan && me.volumeControl == 2) {
							me.volumeServiceFan.updateCharacteristic(Characteristic.RotationSpeed, volume);
							me.volumeServiceFan.updateCharacteristic(Characteristic.On, !mute);
						}
					}
					me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, mute ? 'ON' : 'OFF');
					me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
					me.currentMuteState = mute;
					me.currentVolume = volume;
				}

				let currentMediaState = me.xbox.getManager('system_media').getState();
				me.currentMediaState = (currentMediaState.title_id !== 0);
				me.log.debug('Device: %s %s, get current media state: %s', me.host, me.name, me.currentMediaState);
			}, function (error) {
				me.log.error('Failed to get configuration:', error)
			});
		}

		//start prepare accessory
		if (me.startPrepareAccessory) {
			me.prepareAccessory();
		}
	}

	//Prepare accessory
	prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		const accessoryCategory = Categories.TV_SET_TOP_BOX;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//Prepare information service
		this.log.debug('prepareInformationService');

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, accessoryName)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

		accessory.addService(informationService);


		//Prepare television service
		this.log.debug('prepareTelevisionService');
		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', (callback) => {
				let state = this.currentPowerState ? 1 : 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				callback(null, state);
			})
			.onSet(async (state) => {
				if (state && !this.currentPowerState) {
					let xbox = Smartglass();
					xbox.powerOn({ live_id: this.xboxliveid, tries: 10, ip: this.host }).then(response => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new Power state successful: %s, %s', this.host, accessoryName, 'ON', response);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, booting failed, error: %s', this.host, accessoryName, error);
					});
				} else {
					if (!state && this.currentPowerState) {
						this.xbox.powerOff().then(response => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new Power state successful, new state: %s, %s', this.host, accessoryName, 'OFF', response);
							}
							this.currentPowerState = false;
							this.checkDeviceInfo = true;
						}).catch(error => {
							this.log.error('Device: %s %s, set new Power state error: %s', this.host, accessoryName, error);
						});
					}
				}
			});

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', (callback) => {
				let inputIdentifier = 0;
				let inputReference = this.currentInputReference;
				if (this.inputReferences.indexOf(inputReference) !== -1) {
					inputIdentifier = this.inputReferences.indexOf(inputReference);
				}
				let inputName = this.inputNames[inputIdentifier];
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
				}
				callback(null, inputIdentifier);
			})
			.onSet(async (inputIdentifier) => {
				try {
					let inputName = this.inputNames[inputIdentifier];
					let inputReference = this.inputReferences[inputIdentifier];
					if (inputReference !== this.currentInputReference) {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, set new App successful, new App reference: %s %s', this.host, accessoryName, inputName, inputReference);
						}
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Input. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.onSet(async (command) => {
				try {
					let type;
					switch (command) {
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
							command = this.switchInfoMenu ? 'nexus' : 'view';
							type = 'system_input';
							break;
					}
					this.xbox.getManager(type).sendCommand(command).then(response => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, setRemoteKey successful,  command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					});
				} catch (error) {
					this.log.error('Device: %s %s, can not setRemoteKey command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.onSet(async (command) => {
				try {
					let type;
					switch (command) {
						case Characteristic.PowerModeSelection.SHOW:
							command = this.switchInfoMenu ? 'nexus' : 'menu';
							type = 'system_input';
							break;
						case Characteristic.PowerModeSelection.HIDE:
							command = 'b';
							type = 'system_input';;
							break;
					}
					this.xbox.getManager(type).sendCommand(command).then(response => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					});
				} catch (error) {
					this.log.error('Device: %s %s, can not setPowerModeSelection command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		accessory.addService(this.televisionService);

		//Prepare speaker service
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(accessoryName + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.onSet(async (command) => {
				try {
					let type;
					switch (command) {
						case Characteristic.VolumeSelector.INCREMENT:
							command = 'btn.vol_up';
							type = 'tv_remote';
							break;
						case Characteristic.VolumeSelector.DECREMENT:
							command = 'btn.vol_down';
							type = 'tv_remote';
							break;
					}
					this.xbox.getManager(type).sendIrCommand(command).then(response => {
						if (!this.disableLogInfo) {
							this.log('Device: %s %s, setVolumeSelector successful, command: %s', this.host, accessoryName, command);
						}
					}).catch(error => {
						this.log.error('Device: %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					});
				} catch (error) {
					this.log.error('Device: %s %s, can not setVolumeSelector command. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', (callback) => {
				let volume = this.currentVolume;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				callback(null, volume);
			})
			.onSet(async (volume) => {
				try {
					if (volume == 0 || volume == 100) {
						volume = this.currentVolume;
					}
					if (!this.disableLogInfo) {
						this.log('Device: %s %s, set new Volume level successful: %s', this.host, accessoryName, volume);
					}
				} catch (error) {
					this.log.error('Device: %s %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
				};
			});
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', (callback) => {
				let state = this.currentMuteState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				callback(null, state);
			})
			.onSet(async (state) => {
				if (this.currentPowerState && state !== this.currentMuteState) {
					try {
						let command = 'btn.vol_mute';
						let type = 'tv_remote';
						this.xbox.getManager(type).sendIrCommand(command).then(response => {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, set new Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
							}
						}).catch(error => {
							this.log.error('Device: %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
						});
					} catch (error) {
						this.log.error('Device: %s %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', this.host, accessoryName, error);
					};
				};
			});

		accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);

		//Prepare volume service
		if (this.volumeControl >= 1) {
			this.log.debug('prepareVolumeService');
			if (this.volumeControl == 1) {
				this.volumeService = new Service.Lightbulb(accessoryName + ' Volume', 'volumeService');
				this.volumeService.getCharacteristic(Characteristic.Brightness)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeService);
				this.volumeService.addLinkedService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.on('get', (callback) => {
						let volume = this.currentVolume;
						callback(null, volume);
					})
					.on('set', (volume, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
						callback(null);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.on('get', (callback) => {
						let state = this.currentPowerState ? this.currentMuteState : true;
						callback(null, !state);
					})
					.on('set', (state, callback) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
						callback(null);
					});
				accessory.addService(this.volumeServiceFan);
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}
		}

		let inputs = this.inputs;
		let inputsLength = inputs.length;
		if (inputsLength > 94) {
			inputsLength = 94
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, customInputs file does not exist', this.host, accessoryName)
		}

		for (let i = 0; i < inputsLength; i++) {

			//get input reference
			let inputReference = inputs[i].reference;

			//get input name		
			let inputName = inputs[i].name;
			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = inputs[i].name;
			}

			//get input type
			let inputType = inputs[i].type;

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
				.setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					savedNames[inputReference] = name;
					fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
						if (error) {
							this.log.error('Device: %s %s, can not write new App name, error: %s', this.host, accessoryName, error);
						} else {
							if (!this.disableLogInfo) {
								this.log('Device: %s %s, saved new App successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
							}
						}
					});
					callback(null);
				});
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);

			accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
		};

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
