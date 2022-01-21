const dgram = require('dgram');
const uuidParse = require('uuid-parse');
const uuid = require('uuid');
const EOL = require('os').EOL;
const jsrsasign = require('jsrsasign');
const EventEmitter = require('events').EventEmitter;
const Packer = require('./packet/packer');
const SGCrypto = require('./sgcrypto');

const systemMediaCommands = {
    play: 2,
    pause: 4,
    playpause: 8,
    stop: 16,
    record: 32,
    nextTrack: 64,
    prevTrack: 128,
    fastForward: 256,
    rewind: 512,
    channelUp: 1024,
    channelDown: 2048,
    back: 4096,
    view: 8192,
    menu: 16384,
    seek: 32786
};

const systemInputCommands = {
    unpress: 0,
    nexus: 2,
    view1: 4,
    menu1: 8,
    a: 16,
    b: 32,
    x: 64,
    y: 128,
    up: 256,
    down: 512,
    left: 1024,
    right: 2048
};

const tvRemoteCommands = {
    volUp: 'btn.vol_up',
    volDown: 'btn.vol_down',
    volMute: 'btn.vol_mute'
};
const channelIds = {
    systemMedia: 0,
    systemInput: 1,
    tvRemote: 2,
    // sysConfig: 3
};
const channelUuids = {
    systemMedia: '48a9ca24eb6d4e128c43d57469edd3cd',
    systemInput: 'fa20b8ca66fb46e0adb60b978a59d35f',
    tvRemote: 'd451e3b360bb4c71b3dbf994b1aca3a7',
    //sysConfig: 'd451e3b360bb4c71b3dbf994b1aca3a7'
};
const channelNames = ['systemMedia', 'systemInput', 'tvRemote', 'sysConfig'];
const configNames = ['GetConfiguration', 'GetHeadendInfo', 'GetLiveTVInfo', 'GetTunerLineups', 'GetAppChannelLineups'];

