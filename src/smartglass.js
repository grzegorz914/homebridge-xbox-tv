const dgram = require('dgram');
const uuidParse = require('uuid-parse');
const uuid = require('uuid');
const EOL = require('os').EOL;
const jsrsasign = require('jsrsasign');
const EventEmitter = require('events').EventEmitter;
const Packer = require('./packet/packer');
const SGCrypto = require('./sgcrypto');

const systemInputCommands = {
    a: 16,
    b: 32,
    x: 64,
    y: 128,
    up: 256,
    left: 1024,
    right: 2048,
    down: 512,
    nexus: 2,
    view: 4,
    menu: 8
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
        this.blockMultipleSend = false;
        this.blockMultiplePress = false;

        //xbox
        this.xboxsCount = 0;
        this.requestNum = 0;
        this.participantId = false;
        this.targetParticipantId = 0;
        this.sourceParticipantId = 0;
        this.iv = false;
        this.isAuthenticated = false;

        //channelManager
        this.channelStatus = false;
        this.channelServerId = 0;
        this.channelManagerId = 0;
        this.channelName = '';
        this.configuration = {};
        this.headendInfo = {};
        this.liveTv = {};
        this.tunerLineups = {};
        this.appChannelLineups = {};

        this.socket = dgram.createSocket('udp4');
        this.socket.on('error', (error) => {
                this.socket.close();
                this.emit('error', `Socket error: ${error}`);
            })
            .on('message', async (message, remote) => {
                this.emit('debug', `Server message: ${message} from: ${remote.address}:${remote.port}`);

                const config = {
                    type: message
                };
                message = new Packer(config);

                if (!message.structure) {
                    return;
                };

                const response = message.unpack(this);
                const type = response.name;
                let func = '';

                if (response.packetDecoded.type != 'd00d') {
                    func = `_on_${type}`;
                    this.emit('debug', `Received type: ${func}`);
                } else {
                    if (response.packetDecoded.targetParticipantId != this.participantId) {
                        this.emit('debug', 'Participant id does not match. Ignoring packet.');
                        return;
                    };

                    func = `_on_${message.structure.packetDecoded.name}`;
                    this.emit('debug', `Received name: ${func}`);

                    if (response.packetDecoded.flags.needAck == true) {
                        this.emit('debug', 'Packet needs to be acknowledged. Sending response');

                        try {
                            await this.getRequestNum();
                            const config = {
                                type: 'message.acknowledge'
                            };
                            let acknowledge = new Packer(config);
                            acknowledge.set('lowWatermark', response.packetDecoded.sequenceNumber);
                            acknowledge.structure.structure.processedList.value.push({
                                id: response.packetDecoded.sequenceNumber
                            });
                            const message = acknowledge.pack(this);

                            await this.socketSend(message);
                            this.messageReceivedTime = (new Date().getTime()) / 1000;
                        } catch (error) {
                            this.emit('error', `Packet acknowledge error: ${error}`);
                        };
                    };
                };

                if (func == '_on_json') {
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
                            this.emit('debug', '_on_json: Completed fragmented packet');
                            let jsonResponse = response;
                            jsonResponse.packetDecoded.protectedPayload.json = this.fragments[jsonMessage.datagramId].getValue().toString();

                            this.emit('_on_json', jsonResponse);
                            this.fragments[jsonMessage.datagramId] = undefined;
                        };
                        func = '_on_json_fragment';
                    };
                };
                this.emit(func, response);
                this.emit('debug', `Emit event: ${func}`);
            })
            .on('listening', () => {
                const address = this.socket.address();
                this.emit('debug', `Server listening: ${address.address}:${address.port}, start discovering.`);

                this.listening = setInterval(async () => {
                    if (!this.connectionStatus) {
                        this.emit('debug', `Sending discovery packet`);
                        try {
                            const config = {
                                type: 'simple.discoveryRequest'
                            };
                            let discoveryPacket = new Packer(config);
                            const message = discoveryPacket.pack();
                            await this.socketSend(message);
                        } catch (error) {
                            this.emit('error', `Sending discovery packet error: ${error}`);
                        };
                    };
                }, 5000);
            })
            .on('close', () => {
                this.emit('debug', 'Socket closed.');
                this.connectionStatus = false;

                setInterval(() => {
                    this.socketReconnect();
                }, this.reconnect);
            })
            .bind();

        //EventEmmiter
        this.on('_on_discovery', (message) => {
                this.discoveredXboxs = new Array();
                this.discoveredXboxs.push(message.packetDecoded);
                this.xboxsCount = this.discoveredXboxs.length;
                clearInterval(this.boot);

                if (this.xboxsCount > 0) {
                    this.connectToXbox = setInterval(async () => {
                        this.emit('debug', 'Discovered, sending connect request.');
                        if (!this.connectionStatus) {
                            const uhs = '';
                            const xstsToken = '';
                            const certyficate = (this.discoveredXboxs[0].certificate).toString('base64').match(/.{0,64}/g).join('\n');

                            // // Set pem
                            const pem = `-----BEGIN CERTIFICATE-----${EOL}${certyficate}-----END CERTIFICATE-----`;
                            // Set uuid
                            const uuid4 = Buffer.from(uuidParse.parse(uuid.v4()));

                            // Create public key
                            const ecKey = jsrsasign.X509.getPublicKeyFromCertPEM(pem);
                            this.emit('debug', `Signing public key: ${ecKey.pubKeyHex}`);

                            const object = this.crypto.signPublicKey(ecKey.pubKeyHex);
                            this.emit('debug', `Crypto output: ${object}`);

                            // Load crypto data
                            this.emit('debug', `Loading crypto, public key: ${object.publicKey}, shared secret: ${object.secret}`);
                            this.crypto.load(Buffer.from(object.publicKey, 'hex'), Buffer.from(object.secret, 'hex'));

                            const config = {
                                type: 'simple.connectRequest'
                            };
                            let connectRequest = new Packer(config);
                            connectRequest.set('uuid', uuid4);
                            connectRequest.set('publicKey', this.crypto.getPublicKey());
                            connectRequest.set('iv', this.crypto.getIv());

                            if (uhs != undefined && xstsToken != undefined) {
                                this.emit('debug', `Connecting using token: ${uhs}:${xstsToken}`);
                                connectRequest.set('userhash', uhs, true);
                                connectRequest.set('jwt', xstsToken, true);
                                this.isAuthenticated = true;
                            } else {
                                this.emit('debug', 'Connecting using anonymous login');
                                this.isAuthenticated = false;
                            }
                            const message = connectRequest.pack(this);
                            try {
                                await this.socketSend(message);
                            } catch (error) {
                                this.emit('error', `Sending connect request error: ${error}`);
                            };
                        };
                    }, 2500);
                };
            })
            .on('_on_connectResponse', async (message) => {
                if (!this.connectionStatus) {
                    const connectionResult = message.packetDecoded.protectedPayload.connectResult;
                    const participantId = message.packetDecoded.protectedPayload.participantId;
                    this.participantId = participantId;
                    this.sourceParticipantId = participantId;

                    if (connectionResult == '0') {
                        this.emit('message', 'Connected.')

                        this.discoveredXboxs.splice(0, this.xboxsCount);
                        this.connectionStatus = true;

                        this.emit('debug', 'Sending packet.')
                        try {
                            await this.getRequestNum();
                            const config = {
                                type: 'message.localJoin'
                            };
                            const localJoin = new Packer(config);
                            const message = localJoin.pack(this);
                            await this.socketSend(message);

                            this.emit('_on_connected');
                        } catch (error) {
                            this.emit('error', `Sending packet error: ${error}`);
                        };

                        this.checkConnectionTimeout = setInterval(async () => {
                            if (this.connectionStatus) {
                                const lastMessageReceivedTime = (Math.trunc(((new Date().getTime()) / 1000) - this.messageReceivedTime));
                                this.emit('debug', `Start check message timeout, last received time: ackMessage sec ago.`);

                                if (lastMessageReceivedTime == 5) {
                                    try {
                                        await this.getRequestNum();
                                        const config = {
                                            type: 'message.acknowledge'
                                        };
                                        let ack = new Packer(config);
                                        ack.set('lowWatermark', this.requestNum);
                                        const ackMessage = ack.pack(this);

                                        await this.socketSend(ackMessage);
                                        this.emit('debug', `Send ackMessage.`);
                                    } catch (error) {
                                        this.emit('error', `Send ackMessage error: ${error}`);
                                    };
                                };

                                if (lastMessageReceivedTime > 12) {
                                    try {
                                        await this.disconnect();
                                        this.emit('message', `Send disconnect.`);
                                    } catch (error) {
                                        this.emit('error', `Send disconnect error: ${error}`);
                                    };
                                };
                            };
                        }, 1000)
                    } else {
                        const errorTable = {
                            0: 'Success',
                            1: 'Pending login. Reconnect to complete',
                            2: 'Unknown error',
                            3: 'No anonymous connections',
                            4: 'Device limit exceeded',
                            5: 'Smartglass is disabled on the Xbox console',
                            6: 'User authentication failed',
                            7: 'Sign-in failed',
                            8: 'Sign-in timeout',
                            9: 'Sign-in required'
                        };
                        this.connectionStatus = false;
                        this.emit('error', `Connect error: ${errorTable[message.packetDecoded.protectedPayload.connectResult]}`);
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
            .on('_on_channelOpen', async (channelManagerId, channelName, udid) => {
                if (!this.connectionStatus) {
                    this.emit('debug', 'Not connected.')
                    return;
                };

                this.emit('message', `Request open channel: ${channelName}`);
                this.channelManagerId = channelManagerId;
                this.channelName = channelName;

                try {
                    await this.getRequestNum();
                    const config = {
                        type: 'message.channelRequest'
                    };
                    let channelRequest = new Packer(config);
                    channelRequest.set('channelRequestId', channelManagerId);
                    channelRequest.set('titleId', 0);
                    channelRequest.set('service', Buffer.from(udid, 'hex'));
                    channelRequest.set('activityId', 0);
                    const message = channelRequest.pack(this);

                    await this.socketSend(message);
                    this.emit('debug', `Send channel request for: ${channelName}, client id: ${channelManagerId}`);
                } catch (error) {
                    this.emit('error', `Send channelRequest error: ${error}`);
                };
            })
            .on('_on_channelResponse', (message) => {
                this.emit('debug', `Channel response for: ${this.channelName}`);
                if (message.packetDecoded.protectedPayload.channelRequestId == this.channelManagerId) {
                    if (message.packetDecoded.protectedPayload.result == 0) {
                        this.channelStatus = true;
                        this.channelServerId = message.packetDecoded.protectedPayload.targetChannelId;
                        this.emit('message', `Channel ready for: ${this.channelName}`);
                    } else {
                        this.channelStatus = false;
                        this.emit('debug', `Could not open channel: ${this.channelName}`);
                    };
                };
            })
            .on('_on_status', (message) => {
                if (message.packetDecoded.protectedPayload.apps[0] != undefined) {
                    if (this.currentApp != message.packetDecoded.protectedPayload.apps[0].aumId) {
                        const decodedMessage = message.packetDecoded.protectedPayload;
                        this.connectionStatus = true;

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
                        }
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
                this.emit('message', 'Sending power On.');

                this.boot = setInterval(async () => {
                    try {
                        const config = {
                            type: 'simple.powerOn'
                        };
                        let powerOn = new Packer(config);
                        powerOn.set('liveId', this.liveId);
                        const message = powerOn.pack();
                        await this.socketSend(message);

                        if (this.connectionStatus) {
                            resolve(true);
                        };
                    } catch (error) {
                        this.emit('error', `Sending powerOn error: ${error}`);
                        reject({
                            status: 'error',
                            error: `Sending powerOn error: ${error}`
                        });
                    };
                }, 500);
                setTimeout(() => {
                    reject({
                        status: 'error',
                        error: 'Not powered ON, try again.'
                    });
                }, 4500);
            };
            reject({
                status: 'error',
                error: 'Already connected.'
            });
        });
    };

    powerOff() {
        return new Promise(async (resolve, reject) => {
            if (!this.connectionStatus) {
                reject({
                    status: 'error',
                    error: 'Not connected.'
                });
                return;
            };

            this.emit('message', 'Sending power Off.');
            try {
                await this.getRequestNum();
                const config = {
                    type: 'message.powerOff'
                };
                let powerOff = new Packer(config);
                powerOff.set('liveId', this.liveId);
                const message = powerOff.pack(this);
                await this.socketSend(message);

                setTimeout(async () => {
                    try {
                        await this.disconnect();
                        resolve(true);
                    } catch (error) {
                        resolve({
                            status: 'error',
                            state: `Sending disconnect error: ${error}`
                        });
                    };
                }, 2500);
            } catch (error) {
                this.emit('error', `Sending powerOff error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending powerOff error: ${error}`
                });
            };
        });
    };

    recordGameDvr() {
        return new Promise(async (resolve, reject) => {
            if (!this.connectionStatus || !this.isAuthenticated) {
                this.emit('debug', 'Not connected or not authorized, sending record game ignored. ')
                reject({
                    status: 'error',
                    error: `Connection status: ${this.connectionStatus}, Authorization status: ${this.isAuthenticated}`
                });
                return;
            };

            this.emit('debug', 'Sending record game.');
            try {
                await this.getRequestNum();
                const config = {
                    type: 'message.recordGameDvr'
                };
                let recordGameDvr = new Packer(config);
                recordGameDvr.set('startTimeDelta', -60);
                recordGameDvr.set('endTimeDelta', 0);
                const message = recordGameDvr.pack(this);
                await this.socketSend(message);
                resolve(true);
            } catch (error) {
                this.emit('error', `Sending recordGameDvr error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending recordGameDvr error: ${error}`
                });
            };
        });
    };

    //systemMedia
    sendSystemMediaCommand(command) {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 0, 'systemMedia', '48a9ca24eb6d4e128c43d57469edd3cd');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel systemMedia not ready.'
                });
                return;
            };

            if (systemMediaCommands[command] != undefined && !this.blockMultiplePress) {
                this.emit('debug', `systemMedia send command: ${command}`);
                this.blockMultiplePress = true;

                try {
                    let mediaRequestId = 1;
                    let requestId = "0000000000000000";
                    const requestIdLength = requestId.length;
                    requestId = (requestId + mediaRequestId).slice(-requestIdLength);
                    await this.getRequestNum();

                    const config = {
                        type: 'message.mediaCommand'
                    };
                    let mediaCommand = new Packer(config);
                    mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                    mediaCommand.set('titleId', this.mediaState);
                    mediaCommand.set('command', systemMediaCommands[command]);
                    mediaRequestId++
                    mediaCommand.setChannel(this.channelServerId);
                    const message = mediaCommand.pack(this);
                    await this.socketSend(message);
                    this.blockMultiplePress = false;
                    resolve(true);
                } catch (error) {
                    this.emit('error', `Sending mediaCommand error: ${error}`);
                    this.blockMultiplePress = false;
                    reject({
                        status: 'error',
                        error: `Sending mediaCommand error: ${error}`,
                    });
                };
            } else {
                this.emit('debug', `Failed to send command: ${command}`);
                reject({
                    status: 'error',
                    error: `Unknown command: ${command}`,
                    commands: systemMediaCommands
                });
            };
        });
    };

    //systemInput
    sendSystemInputCommand(command) {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 1, 'systemInput', 'fa20b8ca66fb46e0adb60b978a59d35f');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel systemInput not ready.'
                });
                return;
            };

            if (systemInputCommands[command] != undefined && !this.blockMultiplePress) {
                this.emit('debug', `systemInput send command: ${command}`);
                this.blockMultiplePress = true;

                try {
                    await this.getRequestNum();

                    const config = {
                        type: 'message.gamepad'
                    };
                    const timestampNow = new Date().getTime();
                    let gamepadPress = new Packer(config);
                    gamepadPress.set('timestamp', Buffer.from(`000${timestampNow.toString()}`, 'hex'));
                    gamepadPress.set('command', systemInputCommands[command]);
                    gamepadPress.setChannel(this.channelServerId);
                    const message = gamepadPress.pack(this);
                    await this.socketSend(message);

                    setTimeout(async () => {
                        try {
                            await this.getRequestNum();

                            const config1 = {
                                type: 'message.gamepad'
                            };
                            const timestamp = new Date().getTime();
                            let gamepadUnpress = new Packer(config1);
                            gamepadUnpress.set('timestamp', Buffer.from(`000${timestamp.toString()}`, 'hex'));
                            gamepadUnpress.set('command', 0);
                            gamepadUnpress.setChannel(this.channelServerId);
                            const message = gamepadUnpress.pack(this);
                            await this.socketSend(message);
                            this.blockMultiplePress = false;
                            resolve(true);
                        } catch (error) {
                            this.emit('error', `Sending gamepadUnpress error: ${error}`);
                            this.blockMultiplePress = false;
                        };
                    }, 250);
                } catch (error) {
                    this.emit('error', `Sending gamepadPress error: ${error}`);
                    this.blockMultiplePress = false;
                    reject({
                        status: 'error',
                        error: `Sending gamepadPress error: ${error}`
                    });
                };
            } else {
                this.emit('debug', `Failed to send command: ${command}`);
                reject({
                    status: 'error',
                    error: `Unknown command: ${command}`,
                    commands: systemInputCommands
                });
            };
        });
    };

    //tvRemote
    getConfiguration() {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
                return;
            };

            this.emit('debug', 'Get configuration');
            try {
                let messageNum = 0;
                const msgId = `2ed6c0fd.${messageNum++}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetConfiguration",
                    params: null
                };
                const message = await this.createJsonPacket(jsonRequest);
                await this.socketSend(message);
                setTimeout(() => {
                    resolve(this.configuration);
                }, 1000);
            } catch (error) {
                this.emit('error', `Sending GetConfiguration error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending GetConfiguration error: ${error}`
                });
            };
        });
    };

    getHeadendInfo() {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
                return;
            };

            this.emit('debug', 'Get headend info');
            try {
                let messageNum = 0;
                const msgId = `2ed6c0fd.${messageNum++}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetHeadendInfo",
                    params: null
                };
                const message = await this.createJsonPacket(jsonRequest);
                await this.socketSend(message);
                setTimeout(() => {
                    resolve(this.headendInfo);
                }, 1000);
            } catch (error) {
                this.emit('error', `Sending GetHeadendInfo error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending GetHeadendInfo error: ${error}`
                });
            };
        });
    };

    getLiveTVInfo() {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
                return;
            };

            this.emit('debug', 'Get live tv info');
            try {
                let messageNum = 0;
                const msgId = `2ed6c0fd.${messageNum++}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetLiveTVInfo",
                    params: null
                };
                const message = await this.createJsonPacket(jsonRequest);
                await this.socketSend(message);
                setTimeout(() => {
                    resolve(this.liveTv);
                }, 1000);
            } catch (error) {
                this.emit('error', `Sending GetLiveTVInfo error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending GetLiveTVInfo error: ${error}`
                });
            };
        });
    };

    getTunerLineups() {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
                return;
            };

            this.emit('debug', 'Get tuner lineups');
            try {
                let messageNum = 0;
                const msgId = `2ed6c0fd.${messageNum++}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetTunerLineups",
                    params: null
                };
                const message = awaitthis.createJsonPacket(jsonRequest);
                await this.socketSend(message);
                setTimeout(() => {
                    resolve(this.tunerLineups);
                }, 1000);
            } catch (error) {
                this.emit('error', `Sending GetTunerLineups error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending GetTunerLineups error: ${error}`
                });
            };
        });
    };

    getAppChannelLineups() {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
                return;
            };

            this.emit('debug', 'Get appchannel lineups');
            try {
                let messageNum = 0;
                const msgId = `2ed6c0fd.${messageNum++}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetAppChannelLineups",
                    params: null
                };
                const message = await this.createJsonPacket(jsonRequest);
                await this.socketSend(message);
                setTimeout(() => {
                    resolve(this.appChannelLineups);
                }, 1000);
            } catch (error) {
                this.emit('error', `Sending GetAppChannelLineups error: ${error}`);
                reject({
                    status: 'error',
                    error: `Sending GetAppChannelLineups error: ${error}`
                });
            };
        });
    };

    sendIrCommand(command) {
        return new Promise(async (resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (!this.connectionStatus || !this.channelStatus) {
                reject({
                    status: 'error',
                    error: `Unknown command: ${command}`,
                    commands: tvRemoteCommands[command]
                });
                return;
            };

            if (tvRemoteCommands[command] != undefined && !this.blockMultiplePress) {
                this.emit('debug', ` tvRemote send command: ${command}`);
                this.blockMultiplePress = true;

                try {
                    let messageNum = 0;
                    const msgId = `2ed6c0fd.${messageNum++}`;

                    const jsonRequest = {
                        msgid: msgId,
                        request: "SendKey",
                        params: {
                            button_id: tvRemoteCommands[command],
                            device_id: null
                        }
                    };
                    const message = await this.createJsonPacket(jsonRequest);
                    await this.socketSend(message);
                    this.blockMultiplePress = false;
                    resolve(true);
                } catch (error) {
                    this.emit('error', `Sending irCommand error: ${error}`);
                    this.blockMultiplePress = false;
                    reject({
                        status: 'error',
                        error: `Sending irCommand error: ${error}`
                    });
                };
            } else {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
            };
        });
    };

    createJsonPacket(jsonRequest) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.getRequestNum();

                const config = {
                    type: 'message.json'
                };
                let json = new Packer(config);
                json.set('json', JSON.stringify(jsonRequest));
                json.setChannel(this.channelServerId);
                resolve(json.pack(this));
            } catch (error) {
                this.emit('error', `Sending jsonRequest error: ${error}`);
                reject(false);
            };
        });
    };

    socketSend(message) {
        return new Promise((resolve, reject) => {
            if (this.socket && !this.blockMultipleSend) {
                this.blockMultipleSend = true;
                const ip = this.ip;
                const messageLength = message.length;
                this.socket.send(message, 0, messageLength, 5050, ip, (error, bytes) => {
                    if (error) {
                        this.emit('error', `Sending packet error: ${error}`);
                        this.blockMultipleSend = false;
                        reject({
                            status: 'error',
                            error: `Sending message error: ${error}`
                        });
                    };
                    this.emit('debug', `Sending bytes: ${bytes}`);
                    this.blockMultipleSend = false;
                    resolve(true);
                });
            };
        });
    };

    socketReconnect() {
        if (!this.socket) {
            this.emit('debug', 'Socket recnnecting...');
            this.socket.connect();
        };
    };

    disconnect() {
        return new Promise(async (resolve, reject) => {
            this.emit('debug', 'Disconnecting...');
            clearInterval(this.connectToXbox);
            clearInterval(this.checkConnectionTimeout);

            try {
                await this.getRequestNum();
                const config = {
                    type: 'message.disconnect'
                };
                let disconnect = new Packer(config);
                disconnect.set('reason', 4);
                disconnect.set('errorCode', 0);
                const message = disconnect.pack(this);
                await this.socketSend(message);
                this.emit('_on_disconnected');
                resolve(true);
            } catch (error) {
                this.emit('error', `Sending disconnect error: ${error}`);
                reject(false);
            };
        });
        ed
    };

    getRequestNum() {
        return new Promise(async (resolve, reject) => {
            this.requestNum++;
            this.emit('debug', `Request number set to: ${this.requestNum}`);
            resolve(this.requestNum);
        });
    };
};
module.exports = SMARTGLASS;