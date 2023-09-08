"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const Dgram = require('dgram');
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
        this.port = config.dgramPort;
        this.xboxLiveId = config.xboxLiveId;
        this.infoLog = config.infoLog;
        this.tokensFile = config.tokensFile;
        this.debugLog = config.debugLog;

        this.isConnected = false;
        this.isAuthorized = false;

        this.sequenceNumber = 1;
        this.sourceParticipantId = 0;
        this.channelRequestId = 0;
        this.channelTargetId = 0;
        this.channelStateOpen = false;
        this.mediaRequestId = 1;
        this.emitDevInfo = true;
        this.command = '';

        //dgram socket
        this.connect = () => {
            this.client = new Dgram.createSocket('udp4');
            this.client.on('error', (error) => {
                this.emit('error', `Socket error: ${error}`);
                this.client.close();
            }).on('message', async (message, remote) => {
                const debug = this.debugLog ? this.emit('debug', `Received message from: ${remote.address}:${remote.port}`) : false;
                this.heartBeatStartTime = Date.now();

                //get message type in hex
                const messageTypeHex = message.slice(0, 2).toString('hex');
                const debug1 = this.debugLog ? this.emit('debug', `Received message type hex: ${messageTypeHex}`) : false;

                //check message type exist in types
                const keysTypes = Object.keys(CONSTANTS.MessageTypes);
                const keysTypesExist = keysTypes.includes(messageTypeHex);

                if (!keysTypesExist) {
                    const debug = this.debugLog ? this.emit('debug', `Received unknown message type: ${messageTypeHex}`) : false;
                    return;
                };

                //get message type and request
                const messageType = CONSTANTS.MessageTypes[messageTypeHex];
                const messageRequest = CONSTANTS.MessageRequests[messageTypeHex];
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
                let type = packet.type;
                const debug3 = this.debugLog ? this.emit('debug', `Received type: ${type}`) : false;
                const debug4 = this.debugLog ? this.emit('debug', `Received packet: ${JSON.stringify(packet, null, 2)}`) : false;

                if (messageType === 'message' && packet.targetParticipantId !== this.sourceParticipantId) {
                    const debug = this.debugLog ? this.emit('debug', `Participantid does not match. Ignoring packet.`) : false;
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
                                            this.emit('error', `Valid packet error: ${error}`);
                                            return false;
                                        }
                                    }
                                };
                            }

                            partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;
                            if (fragments[datagramId].isValid()) {
                                const debug = this.debugLog ? this.emit('debug', 'JSON completed fragmented packet.') : false;
                                packet.payloadProtected.json = fragments[datagramId].getValue();
                                delete fragments[datagramId];
                            }
                            const debug1 = this.debugLog ? this.emit('debug', `JSON fragment: ${packet}`) : false;
                        };
                        break;
                    case 'discoveryResponse':
                        try {
                            // Sign public key
                            const data = await this.crypto.getPublicKey(packet);
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

                                    const message = connectRequest.pack(this.crypto);
                                    await this.sendSocketMessage(message, 'connectRequest');

                                    this.isAuthorized = tokenExist;
                                    const debug = this.debugLog ? tokenExist ? this.emit('debug', `Connected using XSTS token.`) : this.emit('debug', 'Connecteed anonymous.') : false;
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

                        try {
                            this.sourceParticipantId = packet.payloadProtected.participantId;
                            const localJoin = new MessagePacket('localJoin');
                            const localJointMessage = localJoin.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                            await this.sendSocketMessage(localJointMessage, 'localJoin');

                            this.isConnected = true;
                            const debug1 = this.debugLog ? this.emit('debug', `Connect state: Connected.`) : false;
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
                            acknowledge.structure.processedList.value.push({
                                id: sequenceNumber
                            });
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
                            this.emit('connected', 'Connected.');
                            this.emit('deviceInfo', firmwareRevision, locale);
                            this.emitDevInfo = false;
                        };

                        const appsCount = Array.isArray(packet.payloadProtected.activeTitles) ? packet.payloadProtected.activeTitles.length : 0;
                        if (appsCount > 0) {
                            const power = true;
                            const volume = 0;
                            const mute = power ? power : true;
                            const mediaState = 0;
                            const titleId = appsCount === 2 ? packet.payloadProtected.activeTitles[1].titleId : packet.payloadProtected.activeTitles[0].titleId;
                            const reference = appsCount === 2 ? packet.payloadProtected.activeTitles[1].aumId : packet.payloadProtected.activeTitles[0].aumId;

                            this.emit('stateChanged', power, volume, mute, mediaState, titleId, reference);
                            const debug = this.debugLog ? this.emit('debug', `Status changed, app Id: ${titleId}, reference: ${reference}`) : false;
                        };

                        //acknowledge
                        const acknowledge = packet.flags.needAck ? this.emit('acknowledge', packet.sequenceNumber) : false;
                        break;
                    case 'channelStartResponse':
                        const debug = this.debugLog ? this.emit('debug', `Channel start response, request Id: ${packet.payloadProtected.channelRequestId}.`) : false;
                        this.channelRequestId = packet.payloadProtected.channelRequestId;
                        this.channelTargetId = packet.payloadProtected.channelTargetId;
                        this.channelStateOpen = packet.payloadProtected.result === 0;
                        break;
                };
            }).on('listening', () => {
                const address = this.client.address();
                const debug = this.debugLog ? this.emit('debug', `Server start listening: ${address.address}:${address.port}.`) : false;

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
                    const disconnect = elapse >= 12 ? this.disconnect() : false;
                }, 1000);
            }).on('close', () => {
                const debug = this.debugLog ? this.emit('debug', 'Socket closed.') : false;
                this.isConnected = false;
                this.reconnect();
            }).bind();
        };

        //EventEmmiter
        this.on('acknowledge', async (sequenceNumber) => {
            try {
                const acknowledge = new MessagePacket('acknowledge');
                acknowledge.set('lowWatermark', sequenceNumber);
                acknowledge.structure.processedList.value.push({
                    id: sequenceNumber
                });
                const message = acknowledge.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                await this.sendSocketMessage(message, 'acknowledge');
            } catch (error) {
                this.emit('error', `Send acknowledge error: ${error}`)
            };
        }).on('channelOpen', async (channelId, channelUuid) => {
            const debug = this.debugLog ? this.emit('debug', `Received channel open, Id: ${channelId}, UuId: ${channelUuid} received.`) : false;

            const channelState = this.channelStateOpen && channelId === this.channelRequestId;
            switch (channelState) {
                case true:
                    const debug = this.debugLog ? this.emit('debug', `Channel Id: ${channelId} open, send command; ${this.command}.`) : false;
                    switch (channelId) {
                        case 0:
                            try {
                                let requestId = '0000000000000000';
                                requestId = (`${requestId}${this.mediaRequestId}`).slice(-requestId.length);

                                const mediaCommand = new MessagePacket('mediaCommand');
                                mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                                mediaCommand.set('titleId', 0);
                                mediaCommand.set('command', CONSTANTS.SystemMediaCommands[this.command]);
                                mediaCommand.setChannel(this.channelTargetId);
                                const message = mediaCommand.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                                this.sendSocketMessage(message, 'mediaCommand');
                                this.mediaRequestId++;
                            } catch (error) {
                                this.emit('error', `Send system inpiut command error: ${error}`)
                            };
                            break;
                        case 1:
                            try {
                                const gamepad = new MessagePacket('gamepad');
                                gamepad.set('timestamp', Buffer.from(`000${new Date().getTime().toString()}`, 'hex'));
                                gamepad.set('buttons', CONSTANTS.SystemInputCommands[this.command]);
                                gamepad.setChannel(this.channelTargetId);
                                const message = gamepad.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId)
                                await this.sendSocketMessage(message, 'gamepad');

                                setTimeout(async () => {
                                    const gamepadUnpress = new MessagePacket('gamepad');
                                    gamepadUnpress.set('timestamp', Buffer.from(`000${new Date().getTime().toString()}`, 'hex'));
                                    gamepadUnpress.set('buttons', CONSTANTS.SystemInputCommands.unpress);
                                    gamepadUnpress.setChannel(this.channelTargetId);
                                    const message = gamepadUnpress.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                                    await this.sendSocketMessage(message, 'gamepadUnpress');
                                }, 150)
                            } catch (error) {
                                this.emit('error', `Send system inpiut command error: ${error}`)
                            };
                            break;
                        case 2:
                            try {
                                const jsonRequest = JSON.stringify({
                                    msgid: `2ed6c0fd.${this.getSequenceNumber()}`,
                                    request: 'SendKey',
                                    params: {
                                        button_id: CONSTANTS.TvRemoteCommands[this.command],
                                        device_id: null
                                    }
                                });
                                const json = new MessagePacket('json');
                                json.set('json', jsonRequest);
                                json.setChannel(this.channelTargetId);
                                const message = json.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                                this.sendSocketMessage(message, 'json');
                            } catch (error) {
                                this.emit('error', `Send tv remote command error: ${error}`)
                            };
                            break;
                    }
                    break;
                case false:
                    const debug1 = !this.debugLog ? this.emit('debug', `Channel Id: ${channelId} closed, trying to open.`) : false;
                    const channelStartRequest = new MessagePacket('channelStartRequest');
                    channelStartRequest.set('channelRequestId', channelId);
                    channelStartRequest.set('titleId', 0);
                    channelStartRequest.set('service', Buffer.from(channelUuid, 'hex'));
                    channelStartRequest.set('activityId', 0);
                    const message = channelStartRequest.pack(this.crypto, this.getSequenceNumber(), this.sourceParticipantId);
                    await this.sendSocketMessage(message, 'channelStartRequest');
                    break;
            };
        });

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

    sendButtonPress(channelId, command) {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected) {
                reject(`Send command ignored, connection state: ${this.isConnected}.`);
                return;
            };

            this.command = command;
            const channelUuid = CONSTANTS.Channels[channelId].ChannelsUuid;
            this.emit('channelOpen', channelId, channelUuid);
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
                this.sequenceNumber = 1;
                this.sourceParticipantId = 0;
                this.channelRequestId = 0;
                this.channelTargetId = 0;
                this.channelStateOpen = false;
                this.mediaRequestId = 1;
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
        const debug = this.debugLog ? this.emit('debug', `Sqquence number set to: ${this.sequenceNumber}`) : false;
        return this.sequenceNumber++;
    };

    sendSocketMessage(message, type) {
        return new Promise((resolve, reject) => {
            const offset = 0;
            const length = message.byteLength;

            this.client.send(message, offset, length, 5050, this.host, (error, bytes) => {
                if (error) {
                    reject(error);
                    return;
                }

                const debug = this.debugLog ? this.emit('debug', `Socket send type: ${type}, ${bytes} bytes.`) : false;
                resolve();
            });
        });
    };
};
module.exports = XBOXLOCALAPI;