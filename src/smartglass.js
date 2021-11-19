const dgram = require('dgram');
const Xbox = require('./xbox');
const Packer = require('./packet/packer');
const EventEmitter = require('events').EventEmitter;

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
    menu: 8,
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
    seek: 32786, // Not implemented yet
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

        this.xbox = new Xbox({
            ip: this.ip,
            liveId: this.liveId
        });

        this.connectionStatus = false;
        this.messageReceivedTime = (new Date().getTime()) / 1000;
        this.titleId = '';
        this.currentApp = '';
        this.mediaState = 0;

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
            .on('message', (message, remote) => {
                this.emit('debug', `Server message: ${message} from: ${remote.address}:${remote.port}`);

                const config = {
                    type: message
                };
                message = new Packer(config);

                if (!message.structure) {
                    return;
                };

                const response = message.unpack(this.xbox);
                const type = response.name;
                let func = '';

                if (response.packetDecoded.type != 'd00d') {
                    func = `_on_${type}`;
                    this.emit('debug', `Received type: ${func}`);
                } else {
                    if (response.packetDecoded.targetParticipantId != this.xbox.participantId) {
                        this.emit('debug', 'Participant id does not match. Ignoring packet.');
                        return;
                    }

                    func = `_on_${message.structure.packetDecoded.name}`;
                    this.emit('debug', `Received name: ${func}`);

                    if (response.packetDecoded.flags.needAck == true) {
                        this.emit('debug', 'Packet needs to be acknowledged. Sending response');

                        this.xbox.getRequestNum();
                        const config = {
                            type: 'message.acknowledge'
                        };
                        let acknowledge = new Packer(config);
                        acknowledge.set('lowWatermark', response.packetDecoded.sequenceNumber);
                        acknowledge.structure.structure.processedList.value.push({
                            id: response.packetDecoded.sequenceNumber
                        });
                        const message = acknowledge.pack(this.xbox);

                        try {
                            this.send(message);
                            this.messageReceivedTime = (new Date().getTime()) / 1000;
                        } catch (error) {
                            this.emit('error', error);
                        }
                    }
                }

                if (func == '_on_json') {
                    const jsonMessage = JSON.parse(response.packetDecoded.protectedPayload.json)

                    // Check if JSON is fragmented
                    if (jsonMessage.datagramId != undefined) {
                        this.emit('debug', `_on_json is fragmented: ${jsonMessage.datagramId}`);
                        if (this.xbox.fragments[jsonMessage.datagramId] == undefined) {
                            // Prepare buffer for JSON
                            this.xbox.fragments[jsonMessage.datagramId] = {

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
                                    } catch (e) {
                                        return false;
                                    };
                                    return true;
                                },
                                partials: {}
                            }
                        }

                        this.xbox.fragments[jsonMessage.datagramId].partials[jsonMessage.fragmentOffset] = jsonMessage.fragmentData;
                        if (this.xbox.fragments[jsonMessage.datagramId].isValid() == true) {
                            this.emit('debug', '_on_json: Completed fragmented packet');
                            const jsonResponse = response;
                            jsonResponse.packetDecoded.protectedPayload.json = this.xbox.fragments[jsonMessage.datagramId].getValue().toString();

                            this.emit('_on_json', jsonResponse);
                            this.xbox.fragments[jsonMessage.datagramId] = undefined;
                        }
                        func = '_on_json_fragment';
                    }
                }
                this.emit('debug', `Emit event: ${func}`);
                this.emit(func, response);
            })
            .on('listening', () => {
                const address = this.socket.address();
                this.emit('debug', `Server listening: ${address.address}:${address.port}, start discovering.`);

                setInterval(() => {
                    if (!this.connectionStatus) {
                        const config = {
                            type: 'simple.discoveryRequest'
                        };
                        let discoveryPacket = new Packer(config);
                        const message = discoveryPacket.pack();
                        this.send(message);
                    };
                }, 2500);
            })
            .on('close', () => {
                this.emit('debug', 'Socket closed.');
                setTimeout(() => {
                    this.socketReconnect();
                }, this.reconnect);
            })
            .bind();

        //EventEmmiter
        this.on('_on_discovery', (message) => {
                const discoveredConsoles = new Array();
                discoveredConsoles.push(message.packetDecoded);

                const consolesCount = discoveredConsoles.length;
                if (this.connectionStatus && consolesCount > 0) {
                    discoveredConsoles.splice(0, consolesCount);
                };

                if (consolesCount > 0) {
                    this.emit('debug', 'Discovered.');
                    const uhs = '';
                    const xstsToken = '';
                    const certyficate = (discoveredConsoles[0].certificate).toString('base64').match(/.{0,64}/g).join('\n');

                    setInterval(() => {
                        if (!this.connectionStatus) {
                            const message = this.xbox.connect(uhs, xstsToken, certyficate); {
                                this.send(message);
                            };
                        }
                    }, 3000);
                };
            })
            .on('_on_connectResponse', (message) => {
                if (this.connectionStatus) {
                    this.emit('debug', 'Ignore packet. Already connected.')
                    return;
                };
                clearInterval(this.boot);

                const participantId = message.packetDecoded.protectedPayload.participantId;
                this.xbox.setParticipantId(participantId);

                const connectionResult = message.packetDecoded.protectedPayload.connectResult;
                if (connectionResult == '0') {
                    this.connectionStatus = true;
                    this.emit('_on_connected');

                    this.xbox.getRequestNum();
                    const config = {
                        type: 'message.localJoin'
                    };
                    const localJoin = new Packer(config);
                    const message = localJoin.pack(this.xbox);
                    this.send(message);

                    this.disconnect12s = setInterval(() => {
                        const lastMessageReceivedTime = (Math.trunc(((new Date().getTime()) / 1000) - this.messageReceivedTime));
                        this.emit('debug', `Last received time: ${lastMessageReceivedTime} sec ago.`);

                        if (this.connectionStatus) {
                            if (lastMessageReceivedTime == 5) {

                                this.xbox.getRequestNum();
                                const config = {
                                    type: 'message.acknowledge'
                                };
                                let ack = new Packer(config);
                                ack.set('lowWatermark', this.xbox.requestNum);
                                const ackMessage = ack.pack(this.xbox);

                                this.send(ackMessage);
                                this.emit('message', `Last packet was sent: ${lastMessageReceivedTime} sec ago, reconnect.`);
                            }

                            if (lastMessageReceivedTime > 12) {
                                this.emit('message', `Last packet was sent: ${lastMessageReceivedTime} sec ago.`);
                                this.disconnect();
                            }
                        }
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
            .on('_on_channelOpen', (channelManagerId, channelName, udid) => {
                if (!this.connectionStatus) {
                    this.emit('debug', 'Not connected.')
                    return;
                };
                
                this.emit('message', `Request open channel: ${channelName}`);
                this.channelManagerId = channelManagerId;
                this.channelName = channelName;

                this.xbox.getRequestNum();
                const config = {
                    type: 'message.channelRequest'
                };
                let channelRequest = new Packer(config);
                channelRequest.set('channelRequestId', channelManagerId);
                channelRequest.set('titleId', 0);
                channelRequest.set('service', Buffer.from(udid, 'hex'));
                channelRequest.set('activityId', 0);
                const message = channelRequest.pack(this.xbox);
                this.send(message);
                this.emit('debug', `Send channel request for: ${channelName}, client id: ${channelManagerId}`);
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
                            this.emit('message', `Status changed, app Id: ${titleId}, reference: ${reference}`);
                        }
                        this.titleId = appsArray[appsCount - 1].titleId;
                        this.currentApp = appsArray[appsCount - 1].reference;
                        this.emit('_on_change', decodedMessage, this.mediaState);
                    };
                };
            }).on('_on_disconnected', () => {
                clearInterval(this.disconnect12s);
                this.connectionStatus = false;
                this.emit('message', 'Disconnected.');
            });
    };

    powerOn() {
        return new Promise((resolve, reject) => {
            if (!this.connectionStatus) {
                this.emit('message', 'Sending power on.');

                let counter = 0;
                this.boot = setInterval(() => {
                    const config = {
                        type: 'simple.powerOn'
                    };
                    let powerOn = new Packer(config);
                    powerOn.set('liveId', this.liveId);
                    const message = powerOn.pack();
                    this.send(message);

                    counter += 1;
                    if (counter === 6) {
                        clearInterval(this.boot);
                    }
                }, 750);

                setTimeout(() => {
                    if (this.connectionStatus) {
                        resolve({
                            status: 'success',
                            state: this.connectionStatus
                        });
                    } else {
                        reject({
                            status: 'error',
                            error: 'Not powered ON, try again.'
                        });
                    }
                }, 4500);
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

                this.xbox.getRequestNum();
                const config = {
                    type: 'message.powerOff'
                };
                let powerOff = new Packer(config);
                powerOff.set('liveId', this.liveId);
                const message = powerOff.pack(this.xbox);
                this.send(message);
                this.emit('message', 'Sending power off.');

                setTimeout(() => {
                    this.disconnect();
                    resolve(true);
                }, 3500);
            } else {
                reject({
                    status: 'error',
                    error: 'Not connected.'
                })
            }
        })
    };

    recordGameDvr() {
        return new Promise((resolve, reject) => {
            if (this.connectionStatus) {
                if (this.xbox.isAuthenticated) {

                    this.xbox.getRequestNum();
                    const config = {
                        type: 'message.recordGameDvr'
                    };
                    let recordGameDvr = new Packer(config);
                    recordGameDvr.set('startTimeDelta', -60);
                    recordGameDvr.set('endTimeDelta', 0);
                    const message = recordGameDvr.pack(this.xbox);
                    this.send(message);

                    this.emit('debug', 'Sending record game dvr.');
                    resolve(true);
                } else {
                    reject({
                        status: 'error',
                        error: 'Game DVR record function requires an authenticated user.'
                    });
                }
            } else {
                reject({
                    status: 'error',
                    error: 'Not connected.'
                });
            };
        });
    };

    //systemMedia
    sendSystemMediaCommand(command) {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 0, 'systemMedia', '48a9ca24eb6d4e128c43d57469edd3cd');

            if (this.connectionStatus && this.channelStatus) {
                if (systemMediaCommands[command] != undefined) {
                    this.emit('debug', `systemMedia send media command: ${command}`);

                    let mediaRequestId = 1;
                    let requestId = "0000000000000000";
                    const requestIdLength = requestId.length;
                    requestId = (requestId + mediaRequestId).slice(-requestIdLength);
                    this.xbox.getRequestNum();

                    const config = {
                        type: 'message.mediaCommand'
                    };
                    let mediaCommand = new Packer(config);
                    mediaCommand.set('requestId', Buffer.from(requestId, 'hex'));
                    mediaCommand.set('titleId', this.mediaState);
                    mediaCommand.set('command', systemMediaCommands[command]);
                    mediaRequestId++
                    mediaCommand.setChannel(this.channelServerId);

                    const message = mediaCommand.pack(this.xbox);
                    this.send(message);

                    resolve({
                        status: 'success',
                        command: command
                    });
                } else {
                    this.emit('debug', `Failed to send command: ${command}`);
                    reject({
                        status: 'error',
                        error: `Unknown command: ${command}`,
                        commands: systemMediaCommands
                    });
                };
            } else {
                reject({
                    status: 'error',
                    error: 'Channel systemMedia not ready.'
                });
            };
        });
    };

    //systemInput
    sendSystemInputCommand(command) {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 1, 'systemInput', 'fa20b8ca66fb46e0adb60b978a59d35f');

            if (this.connectionStatus && this.channelStatus) {
                this.emit('debug', `systemInput send command: ${command}`);

                if (systemInputCommands[command] != undefined) {
                    const timestampNow = new Date().getTime();
                    this.xbox.getRequestNum();

                    const config = {
                        type: 'message.gamepad'
                    };
                    let gamepadPress = new Packer(config);
                    gamepadPress.set('timestamp', Buffer.from('000' + timestampNow.toString(), 'hex'));
                    gamepadPress.set('command', systemInputCommands[command]);
                    gamepadPress.setChannel(this.channelServerId);

                    const message = gamepadPress.pack(this.xbox);
                    this.send(message);

                    setTimeout(() => {
                        const timestamp = new Date().getTime();
                        this.xbox.getRequestNum();

                        let gamepadUnpress = new Packer(config);
                        gamepadUnpress.set('timestamp', Buffer.from('000' + timestamp.toString(), 'hex'));
                        gamepadUnpress.set('command', 0);
                        gamepadUnpress.setChannel(this.channelServerId);

                        const message = gamepadUnpress.pack(this.xbox);
                        this.send(message);

                        resolve({
                            status: 'success',
                            command: command
                        });
                    }, 200);
                } else {
                    this.emit('debug', `Failed to send command: ${command}`);
                    reject({
                        status: 'error',
                        error: `Unknown command: ${command}`,
                        commands: systemInputCommands
                    });
                };
            } else {
                reject({
                    status: 'error',
                    error: 'Channel systemInput not ready.'
                })
            };
        });
    };

    //tvRemote
    getConfiguration() {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (this.connectionStatus && this.channelStatus) {
                this.emit('debug', 'Get configuration');

                let messageNum = 0;
                messageNum++
                const msgId = `2ed6c0fd.${messageNum}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetConfiguration",
                    params: null
                }

                const message = this.createJsonPacket(jsonRequest);
                this.send(message);

                setTimeout(() => {
                    resolve(this.configuration);
                }, 1000);
            } else {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
            };
        });
    };

    getHeadendInfo() {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (this.connectionStatus && this.channelStatus) {
                this.emit('debug', 'Get headend info');

                let messageNum = 0;
                messageNum++
                const msgId = `2ed6c0fd.${messageNum}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetHeadendInfo",
                    params: null
                };

                const message = this.createJsonPacket(jsonRequest);
                this.send(message);

                setTimeout(() => {
                    resolve(this.headendInfo);
                }, 1000);
            } else {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
            };
        });
    };

    getLiveTVInfo() {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (this.connectionStatus && this.channelStatus) {
                this.emit('debug', 'Get live tv info');

                let messageNum = 0;
                messageNum++
                const msgId = `2ed6c0fd.${messageNum}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetLiveTVInfo",
                    params: null
                }

                const message = this.createJsonPacket(jsonRequest);
                this.send(message);

                setTimeout(() => {
                    resolve(this.liveTv);
                }, 1000);
            } else {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
            };
        });
    };

    getTunerLineups() {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (this.connectionStatus && this.channelStatus) {
                this.emit('debug', 'Get tuner lineups');

                let messageNum = 0;
                messageNum++
                const msgId = `2ed6c0fd.${messageNum}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetTunerLineups",
                    params: null
                };

                const message = this.createJsonPacket(jsonRequest);
                this.send(message);

                setTimeout(() => {
                    resolve(this.tunerLineups);
                }, 1000);
            } else {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
            };
        });
    };

    getAppChannelLineups() {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');

            if (this.connectionStatus && this.channelStatus) {
                this.emit('debug', 'Get appchannel lineups');

                let messageNum = 0;
                messageNum++
                const msgId = `2ed6c0fd.${messageNum}`;

                const jsonRequest = {
                    msgid: msgId,
                    request: "GetAppChannelLineups",
                    params: null
                }

                const message = this.createJsonPacket(jsonRequest);
                this.send(message);

                setTimeout(() => {
                    resolve(this.appChannelLineups);
                }, 1000);
            } else {
                reject({
                    status: 'error',
                    error: 'Channel tvRemote not ready.'
                });
            };
        });
    };

    sendIrCommand(command) {
        return new Promise((resolve, reject) => {
            this.emit('_on_channelOpen', 2, 'tvRemote', 'd451e3b360bb4c71b3dbf994b1aca3a7');
            if (this.connectionStatus && this.channelStatus) {
                if (tvRemoteCommands[command] != undefined) {
                    this.emit('debug', ` tvRemote send command: ${command}`);

                    let messageNum = 0;
                    messageNum++
                    const msgId = `2ed6c0fd.${messageNum}`;

                    const jsonRequest = {
                        msgid: msgId,
                        request: "SendKey",
                        params: {
                            button_id: tvRemoteCommands[command],
                            device_id: null
                        }
                    };

                    const message = this.createJsonPacket(jsonRequest);
                    this.send(message);

                    resolve({
                        status: 'success',
                        command: command
                    });
                } else {
                    this.emit('debug', `Failed to send command: ${command}`);
                    reject({
                        status: 'error',
                        error: `Unknown command: ${command}`,
                        commands: tvRemoteCommands
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
        this.xbox.getRequestNum();

        const config = {
            type: 'message.json'
        };
        let json = new Packer(config);
        json.set('json', JSON.stringify(jsonRequest));
        json.setChannel(this.channelServerId);
        return json.pack(this.xbox);
    };

    send(message) {
        if (this.socket) {
            const ip = this.ip;
            const messageLength = message.length;
            this.socket.send(message, 0, messageLength, 5050, ip, (err, bytes) => {
                this.emit('debug', `Sending packet: ${message.toString('hex')}`);
            });
        };
    };

    socketReconnect() {
        if (!this.socket) {
            this.emit('debug', 'Socket recnnecting...');
            this.socket = dgram.createSocket('udp4');
        }
    };

    disconnect() {
        this.emit('debug', 'Disconnecting...');

        this.xbox.getRequestNum();
        const config = {
            type: 'message.disconnect'
        };
        let disconnect = new Packer(config);
        disconnect.set('reason', 4);
        disconnect.set('errorCode', 0);
        const message = disconnect.pack(this.xbox);
        this.send(message);
        this.emit('_on_disconnected');
    };
}

module.exports = SMARTGLASS;