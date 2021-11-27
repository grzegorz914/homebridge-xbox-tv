const dgram = require('dgram');
const uuidParse = require('uuid-parse');
const uuid = require('uuid');
const EOL = require('os').EOL;
const jsrsasign = require('jsrsasign');
const EventEmitter = require('events').EventEmitter;
const Packer = require('./packet/packer');
const SGCrypto = require('./sgcrypto');

const systemInputCommands = {
    nexus: 2,
    view: 4,
    menu: 8,
    a: 16,
    b: 32,
    x: 64,
    y: 128,
    up: 256,
    down: 512,
    left: 1024,
    right: 2048
};

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

const tvRemoteCommands = {
    volUp: 'btn.vol_up',
    volDown: 'btn.vol_down',
    volMute: 'btn.vol_mute'
};

const channelNames = {
    0: 'systemMedia',
    1: 'systemInput',
    2: 'tvRemote',
    3: 'sysConfig'
};

const configNames = {
    0: 'GetConfiguration',
    1: 'GetHeadendInfo',
    2: 'GetLiveTVInfo',
    3: 'GetTunerLineups',
    4: 'GetAppChannelLineups'
};

class SMARTGLASS extends EventEmitter {
    constructor(config) {
        super();

        this.ip = config.ip;
        this.liveId = config.liveId;
        this.reconnect = config.reconnect;

        this.crypto = new SGCrypto();
        this.connectionStatus = false;
        this.messageReceivedTime = (new Date().getTime()) / 1000;
        this.titleId = '';
        this.currentApp = '';
        this.mediaState = 0;
        this.fragments = {};

        this.xboxsCount = 0;
        this.requestNum = 0;
        this.participantId = false;
        this.targetParticipantId = 0;
        this.sourceParticipantId = 0;
        this.iv = false;
        this.isAuthenticated = false;
        this.function = '';

        //channelManager
        this.channelRequestId = 0;
        this.channelCommand = '';
        this.configuration = {};
        this.headendInfo = {};
        this.liveTv = {};
        this.tunerLineups = {};
        this.appChannelLineups = {};

        this.socket = new dgram.createSocket('udp4');
        this.socket.on('error', (error) => {
                this.emit('error', `Socket error: ${error}`);
                this.socket.close();
            })
            .on('message', (message, remote) => {
                this.emit('debug', `Server reveived message from: ${remote.address}:${remote.port}`);
                this.messageReceivedTime = (new Date().getTime()) / 1000;
                message = new Packer(message);
                if (!message.structure) {
                    return;
                };

                const response = message.unpack(this);
                const type = response.name;

                if (response.packetDecoded.type != 'd00d') {
                    this.function = `_on_${type}`;
                } else {
                    if (response.packetDecoded.targetParticipantId != this.participantId) {
                        this.emit('debug', 'Participant id does not match. Ignoring packet.');
                        return;
                    };

                    this.function = `_on_${message.structure.packetDecoded.name}`;
                    if (response.packetDecoded.flags.needAck == true) {
                        this.emit('debug', 'Packet needs to be acknowledged, send acknowledge.');

                        let acknowledge = new Packer('message.acknowledge');
                        acknowledge.set('lowWatermark', response.packetDecoded.sequenceNumber);
                        acknowledge.structure.structure.processedList.value.push({
                            id: response.packetDecoded.sequenceNumber
                        });
                        const message = acknowledge.pack(this);
                        this.sendSocketMessage(message);
                    };
                };

                if (this.function == '_on_json') {
                    const jsonMessage = JSON.parse(response.packetDecoded.protectedPayload.json)

                    // Check if JSON is fragmented
                    if (jsonMessage.datagramId != undefined) {
                        this.emit('debug', `_on_json is fragmented: ${jsonMessage.datagramId}`);
                        if (this.fragments[jsonMessage.datagramId] == undefined) {
                            // Prepare buffer for JSON
                            this.fragments[jsonMessage.datagramId] = {

                                getValue: () => {
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
                                isValid: () => {
                                    const json = this.getValue();

                                    try {
                                        JSON.parse(json.toString());
                                    } catch (error) {
                                        return false;
                                    };
                                    return true;
                                },
                                partials: {}
                            };
                        };

                        this.fragments[jsonMessage.datagramId].partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;
                        if (this.fragments[jsonMessage.datagramId].isValid() == true) {
                            this.emit('debug', '_on_json: Completed fragmented packet.');
                            let jsonResponse = response;
                            jsonResponse.packetDecoded.protectedPayload.json = this.fragments[jsonMessage.datagramId].getValue().toString();

                            this.emit('_on_json', jsonResponse);
                            this.fragments[jsonMessage.datagramId] = undefined;
                        };
                        this.function = '_on_json_fragment';
                    };
                };
                this.emit(this.function, response);
                this.emit('debug', `Emit event type: ${this.function}`);
            })
            .on('listening', () => {
                const address = this.socket.address();
                this.emit('debug', `Server listening: ${address.address}:${address.port}, start discovering.`);

                setInterval(() => {
                    if (!this.connectionStatus) {
                        let discoveryPacket = new Packer('simple.discoveryRequest');
                        const message = discoveryPacket.pack();
                        this.sendSocketMessage(message);
                    };
                }, 5000);
            })
            .on('close', () => {
                this.emit('debug', 'Socket closed.');

                setTimeout(() => {
                    this.connect();
                }, this.reconnect);
            })
            .bind();

        //EventEmmiter
        this.on('_on_discovery', (message) => {
                clearInterval(this.boot);
                this.discoveredXboxs = new Array();
                this.discoveredXboxs.push(message.packetDecoded);
                this.xboxsCount = this.discoveredXboxs.length;

                if (this.xboxsCount > 0) {
                    const uhs = '';
                    const xstsToken = '';
                    const certyficate = (this.discoveredXboxs[0].certificate).toString('base64').match(/.{0,64}/g).join('\n');

                    if (!this.connectionStatus && certyficate != undefined) {
                        this.emit('debug', 'Discovered, send connect request.');

                        // // Set pem
                        const pem = `-----BEGIN CERTIFICATE-----${EOL}${certyficate}-----END CERTIFICATE-----`;
                        // Set uuid
                        const uuid4 = Buffer.from(uuidParse.parse(uuid.v4()));

                        // Create public key
                        const ecKey = jsrsasign.X509.getPublicKeyFromCertPEM(pem);
                        this.emit('debug', `Signing public key: ${ecKey.pubKeyHex}`);

                        const object = this.crypto.signPublicKey(ecKey.pubKeyHex);
                        this.emit('debug', `Crypto output object: ${object}`);

                        // Load crypto data
                        this.crypto.load(Buffer.from(object.publicKey, 'hex'), Buffer.from(object.secret, 'hex'));
                        this.emit('debug', `Loading crypto, public key: ${object.publicKey}, and secret: ${object.secret}`);

                        let connectRequest = new Packer('simple.connectRequest');
                        connectRequest.set('uuid', uuid4);
                        connectRequest.set('publicKey', this.crypto.getPublicKey());
                        connectRequest.set('iv', this.crypto.getIv());

                        if (uhs != undefined && xstsToken != undefined) {
                            connectRequest.set('userhash', uhs, true);
                            connectRequest.set('jwt', xstsToken, true);
                            this.isAuthenticated = true;
                            this.emit('debug', 'Connecting using token.');
                        } else {
                            this.isAuthenticated = false;
                            this.emit('debug', 'Connecting using anonymous login.');
                        }
                        const message = connectRequest.pack(this);
                        this.sendSocketMessage(message);
                    };
                };
            })
            .on('_on_connectResponse', (message) => {
                const connectionResult = message.packetDecoded.protectedPayload.connectResult;
                const participantId = message.packetDecoded.protectedPayload.participantId;
                this.participantId = participantId;
                this.sourceParticipantId = participantId;

                if (connectionResult == '0') {
                    this.emit('debug', 'Connect response received.')

                    let localJoin = new Packer('message.localJoin');
                    const message = localJoin.pack(this);
                    this.sendSocketMessage(message);

                    this.checkConnection = setInterval(() => {
                        if (this.connectionStatus) {
                            const lastMessageReceivedTime = (Math.trunc(((new Date().getTime()) / 1000) - this.messageReceivedTime));
                            this.emit('debug', `Start check message timeout, last received was ${lastMessageReceivedTime} seconds ago.`);
                            if (lastMessageReceivedTime == 5) {

                                let ack = new Packer('message.acknowledge');
                                ack.set('lowWatermark', this.requestNum);
                                const ackMessage = ack.pack(this);

                                this.sendSocketMessage(ackMessage);
                                this.emit('debug', `Last message was ${lastMessageReceivedTime} seconds ago, send acknowledge.`);
                            };
                            if (lastMessageReceivedTime > 12) {
                                this.disconnect();
                                this.emit('debug', `Last message was ${lastMessageReceivedTime} seconds ago, send disconnect.`);
                            };
                        };
                    }, 1000);
                } else {
                    const errorTable = {
                        0: 'Success',
                        1: 'Pending login. Reconnect to complete.',
                        2: 'Unknown error',
                        3: 'No anonymous connections.',
                        4: 'Device limit exceeded.',
                        5: 'Smartglass is disabled on the Xbox console.',
                        6: 'User authentication failed.',
                        7: 'Sign-in failed.',
                        8: 'Sign-in timeout.',
                        9: 'Sign-in required.'
                    };
                    this.connectionStatus = false;
                    this.emit('error', `Connect error: ${errorTable[message.packetDecoded.protectedPayload.connectResult]}`);
                };
            })
            .on('_on_channelOpen', (channelRequestId, channelName, udid, command) => {
                this.emit('debug', `Channel open for: ${channelName}`);
                this.channelRequestId = channelRequestId;
                this.channelCommand = command;

                let channelRequest = new Packer('message.channelRequest');
                channelRequest.set('channelRequestId', channelRequestId);
                channelRequest.set('titleId', 0);
                channelRequest.set('service', Buffer.from(udid, 'hex'));
                channelRequest.set('activityId', 0);
                const message = channelRequest.pack(this);
                this.sendSocketMessage(message);
                this.emit('debug', `Send channel request for: ${channelName}, channel id: ${channelRequestId}`);
            })
            .on('_on_channelResponse', (message) => {
                this.emit('debug', `Channel response for: ${channelNames[this.channelRequestId]}`);
                if (message.packetDecoded.protectedPayload.channelRequestId == this.channelRequestId) {
                    const channelRequestId = message.packetDecoded.protectedPayload.channelRequestId;

                    if (message.packetDecoded.protectedPayload.result == 0) {
                        const command = this.channelCommand;

                        if (channelRequestId == 0) {
                            if (command in systemMediaCommands) {
                                let mediaRequestId = 1;
                                let requestId = '0000000000000000';
                                const requestIdLength = requestId.length;
                                requestId = (requestId + mediaRequestId).slice(-requestIdLength);

                                let mediaCommand = new Packer('message.mediaCommand');
                                mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                                mediaCommand.set('titleId', 0);
                                mediaCommand.set('command', systemMediaCommands[command]);
                                mediaRequestId++
                                mediaCommand.setChannel('0');
                                const message = mediaCommand.pack(this);
                                this.sendSocketMessage(message);
                                this.emit('debug', `System media send command: ${command}`);
                            } else {
                                this.emit('debug', `Failed to send media input command: ${command}`);
                            };
                        };

                        if (channelRequestId == 1) {
                            if (command in systemInputCommands) {
                                const timestampNow = new Date().getTime();
                                let gamepadPress = new Packer('message.gamepad');
                                gamepadPress.set('timestamp', Buffer.from(`000${timestampNow.toString()}`, 'hex'));
                                gamepadPress.set('command', systemInputCommands[command]);
                                gamepadPress.setChannel('1');
                                const message = gamepadPress.pack(this);
                                this.sendSocketMessage(message);
                                this.emit('debug', `System input send press, command: ${command}`);

                                setTimeout(() => {
                                    const timestamp = new Date().getTime();
                                    let gamepadUnpress = new Packer('message.gamepad');
                                    gamepadUnpress.set('timestamp', Buffer.from(`000${timestamp.toString()}`, 'hex'));
                                    gamepadUnpress.set('command', 0);
                                    gamepadUnpress.setChannel('1');
                                    const message = gamepadUnpress.pack(this);
                                    this.sendSocketMessage(message);
                                    this.emit('debug', `System input send unpress command: 0`);
                                }, 100);
                            } else {
                                this.emit('debug', `Failed to send system input command: ${command}`);
                            };
                        };

                        if (channelRequestId == 2) {
                            if (command in tvRemoteCommands) {
                                let messageNum = 0;
                                const jsonRequest = {
                                    msgid: `2ed6c0fd.${messageNum++}`,
                                    request: 'SendKey',
                                    params: {
                                        button_id: tvRemoteCommands.command,
                                        device_id: null
                                    }
                                };
                                let json = new Packer('message.json');
                                json.set('json', JSON.stringify(jsonRequest));
                                json.setChannel('2');
                                const message = json.pack(this);
                                this.sendSocketMessage(message);
                                this.emit('debug', `TV remote send command: ${command}`);
                            } else {
                                this.emit('debug', `Failed to send tv remote command: ${command}`);
                            };
                        };

                        if (channelRequestId == 3) {
                            this.emit('debug', `System config send.`);
                            const configNamesCount = configNames.length;
                            for (let i = 0; i < configNamesCount; i++) {
                                const configName = configNames[i];
                                const jsonRequest = {
                                    msgid: `2ed6c0fd.${i}`,
                                    request: configName,
                                    params: null
                                };
                                let json = new Packer('message.json');
                                json.set('json', JSON.stringify(jsonRequest));
                                json.setChannel('2');
                                const message = json.pack(this);
                                this.sendSocketMessage(message);
                                this.emit('debug', `System config send: ${configName}`);
                            };
                        };
                    } else {
                        this.emit('debug', `Could not request channel: ${channelNames[channelRequestId]}`);
                    };
                };
            })
            .on('_on_json', (message) => {
                const response = JSON.parse(message.packetDecoded.protectedPayload.json);
                if (response.response == "Error") {
                    this.emit('debug', `Got Error: ${response}`);
                } else {
                    if (response.response == 'GetConfiguration') {
                        this.emit('debug', 'Got tvRemote Configuration');
                        this.configuration = response.params;
                    };
                    if (response.response == 'GetHeadendInfo') {
                        this.emit('debug', 'Got Headend Configuration');
                        this.headendInfo = response.params;
                    };
                    if (response.response == 'GetLiveTVInfo') {
                        this.emit('debug', 'Got live tv Info');
                        this.liveTv = response.params;
                    };
                    if (response.response == 'GetTunerLineups') {
                        this.emit('debug', 'Got live tv Info');
                        this.tunerLineups = response.params;
                    };
                    if (response.response == 'GetAppChannelLineups') {
                        this.emit('debug', 'Got live tv Info');
                        this.appChannelLineups = response.params;
                    };
                };
            })
            .on('_on_status', (message) => {
                if (message.packetDecoded.protectedPayload.apps[0] != undefined) {
                    if (this.currentApp != message.packetDecoded.protectedPayload.apps[0].aumId) {
                        const decodedMessage = message.packetDecoded.protectedPayload;
                        if (!this.connectionStatus) {
                            this.emit('message', 'Connected.')
                            this.emit('_on_connected');
                            this.discoveredXboxs.splice(0, this.xboxsCount);
                            this.xboxsCount = 0;
                            this.connectionStatus = true;
                        };

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
                        this.emit('_on_change', decodedMessage, this.mediaState);
                    };
                };
            }).on('_on_disconnected', () => {
                this.connectionStatus = false;
                this.requestNum = 0;
                this.emit('message', 'Disconnected.');
            });
    };

    powerOn() {
        return new Promise((resolve, reject) => {
            if (!this.connectionStatus) {
                this.emit('message', 'Send power On.');
                const bootStartTime = (new Date().getTime()) / 1000;

                this.boot = setInterval(() => {
                    let powerOn = new Packer('simple.powerOn');
                    powerOn.set('liveId', this.liveId);
                    const message = powerOn.pack();
                    this.sendSocketMessage(message);

                    const lastBootTime = (Math.trunc(((new Date().getTime()) / 1000) - bootStartTime));
                    this.emit('debug', `Last boot time was ${lastBootTime} seconds ago.`);
                    if (lastBootTime == 4) {
                        resolve(true);
                    };
                    if (lastBootTime > 15) {
                        this.emit('_on_disconnected');
                        clearInterval(this.boot)
                    };
                }, 500);
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
            if (this.connectionStatus) {
                this.emit('message', 'Send power Off.');

                let powerOff = new Packer('message.powerOff');
                powerOff.set('liveId', this.liveId);
                const message = powerOff.pack(this);
                this.sendSocketMessage(message);

                setTimeout(() => {
                    this.disconnect();
                    resolve(true);
                }, 2500);
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
            if (this.connectionStatus && this.isAuthenticated) {
                this.emit('debug', 'Send record game.');
                let recordGameDvr = new Packer('message.recordGameDvr');
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this);
                this.sendSocketMessage(message);
                resolve(true);
            } else {
                this.emit('debug', 'Not connected or not authorized, send record game ignored. ')
                reject({
                    status: 'error',
                    error: `Connection state: ${this.connectionStatus}, authorization state: ${this.isAuthenticated}`
                });
            };
        });
    };

    sendCommand(command, channelName) {
        return new Promise((resolve, reject) => {
            if (this.connectionStatus) {
                if (channelName == 'systemMedia') {
                    this.emit('_on_channelOpen', 0, 'systemMedia', '48a9ca24eb6d4e128c43d57469edd3cd', command);
                    resolve(true);
                };
                if (channelName == 'systemInput') {
                    this.emit('_on_channelOpen', 1, 'systemInput', 'fa20b8ca66fb46e0adb60b978a59d35f', command);
                    resolve(true);
                };
                if (channelName == 'tvRemote') {
                    this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7', command);
                    resolve(true);
                };
                if (channelName == 'sysConfig') {
                    this.emit('_on_channelOpen', 3, 'sysConfig', 'd451e3b360bb4c71b3dbf994b1aca3a7', null);
                    resolve(true);
                };
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
            this.socket.send(message, 0, message.length, 5050, this.ip, (error, bytes) => {
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

        let disconnect = new Packer('message.disconnect');
        disconnect.set('reason', 4);
        disconnect.set('errorCode', 0);
        const message = disconnect.pack(this);
        this.sendSocketMessage(message);
        this.emit('_on_disconnected');
    };

    getRequestNum() {
        this.requestNum++;
        this.emit('debug', `Request number set to: ${this.requestNum}`);
    };

    connect() {
        if (!this.socket) {
            this.socket = new dgram.createSocket('udp4');
        };
    };
};
module.exports = SMARTGLASS;