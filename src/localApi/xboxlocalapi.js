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
        this.heartBeatConnection = false;

        this.sequenceNumber = 0;
        this.targetParticipantId = 0;
        this.mediaRequestId = 0;
        this.emitDevInfo = true;

        //dgram socket
        this.connect = () => {
            this.client = new Dgram.createSocket('udp4');
            this.client.on('error', (error) => {
                this.emit('error', `Socket error: ${error}`);
                this.client.close();
            }).on('message', (message, remote) => {
                const debug = this.debugLog ? this.emit('debug', `Received message from: ${remote.address}:${remote.port}`) : false;

                const packetTypeHex = message.slice(0, 2).toString('hex');
                const debug1 = !this.debugLog ? this.emit('debug', `Received packet type hex: ${packetTypeHex}`) : false;

                const keysOfTypes = Object.keys(CONSTANTS.Types);
                const keyOfTypeExist = keysOfTypes.includes(packetTypeHex);
                const keyType = keyOfTypeExist ? CONSTANTS.Types[packetTypeHex] : message;
                message = keyOfTypeExist ? message : false;

                let packeStructuret;
                switch (keyType.slice(0, 6)) {
                    case 'simple':
                        packeStructuret = new SimplePacket(keyType, message);
                        break;
                    case 'messag':
                        packeStructuret = new MessagePacket(keyType, message);
                        break;
                };

                let packet = packeStructuret.unpack(this.crypto);
                let type = packet.type;

                if (type === 'json') {
                    // Object to hold fragments 
                    const fragments = {};
                    const jsonMessage = JSON.parse(packet.protectedPayload.json);

                    // Check if JSON is fragmented
                    if (jsonMessage.datagramId) {
                        const debug2 = this.debugLog ? this.emit('debug', `JSON message is fragmented: ${jsonMessage.datagramId}`) : false;

                        if (!fragments[jsonMessage.datagramId]) {
                            fragments[jsonMessage.datagramId] = {
                                partials: {},
                                getValue() {
                                    const buffer = Buffer.concat(Object.values(this.partials).map(partial => Buffer.from(partial)));
                                    return buffer.toString();
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

                        fragments[jsonMessage.datagramId].partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;
                        if (fragments[jsonMessage.datagramId].isValid()) {
                            const debug3 = this.debugLog ? this.emit('debug', 'JSON completed fragmented packet.') : false;
                            packet.protectedPayload.json = fragments[jsonMessage.datagramId].getValue();
                            delete fragments[jsonMessage.datagramId];
                        }
                        type = 'jsonFragment';
                        const debu4 = this.debugLog ? this.emit('debug', `JSON fragment: ${packet}`) : false;
                    };
                };

                this.heartBeatStartTime = Date.now();
                const sendHeartBeat = this.isConnected ? this.emit('heartBeat') : false;
                const debug5 = !this.debugLog ? this.emit('debug', `Received packet type: ${type}`) : false;
                const debug6 = !this.debugLog ? this.emit('debug', `Received packet: ${JSON.stringify(packet, null, 2)}`) : false;
                this.emit(type, packet);
            }).on('listening', () => {
                const address = this.client.address();
                const debug = this.debugLog ? this.emit('debug', `Server start listening: ${address.address}:${address.port}.`) : false;

                setInterval(async () => {
                    if (this.isConnected) {
                        return;
                    }

                    const state = await Ping.promise.probe(this.host, { timeout: 3 });
                    const debug = this.debugLog ? this.emit('debug', `Ping console, state: ${state.alive ? 'Online' : 'Offline'}`) : false;

                    if (!state.alive || this.isConnected) {
                        return;
                    }

                    const discoveryPacket = new SimplePacket('simple.discoveryRequest');
                    const message = discoveryPacket.pack(this.crypto);
                    await this.sendSocketMessage(message);
                }, 10000);
            }).on('close', () => {
                const debug = this.debugLog ? this.emit('debug', 'Socket closed.') : false;
                this.isConnected = false;
                this.reconnect();
            }).bind();
        };

        //EventEmmiter
        this.on('discoveryResponse', async (packet) => {
            const debug = this.debugLog ? this.emit('debug', `Discovery response: ${JSON.stringify(packet)}.`) : false;

            if (packet && !this.isConnected) {
                try {
                    // Sign public key
                    const data = await this.crypto.getPublicKey(packet);
                    const debug2 = this.debugLog ? this.emit('debug', `Signed public key: ${data.publicKey}, iv: ${data.iv}`) : false;

                    // Connect request
                    const connectRequest = new SimplePacket('simple.connectRequest');
                    connectRequest.set('uuid', Buffer.from(UuIdParse(UuIdv4())));
                    connectRequest.set('publicKey', data.publicKey);
                    connectRequest.set('iv', data.iv);

                    const tokenData = await this.readToken();
                    const tokenExist = tokenData !== false ? true : false;
                    if (tokenExist) {
                        connectRequest.set('userHash', tokenData.user.DisplayClaims.xui[0].uhs, true);
                        connectRequest.set('jwt', tokenData.xsts.Token, true);
                        this.isAuthorized = true;
                    }

                    const debug3 = this.debugLog ? this.isAuthorized ? this.emit('debug', `Connecting using XSTS token.`) : this.emit('debug', 'Connecting using anonymous login.') : false;
                    const message = connectRequest.pack(this.crypto);
                    await this.sendSocketMessage(message);
                } catch (error) {
                    this.emit('error', `Send connect request error: ${error}`)
                };
            };
        }).on('connectResponse', async (packet) => {
            const connectionResult = packet.protectedPayload.connectResult;
            this.targetParticipantId = packet.protectedPayload.participantId;
            const debug = this.debugLog ? this.emit('debug', `Connect response state: ${connectionResult === 0 ? 'Connected' : 'Not Connected'}.`) : false;

            if (connectionResult !== 0) {
                const errorTable = {
                    0: 'Success.',
                    1: 'Pending login. Reconnect to complete.',
                    2: 'Unknown.',
                    3: 'Anonymous connections disabled.',
                    4: 'Device limit exceeded.',
                    5: 'Remote connect is disabled on the console.',
                    6: 'User authentication failed.',
                    7: 'User Sign-in failed.',
                    8: 'User Sign-in timeout.',
                    9: 'User Sign-in required.'
                };
                this.emit('error', `Connect error: ${errorTable[connectionResult]}`);
                return;
            };

            this.isConnected = true;
            try {
                const localJoin = new MessagePacket('message.localJoin');
                const localJointMessage = localJoin.pack(this.crypto, this.getSequenceNumber(), this.targetParticipantId);
                await this.sendSocketMessage(localJointMessage);
            } catch (error) {
                this.emit('error', `Send local join error: ${error}`)
            };
        }).on('acknowledge', async () => {
            const debug = this.debugLog ? this.emit('debug', 'Acknowledge received.') : false;

            try {
                const acknowledge = new MessagePacket('message.acknowledge');
                acknowledge.set('lowWatermark', this.sequenceNumber);
                acknowledge.structure.processedList.value.push({
                    id: this.sequenceNumber
                });
                const message = acknowledge.pack(this.crypto, this.getSequenceNumber(), this.targetParticipantId);
                await this.sendSocketMessage(message);
            } catch (error) {
                this.emit('error', `Send acknowledge error: ${error}`)
            };
        }).on('consoleStatus', (packet) => {
            const debug = this.debugLog ? this.emit('debug', `Status received: ${JSON.stringify(packet.protectedPayload, null, 2)}`) : false;
            if (!packet.protectedPayload) {
                return;
            };

            if (this.emitDevInfo) {
                const majorVersion = packet.protectedPayload.majorVersion;
                const minorVersion = packet.protectedPayload.minorVersion;
                const buildNumber = packet.protectedPayload.buildNumber;
                const locale = packet.protectedPayload.locale;
                const firmwareRevision = `${majorVersion}.${minorVersion}.${buildNumber}`;
                this.emit('connected', 'Connected.');
                this.emit('deviceInfo', firmwareRevision, locale);
                this.emitDevInfo = false;
            };

            const appsCount = Array.isArray(packet.protectedPayload.apps) ? packet.protectedPayload.apps.length : 0;
            if (appsCount > 0) {
                const power = true;
                const volume = 0;
                const mute = power ? power : true;
                const mediaState = 0;
                const titleId = appsCount === 2 ? packet.protectedPayload.apps[1].titleId : packet.protectedPayload.apps[0].titleId;
                const reference = appsCount === 2 ? packet.protectedPayload.apps[1].aumId : packet.protectedPayload.apps[0].aumId;

                this.emit('stateChanged', power, volume, mute, mediaState, titleId, reference);
                const debug1 = this.debugLog ? this.emit('debug', `Status changed, app Id: ${titleId}, reference: ${reference}`) : false;
            };
        }).on('heartBeat', () => {
            if (this.heartBeatConnection) {
                return;
            }

            const debug = this.debugLog ? this.emit('debug', `Start heart beat.`) : false;
            this.heartBeatConnection = setInterval(async () => {
                const elapse = (Date.now() - this.heartBeatStartTime) / 1000;
                const debug = this.debugLog ? this.emit('debug', `Last heart beat was: ${elapse} sec ago.`) : false;
                if (elapse > 5 && elapse < 6) {
                    try {
                        const acknowledge = new MessagePacket('message.acknowledge');
                        acknowledge.set('lowWatermark', this.sequenceNumber);
                        const message = acknowledge.pack(this.crypto, this.getSequenceNumber(), this.targetParticipantId);
                        await this.sendSocketMessage(message);
                    } catch (error) {
                        this.emit('error', `Send acknowledge error: ${error}`)
                    };
                }

                const disconnect = elapse >= 12 ? this.disconnect() : false;
            }, 1000);
        }).on('disconnected', async () => {
            const debug = this.debugLog ? this.emit('debug', 'Disconnect received.') : false;
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.isConnected = false;
            this.sequenceNumber = 0;
            this.targetParticipantId = 0;
            this.mediaRequestId = 0;
            this.emitDevInfo = true;
            this.emit('stateChanged', false, 0, true, 0, -1, -1);
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
                    const powerOn = new SimplePacket('simple.powerOn');
                    powerOn.set('liveId', this.xboxLiveId);
                    const message = powerOn.pack(this.crypto);
                    await this.sendSocketMessage(message);

                    await new Promise(resolve => setTimeout(resolve, 600));
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
                const powerOff = new MessagePacket('message.powerOff');
                powerOff.set('liveId', this.xboxLiveId);
                const message = powerOff.pack(this.crypto, this.getSequenceNumber(), this.targetParticipantId);
                await this.sendSocketMessage(message);

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
                const recordGameDvr = new MessagePacket('message.recordGameDvr');
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this.crypto, this.getSequenceNumber(), this.targetParticipantId);
                await this.sendSocketMessage(message);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    disconnect() {
        return new Promise(async (resolve, reject) => {
            const debug = this.debugLog ? this.emit('debug', 'Disconnecting...') : false;
            clearInterval(this.heartBeatConnection);
            this.heartBeatConnection = false;

            try {
                const disconnect = new MessagePacket('message.disconnect');
                disconnect.set('reason', 4);
                disconnect.set('errorCode', 0);
                const message = disconnect.pack(this.crypto, this.getSequenceNumber(), this.targetParticipantId);
                await this.sendSocketMessage(message);
                this.emit('disconnected', 'Disconnected.');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    getSequenceNumber() {
        this.sequenceNumber++;
        const debug = this.debugLog ? this.emit('debug', `Request number set to: ${this.sequenceNumber}`) : false;
        return this.sequenceNumber;
    };

    sendSocketMessage(message) {
        return new Promise((resolve, reject) => {
            const offset = 0;
            const length = message.byteLength;

            this.client.send(message, offset, length, 5050, this.host, (error, bytes) => {
                if (error) {
                    reject(error);
                    return;
                }
                const sendMessage = {
                    16: 'Discovery',
                    25: 'Power On',
                    74: 'Acknowledge',
                    90: 'Power Off',
                    106: 'Local Join with JWT Token',
                    122: 'Local Join Anonymous',
                    170: 'Connect Request Anonymous',
                    1770: 'Connect Request with JWT Token',
                    1802: 'Connect Request with JWT Token'
                }

                const debug = this.debugLog ? this.emit('debug', `Socket send: ${bytes} bytes.`) : false;
                const debug1 = this.debugLog ? this.emit('debug', `Socket send: ${sendMessage[bytes]}.`) : false;
                resolve();
            });
        });
    };
};
module.exports = XBOXLOCALAPI;