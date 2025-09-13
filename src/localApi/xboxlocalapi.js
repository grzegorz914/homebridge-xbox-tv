import { promises as fsPromises } from 'fs';
import Dgram from 'dgram';
import Net from 'net';
import { parse as UuIdParse, v4 as UuIdv4 } from 'uuid';
import EventEmitter from 'events';
import Ping from 'ping';
import SimplePacket from './simple.js';
import MessagePacket from './message.js';
import SGCrypto from './sgcrypto.js';
import { LocalApi } from '../constants.js';
import ImpulseGenerator from '../impulsegenerator.js';
import Functions from '../functions.js';

class XboxLocalApi extends EventEmitter {
    constructor(config) {
        super();

        this.crypto = new SGCrypto();
        this.udpType = Net.isIPv6(config.host) ? 'udp6' : 'udp4';
        this.host = config.host;
        this.xboxLiveId = config.xboxLiveId;
        this.tokensFile = config.tokensFile;
        this.devInfoFile = config.devInfoFile;
        this.disableLogInfo = config.disableLogInfo;
        this.enableDebugMode = config.enableDebugMode;

        this.consoleConnected = false;
        this.power = false;
        this.volume = 0;
        this.mute = false;
        this.titleId = '';
        this.reference = '';

        this.isAuthorized = false;
        this.firstRun = false;
        this.fragments = {};
        this.socket = null;
        this.interval = null;
        this.sequenceNumber = 0;
        this.sourceParticipantId = 0;
        this.functions = new Functions();

        //create impulse generator
        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', async () => {
                try {
                    if (this.consoleConnected) return;
                    if (this.enableDebugMode) this.emit('debug', `Plugin send heart beat to console`);

                    const state = await Ping.promise.probe(this.host, { timeout: 3 });
                    if (!state.alive) return;

                    if (this.enableDebugMode) this.emit('debug', `Plugin received heart beat from console`);
                    await this.connect(true);
                } catch (error) {
                    this.emit('error', `Local API heart beat error: ${error}, will retry`);
                }
            })
            .on('state', (state) => {
                this.emit('success', `Local Api monitoring ${state ? 'started' : 'stopped'}`);
            });
    };

    async updateState(connect = false) {
        this.consoleConnected = false;
        this.socket = null;
        this.interval = null;
        this.sequenceNumber = 0;
        this.sourceParticipantId = 0;

        if (connect) return true;
        this.power = false;
        this.emit('stateChanged', this.power, this.titleId, this.reference, this.volume, this.mute);
        return true;
    };

    async getSequenceNumber() {
        const seq = this.sequenceNumber;
        this.sequenceNumber = (this.sequenceNumber + 1) >>> 0;
        if (this.enableDebugMode) this.emit('debug', `Sqquence number set to: ${this.sequenceNumber}`);
        return seq;
    };

    async recordGameDvr() {
        if (!this.consoleConnected || !this.isAuthorized) {
            this.emit('warn', `Send record game ignored, connection state: ${this.consoleConnected}, authorization state: ${this.isAuthorized}`);
            return;
        };

        if (this.enableDebugMode) this.emit('debug', 'Send record game.');
        try {
            const sequenceNumber = await this.getSequenceNumber();
            const recordGameDvr = new MessagePacket('recordGameDvr');
            recordGameDvr.set('startTimeDelta', -60);
            recordGameDvr.set('endTimeDelta', 0);
            const message = recordGameDvr.pack(this.crypto, sequenceNumber, this.sourceParticipantId);
            await this.sendSocketMessage(message, 'recordGameDvr');
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };

    async heartBeat(sequenceNumber) {
        try {
            const heartBeat = new MessagePacket('heartBeat');
            heartBeat.set('lowWatermark', sequenceNumber);
            heartBeat.packet.processedList.value.push({ id: sequenceNumber });
            const sequenceNumber1 = await this.getSequenceNumber();
            const message = heartBeat.pack(this.crypto, sequenceNumber1, this.sourceParticipantId);
            await this.sendSocketMessage(message, 'heartBeat');
            return true;
        } catch (error) {
            this.emit('error', `Heartbeat error: ${error}`);
            return false;
        }
    }

    async sendSocketMessage(message, type) {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                return reject(new Error(`Socket not initialized, cannot send message: ${type}`));
            }

            const offset = 0;
            const length = message.byteLength;

            this.socket.send(message, offset, length, 5050, this.host, (error, bytes) => {
                if (error) {
                    return reject(new Error(`Socket send error: ${error}`));
                }

                if (this.enableDebugMode) this.emit('debug', `Socket send: ${type}, ${bytes}B`);
                resolve(true);
            });
        });
    };

    async connect(discovery = false) {
        try {
            await this.updateState(true);

            this.socket = Dgram.createSocket(this.udpType);

            await new Promise((resolve, reject) => {
                this.socket
                    .on('error', (error) => {
                        this.emit('error', `Socket error: ${error}`);
                        reject(error);
                    })
                    .on('close', async () => {
                        if (this.enableDebugMode) this.emit('debug', 'Socket closed.');
                        await this.updateState();
                    })
                    .on('listening', async () => {
                        const address = this.socket.address();
                        if (this.enableDebugMode) this.emit('debug', `Socket start listening: ${address.address}:${address.port}`);
                        this.firstRun = true;

                        if (discovery) {
                            const discoveryRequest = new SimplePacket('discoveryRequest');
                            const message = discoveryRequest.pack(this.crypto);
                            await this.sendSocketMessage(message, 'discoveryRequest');
                        }

                        resolve(true);
                    })
                    .on('message', this._handleMessage.bind(this))
                    .bind();
            });

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error.message || error}`);
        };
    };

    async _handleMessage(message, remote) {
        try {
            if (this.enableDebugMode) {
                this.emit('debug', `Received message from: ${remote.address}:${remote.port}`);
            }

            // get message type in hex
            const messageTypeHex = message.slice(0, 2).toString('hex');
            if (this.enableDebugMode) {
                this.emit('debug', `Received message type hex: ${messageTypeHex}`);
            }

            // check message type exists
            if (!Object.keys(LocalApi.Messages.Types).includes(messageTypeHex)) {
                if (this.enableDebugMode) {
                    this.emit('debug', `Received unknown message type: ${messageTypeHex}`);
                }
                return;
            }

            // get message type and request
            const messageType = LocalApi.Messages.Types[messageTypeHex];
            const messageRequest = LocalApi.Messages.Requests[messageTypeHex];

            // create packet structure
            let packetStructure;
            switch (messageType) {
                case 'simple':
                    packetStructure = new SimplePacket(messageRequest);
                    break;
                case 'message':
                    packetStructure = new MessagePacket(messageRequest);
                    break;
                default:
                    if (this.enableDebugMode) {
                        this.emit('debug', `No handler for type: ${messageType}`);
                    }
                    return;
            }

            // unpack packet
            let packet;
            try {
                packet = packetStructure.unpack(this.crypto, message);
                if (this.enableDebugMode) {
                    this.emit('debug', `Received packet type: ${packet.type}, packet: ${JSON.stringify(packet, null, 2)}`);
                }
            } catch (error) {
                if (this.enableDebugMode) {
                    this.emit('debug', `Failed to unpack packet type: ${messageType}, request: ${messageRequest}, error: ${error.message}`);
                }
                return;
            }

            // validate packet fragments
            if (packet.type === 'json') {
                const fragments = this.fragments;
                let jsonMessage;

                try {
                    jsonMessage = JSON.parse(packet.payloadProtected.json);
                } catch (error) {
                    if (this.enableDebugMode) {
                        this.emit('debug', `Failed to parse JSON payload: ${error.message}`);
                    }
                    return;
                }

                const datagramId = jsonMessage.datagramId;
                if (datagramId) {
                    if (!fragments[datagramId]) {
                        fragments[datagramId] = {
                            partials: {},
                            getValue() {
                                const buffers = Object.keys(this.partials)
                                    .sort((a, b) => Number(a) - Number(b))
                                    .map(offset => Buffer.from(this.partials[offset], 'base64'));
                                return Buffer.concat(buffers);
                            },
                            isValid() {
                                try {
                                    JSON.parse(this.getValue().toString());
                                    return true;
                                } catch {
                                    return false;
                                }
                            }
                        };
                    }

                    fragments[datagramId].partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;

                    if (fragments[datagramId].isValid()) {
                        const fullJson = fragments[datagramId].getValue().toString();
                        packet.payloadProtected = JSON.parse(fullJson);

                        if (this.enableDebugMode) {
                            this.emit('debug', `Reassembled JSON packet: ${fullJson}`);
                        }
                        delete fragments[datagramId];
                    }
                }
            }

            if (messageType === 'message') {
                const targetId = Number(packet.targetParticipantId) || 0;

                if (!this.sourceParticipantId) {
                    if (targetId > 0) {
                        this.sourceParticipantId = targetId;
                        if (this.enableDebugMode) {
                            this.emit('debug', `Discovered Xbox ParticipantId: ${this.sourceParticipantId}`);
                        }
                    } else {
                        if (this.enableDebugMode) {
                            this.emit('debug', `Received message with invalid participantId (${targetId}), sourceParticipantId not set yet. Ignoring packet`);
                        }
                        return;
                    }
                }

                if (targetId !== this.sourceParticipantId) {
                    if (this.enableDebugMode) {
                        this.emit('debug', `ParticipantId mismatch: ${targetId} !== ${this.sourceParticipantId}. Ignoring packet`);
                    }
                    return;
                }

                if (this.consoleConnected && packet.flags.needHeartBeat) {
                    await this.heartBeat(packet.sequenceNumber);
                }
            }

            // handle packet types (oryginalna logika)
            switch (packet.type) {
                case 'heartBeat':
                    this.heartBeatStartTime = Date.now();

                    if (!this.interval) {
                        this.interval = setInterval(async () => {
                            const elapsed = (Date.now() - this.heartBeatStartTime) / 1000;
                            if (this.enableDebugMode) {
                                this.emit('debug', `Socket received heart beat: ${elapsed.toFixed(1)} sec ago`);
                            }

                            if (elapsed >= 14) {
                                clearInterval(this.interval);

                                const sequenceNumber = await this.getSequenceNumber();
                                const disconnect = new MessagePacket('disconnect');
                                disconnect.set('reason', 2);
                                disconnect.set('errorCode', 0);
                                const message = disconnect.pack(this.crypto, sequenceNumber, this.sourceParticipantId);
                                await this.sendSocketMessage(message, 'disconnect');
                                await this.updateState();
                            }
                        }, 1000);
                    }
                    break;
                case 'discoveryResponse':
                    // oryginalna logika discoveryResponse (bez zmian)
                    const deviceType = packet.clientType;
                    const deviceName = packet.name;
                    const certificate = packet.certificate;

                    if (this.enableDebugMode) {
                        this.emit('debug', `Discovered device: ${LocalApi.Console.Name[deviceType] || 'Unknown'}, name: ${deviceName}`);
                    }

                    if (!certificate) {
                        this.emit('error', 'Certificate missing from device packet');
                        return;
                    }

                    try {
                        const data = await this.crypto.getPublicKey(certificate);
                        if (this.enableDebugMode) {
                            this.emit('debug', `Signed public key: ${data.publicKey.toString('hex')}, iv: ${data.iv.toString('hex')}`);
                        }

                        const connectRequest = new SimplePacket('connectRequest');
                        const uuidBuffer = Buffer.from(UuIdParse(UuIdv4()));
                        if (uuidBuffer.length !== 16) {
                            this.emit('error', 'Invalid UUID length');
                            return;
                        }

                        connectRequest.set('uuid', uuidBuffer);
                        connectRequest.set('publicKey', data.publicKey);
                        connectRequest.set('iv', data.iv);

                        try {
                            const response = await this.functions.readData(this.tokensFile);
                            const parsed = JSON.parse(response);
                            const token = parsed?.xsts?.Token || null;
                            const userHash = parsed.xsts.DisplayClaims?.xui?.[0]?.uhs;

                            if (token && userHash) {
                                connectRequest.set('userHash', userHash, true);
                                connectRequest.set('jwt', token, true);
                                this.isAuthorized = true;
                            }
                        } catch (error) {
                            this.emit('debug', 'No valid token data found, connecting anonymously');
                        }

                        if (this.enableDebugMode) {
                            this.emit('debug', `Client connecting using: ${this.isAuthorized ? 'XSTS token' : 'Anonymous'}`);
                        }

                        const message = connectRequest.pack(this.crypto);
                        await this.sendSocketMessage(message, this.isAuthorized ? 'connectRequestProtected' : 'connectRequest');
                    } catch (error) {
                        this.emit('error', `Sign certificate error: ${error}`);
                    }
                    break;
                case 'connectResponse':
                    // oryginalna logika connectResponse (bez zmian)
                    if (this.consoleConnected) return;

                    const { connectResult, pairingState, participantId } = packet.payloadProtected;
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

                    if (connectResult !== 0) {
                        this.emit('error', `Connect error: ${errorTable[connectResult] || connectResult}`);
                        return;
                    }

                    this.sourceParticipantId = participantId;

                    if (this.enableDebugMode) {
                        this.emit('debug', `Client connected, pairing state: ${LocalApi.Console.PairingState[pairingState]}`);
                    }

                    try {
                        const sequenceNumber = await this.getSequenceNumber();
                        const localJoin = new MessagePacket('localJoin');
                        const message = localJoin.pack(this.crypto, sequenceNumber, participantId);
                        await this.sendSocketMessage(message, 'localJoin');
                    } catch (error) {
                        this.emit('error', `Send local join error: ${error}`);
                    }
                    break;
                case 'pairedIdentityStateChanged':
                    const pairingState1 = packet.payloadProtected.pairingState || 0;
                    if (this.enableDebugMode) {
                        this.emit('debug', `Client pairing state: ${LocalApi.Console.PairingState[pairingState1]}`);
                    }
                    break;
                case 'consoleStatus':
                    if (!packet.payloadProtected) return;

                    if (this.firstRun) {
                        this.emit('success', `Connect Success`);

                        const { majorVersion, minorVersion, buildNumber, locale } = packet.payloadProtected;
                        const firmwareRevision = `${majorVersion}.${minorVersion}.${buildNumber}`;

                        const info = { locale, firmwareRevision };
                        this.emit('deviceInfo', info);
                        this.consoleConnected = true;
                        this.power = true;
                        this.firstRun = false;
                    }

                    const activeTitles = Array.isArray(packet.payloadProtected.activeTitles) ? packet.payloadProtected.activeTitles : [];
                    if (activeTitles.length > 0) {
                        const title = activeTitles[0];
                        this.titleId = title.titleId;
                        this.reference = title.aumId;

                        this.emit('stateChanged', this.power, this.titleId, this.reference, this.volume, this.mute);
                        if (this.enableDebugMode) {
                            this.emit('debug', `Status changed, app Id: ${this.titleId}, reference: ${this.reference}`);
                        }

                        const state = { power: this.power, titleId: this.titleId, reference: this.reference, volume: this.volume, mute: this.mute };
                        this.emit('restFul', 'state', state);
                        this.emit('mqtt', 'State', state);
                    }
                    break;
            }
        } catch (error) {
            this.emit('error', `Handle message error: ${error.message || error}`);
        }
    }

};
export default XboxLocalApi;