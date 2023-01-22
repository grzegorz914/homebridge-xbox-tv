"use strict";
const Dgram = require('dgram');
const UuIdParse = require('uuid-parse');
const UuId = require('uuid');
const EOL = require('os').EOL;
const JsRsaSign = require('jsrsasign');
const EventEmitter = require('events');
const Packer = require('./packet/packer');
const SGCrypto = require('./sgcrypto');
const CONSTANS = require('./constans.json');
const Ping = require('ping');

class XBOXLOCALAPI extends EventEmitter {
    constructor(config) {
        super();

        this.host = config.host;
        this.port = config.dgramPort;
        this.xboxLiveId = config.xboxLiveId;
        this.userToken = config.userToken;
        this.userHash = config.uhs;
        this.infoLog = config.infoLog;
        this.debugLog = config.debugLog;

        this.crypto = new SGCrypto();
        this.isConnected = false;
        this.isAuthorized = false;
        this.heartBeatConnection = false;

        this.requestNum = 0;
        this.targetParticipantId = 0;
        this.sourceParticipantId = 0;
        this.mediaRequestId = 0;
        this.emitDevInfo = true;
        this.command = '';

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
                    const debug = this.debugLog ? this.emit('debug', `Ping console: ${state.alive ? 'Online' : 'Offline'}`) : false;

                    if (!state.alive) {
                        return;
                    }

                    const discoveryPacket = new Packer('simple.discoveryRequest');
                    const message = discoveryPacket.pack(this);
                    await this.sendSocketMessage(message);
                }, 5000);
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
            if (!decodedMessage || this.isConnected) {
                const debug = this.debugLog ? this.emit('debug', `Decoded message undefined or console already connected`) : false;
                return;
            };

            // Set certyficate
            const certyficate = (decodedMessage.certificate).toString('base64').match(/.{0,64}/g).join('\n');

            // Set pem
            const pem = `-----BEGIN CERTIFICATE-----${EOL}${certyficate}-----END CERTIFICATE-----`;

            // Set uuid
            const uuid4 = Buffer.from(UuIdParse.parse(UuId.v4()));

            // Create public key
            const ecKey = JsRsaSign.X509.getPublicKeyFromCertPEM(pem);
            const debug1 = this.debugLog ? this.emit('debug', `Signing public key: ${ecKey.pubKeyHex}`) : false;

            // Load crypto data
            const { publicKey, secret } = this.crypto.signPublicKey(ecKey.pubKeyHex);
            this.crypto.load(Buffer.from(publicKey, 'hex'), Buffer.from(secret, 'hex'));
            const debug2 = this.debugLog ? this.emit('debug', `Loading crypto, public key: ${publicKey}, and secret: ${secret}`) : false;

            const connectRequest = new Packer('simple.connectRequest');
            connectRequest.set('uuid', uuid4);
            connectRequest.set('publicKey', this.crypto.getPublicKey());
            connectRequest.set('iv', this.crypto.getIv());

            if (this.userHash && this.userToken) {
                connectRequest.set('userHash', this.userHash, true);
                connectRequest.set('jwt', this.userToken, true);
                this.isAuthorized = true;
            }
            const debug3 = this.debugLog ? this.isAuthorized ? this.emit('debug', `Connecting using token: ${this.userToken}`) : this.emit('debug', 'Connecting using anonymous login.') : false;

            try {
                const message = connectRequest.pack(this);
                await this.sendSocketMessage(message);
            } catch (error) {
                this.emit('error', `Send connect request error: ${error}`)
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

            const participantId = message.packetDecoded.protectedPayload.participantId;
            this.targetParticipantId = participantId;
            this.sourceParticipantId = participantId;
            this.isConnected = true;

            try {
                const localJoin = new Packer('message.localJoin');
                const message = localJoin.pack(this);
                await this.sendSocketMessage(message);
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
            const power = true;
            const volume = 0;
            const mute = power ? power : true;
            const mediaState = 0;
            const titleId = (appsCount === 1) ? decodedMessage.apps[0].titleId : (appsCount === 2) ? decodedMessage.apps[1].titleId : this.titleId;
            const inputReference = (appsCount === 1) ? decodedMessage.apps[0].aumId : (appsCount === 2) ? decodedMessage.apps[1].aumId : this.inputReference;

            if (appsCount === 0) {
                return;
            };

            this.emit('stateChanged', power, titleId, inputReference, volume, mute, mediaState);
            const debug1 = this.debugLog ? this.emit('debug', `Status changed, app Id: ${titleId}, reference: ${inputReference}`) : false;
        }).on('channelResponse', (message) => {
            if (message.packetDecoded.protectedPayload.result !== '0') {
                return;
            };

            const channelRequestId = message.packetDecoded.protectedPayload.channelRequestId;
            const channelTargetId = message.packetDecoded.protectedPayload.channelTargetId;
            const debug = this.debugLog ? this.emit('debug', `Channel response for name: ${CONSTANS.ChannelNames[channelRequestId]}, request id: ${channelRequestId}, target id: ${channelTargetId}`) : false;

            this.emit('sendCommand', channelRequestId, this.command);
        }).on('sendCommand', async (channelRequestId, command) => {
            const debug = this.debugLog ? this.emit('debug', `Channel send command for name: ${CONSTANS.ChannelNames[channelRequestId]}, request id: ${channelRequestId}, command: ${command}`) : false;

            switch (channelRequestId) {
                case 0:
                    if (!(command in CONSTANS.SystemMediaCommands)) {
                        const debug = this.debugLog ? this.emit('debug', `Unknown media input command: ${command}`) : false;
                        return;
                    }

                    try {
                        this.mediaRequestId++;
                        let requestId = '0000000000000000';
                        const requestIdLength = requestId.length;
                        requestId = (requestId + this.mediaRequestId).slice(-requestIdLength);

                        const mediaCommand = new Packer('message.mediaCommand');
                        mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                        mediaCommand.set('titleId', 0);
                        mediaCommand.set('command', CONSTANS.SystemMediaCommands[command]);
                        mediaCommand.setChannel('0');
                        const message = mediaCommand.pack(this);
                        const debug = this.debugLog ? this.emit('debug', `System media send command: ${command}`) : false;
                        await this.sendSocketMessage(message);
                    } catch (error) {
                        this.emit('error', `Send media command error: ${error}`)
                    };
                    break;
                case 1:
                    if (!(command in CONSTANS.SystemInputCommands)) {
                        const debug = this.debugLog ? this.emit('debug', `Unknown system input command: ${command}`) : false;
                        return;
                    };

                    try {
                        const timeStampPress = new Date().getTime().toString();
                        const gamepadPress = new Packer('message.gamepad');
                        gamepadPress.set('timestamp', Buffer.from(`000${timeStampPress}`, 'hex'));
                        gamepadPress.set('buttons', CONSTANS.SystemInputCommands[command]);
                        gamepadPress.setChannel('1');
                        const message = gamepadPress.pack(this);
                        const debug = this.debugLog ? this.emit('debug', `System input send press, command: ${command}`) : false;
                        const status = await this.sendSocketMessage(message);

                        if (status) {
                            try {
                                const timeStampUnpress = new Date().getTime().toString();
                                const gamepadUnpress = new Packer('message.gamepad');
                                gamepadUnpress.set('timestamp', Buffer.from(`000${timeStampUnpress}`, 'hex'));
                                gamepadUnpress.set('buttons', CONSTANS.SystemInputCommands['unpress']);
                                gamepadUnpress.setChannel('1');
                                const message = gamepadUnpress.pack(this);
                                const debug = this.debugLog ? this.emit('debug', `System input send unpress, command: unpress`) : false;
                                await this.sendSocketMessage(message);
                            } catch (error) {
                                this.emit('error', `Send system input command unpress error: ${error}`)
                            };
                        }
                    } catch (error) {
                        this.emit('error', `Send system input command press error: ${error}`)
                    };
                    break;
                case 2:
                    if (!(command in CONSTANS.TvRemoteCommands)) {
                        const debug = this.debugLog ? this.emit('debug', `Unknown tv remote command: ${command}`) : false;
                        return
                    };

                    try {
                        let messageNum = 0;
                        const jsonRequest = {
                            msgid: `2ed6c0fd.${messageNum++}`,
                            request: 'SendKey',
                            params: {
                                button_id: CONSTANS.TvRemoteCommands[command],
                                device_id: null
                            }
                        };
                        const json = new Packer('message.json');
                        json.set('json', JSON.stringify(jsonRequest));
                        json.setChannel('2');
                        const message = json.pack(this);
                        const debug = this.debugLog ? this.emit('debug', `TV remote send command: ${command}`) : false;
                        await this.sendSocketMessage(message);
                    } catch (error) {
                        this.emit('error', `Send tv remote command error: ${error}`)
                    };
                    break;
                case 3:
                    const configNames = CONSTANS.ConfigNames;
                    for (const configName of configNames) {
                        try {
                            const jsonRequest = {
                                msgid: `2ed6c0fd.${i}`,
                                request: configName,
                                params: null
                            };
                            const json = new Packer('message.json');
                            json.set('json', JSON.stringify(jsonRequest));
                            json.setChannel('3');
                            const message = json.pack(this);
                            const debug = this.debugLog ? this.emit('debug', `System config send: ${configName}`) : false;
                            await this.sendSocketMessage(message);
                        } catch (error) {
                            this.emit('error', `Send json error: ${error}`)
                        };
                    };
                    break;
            };
        }).on('heartBeat', () => {
            if (this.heartBeatConnection) {
                return;
            }

            const debug = this.debugLog ? this.emit('debug', `Start heart beat.`) : false;
            this.heartBeatConnection = setInterval(() => {
                const elapse = (Date.now() - this.heartBeatStartTime) / 1000;
                const debug = this.debugLog ? this.emit('debug', `Last heart beat was: ${elapse} sec ago.`) : false;
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
            this.emit('stateChanged', false, 0, 0, 0, true, 0);
        });

        this.connect();
    };

    async reconnect() {
        await new Promise(resolve => setTimeout(resolve, 5000));
        this.connect();
    };

    powerOn() {
        return new Promise(async (resolve, reject) => {
            if (this.isConnected) {
                this.emit('message', 'Console already On.');
                resolve(true);
                return;
            };

            const info = this.infoLog ? false : this.emit('message', 'Send power On.');
            try {
                for (let i = 0; i < 12; i++) {
                    if (this.isConnected) {
                        resolve(true);
                        return;
                    }
                    this.sendPowerOn();
                    await new Promise(resolve => setTimeout(resolve, 600));
                    resolve(true);
                }
                this.emit('disconnected', 'Power On failed, please try again.');
            } catch (error) {
                reject({
                    status: 'Send power On error.',
                    error: error
                });
            };
        }, 600);
    };

    async sendPowerOn() {
        try {
            const powerOn = new Packer('simple.powerOn');
            powerOn.set('liveId', this.xboxLiveId);
            const message = powerOn.pack(this);
            await this.sendSocketMessage(message);
        } catch (error) {
            this.emit('error', `Send power On error: ${error}`)
        };
    };

    powerOff() {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected) {
                reject({
                    status: 'Console already Off.'
                });
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
                resolve(true);
            } catch (error) {
                reject({
                    status: 'Send power Off error.',
                    error: error
                });
            };
        });
    };

    recordGameDvr() {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected || !this.isAuthorized) {
                reject({
                    status: `Send record game ignored, connection state: ${this.isConnected}, authorization state: ${this.isAuthorized}`
                });
                return;
            };

            const info = this.infoLog ? false : this.emit('message', 'Send record game.');
            try {
                const recordGameDvr = new Packer('message.recordGameDvr');
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this);
                await this.sendSocketMessage(message);
                resolve(true);
            } catch (error) {
                reject({
                    status: 'Send record game error.',
                    error: error
                });
            };
        });
    };

    sendCommand(channelName, command) {
        return new Promise(async (resolve, reject) => {
            if (!this.isConnected) {
                reject({
                    status: `Console not connected, send command: ${command} ignored.`
                });
                return;
            };

            const debug = this.debugLog ? this.emit('debug', 'Send command.') : false;
            this.command = command;
            try {
                const channelRequest = new Packer('message.channelRequest');
                channelRequest.set('channelRequestId', CONSTANS.ChannelIds[channelName]);
                channelRequest.set('titleId', 0);
                channelRequest.set('service', Buffer.from(CONSTANS.ChannelUuids[channelName], 'hex'));
                channelRequest.set('activityId', 0);
                const message = channelRequest.pack(this);
                const debug1 = this.debugLog ? this.emit('debug', `Send channel request name: ${channelName}, id: ${CONSTANS.ChannelIds[channelName]}`) : false;
                await this.sendSocketMessage(message);
                resolve(true);
            } catch (error) {
                reject({
                    status: `Send command: ${command} error.`,
                    error: error
                });
            }
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
                resolve(true);
            } catch (error) {
                reject({
                    status: `Send disconnect error.`,
                    error: error
                });
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
                    122: 'Local Join',
                    170: 'Connect Request'
                }
                const debug = this.debugLog ? this.emit('debug', `Socket send ${sendMessage[bytes]}.`) : false;
                this.bytes = bytes;
                resolve(true);
            });
        });
    };
};
module.exports = XBOXLOCALAPI;