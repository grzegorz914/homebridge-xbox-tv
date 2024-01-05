"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const Dgram = require('dgram');
const Net = require('net');
const { parse: UuIdParse, v4: UuIdv4 } = require('uuid');
const EventEmitter = require('events');
const Ping = require('ping');
const SimplePacket = require('./simple.js');
const MessagePacket = require('./message.js');
const SGCrypto = require('./sgcrypto.js');
const CONSTANTS = require('../constans.json');

class XBOXLOCALAPI extends EventEmitter {
    constructor(config) {
        super();

        this.crypto = new SGCrypto();
        this.host = config.host;
        this.xboxLiveId = config.xboxLiveId;
        this.tokensFile = config.tokensFile;
        this.devInfoFile = config.devInfoFile;
        this.infoLog = config.infoLog;
        this.debugLog = config.debugLog;

        this.isConnected = false;
        this.isAuthorized = false;
        this.sequenceNumber = 0;
        this.sourceParticipantId = 0;
        this.channels = [];
        this.channelRequestId = 0;
        this.mediaRequestId = 0;
        this.emitDevInfo = true;
        this.startPrepareAccessory = true;

        //dgram socket
        this.connect = () => {
            const udpType = Net.isIPv6(this.host) ? 'udp6' : 'udp4';
            const socket = Dgram.createSocket(udpType);
            socket.on('error', (error) => {
                this.emit('error', `Socket error: ${error}`);
                socket.close();
            }).on('close', () => {
                const debug = this.debugLog ? this.emit('debug', 'Socket closed.') : false;
                this.isConnected = false;
                this.reconnect();
            }).on('message', async (message, remote) => {
                const debug = this.debugLog ? this.emit('debug', `Received message from: ${remote.address}:${remote.port}`) : false;
                this.heartBeatStartTime = Date.now();

                //get message type in hex
                const messageTypeHex = message.slice(0, 2).toString('hex');
                const debug1 = this.debugLog ? this.emit('debug', `Received message type hex: ${messageTypeHex}`) : false;

                //check message type exist in types
                const keysTypes = Object.keys(CONSTANTS.LocalApi.Messages.Types);
                const keysTypesExist = keysTypes.includes(messageTypeHex);

                if (!keysTypesExist) {
                    const debug = this.debugLog ? this.emit('debug', `Received unknown message type: ${messageTypeHex}`) : false;
                    return;
                };

                //get message type and request
                const messageType = CONSTANTS.LocalApi.Messages.Types[messageTypeHex];
                const messageRequest = CONSTANTS.LocalApi.Messages.Requests[messageTypeHex];
                const debug2 = this.debugLog ? this.emit('debug', `Received message type: ${messageType}, request: ${messageRequest}`) : false;

                let packeStructure;
                switch (messageType) {
                    case 'simple':
                        packeStructure = new SimplePacket(messageRequest);
                        break;
                    case 'message':
                        packeStructure = new MessagePacket(messageRequest);
                        break;
                };

                let packet = packeStructure.unpack(this.crypto, message);
                const type = packet.type;
                const debug3 = this.debugLog ? this.emit('debug', `Received type: ${type}`) : false;
                const debug4 = this.debugLog ? this.emit('debug', `Received packet: ${JSON.stringify(packet, null, 2)}`) : false;

                if (messageType === 'message' && packet.targetParticipantId !== this.sourceParticipantId) {
                    const debug = this.debugLog ? this.emit('debug', `Participant Id: ${packet.targetParticipantId} !== ${this.sourceParticipantId}. Ignoring packet.`) : false;
                    return;
                };

                switch (type) {
                    case 'json':
                        // Object to hold fragments 
                        const fragments = {};
                        const jsonMessage = JSON.parse(packet.payloadProtected.json);
                        const datagramId = jsonMessage.datagramId;

                        // Check if JSON is fragmented
                        if (datagramId) {
                            const debug = this.debugLog ? this.emit('debug', `JSON message datagram Id: ${datagramId}`) : false;

                            let partials = {};
                            if (!fragments[datagramId]) {
                                fragments[datagramId] = {
                                    getValue() {
                                        const buffers = Object.values(partials).map(partial => Buffer.from(partial, 'base64'));
                                        return Buffer.concat(buffers);
                                    },
                                    isValid() {
                                        try {
                                            JSON.parse(this.getValue());
                                            return true;
                                        } catch (error) {
                                            this.emit('error', `Valid fragments error: ${error}`);
                                            return false;
                                        }
                                    }
                                };
                            }

                            partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;
                            if (fragments[datagramId].isValid()) {
                                packet.payloadProtected.json = fragments[datagramId].getValue();
                                const debug = this.debugLog ? this.emit('debug', `JSON fragments: ${fragments}`) : false;

                                // Delete
                                delete fragments[datagramId];
                            }
                        };
                        break;
                    case 'discoveryResponse':
                        const deviceType = packet.clientType;
                        const deviceName = packet.name;
                        const certificate = packet.certificate;
                        const debug = this.debugLog ? this.emit('debug', `Discovered device: ${CONSTANTS.LocalApi.Console.Name[deviceType]}, name: ${deviceName}`) : false;

                        try {
                            // Sign public key
                            const data = await this.crypto.getPublicKey(certificate);
                            const debug = this.debugLog ? this.emit('debug', `Signed public key: ${data.publicKey}, iv: ${data.iv}`) : false;

                            // Connect request
                            if (!this.isConnected) {
                                try {
                                    const connectRequest = new SimplePacket('connectRequest');
                                    connectRequest.set('uuid', Buffer.from(UuIdParse(UuIdv4())));
                                    connectRequest.set('publicKey', data.publicKey);
                                    connectRequest.set('iv', data.iv);

                                    const tokenData = await this.readToken();
                                    const tokenExist = tokenData !== false ? true : false;
                                    if (tokenExist) {
                                        connectRequest.set('userHash', tokenData.xsts.DisplayClaims.xui[0].uhs, true);
                                        connectRequest.set('jwt', tokenData.xsts.Token, true);
                                    }
                                    this.isAuthorized = tokenExist;
                                    const debug = this.debugLog ? this.emit('debug', `Client connecting using: ${tokenExist ? 'XSTS token' : 'Anonymous'}.`) : false;

                                    const message = connectRequest.pack(this.crypto);
                                    await this.sendSocketMessage(message, 'connectRequest');
                                } catch (error) {
                                    this.emit('error', `Send connect request error: ${error}`)
                                };
                            };
                        } catch (error) {
                            this.emit('error', `Sign certificate error: ${error}`)
                        };
                        break;
                    case 'connectResponse':
                        const connectionResult = packet.payloadProtected.connectResult;
                        const pairingState = packet.payloadProtected.pairingState;
                        const sourceParticipantId = packet.payloadProtected.participantId;
                        if (connectionResult !== 0) {
                            const errorTable = {
                                0: 'Success.',
                                1: 'Pending login. Reconnect to complete.',
                                2: 'Unknown.',
                                3: 'Anonymous connections disabled.',
                                4: 'Device limit exceeded.',
                                5: 'Remote connect is disabled on the console.',
                                6: 'User authentication failed.',
                                7: 'User Sign-In failed.',
                                8: 'User Sign-In timeout.',
                                9: 'User Sign-In required.'
                            };
                            this.emit('error', `Connect error: ${errorTable[connectionResult]}`);
                            return;
                        }
                        this.isConnected = true;
                        this.sourceParticipantId = sourceParticipantId;
                        const debug1 = this.debugLog ? this.emit('debug', `Client connect state: ${this.isConnected ? 'Connected' : 'Not Connected'}.`) : false;
                        const debug2 = this.debugLog ? this.emit('debug', `Client pairing state: ${CONSTANTS.LocalApi.Console.PairingState[pairingState]}.`) : false;

                        try {
                            const localJoin = new MessagePacket('localJoin');
                            const localJointMessage = localJoin.pack(this.crypto, this.getSequenceNumber(), sourceParticipantId);
                            await this.sendSocketMessage(localJointMessage, 'localJoin');

                            // Open channels
                            try {
                                const channelNames = ['Input', 'TvRemote', 'Media'];
                                for (const channelName of channelNames) {
                                    const channelRequestId = CONSTANTS.LocalApi.Channels.System[channelName].Id
                                    const service = CONSTANTS.LocalApi.Channels.System[channelName].Uuid
                                    //await this.channelOpen(channelRequestId, service);
                                };
                            } catch (error) {
                                this.emit('error', `Channel open error: ${error}`)
                            };
                        } catch (error) {
                            this.emit('error', `Send local join error: ${error}`)
                        };
                        break;
                    case 'acknowledge':
                        const needAck = packet.flags.needAck;
                        if (!needAck) {
                            return;
                        };

                        try {
                            const sequenceNumber = packet.sequenceNumber;
                            const acknowledge = new MessagePacket('acknowledge');
                            acknowledge.set('lowWatermark', sequenceNumber);
                            acknowledge.packet.processedList.value.push({ id: sequenceNumber });
                            const message = acknowledge.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                            await this.sendSocketMessage(message, 'acknowledge');
                        } catch (error) {
                            this.emit('error', `Send acknowledge error: ${error}`)
                        };
                        break;
                    case 'consoleStatus':
                        if (!packet.payloadProtected) {
                            return;
                        };

                        if (this.emitDevInfo) {
                            const majorVersion = packet.payloadProtected.majorVersion;
                            const minorVersion = packet.payloadProtected.minorVersion;
                            const buildNumber = packet.payloadProtected.buildNumber;
                            const locale = packet.payloadProtected.locale;
                            const firmwareRevision = `${majorVersion}.${minorVersion}.${buildNumber}`;

                            //save device info to the file
                            await this.saveDevInfo(this.tokensFile, firmwareRevision, locale)

                            this.emit('deviceInfo', firmwareRevision, locale);
                            this.emitDevInfo = false;
                        };

                        //Start prepare accessory
                        const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                        const awaitToPrepareAccesory = this.startPrepareAccessory ? await new Promise(resolve => setTimeout(resolve, 1000)) : false;
                        this.startPrepareAccessory = false;

                        const appsCount = Array.isArray(packet.payloadProtected.activeTitles) ? packet.payloadProtected.activeTitles.length : 0;
                        if (appsCount > 0) {
                            const power = true;
                            const volume = 0;
                            const mute = power ? power : true;
                            const mediaState = 2;
                            const titleId = appsCount === 2 ? packet.payloadProtected.activeTitles[0].titleId : packet.payloadProtected.activeTitles[0].titleId;
                            const reference = appsCount === 2 ? packet.payloadProtected.activeTitles[0].aumId : packet.payloadProtected.activeTitles[0].aumId;

                            this.emit('stateChanged', power, volume, mute, mediaState, titleId, reference);
                            const debug = this.debugLog ? this.emit('debug', `Status changed, app Id: ${titleId}, reference: ${reference}`) : false;

                            //emit restFul and mqtt
                            const obj = {
                                'power': power,
                                'titleId': titleId,
                                'app': reference,
                                'volume': volume,
                                'mute': mute,
                                'mediaState': mediaState,
                            };
                            this.emit('restFul', 'state', obj);
                            this.emit('mqtt', 'State', obj);
                        };

                        //acknowledge
                        try {
                            const acknowledge = packet.flags.needAck ? await this.acknowledge(packet.sequenceNumber) : false;
                        } catch (error) {
                            this.emit('error', `Acknowledge error: ${error}`)
                        };
                        break;
                    case 'mediaState':

                        break;
                    case 'mediaCommandResult':

                        break;
                    case 'channelStartResponse':
                        const requestIdMatch = this.channelRequestId === packet.payloadProtected.channelRequestId;
                        const channelState = requestIdMatch ? packet.payloadProtected.result === 0 : false;
                        const debug5 = this.debugLog ? this.emit('debug', `channelState: ${channelState}`) : false;
                        const channelCommunicationId = channelState && packet.payloadProtected.channelTargetId ? packet.payloadProtected.channelTargetId : -1;
                        const debug6 = this.debugLog ? this.emit('debug', `channelCommunicationId: ${packet.payloadProtected.channelTargetId}`) : false;
                        const channel = {
                            id: channelCommunicationId,
                            open: channelState
                        }
                        const pushChannel = channelCommunicationId !== -1 ? this.channels.push(channel) : false;
                        const debug3 = this.debugLog ? this.emit('debug', `Channel communication Id: ${channelCommunicationId}, state: ${channelState ? 'Open' : 'Closed'}.`) : false;
                        break;
                    case 'pairedIdentityStateChanged':
                        const pairingState1 = packet.payloadProtected.pairingState || 0;
                        const debug4 = this.debugLog ? this.emit('debug', `Client pairing state: ${CONSTANTS.LocalApi.Console.PairingState[pairingState1]}.`) : false;
                        break;
                };
            }).on('listening', async () => {
                //socket.setBroadcast(true);
                const address = socket.address();
                const debug = this.debugLog ? this.emit('debug', `Server start listening: ${address.address}:${address.port}.`) : false;
                this.socket = socket;

                //ping console
                setInterval(async () => {
                    if (this.isConnected) {
                        return;
                    }

                    const state = await Ping.promise.probe(this.host, { timeout: 3 });
                    const debug = this.debugLog ? this.emit('debug', `Ping console, state: ${state.alive ? 'Online' : 'Offline'}`) : false;

                    if (!state.alive || this.isConnected) {
                        return;
                    }

                    try {
                        const discoveryRequest = new SimplePacket('discoveryRequest');
                        const message = discoveryRequest.pack(this.crypto);
                        await this.sendSocketMessage(message, 'discoveryRequest');
                    } catch (error) {
                        this.emit('error', `Send discovery request error: ${error}`)
                    };
                }, 10000);

                //heart beat
                setInterval(async () => {
                    if (!this.isConnected) {
                        return;
                    }

                    const elapse = (Date.now() - this.heartBeatStartTime) / 1000;
                    const debug = this.debugLog && elapse >= 12 ? this.emit('debug', `Last message was: ${elapse} sec ago.`) : false;
                    const disconnect = elapse >= 12 ? await this.disconnect() : false;
                }, 1000);

                //Prepare accessory
                await new Promise(resolve => setTimeout(resolve, 5000));
                const prepareAccessory = this.startPrepareAccessory ? this.emit('prepareAccessory') : false;
                this.startPrepareAccessory = false;
            }).bind();
        };

        this.connect();
    };