class SMARTGLASS extends EventEmitter {
    constructor(config) {
        super();

        this.host = config.host;
        this.xboxLiveId = config.xboxLiveId;
        this.userToken = config.userToken;
        this.userHash = config.uhs;

        this.crypto = new SGCrypto();
        this.isConnected = false;
        this.isAuthorized = false;
        this.titleId = '';
        this.currentApp = '';
        this.mediaState = 0;
        this.fragments = {};

        this.requestNum = 0;
        this.participantId = false;
        this.targetParticipantId = 0;
        this.sourceParticipantId = 0;
        this.iv = false;
        this.function = '';

        //channelManager
        this.channelClientId = 0;
        this.channelCommand = '';
        this.configuration = {};
        this.headendInfo = {};
        this.liveTv = {};
        this.tunerLineups = {};
        this.appChannelLineups = {};
        this.channelTargetId = null;
        this.channelRequestId = null;
        this.message = {};

        //dgram socket
        this.socket = new dgram.createSocket('udp4');
        this.socket.on('error', (error) => {
                this.emit('error', `Socket error: ${error}`);
                this.socket.close();
            })
            .on('message', (message, remote) => {
                this.emit('debug', `Received message from: ${remote.address}:${remote.port}`);
                this.messageReceivedTime = (new Date().getTime()) / 1000;
                message = new Packer(message);
                if (message.structure == false) {
                    return;
                };
                this.response = message.unpack(this);

                if (this.response.packetDecoded.type != 'd00d') {
                    this.function = this.response.name;
                } else {
                    if (this.response.packetDecoded.targetParticipantId != this.participantId) {
                        this.emit('debug', 'Participant id does not match. Ignoring packet.');
                        return;
                    };
                    this.function = message.structure.packetDecoded.name;
                };

                if (this.function == 'json') {
                    const jsonMessage = JSON.parse(this.response.packetDecoded.protectedPayload.json)

                    // Check if JSON is fragmented
                    if (jsonMessage.datagramId != undefined) {
                        this.emit('debug', `Json message is fragmented: ${jsonMessage.datagramId}`);
                        if (this.fragments[jsonMessage.datagramId] == undefined) {
                            // Prepare buffer for JSON
                            this.fragments[jsonMessage.datagramId] = {

                                getValue() {
                                    let buffer = Buffer.from('');
                                    for (let partial in this.partials) {
                                        buffer = Buffer.concat([
                                            buffer,
                                            Buffer.from(this.partials[partial])
                                        ])
                                    };
                                    const bufferDecoded = Buffer(buffer.toString(), 'base64');
                                    return bufferDecoded;
                                },
                                isValid() {
                                    const json = this.getValue();
                                    let isValid = false;
                                    try {
                                        JSON.parse(json.toString());
                                        isValid = true;
                                    } catch (error) {
                                        isValid = false;
                                        this.emit('error', `Valid packet error: ${error}`);
                                    };
                                    return isValid;
                                },
                                partials: {}
                            };
                        };

                        this.fragments[jsonMessage.datagramId].partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;
                        if (this.fragments[jsonMessage.datagramId].isValid()) {
                            this.emit('debug', 'Json completed fragmented packet.');
                            this.response.packetDecoded.protectedPayload.json = this.fragments[jsonMessage.datagramId].getValue().toString();
                            this.fragments[jsonMessage.datagramId] = undefined;
                        };
                        this.function = 'jsonFragment';
                    };
                };

                if (this.function == 'status') {
                    const decodedMessage = JSON.stringify(this.response.packetDecoded.protectedPayload);
                    if (this.message === decodedMessage) {
                        this.emit('debug', 'Received unchanged status message.');
                        return;
                    };
                    this.message = decodedMessage;
                };

                this.emit('debug', `Received event type: ${this.function}`);
                this.emit(this.function, this.response);
            })
            .on('listening', () => {
                const address = this.socket.address();
                this.emit('debug', `Server listening: ${address.address}:${address.port}, start discovering.`);

                // Start discovery
                this.startDiscovery();
            })
            .on('close', () => {
                clearInterval(this.discovery);
                this.emit('debug', 'Socket closed.');

                setTimeout(() => {
                    this.connect();
                }, 5000);
            })
            .bind();

        //EventEmmiter
        this.on('discoveryResponse', (message) => {
                clearInterval(this.boot);
                const decodedMessage = message.packetDecoded;

                if (decodedMessage != undefined && !this.isConnected) {
                    this.emit('debug', `Discovered: ${JSON.stringify(decodedMessage)}, send connect request.`);

                    // Set certyficate
                    const certyficate = (decodedMessage.certificate).toString('base64').match(/.{0,64}/g).join('\n');

                    // Set pem
                    const pem = `-----BEGIN CERTIFICATE-----${EOL}${certyficate}-----END CERTIFICATE-----`;

                    // Set uuid
                    const uuid4 = Buffer.from(uuidParse.parse(uuid.v4()));

                    // Create public key
                    const ecKey = jsrsasign.X509.getPublicKeyFromCertPEM(pem);
                    this.emit('debug', `Signing public key: ${ecKey.pubKeyHex}`);

                    // Load crypto data
                    const object = this.crypto.signPublicKey(ecKey.pubKeyHex);
                    this.crypto.load(Buffer.from(object.publicKey, 'hex'), Buffer.from(object.secret, 'hex'));
                    this.emit('debug', `Loading crypto, public key: ${object.publicKey}, and secret: ${object.secret}`);

                    const connectRequest = new Packer('simple.connectRequest');
                    connectRequest.set('uuid', uuid4);
                    connectRequest.set('publicKey', this.crypto.getPublicKey());
                    connectRequest.set('iv', this.crypto.getIv());

                    if (this.userHash != undefined && this.userToken != undefined) {
                        connectRequest.set('userHash', this.userHash, true);
                        connectRequest.set('jwt', this.userToken, true);
                        this.isAuthorized = true;
                        this.emit('debug', `Connecting using token: ${this.userToken}`);
                    } else {
                        this.isAuthorized = false;
                        this.emit('debug', 'Connecting using anonymous login.');
                    }
                    const message = connectRequest.pack(this);
                    this.sendSocketMessage(message);
                };
            })
            .on('connectResponse', (message) => {
                const connectionResult = message.packetDecoded.protectedPayload.connectResult;
                const participantId = message.packetDecoded.protectedPayload.participantId;
                this.participantId = participantId;
                this.sourceParticipantId = participantId;

                if (connectionResult == 0) {
                    this.emit('debug', 'Connect response received.')

                    const localJoin = new Packer('message.localJoin');
                    const message = localJoin.pack(this);
                    this.sendSocketMessage(message);

                    this.checkConnection = setInterval(() => {
                        if (this.isConnected) {
                            const lastMessageReceivedTime = (Math.trunc(((new Date().getTime()) / 1000) - this.messageReceivedTime));
                            this.emit('debug', `Start check message timeout, last received was ${lastMessageReceivedTime} seconds ago.`);
                            if (lastMessageReceivedTime == 5) {
                                this.emit('debug', `Last message was: ${lastMessageReceivedTime} seconds ago, send acknowledge.`);
                                this.emit('acknowledge');
                            };
                            if (lastMessageReceivedTime > 12) {
                                this.emit('debug', `Last message was: ${lastMessageReceivedTime} seconds ago, send disconnect.`);
                                this.disconnect();
                            };
                        };
                    }, 1000);
                } else {
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
                    this.isConnected = false;
                    this.emit('error', `Connect error: ${errorTable[connectionResult]}`);
                };
            })
            .on('acknowledge', (message) => {
                this.emit('debug', 'Packet needs to be acknowledged, send acknowledge.');

                const acknowledge = new Packer('message.acknowledge');
                acknowledge.set('lowWatermark', this.requestNum);
                acknowledge.structure.structure.processedList.value.push({
                    id: this.requestNum
                });
                const message1 = acknowledge.pack(this);
                this.sendSocketMessage(message1);
            })
            .on('status', (message) => {
                if (message.packetDecoded.protectedPayload.apps[0] != undefined) {
                    const decodedMessage = message.packetDecoded.protectedPayload;
                    this.emit('debug', `Status: ${JSON.stringify(decodedMessage)}`);

                    if (!this.isConnected) {
                        clearInterval(this.discovery);
                        this.emit('debug', 'Stop discovery.');

                        this.isConnected = true;
                        this.emit('connected', 'Connected.');

                        const majorVersion = decodedMessage.majorVersion;
                        const minorVersion = decodedMessage.minorVersion;
                        const buildNumber = decodedMessage.buildNumber
                        const firmwareRevision = `${majorVersion}.${minorVersion}.${buildNumber}`;
                        this.emit('deviceInfo', firmwareRevision);
                    };

                    if (this.currentApp != decodedMessage.apps[0].aumId) {
                        const appsArray = new Array();
                        const appsCount = decodedMessage.apps.length;
                        for (let i = 0; i < appsCount; i++) {
                            const titleId = decodedMessage.apps[i].titleId;
                            const reference = decodedMessage.apps[i].aumId;
                            const app = {
                                titleId: titleId,
                                reference: reference
                            };
                            appsArray.push(app);
                            this.emit('debug', `Status changed, app Id: ${titleId}, reference: ${reference}`);
                        };
                        this.titleId = appsArray[appsCount - 1].titleId;
                        this.currentApp = appsArray[appsCount - 1].reference;
                        this.emit('stateChanged', decodedMessage, this.mediaState);
                    };
                };
            })
            .on('channelResponse', (message) => {
                if (message.packetDecoded.protectedPayload.result == 0) {
                    const channelRequestId = message.packetDecoded.protectedPayload.channelRequestId;
                    const channelTargetId = message.packetDecoded.protectedPayload.channelTargetId;
                    this.emit('debug', `Channel response for name: ${channelNames[channelRequestId]}, request id: ${channelRequestId}, target id: ${channelTargetId}`);

                    if (channelTargetId != this.channelTargetId) {
                        this.channelTargetId = channelTargetId;
                        this.channelRequestId = channelRequestId;
                    };
                };
            })
            .on('sendCommand', (command) => {
                this.emit('debug', `Channel send command for name: ${channelNames[this.channelRequestId]}, request id: ${this.channelRequestId}, command: ${command}`);

                if (this.channelRequestId == 0) {
                    if (command in systemMediaCommands) {

                        let mediaRequestId = 0;
                        let requestId = '0000000000000000';
                        const requestIdLength = requestId.length;
                        requestId = (requestId + mediaRequestId++).slice(-requestIdLength);

                        const mediaCommand = new Packer('message.mediaCommand');
                        mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                        mediaCommand.set('titleId', 0);
                        mediaCommand.set('command', systemMediaCommands[command]);
                        mediaCommand.setChannel(this.channelTargetId);
                        const message = mediaCommand.pack(this);
                        this.emit('debug', `System media send command: ${command}`);
                        this.sendSocketMessage(message);
                    } else {
                        this.emit('debug', `Unknown media input command: ${command}`);
                    };
                };

                if (this.channelRequestId == 1) {
                    if (command in systemInputCommands) {
                        const timeStampPress = new Date().getTime();
                        const gamepadPress = new Packer('message.gamepad');
                        gamepadPress.set('timestamp', Buffer.from(`000${timeStampPress.toString()}`, 'hex'));
                        gamepadPress.set('buttons', systemInputCommands[command]);
                        gamepadPress.setChannel(this.channelTargetId);
                        const message = gamepadPress.pack(this);
                        this.emit('debug', `System input send press, command: ${command}`);
                        this.sendSocketMessage(message);

                        setTimeout(() => {
                            const timeStampUnpress = new Date().getTime();
                            const gamepadUnpress = new Packer('message.gamepad');
                            gamepadUnpress.set('timestamp', Buffer.from(`000${timeStampUnpress.toString()}`, 'hex'));
                            gamepadUnpress.set('buttons', systemInputCommands['unpress']);
                            gamepadUnpress.setChannel(this.channelTargetId);
                            const message = gamepadUnpress.pack(this);
                            this.emit('debug', `System input send unpress, command: unpress`);
                            this.sendSocketMessage(message);
                        }, 150);
                    } else {
                        this.emit('debug', `Unknown system input command: ${command}`);
                    };
                };

                if (this.channelRequestId == 2) {
                    if (command in tvRemoteCommands) {
                        let messageNum = 0;
                        const jsonRequest = {
                            msgid: `2ed6c0fd.${messageNum++}`,
                            request: 'SendKey',
                            params: {
                                button_id: tvRemoteCommands[command],
                                device_id: null
                            }
                        };
                        const json = new Packer('message.json');
                        json.set('json', JSON.stringify(jsonRequest));
                        json.setChannel(this.channelTargetId);
                        const message = json.pack(this);
                        this.emit('debug', `TV remote send command: ${command}`);
                        this.sendSocketMessage(message);
                    } else {
                        this.emit('debug', `Unknown tv remote command: ${command}`);
                    };
                };

                if (this.channelRequestId == 3) {
                    const configNamesCount = configNames.length;
                    for (let i = 0; i < configNamesCount; i++) {
                        const configName = configNames[i];
                        const jsonRequest = {
                            msgid: `2ed6c0fd.${i}`,
                            request: configName,
                            params: null
                        };
                        const json = new Packer('message.json');
                        json.set('json', JSON.stringify(jsonRequest));
                        json.setChannel(this.channelTargetId);
                        const message = json.pack(this);
                        this.emit('debug', `System config send: ${configName}`);
                        this.sendSocketMessage(message);
                    };
                };
            })
            .on('json', (message) => {
                const response = JSON.parse(message.packetDecoded.protectedPayload.json);
                if (response.response == "Error") {
                    this.emit('error', `Json error: ${response}`);
                } else {
                    if (response.response == 'GetConfiguration') {
                        this.configuration = response.params;
                        this.emit('debug', `TV remote configuration: ${this.configuration }`);
                    };
                    if (response.response == 'GetHeadendInfo') {
                        this.headendInfo = response.params;
                        this.emit('debug', `Headend info: ${this.headendInfo }`);
                    };
                    if (response.response == 'GetLiveTVInfo') {
                        this.liveTv = response.params;
                        this.emit('debug', `Live TV info: ${this.liveTv }`);
                    };
                    if (response.response == 'GetTunerLineups') {
                        this.tunerLineups = response.params;
                        this.emit('debug', `Tuner lineups: ${this.tunerLineups }`);
                    };
                    if (response.response == 'GetAppChannelLineups') {
                        this.appChannelLineups = response.params;
                        this.emit('debug', `App channel lineups: ${this.appChannelLineups }`);
                    };
                };
            })
            .on('jsonFragment', (message) => {
                this.emit('debug', `Json fragment: ${message}`);
            });
    };

