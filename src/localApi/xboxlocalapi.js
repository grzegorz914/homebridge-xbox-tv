"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const Dgram = require('dgram');
const { parse: UuIdParse, v4: UuIdv4 } = require('uuid');
const EventEmitter = require('events');
const Ping = require('ping');
const Packer = require('./packer.js');
const SGCrypto = require('./sgcrypto.js');

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

        this.requestNum = 0;
        this.targetParticipantId = 0;
        this.sourceParticipantId = 0;
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

                message = new Packer(message);
                if (message.structure === false) {
                    return;
                };
                let eventMessage = message.unpack(this);
                let eventType = eventMessage.packetType;

                if (eventMessage.packetDecoded.type === 'd00d') {
                    if (eventMessage.packetDecoded.targetParticipantId !== this.targetParticipantId) {
                        const debug1 = this.debugLog ? this.emit('debug', 'Participant id does not match. Ignoring packet.') : false;
                        return;
                    };
                    eventType = message.structure.packetDecoded.type;
                }

                if (eventType === 'json') {
                    // Object to hold fragments 
                    const fragments = {};
                    const jsonMessage = JSON.parse(eventMessage.packetDecoded.protectedPayload.json);

                    // Check if JSON is fragmented
                    if (jsonMessage.datagramId) {
                        const debug1 = this.debugLog ? this.emit('debug', `Json message is fragmented: ${jsonMessage.datagramId}`) : false;

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
                            const debug2 = this.debugLog ? this.emit('debug', 'Json completed fragmented packet.') : false;
                            eventMessage.packetDecoded.protectedPayload.json = fragments[jsonMessage.datagramId].getValue();
                            delete fragments[jsonMessage.datagramId];
                        }
                        eventType = 'jsonFragment';
                        const debug = this.debugLog ? this.emit('debug', `Json fragment: ${eventMessage}`) : false;
                    };
                };

                this.heartBeatStartTime = Date.now();
                const sendHeartBeat = this.isConnected ? this.emit('heartBeat') : false;
                const debug2 = this.debugLog ? this.emit('debug', `Received event type: ${eventType}`) : false;
                this.emit(eventType, eventMessage);
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

                    const discoveryPacket = new Packer('simple.discoveryRequest');
                    const message = discoveryPacket.pack(this);
                    await this.sendSocketMessage(message);
                }, 10000);
            }).on('close', () => {
                const debug = this.debugLog ? this.emit('debug', 'Socket closed.') : false;
                this.isConnected = false;
                this.reconnect();
            }).bind();
        };

        //EventEmmiter
        this.on('discoveryResponse', async (message) => {
            const decodedMessage = message.packetDecoded;
            const debug = this.debugLog ? this.emit('debug', `Discovery response: ${JSON.stringify(decodedMessage)}.`) : false;

            if (decodedMessage && !this.isConnected) {
                try {
                    // Sign public key
                    const data = await this.crypto.getPublicKey(decodedMessage);
                    const debug2 = this.debugLog ? this.emit('debug', `Signed public key: ${data.publicKey}, iv: ${data.iv}`) : false;

                    // Connect request
                    const connectRequest = new Packer('simple.connectRequest');
                    connectRequest.set('uuid', Buffer.from(UuIdParse(UuIdv4())));
                    connectRequest.set('publicKey', data.publicKey);
                    connectRequest.set('iv', data.iv);

                    const tokenData = await this.readToken();
                    const tokenExist = tokenData !== false ? true : false;
                    if (tokenExist) {
                        connectRequest.set('userHash', tokenData.user.DisplayClaims.xui[0].uhs, true);
                        connectRequest.set('jwt', tokenData.user.Token, true);
                        this.isAuthorized = true;
                    }

                    const debug3 = this.debugLog ? this.isAuthorized ? this.emit('debug', `Connecting using JWT token.`) : this.emit('debug', 'Connecting using anonymous login.') : false;
                    const message = connectRequest.pack(this);
                    await this.sendSocketMessage(message);
                } catch (error) {
                    this.emit('error', `Send connect request error: ${error}`)
                };
            };
        }).on('connectResponse', async (message) => {
            const connectionResult = message.packetDecoded.protectedPayload.connectResult;
            const debug = this.debugLog ? this.emit('debug', `Connect response state: ${connectionResult === 0 ? 'Connected' : 'Not Connected'}.`) : false;

            if (connectionResult !== 0) {
                const errorTable = {
                    0: 'Success.',
                    1: 'Pending login. Reconnect to complete.',
                    2: 'Unknown error.',
                    3: 'No anonymous connections.',
                    4: 'Device limit exceeded.',
                    5: 'Remote connect is disabled on the console.',
                    6: 'User authentication failed.',
                    7: 'Sign-in failed.',
                    8: 'Sign-in timeout.',
                    9: 'Sign-in required.'
                };
                this.emit('error', `Connect error: ${errorTable[connectionResult]}`);
                return;
            };

            this.isConnected = true;
            try {
                const participantId = message.packetDecoded.protectedPayload.participantId;
                this.targetParticipantId = participantId;
                this.sourceParticipantId = participantId;

                const localJoin = new Packer('message.localJoin');
                const localJointMessage = localJoin.pack(this);
                await this.sendSocketMessage(localJointMessage);
            } catch (error) {
                this.emit('error', `Send local join error: ${error}`)
            };
        }).on('acknowledge', async () => {
            const debug = this.debugLog ? this.emit('debug', 'Packet send acknowledge.') : false;

            try {
                const acknowledge = new Packer('message.acknowledge');
                acknowledge.set('lowWatermark', this.requestNum);
                acknowledge.structure.structure.processedList.value.push({
                    id: this.requestNum
                });
                const message = acknowledge.pack(this);
                await this.sendSocketMessage(message);
            } catch (error) {
                this.emit('error', `Send acknowledge error: ${error}`)
            };
        }).on('status', (message) => {
            const decodedMessage = message.packetDecoded.protectedPayload;
            const debug = this.debugLog ? this.emit('debug', `Status message: ${JSON.stringify(decodedMessage, null, 2)}`) : false;
            if (!decodedMessage) {
                return;
            };

            if (this.emitDevInfo) {
                const majorVersion = decodedMessage.majorVersion;
                const minorVersion = decodedMessage.minorVersion;
                const buildNumber = decodedMessage.buildNumber;
                const locale = decodedMessage.locale;
                const firmwareRevision = `${majorVersion}.${minorVersion}.${buildNumber}`;
                this.emit('connected', 'Connected.');
                this.emit('deviceInfo', firmwareRevision, locale);
                this.emitDevInfo = false;
            };

            const appsCount = Array.isArray(decodedMessage.apps) ? decodedMessage.apps.length : 0;
            if (appsCount > 0) {
                const power = true;
                const volume = 0;
                const mute = power ? power : true;
                const mediaState = 0;
                const titleId = appsCount === 2 ? decodedMessage.apps[1].titleId : decodedMessage.apps[0].titleId;
                const reference = appsCount === 2 ? decodedMessage.apps[1].aumId : decodedMessage.apps[0].aumId;

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
                        const acknowledge = new Packer('message.acknowledge');
                        acknowledge.set('lowWatermark', this.requestNum);
                        const message = acknowledge.pack(this);
                        await this.sendSocketMessage(message);
                    } catch (error) {
                        this.emit('error', `Send acknowledge error: ${error}`)
                    };
                }

                const disconnect = elapse >= 12 ? this.disconnect() : false;
            }, 1000);
        }).on('disconnected', async () => {
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.isConnected = false;
            this.requestNum = 0;
            this.targetParticipantId = 0;
            this.sourceParticipantId = 0;
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
                const tokenData = parseData.user.Token ? parseData : false;
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
                    const powerOn = new Packer('simple.powerOn');
                    powerOn.set('liveId', this.xboxLiveId);
                    const message = powerOn.pack(this);
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
                const powerOff = new Packer('message.powerOff');
                powerOff.set('liveId', this.xboxLiveId);
                const message = powerOff.pack(this);
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
                const recordGameDvr = new Packer('message.recordGameDvr');
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this);
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
                const disconnect = new Packer('message.disconnect');
                disconnect.set('reason', 4);
                disconnect.set('errorCode', 0);
                const message = disconnect.pack(this);
                await this.sendSocketMessage(message);
                this.emit('disconnected', 'Disconnected.');
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };

    getRequestNum() {
        this.requestNum++;
        const debug = this.debugLog ? this.emit('debug', `Request number set to: ${this.requestNum}`) : false;
        return this.requestNum;
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
                    1802: 'Connect Request with JWT Token'
                }

                const debug = this.debugLog ? this.emit('debug', `Socket send ${sendMessage[bytes]}.`) : false;
                resolve();
            });
        });
    };
};
module.exports = XBOXLOCALAPI;