    async reconnect() {
        await new Promise(resolve => setTimeout(resolve, 5000));
        this.connect();
    };

    readToken() {
        return new Promise(async (resolve, reject) => {
            try {
                const data = await fsPromises.readFile(this.tokensFile);
                const parseData = JSON.parse(data);
                const tokenData = parseData.xsts.Token ? parseData : false;
                resolve(tokenData);
            } catch (error) {
                reject(`Read token error: ${error}`);
            }
        });
    }

    saveDevInfo(path, firmwareRevision, locale) {
        return new Promise(async (resolve, reject) => {
            try {
                const obj = {
                    manufacturer: 'Microsoft',
                    modelName: 'Xbox',
                    serialNumber: this.xboxLiveId,
                    firmwareRevision: firmwareRevision,
                    locale: locale
                };
                const devInfo = JSON.stringify(obj, null, 2);
                await fsPromises.writeFile(path, devInfo);
                const debug = this.debugLog ? this.emit('debug', `Saved device info: ${devInfo}`) : false;

                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    acknowledge(sequenceNumber) {
        return new Promise(async (resolve, reject) => {
            try {
                const acknowledge = new MessagePacket('acknowledge');
                acknowledge.set('lowWatermark', sequenceNumber);
                acknowledge.packet.processedList.value.push({
                    id: sequenceNumber
                });
                const message = acknowledge.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                await this.sendSocketMessage(message, 'acknowledge');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    }

    channelOpen(channelRequestId, service) {
        return new Promise(async (resolve, reject) => {
            const debug = this.debugLog ? this.emit('debug', `Received channel Id: ${channelRequestId}, request open.`) : false;
            this.channelRequestId = channelRequestId;

            try {
                const channelStartRequest = new MessagePacket('channelStartRequest');
                channelStartRequest.set('channelRequestId', channelRequestId);
                channelStartRequest.set('titleId', 0);
                channelStartRequest.set('service', Buffer.from(service, 'hex'));
                channelStartRequest.set('activityId', 0);
                const message = channelStartRequest.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                await this.sendSocketMessage(message, 'channelStartRequest');
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    powerOn() {
        return new Promise(async (resolve, reject) => {
            if (this.isConnected) {
                reject('Console already On.');
                return;
            };

            const info = this.infoLog ? false : this.emit('message', 'Send power On.');
            try {
                for (let i = 0; i < 15; i++) {
                    if (this.isConnected) {
                        resolve();
                        return;
                    }
                    const powerOn = new SimplePacket('powerOn');
                    powerOn.set('liveId', this.xboxLiveId);
                    const message = powerOn.pack(this.crypto);
                    await this.sendSocketMessage(message, 'powerOn');

                    await new Promise(resolve => setTimeout(resolve, 1000));
                    resolve();
                }
                this.emit('disconnected', 'Power On failed, please try again.');
            } catch (error) {
                this.emit('disconnected', 'Power On error, please try again.');
                reject(error);
            };
        });
    };

    powerOff() {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected) {
                reject('Console already Off.');
                return;
            };

            const info = this.infoLog ? false : this.emit('message', 'Send power Off.');
            try {
                const powerOff = new MessagePacket('powerOff');
                powerOff.set('liveId', this.xboxLiveId);
                const message = powerOff.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                await this.sendSocketMessage(message, 'powerOff');

                await new Promise(resolve => setTimeout(resolve, 3500));
                await this.disconnect();
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    recordGameDvr() {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected || !this.isAuthorized) {
                reject(`Send record game ignored, connection state: ${this.isConnected}, authorization state: ${this.isAuthorized}`);
                return;
            };

            const info = this.infoLog ? false : this.emit('message', 'Send record game.');
            try {
                const recordGameDvr = new MessagePacket('recordGameDvr');
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                await this.sendSocketMessage(message, 'recordGameDvr');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    sendButtonPress(channelName, command) {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected) {
                reject(`Send command ignored, connection state: ${this.isConnected ? 'Not Connected' : 'Connected'}.`);
                return;
            };

            const channelRequestId = CONSTANTS.LocalApi.Channels.System[channelName].Id
            const channelCommunicationId = this.channels[requestId].id;
            const channelOpen = this.channels[requestId].open;

            if (channelCommunicationId === -1 || !channelOpen) {
                reject(`Channel Id: ${channelCommunicationId}, state: ${channelOpen ? 'Open' : 'Closed'}, trying to open it.`);
                return;
            };

            command = CONSTANTS.LocalApi.Channels.System[channelName][command];
            const debug = this.debugLog ? this.emit('debug', `Channel communication Id: ${channelCommunicationId}, name:  ${channelName} opened, send command; ${command}.`) : false;

            switch (channelRequestId) {
                case 0:
                    try {
                        const gamepad = new MessagePacket('gamepad');
                        gamepad.set('timestamp', Buffer.from(`000${new Date().getTime().toString()}`, 'hex'));
                        gamepad.set('buttons', command);
                        const message = gamepad.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId, channelCommunicationId);
                        await this.sendSocketMessage(message, 'gamepad');

                        setTimeout(async () => {
                            const gamepadUnpress = new MessagePacket('gamepad');
                            gamepadUnpress.set('timestamp', Buffer.from(`000${new Date().getTime().toString()}`, 'hex'));
                            gamepadUnpress.set('buttons', CONSTANTS.LocalApi.Channels.System.Input.Commands.unpress);
                            const message = gamepadUnpress.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId, channelCommunicationId);
                            await this.sendSocketMessage(message, 'gamepadUnpress');
                        }, 150)
                    } catch (error) {
                        this.emit('error', `Send system input command error: ${error}`)
                    };
                    break;
                case 1:
                    try {
                        const jsonRequest = JSON.stringify({
                            msgid: `2ed6c0fd.${this.getSequenceNumber()}`,
                            request: CONSTANTS.LocalApi.Channels.System.TvRemote.MessageType.SendKey,
                            params: {
                                button_id: command,
                                device_id: null
                            }
                        });
                        const json = new MessagePacket('json');
                        json.set('json', jsonRequest);
                        const message = json.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId, channelCommunicationId);
                        this.sendSocketMessage(message, 'json');
                    } catch (error) {
                        this.emit('error', `Send tv remote command error: ${error}`)
                    };
                    break;
                case 2:
                    try {
                        let requestId = '0000000000000000';
                        requestId = (`${requestId}${this.mediaRequestId}`).slice(-requestId.length);

                        const mediaCommand = new MessagePacket('mediaCommand');
                        mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                        mediaCommand.set('titleId', 0);
                        mediaCommand.set('command', command);
                        const message = mediaCommand.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId, channelCommunicationId);
                        this.sendSocketMessage(message, 'mediaCommand');
                        this.mediaRequestId++;
                    } catch (error) {
                        this.emit('error', `Send system media command error: ${error}`)
                    };
                    break;
            }
            resolve();
        });
    };

    disconnect() {
        return new Promise(async (resolve, reject) => {
            const debug = this.debugLog ? this.emit('debug', 'Disconnecting...') : false;

            try {
                const disconnect = new MessagePacket('disconnect');
                disconnect.set('reason', 2);
                disconnect.set('errorCode', 0);
                const message = disconnect.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                await this.sendSocketMessage(message, 'disconnect');

                this.isConnected = false;
                this.sequenceNumber = 0;
                this.sourceParticipantId = 0;
                this.channels = [];
                this.channelRequestId = 0;
                this.mediaRequestId = 0;
                this.emitDevInfo = true;
                await new Promise(resolve => setTimeout(resolve, 3000));
                this.emit('stateChanged', false, 0, true, 0, -1, -1);
                this.emit('disconnected', 'Disconnected.');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    getSequenceNumber() {
        this.sequenceNumber++;
        const debug = this.debugLog ? this.emit('debug', `Sqquence number set to: ${this.sequenceNumber}`) : false;
        return this.sequenceNumber;
    };

    sendSocketMessage(message, type) {
        return new Promise((resolve, reject) => {
            const offset = 0;
            const length = message.byteLength;

            this.socket.send(message, offset, length, 5050, this.host, (error, bytes) => {
                if (error) {
                    reject(error);
                    return;
                }

                const debug = this.debugLog ? this.emit('debug', `Socket send: ${type}, ${bytes}B.`) : false;
                resolve();
            });
        });
    };
};
module.exports = XBOXLOCALAPI;