    startDiscovery() {
        this.emit('debug', 'Start discovery.');
        this.discovery = setInterval(() => {
            if (!this.isConnected) {
                const discoveryPacket = new Packer('simple.discoveryRequest');
                const message = discoveryPacket.pack();
                this.sendSocketMessage(message);
            };
        }, 5000);
    };

    powerOn() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                this.emit('message', 'Send power On.');
                const powerOnStartTime = (new Date().getTime()) / 1000;

                this.boot = setInterval(() => {
                    const powerOn = new Packer('simple.powerOn');
                    powerOn.set('liveId', this.xboxLiveId);
                    const message = powerOn.pack();
                    this.sendSocketMessage(message);

                    const lastPowerOnTime = (Math.trunc(((new Date().getTime()) / 1000) - powerOnStartTime));
                    if (lastPowerOnTime > 15) {
                        clearInterval(this.boot)
                        this.emit('disconnected', 'Power On failed, please try again.');
                    };
                }, 500);

                setTimeout(() => {
                    resolve(true);
                }, 3500);
            } else {
                reject({
                    status: 'error',
                    error: 'Already connected.'
                });
            };
        });
    };

    powerOff() {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                this.emit('message', 'Send power Off.');

                const powerOff = new Packer('message.powerOff');
                powerOff.set('liveId', this.xboxLiveId);
                const message = powerOff.pack(this);
                this.sendSocketMessage(message);

                setTimeout(() => {
                    this.disconnect();
                    resolve(true);
                }, 3500);
            } else {
                reject({
                    status: 'error',
                    error: 'Already disconnected.'
                });
            };
        });
    };

    recordGameDvr() {
        return new Promise((resolve, reject) => {
            if (this.isConnected && this.isAuthorized) {
                this.emit('message', 'Send record game.');

                const recordGameDvr = new Packer('message.recordGameDvr');
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this);
                this.sendSocketMessage(message);
                resolve(true);
            } else {
                this.emit('debug', 'Not connected or not authorized, send record game ignored. ')
                reject({
                    status: 'error',
                    error: `Connection state: ${this.isConnected}, authorization state: ${this.isAuthorized}`
                });
            };
        });
    };

    sendCommand(channelName, command) {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                this.emit('debug', 'Send command.');

                if (channelIds[channelName] != this.channelRequestId) {
                    const channelRequest = new Packer('message.channelRequest');
                    channelRequest.set('channelRequestId', channelIds[channelName]);
                    channelRequest.set('titleId', 0);
                    channelRequest.set('service', Buffer.from(channelUuids[channelName], 'hex'));
                    channelRequest.set('activityId', 0);
                    const message = channelRequest.pack(this);
                    this.emit('debug', `Send channel request name: ${channelName}, id: ${channelIds[channelName]}`);
                    this.sendSocketMessage(message);

                    setTimeout(() => {
                        this.emit('sendCommand', command)
                    }, 500);
                } else {
                    this.emit('sendCommand', command)
                }
                resolve(true);
            } else {
                reject({
                    status: 'error',
                    error: 'Not connected, send command ignored.'
                });
            };
        });
    };



    sendSocketMessage(message) {
        if (this.socket) {
            const messageLength = message.length;
            this.socket.send(message, 0, messageLength, 5050, this.host, (error, bytes) => {
                if (error) {
                    this.emit('error', `Socket send message error: ${error}`);
                };
                this.emit('debug', `Socket send ${bytes} bytes.`);
            });
        };
    };

    disconnect() {
        this.emit('debug', 'Disconnecting...');
        clearInterval(this.checkConnection);

        const disconnect = new Packer('message.disconnect');
        disconnect.set('reason', 4);
        disconnect.set('errorCode', 0);
        const message = disconnect.pack(this);
        this.sendSocketMessage(message);

        setTimeout(() => {
            this.isConnected = false;
            this.requestNum = 0;
            this.channelTargetId = null;
            this.channelRequestId = null;
            this.emit('disconnected', 'Disconnected.');

            // Start discovery
            this.startDiscovery();
        }, 3500);
    };

    getRequestNum() {
        this.requestNum++;
        this.emit('debug', `Request number set to: ${this.requestNum}`);
    };

    connect() {
        if (!this.socket) {
            this.socket = new dgram.createSocket('udp4');
            this.socket.bind();
        };
    };
};
module.exports = SMARTGLASS;