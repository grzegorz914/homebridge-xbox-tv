'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
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
				const deviceName = this.devices[i];
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
		this.volumeControl = config.volumeControl || 0;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs || [];

		//device info
		this.manufacturer = config.manufacturer || 'Microsoft';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.inputsName = new Array();
		this.inputsReference = new Array();
		this.inputsType = new Array();
		this.checkDeviceInfo = true;
		this.startPrepareAccessory = true;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
		this.currentInputIdentifier = 0;
		this.currentMediaState = false; //play/pause
		this.prefDir = path.join(api.user.storagePath(), 'xboxTv');
		this.devConfigurationFile = this.prefDir + '/' + 'Configurationo_' + this.host.split('.').join('');
		this.devHeadendInfoFile = this.prefDir + '/' + 'HeadendInfo_' + this.host.split('.').join('');
		this.devLiveTVInfoFile = this.prefDir + '/' + 'LiveTVInfo_' + this.host.split('.').join('');
		this.devTunerLineupsFile = this.prefDir + '/' + 'TunerLineups_' + this.host.split('.').join('');
		this.devAppChannelLineupsFile = this.prefDir + '/' + 'AppChannelLineups_' + this.host.split('.').join('');
		this.devInfoFile = this.prefDir + '/' + 'devInfo_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.xbox = Smartglass();

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}
		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fsPromises.mkdir(this.prefDir);
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devConfigurationFile) === false) {
			fsPromises.writeFile(this.devConfigurationFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devHeadendInfoFile) === false) {
			fsPromises.writeFile(this.devHeadendInfoFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devTunerLineupsFile) === false) {
			fsPromises.writeFile(this.devTunerLineupsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devTunerLineupsFile) === false) {
			fsPromises.writeFile(this.devTunerLineupsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devAppChannelLineupsFile) === false) {
			fsPromises.writeFile(this.devAppChannelLineupsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.devInfoFile) === false) {
			fsPromises.writeFile(this.devInfoFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.inputsFile) === false) {
			fsPromises.writeFile(this.inputsFile, '{}');
		}
		//check if the files exists, if not then create it
		if (fs.existsSync(this.customInputsFile) === false) {
			fsPromises.writeFile(this.customInputsFile, '{}');
		}

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
			if (this.currentPowerState && this.checkDeviceInfo) {
				this.getDeviceInfo();
			}
		}.bind(this), this.refreshInterval * 1000);

		if (this.startPrepareAccessory) {
			this.prepareAccessory();
		}
	}

	getDeviceInfo() {
		this.log.debug('Device: %s %s, requesting Device Info.', this.host, this.name);
		try {
			this.xbox.getManager('tv_remote').getConfiguration().then(response => {
				this.log.debug('Device: %s %s, debug getConfiguration response: %s', this.host, this.name, response);
				if (fs.existsSync(this.devConfigurationFile) === false) {
					const data = JSON.stringify(response, null, 2);
					fsPromises.writeFile(this.devConfigurationFile, data);
				}
			}).catch(error => {
				this.log.error('Device: %s %s, getConfiguration error: %s', this.host, this.name, error);
			});
			this.xbox.getManager('tv_remote').getHeadendInfo().then(response => {
				this.log.debug('Device: %s %s, debug getHeadendInfo response: %s', this.host, this.name, response);
				if (fs.existsSync(this.devHeadendInfoFile) === false) {
					const data = JSON.stringify(response, null, 2);
					fsPromises.writeFile(this.devHeadendInfoFile, data);
				}
			}).catch(error => {
				this.log.error('Device: %s %s, getHeadendInfo data error: %s', this.host, this.name, error);
			});
			this.xbox.getManager('tv_remote').getLiveTVInfo().then(response => {
				this.log.debug('Device: %s %s, debug getLiveTVInfo response: %s', this.host, this.name, response);
				if (fs.existsSync(this.devLiveTVInfoFile) === false) {
					const data = JSON.stringify(response, null, 2);
					fsPromises.writeFile(this.devLiveTVInfoFile, data);
				}
			}).catch(error => {
				this.log.error('Device: %s %s, getLiveTVInfo data error: %s', this.host, this.name, error);
			});
			this.xbox.getManager('tv_remote').getTunerLineups().then(response => {
				this.log.debug('Device: %s %s, debug getTunerLineups response: %s', this.host, this.name, response);
				if (fs.existsSync(this.devTunerLineupsFile) === false) {
					const data = JSON.stringify(response, null, 2);
					fsPromises.writeFile(this.devTunerLineupsFile, data);
				}
			}).catch(error => {
				this.log.error('Device: %s %s, getTunerLineups data error: %s', this.host, this.name, error);
			});
			//this.xbox.getManager('tv_remote').getAppChannelLineups().then(response => {
			//	if (fs.existsSync(this.devAppChannelLineupsFile) === false) {
			//		const data = JSON.stringify(response, null, 2);
			//		fsPromises.writeFile(this.getAppChannelLineups, data);
			//	}
			//}).catch(error => {
			//	this.log.error('Device: %s %s, getAppChannelLineups data error: %s', this.host, this.name, error);
			//});
			const manufacturer = this.manufacturer;
			const modelName = this.modelName;
			const serialNumber = this.serialNumber;
			const firmwareRevision = this.firmwareRevision;

			const obj = { 'manufacturer': manufacturer, 'modelName': this.modelName, 'Serial': serialNumber, 'Firmware': firmwareRevision };
			const devInfo = JSON.stringify(obj, null, 2);
			const writeDevInfoFile = fsPromises.writeFile(this.devInfoFile, devInfo);
			this.log.debug('Device: %s %s, saved Device Info successful.', this.host, this.name);

			if (!this.disableLogInfo) {
				this.log('Device: %s %s, state: Online.', this.host, this.name);
			}
			this.log('-------- %s --------', this.name);
			this.log('Manufacturer: %s', manufacturer);
			this.log('Model: %s', modelName);
			this.log('Serialnr: %s', serialNumber);
			this.log('Firmware: %s', firmwareRevision);
			this.log('----------------------------------');

			this.checkDeviceInfo = false;
			this.updateDeviceState();
		} catch (error) {
			this.log.error('Device: %s %s, Device Info eror: %s, state: Offline, trying to reconnect', this.host, this.name, error);
			this.checkDeviceInfo = true;
		}
	}

	updateDeviceState() {
		this.log.debug('Device: %s %s, requesting Device state.', this.host, this.name);
		if (this.currentPowerState) {
			this.xbox.on('_on_console_status', (response, config, smartglass) => {
				this.log.debug('Device %s %s, get device status data: %s', this.host, this.name, response);
				if (response.packet_decoded.protected_payload.apps[0] !== undefined) {
					const powerState = this.currentPowerState;
					if (this.televisionService) {
						this.televisionService
							.updateCharacteristic(Characteristic.Active, powerState ? 1 : 0);
					}
					const inputReference = response.packet_decoded.protected_payload.apps[0].aum_id;
					const inputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
					const inputName = this.inputsName[inputIdentifier];
					if (this.televisionService) {
						this.televisionService
							.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
					}
					this.currentInputReference = inputReference;
					this.currentInputIdentifier = inputIdentifier;
					this.currentInputName = inputName;

					const volume = this.currentVolume;
					const mute = powerState ? this.currentMuteState : true;
					if (this.speakerService) {
						this.speakerService
							.updateCharacteristic(Characteristic.Volume, volume)
							.updateCharacteristic(Characteristic.Mute, mute);
						if (this.volumeService && this.volumeControl === 1) {
							this.volumeService
								.updateCharacteristic(Characteristic.Brightness, volume)
								.updateCharacteristic(Characteristic.On, !mute);
						}
						if (this.volumeServiceFan && this.volumeControl === 2) {
							this.volumeServiceFan
								.updateCharacteristic(Characteristic.RotationSpeed, volume)
								.updateCharacteristic(Characteristic.On, !mute);
						}
					}
					this.currentMuteState = mute;
					this.currentVolume = volume;
				}

				const currentMediaState = this.xbox.getManager('system_media').getState();
				this.currentMediaState = (currentMediaState.title_id !== 0);
				this.log.debug('Device: %s %s, get current media state: %s', this.host, this.name, this.currentMediaState);
			}, function (error) {
				this.log.error('Device: %s %s, update Device state error: %s, state: Offline', this.host, this.name, error);
			});
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
		let devInfo = { 'manufacturer': 'Manufacturer', 'modelName': 'Model name', 'serialNumber': 'Serial number', 'firmwareRevision': 'Firmware' };
		try {
			devInfo = JSON.parse(fs.readFileSync(this.devInfoFile));
			this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, devInfo)
		} catch (error) {
			this.log.debug('Device: %s %s, read devInfo failed, error: %s', this.host, accessoryName, error)
		}

		const manufacturer = this.manufacturer;
		const modelName = devInfo.modelName;
		const serialNumber = devInfo.serialNumber;
		const firmwareRevision = devInfo.firmwareRevision;

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
			.onGet(async () => {
				const state = this.currentPowerState ? 1 : 0;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Power state successfull, state: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (state && !this.currentPowerState) {
					const xbox = Smartglass();
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
			.onGet(async () => {
				const inputReference = this.currentInputReference;
				const inputIdentifier = (this.inputsReference.indexOf(inputReference) >= 0) ? this.inputsReference.indexOf(inputReference) : 0;
				const inputName = this.inputsName[inputIdentifier];
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Input successful: %s %s', this.host, accessoryName, inputName, inputReference);
				}
				return inputIdentifier;
			})
			.onSet(async (inputIdentifier) => {
				try {
					const inputName = this.inputsName[inputIdentifier];
					const inputReference = this.inputsReference[inputIdentifier];
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
			.onGet(async () => {
				const volume = this.currentVolume;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Volume level successful: %s', this.host, accessoryName, volume);
				}
				return volume;
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
			.onGet(async () => {
				const state = this.currentMuteState;
				if (!this.disableLogInfo) {
					this.log('Device: %s %s, get current Mute state successful: %s', this.host, accessoryName, state ? 'ON' : 'OFF');
				}
				return state;
			})
			.onSet(async (state) => {
				if (this.currentPowerState && state !== this.currentMuteState) {
					try {
						const command = 'btn.vol_mute';
						const type = 'tv_remote';
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
					.onGet(async () => {
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.currentMuteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeService);
				this.volumeService.addLinkedService(this.volumeService);
			}
			if (this.volumeControl == 2) {
				this.volumeServiceFan = new Service.Fan(accessoryName + ' Volume', 'volumeServiceFan');
				this.volumeServiceFan.getCharacteristic(Characteristic.RotationSpeed)
					.onGet(async () => {
						const volume = this.currentVolume;
						return volume;
					})
					.onSet(async (volume) => {
						this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					});
				this.volumeServiceFan.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !this.currentMuteState;
						return state;
					})
					.onSet(async (state) => {
						this.speakerService.setCharacteristic(Characteristic.Mute, !state);
					});
				accessory.addService(this.volumeServiceFan);
				this.televisionService.addLinkedService(this.volumeServiceFan);
			}
		}

		//Prepare inputs services
		if (this.inputs.length > 0) {
			this.log.debug('prepareInputsService');
			this.inputsService = new Array();

			let savedNames = {};
			try {
				savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
				this.log.debug('Device: %s %s, read devInfo: %s', this.host, accessoryName, savedNames)
			} catch (error) {
				this.log.debug('Device: %s %s, customInputs file does not exist', this.host, accessoryName)
			}

			const inputs = this.inputs;
			let inputsLength = inputs.length;
			if (inputsLength > 94) {
				inputsLength = 94
			}

			for (let i = 0; i < inputsLength; i++) {

				//get input reference
				const inputReference = inputs[i].reference;

				//get input name		
				let inputName = inputs[i].name;
				if (savedNames && savedNames[inputReference]) {
					inputName = savedNames[inputReference];
				} else {
					inputName = inputs[i].name;
				}

				//get input type
				const inputType = inputs[i].type;

				const inputService = new Service.InputSource(inputReference, 'input' + i);
				inputService
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, inputType)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
					.setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN);

				inputService
					.getCharacteristic(Characteristic.ConfiguredName)
					.onSet(async (name) => {
						savedNames[inputReference] = name;
						fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
							this.log.debug('Device: %s %s, saved new Input successful, savedNames: %s', this.host, accessoryName, JSON.stringify(savedNames, null, 2));
							if (error) {
								this.log.error('Device: %s %s, can not write new App name, error: %s', this.host, accessoryName, error);
							} else {
								if (!this.disableLogInfo) {
									this.log('Device: %s %s, saved new App successful, name: %s reference: %s', this.host, accessoryName, name, inputReference);
								}
							}
						});
					});
				this.inputsReference.push(inputReference);
				this.inputsName.push(inputName);
				this.inputsType.push(inputType);

				this.inputsService.push(inputService);
				accessory.addService(this.inputsService[i]);
				this.televisionService.addLinkedService(this.inputsService[i]);
			};
		}

		this.startPrepareAccessory = false;
		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	}
};
