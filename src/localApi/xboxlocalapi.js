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

        this.isConnected = false;
        this.isAuthorized = false;
        this.sequenceNumber = 0;
        this.sourceParticipantId = 0;
        this.channels = [];
        this.channelRequestId = 0;
        this.mediaRequestId = 0;
        this.fragments = {};
        this.firstRun = false;
        this.socket = false;

        //create impulse generator
        this.impulseGenerator = new ImpulseGenerator()
            .on('heartBeat', async () => {
                try {
                    // Heartbeat when not connected
                    if (!this.isConnected) {
                        if (this.enableDebugMode) this.emit('debug', `Plugin send heartbeat to console`);

                        const state = await Ping.promise.probe(this.host, { timeout: 3 });

                        // If console is not alive or became connected meanwhile, exit
                        if (!state.alive) return;
                        if (this.enableDebugMode) this.emit('debug', `Plugin received heartbeat from console`);

                        if (!this.socket) await this.connect();

                        const discoveryRequest = new SimplePacket('discoveryRequest');
                        const message = discoveryRequest.pack(this.crypto);
                        await this.sendSocketMessage(message, 'discoveryRequest');
                        return;
                    }

                    // Heartbeat when already connected
                    if (this.isConnected) {
                        if (this.enableDebugMode) this.emit('debug', `Socket send heartbeat`);

                        const elapsed = (Date.now() - this.heartBeatStartTime) / 1000;

                        if (this.enableDebugMode && elapsed >= 12) {
                            this.emit('debug', `Last message was: ${elapsed.toFixed(2)} sec ago`);
                        }

                        // Disconnect if last message was too long ago
                        if (elapsed >= 12) await this.disconnect();
                    }
                } catch (error) {
                    this.emit('error', `Local API heartbeat error: ${error}, will retry`);
                }
            })
            .on('state', (state) => {
                this.emit('success', `Local Api monitoring ${state ? 'started' : 'stopped'}`);
            });
    };

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error.message || error}`);
        }
    }

    async saveData(path, data) {
        try {
            data = JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data);
            if (this.enableDebugMode) this.emit('debug', `Saved data: ${data}`);
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message || error}`);
        };
    };

    async acknowledge(sequenceNumber) {
        try {
            const acknowledge = new MessagePacket('acknowledge');
            acknowledge.set('lowWatermark', sequenceNumber);
            acknowledge.packet.processedList.value.push({
                id: sequenceNumber
            });
            const sequenceNumber1 = await this.getSequenceNumber();
            const message = acknowledge.pack(this.crypto, sequenceNumber1, this.sourceParticipantId);
            await this.sendSocketMessage(message, 'acknowledge');
            return true;
        } catch (error) {
            throw new Error(error);
        };
    }

    async recordGameDvr() {
        if (!this.isConnected || !this.isAuthorized) {
            this.emit('warn', `Send record game ignored, connection state: ${this.isConnected}, authorization state: ${this.isAuthorized}`);
            return;
        };

        const info = this.disableLogInfo ? false : this.emit('info', 'Send record game.');
        try {
            const recordGameDvr = new MessagePacket('recordGameDvr');
            recordGameDvr.set('startTimeDelta', -60);
            recordGameDvr.set('endTimeDelta', 0);
            const sequenceNumber = await this.getSequenceNumber();
            const message = recordGameDvr.pack(this.crypto, sequenceNumber, this.sourceParticipantId);
            await this.sendSocketMessage(message, 'recordGameDvr');
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };

    async disconnect() {
        if (this.enableDebugMode) this.emit('debug', 'Disconnecting...');

        try {
            const disconnect = new MessagePacket('disconnect');
            disconnect.set('reason', 2);
            disconnect.set('errorCode', 0);
            const sequenceNumber = await this.getSequenceNumber();
            const message = disconnect.pack(this.crypto, sequenceNumber, this.sourceParticipantId);
            await this.sendSocketMessage(message, 'disconnect');

            this.isConnected = false;
            this.sequenceNumber = 0;
            this.sourceParticipantId = 0;
            this.channels = [];
            this.channelRequestId = 0;
            this.mediaRequestId = 0;
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.emit('stateChanged', false, 0, true, 0, -1, -1);
            this.emit('info', 'Disconnected.');
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };

    async getSequenceNumber() {
        this.sequenceNumber++;
        if (this.enableDebugMode) this.emit('debug', `Sqquence number set to: ${this.sequenceNumber}`);
        return this.sequenceNumber;
    };

    async sendSocketMessage(message, type) {
        return new Promise((resolve, reject) => {
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

    //connect
    async connect() {
        try {
            const socket = Dgram.createSocket(this.udpType)
                .on('error', (error) => {
                    this.emit('error', `Socket error: ${error}`);
                    socket.close();
                }).on('close', async () => {
                    if (this.enableDebugMode) this.emit('debug', 'Socket closed.');
                    this.isConnected = false;
                    this.socket = false;
                }).on('message', async (message, remote) => {
                    if (this.enableDebugMode) this.emit('debug', `Received message from: ${remote.address}:${remote.port}`);
                    this.heartBeatStartTime = Date.now();

                    // get message type in hex
                    const messageTypeHex = message.slice(0, 2).toString('hex');
                    if (this.enableDebugMode) this.emit('debug', `Received message type hex: ${messageTypeHex}`);

                    // check message type exists
                    if (!Object.keys(LocalApi.Messages.Types).includes(messageTypeHex)) {
                        if (this.enableDebugMode) this.emit('debug', `Received unknown message type: ${messageTypeHex}`);
                        return;
                    }

                    // get message type and request
                    const messageType = LocalApi.Messages.Types[messageTypeHex];
                    const messageRequest = LocalApi.Messages.Requests[messageTypeHex];
                    if (this.enableDebugMode) this.emit('debug', `Received message type: ${messageType}, request: ${messageRequest}`);

                    // create packet structure
                    let packeStructure;
                    switch (messageType) {
                        case 'simple':
                            packeStructure = new SimplePacket(messageRequest);
                            break;
                        case 'message':
                            packeStructure = new MessagePacket(messageRequest);
                            break;
                    }

                    let packet = packeStructure.unpack(this.crypto, message);
                    if (this.enableDebugMode) this.emit('debug', `Received type: ${packet.type}`);
                    if (this.enableDebugMode) this.emit('debug', `Received packet: ${JSON.stringify(packet, null, 2)}`);

                    if (messageType === 'message') {
                        // Jeśli jeszcze nie mamy participantId, to przyjmujemy ten z konsoli
                        if (!this.sourceParticipantId && packet.targetParticipantId !== 0) {
                            this.sourceParticipantId = packet.targetParticipantId;
                            if (this.enableDebugMode) {
                                this.emit('debug', `Discovered Xbox ParticipantId: ${this.sourceParticipantId}`);
                            }
                        }

                        // Jeśli nadal się nie zgadza, to ignorujemy
                        if (packet.targetParticipantId !== this.sourceParticipantId) {
                            if (this.enableDebugMode) {
                                this.emit('debug', `Participant Id mismatch: ${packet.targetParticipantId} !== ${this.sourceParticipantId}. Ignoring packet`);
                            }
                            return;
                        }
                    }

                    switch (packet.type) {
                        case 'json':
                            const fragments = this.fragments;
                            let jsonMessage;

                            try {
                                jsonMessage = JSON.parse(packet.payloadProtected.json);
                            } catch (error) {
                                if (this.enableDebugMode) this.emit('debug', `Failed to parse JSON payload: ${error.message}`);
                                break;
                            }

                            const datagramId = jsonMessage.datagramId;

                            if (datagramId) {
                                if (this.enableDebugMode) this.emit('debug', `JSON message datagram Id: ${datagramId}`);

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
                                            } catch (error) {
                                                if (this.enableDebugMode) this.emit('debug', `Invalid JSON fragments: ${error.message}`);
                                                return false;
                                            }
                                        }
                                    };
                                }

                                fragments[datagramId].partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;

                                if (fragments[datagramId].isValid()) {
                                    packet.payloadProtected.json = fragments[datagramId].getValue().toString();
                                    if (this.enableDebugMode) this.emit('debug', `Reassembled JSON: ${packet.payloadProtected.json}`);
                                    delete fragments[datagramId];
                                }
                            }
                            break;
                        case 'discoveryResponse':
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
                                // Sign public key
                                const data = await this.crypto.getPublicKey(certificate);
                                if (this.enableDebugMode) this.emit('debug', `Signed public key: ${data.publicKey.toString('hex')}, iv: ${data.iv.toString('hex')}`);

                                // Connect request
                                if (!this.isConnected) {
                                    try {
                                        const connectRequest = new SimplePacket('connectRequest');

                                        // UUID -> Buffer
                                        const uuidBuffer = Buffer.from(UuIdParse(UuIdv4()));
                                        if (uuidBuffer.length !== 16) {
                                            this.emit('error', 'Invalid UUID length');
                                            return;
                                        }

                                        connectRequest.set('uuid', uuidBuffer);
                                        connectRequest.set('publicKey', data.publicKey);
                                        connectRequest.set('iv', data.iv);

                                        // Read tokens file safely
                                        let tokenData = null;
                                        try {
                                            const response = await this.readData(this.tokensFile);
                                            const parsed = JSON.parse(response);
                                            tokenData = parsed?.xsts?.Token?.trim() || null;

                                            if (tokenData) {
                                                const userHash = parsed.xsts.DisplayClaims?.xui?.[0]?.uhs || '';
                                                connectRequest.set('userHash', userHash, true);
                                                connectRequest.set('jwt', tokenData, true);
                                                this.isAuthorized = true;
                                            }
                                        } catch (jsonError) {
                                            this.emit('debug', 'No valid token data found, connecting anonymously');
                                        }

                                        if (this.enableDebugMode) this.emit('debug', `Client connecting using: ${this.isAuthorized ? 'XSTS token' : 'Anonymous'}`);

                                        const message = connectRequest.pack(this.crypto);
                                        await this.sendSocketMessage(message, 'connectRequest');
                                    } catch (sendError) {
                                        this.emit('error', `Send connect request error: ${sendError}`);
                                    }
                                }
                            } catch (signError) {
                                this.emit('error', `Sign certificate error: ${signError}`);
                            }

                            break;
                        case 'connectResponse':
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
                                this.emit('error', `Connect error: ${errorTable[connectResult] || 'Unknown error.'}`);
                                return;
                            }

                            this.isConnected = true;
                            this.sourceParticipantId = participantId;

                            if (this.enableDebugMode) {
                                this.emit('debug', `Client connect state: ${this.isConnected ? 'Connected' : 'Not Connected'}`);
                                this.emit('debug', `Client pairing state: ${LocalApi.Console.PairingState[pairingState]}`);
                            }

                            try {
                                const localJoin = new MessagePacket('localJoin');
                                const sequenceNumber = await this.getSequenceNumber();
                                const localJointMessage = localJoin.pack(this.crypto, sequenceNumber, participantId);
                                await this.sendSocketMessage(localJointMessage, 'localJoin');
                            } catch (error) {
                                this.emit('error', `Send local join error: ${error}`);
                            }
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
                                const sequenceNumber1 = await this.getSequenceNumber();
                                const message = acknowledge.pack(this.crypto, sequenceNumber1, this.sourceParticipantId);
                                await this.sendSocketMessage(message, 'acknowledge');
                            } catch (error) {
                                this.emit('error', `Send acknowledge error: ${error}`)
                            };
                            break;
                        case 'consoleStatus':
                            if (!packet.payload) return;

                            if (this.firstRun) {
                                this.emit('success', `Connect Success`);

                                const { majorVersion, minorVersion, buildNumber, locale } = packet.payload;
                                const firmwareRevision = `${majorVersion}.${minorVersion}.${buildNumber}`;

                                const info = {
                                    locale: locale,
                                    firmwareRevision: firmwareRevision,
                                };

                                // Emit device info
                                this.emit('deviceInfo', info);
                                this.firstRun = false;
                            }

                            const activeTitles = Array.isArray(packet.payload.activeTitles) ? packet.payload.activeTitles : [];
                            if (activeTitles.length > 0) {
                                const power = true;
                                const volume = 0;
                                const mute = !power ? false : true;
                                const mediaState = 2;

                                const title = activeTitles[0];
                                const titleId = title.titleId;
                                const reference = title.aumId;

                                this.emit('stateChanged', power, titleId, reference, volume, mute, mediaState);
                                if (this.enableDebugMode) this.emit('debug', `Status changed, app Id: ${titleId}, reference: ${reference}`);

                                const state = { power, titleId, reference, volume, mute, mediaState };
                                this.emit('restFul', 'state', state);
                                this.emit('mqtt', 'State', state);
                            }

                            // Acknowledge if required
                            if (packet.flags.needAck) {
                                try {
                                    await this.acknowledge(packet.sequenceNumber);
                                } catch (error) {
                                    this.emit('error', `Acknowledge error: ${error}`);
                                }
                            }
                            break;
                        case 'mediaState':
                            break;
                        case 'mediaCommandResult':
                            break;
                        case 'channelStartResponse':
                            const requestIdMatch = this.channelRequestId === packet.payloadProtected.channelRequestId;
                            const channelState = requestIdMatch ? packet.payloadProtected.result === 0 : false;
                            if (this.enableDebugMode) this.emit('debug', `channelState: ${channelState}`);
                            const channelCommunicationId = channelState && packet.payloadProtected.channelTargetId ? packet.payloadProtected.channelTargetId : -1;
                            if (this.enableDebugMode) this.emit('debug', `channelCommunicationId: ${packet.payloadProtected.channelTargetId}`);
                            const channel = {
                                id: channelCommunicationId,
                                open: channelState
                            }
                            const pushChannel = channelCommunicationId !== -1 ? this.channels.push(channel) : false;
                            if (this.enableDebugMode) this.emit('debug', `Channel communication Id: ${channelCommunicationId}, state: ${channelState ? 'Open' : 'Closed'}`);
                            break;
                        case 'pairedIdentityStateChanged':
                            const pairingState1 = packet.payloadProtected.pairingState || 0;
                            if (this.enableDebugMode) this.emit('debug', `Client pairing state: ${LocalApi.Console.PairingState[pairingState1]}`);
                            break;
                    };
                }).on('listening', async () => {
                    //socket.setBroadcast(true);
                    const address = socket.address();
                    if (this.enableDebugMode) this.emit('debug', `Server start listening: ${address.address}:${address.port}`);
                    this.socket = socket;
                    this.firstRun = true;
                }).bind();

            return true;
        } catch (error) {
            throw new Error(`Connect error: ${error.message || error}`);
        };
    };
};
export default XboxLocalApi;