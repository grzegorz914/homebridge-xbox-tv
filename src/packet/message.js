const PacketStructure = require('./structure');
const hexToBin = require('hex-to-binary');

const playbackStatus = {
    0: 'Closed',
    1: 'Changing',
    2: 'Stopped',
    3: 'Playing',
    4: 'Paused'
};

const mediaTypes = {
    0: 'No Media',
    1: 'Music',
    2: 'Video',
    3: 'Image',
    4: 'Conversation',
    5: 'Game'
};

const soundStatus = {
    0: 'Muted',
    1: 'Low',
    2: 'Full'
};

class MESSAGE {
    constructor(type, packetData = false) {
        this.type = 'message';
        this.name = type;
        this.packetData = packetData;
        this.packetDecoded = false;
        this.channelId = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00');

        const Type = {
            uInt32(value) {
                const packet = {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt32(this.value);
                    },
                    unpack(packetStructure) {
                        this.value = packetStructure.readUInt32();
                        return this.value;
                    }
                }
                return packet;
            },
            sInt32(value) {
                const packet = {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeInt32(this.value);
                    },
                    unpack(packetStructure) {
                        this.value = packetStructure.readInt32();
                        return this.value;
                    }
                }
                return packet;
            },
            uInt16(value) {
                const packet = {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt16(this.value);
                    },
                    unpack(packetStructure) {
                        this.value = packetStructure.readUInt16();
                        return this.value;
                    }
                }
                return packet;
            },
            bytes(length, value) {
                const packet = {
                    value: value,
                    length: length,
                    pack(packetStructure) {
                        return packetStructure.writeBytes(this.value);
                    },
                    unpack(packetStructure) {
                        this.value = packetStructure.readBytes(length);
                        return this.value;
                    }
                }
                return packet;
            },
            sgString(value) {
                const packet = {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeSGString(this.value);
                    },
                    unpack(packetStructure) {
                        this.value = packetStructure.readSGString().toString();
                        return this.value;
                    }
                }
                return packet;
            },
            flags(length, value) {
                const packet = {
                    value: value,
                    length: length,
                    pack(packetStructure) {
                        return packetStructure.writeBytes(setFlags(this.value));
                    },
                    unpack(packetStructure) {
                        this.value = readFlags(packetStructure.readBytes(this.length));
                        return this.value;
                    }
                }
                return packet;
            },
            sgArray(structure, value) {
                const packet = {
                    value: value,
                    structure: structure,
                    pack(packetStructure) {
                        packetStructure.writeUInt16(this.value.length);
                        let arrayStructure = Packet[this.structure];
                        for (let index in this.value) {
                            for (let name in arrayStructure) {
                                arrayStructure[name].value = this.value[index][name]
                                packetStructure = arrayStructure[name].pack(packetStructure);
                            }
                        }
                        return packetStructure;
                    },
                    unpack(packetStructure) {
                        const arrayCount = packetStructure.readUInt16();
                        const array = new Array();

                        for (let i = 0; i < arrayCount; i++) {
                            const arrayStructure = Packet[this.structure];
                            let item = {};

                            for (let name in arrayStructure) {
                                item[name] = arrayStructure[name].unpack(packetStructure);
                            }
                            array.push(item);
                        }
                        this.value = array;
                        return this.value;
                    }
                }
                return packet;
            },
            sgList(structure, value) {
                const packet = {
                    value: value,
                    structure: structure,
                    pack(packetStructure) {
                        packetStructure.writeUInt32(this.value.length);

                        let arrayStructure = Packet[this.structure];
                        for (let index in this.value) {
                            for (let name in arrayStructure) {
                                arrayStructure[name].value = this.value[index][name]
                                packetStructure = arrayStructure[name].pack(packetStructure);
                            }
                        }
                        return packetStructure;
                    },
                    unpack(packetStructure) {
                        const arrayCount = packetStructure.readUInt32();
                        const array = new Array();

                        for (let i = 0; i < arrayCount; i++) {
                            const arrayStructure = Packet[this.structure];
                            let item = {};

                            for (let name in arrayStructure) {
                                item[name] = arrayStructure[name].unpack(packetStructure);
                            }
                            array.push(item);
                        }
                        this.value = array;
                        return this.value;
                    }
                }
                return packet;
            },
            mapper(map, item) {
                const packet = {
                    item: item,
                    value: false,
                    pack(packetStructure) {
                        return item.pack(packetStructure);
                    },
                    unpack(packetStructure) {
                        this.value = item.unpack(packetStructure);
                        return map[this.value];
                    }
                }
                return packet;
            }
        };

        const Packet = {
            status: {
                liveTvProvider: Type.uInt32('0'),
                majorVersion: Type.uInt32('0'),
                minorVersion: Type.uInt32('0'),
                buildNumber: Type.uInt32('0'),
                locale: Type.sgString('en-US'),
                apps: Type.sgArray('activeApps')
            },
            activeApps: {
                titleId: Type.uInt32('0'),
                flags: Type.bytes(2),
                productId: Type.bytes(16, ''),
                sandboxId: Type.bytes(16, ''),
                aumId: Type.sgString('')
            },
            powerOff: {
                liveId: Type.sgString(''),
            },
            acknowledge: {
                lowWatermark: Type.uInt32('0'),
                processedList: Type.sgList('acknowledgeList', []),
                rejectedList: Type.sgList('acknowledgeList', []),
            },
            acknowledgeList: {
                id: Type.uInt32('0'),
            },
            recordGameDvr: {
                startTimeDelta: Type.sInt32('0'),
                endTimeDelta: Type.sInt32('0'),
            },
            channelRequest: {
                channelRequestId: Type.uInt32('0'),
                titleId: Type.uInt32('0'),
                service: Type.bytes(16, ''),
                activityId: Type.uInt32('0'),
            },
            channelResponse: {
                channelRequestId: Type.uInt32('0'),
                channelTargetId: Type.bytes(8, ''),
                result: Type.uInt32('0'),
            },
            gamepad: {
                timestamp: Type.bytes(8, ''),
                buttons: Type.uInt16('0'),
                leftTrigger: Type.uInt32('0'),
                rightTrigger: Type.uInt32('0'),
                leftThumbstickX: Type.uInt32('0'),
                leftThumbstickY: Type.uInt32('0'),
                rightThumbstickX: Type.uInt32('0'),
                rightThumbstickY: Type.uInt32('0'),
            },
            mediaState: {
                titleId: Type.uInt32('0'),
                aumId: Type.sgString(),
                assetId: Type.sgString(),
                mediaType: Type.mapper(mediaTypes, Type.uInt16('0')),
                soundLevel: Type.mapper(soundStatus, Type.uInt16('0')),
                enabledCommands: Type.uInt32('0'),
                playbackStatus: Type.mapper(playbackStatus, Type.uInt16('0')),
                rate: Type.uInt32('0'),
                position: Type.bytes(8, ''),
                enabmediaStart: Type.bytes(8, ''),
                mediaEnd: Type.bytes(8, ''),
                minSeek: Type.bytes(8, ''),
                maxSeek: Type.bytes(8, ''),
                metadata: Type.sgArray('mediaStateList', []),
            },
            mediaStateList: {
                name: Type.sgString(),
                value: Type.sgString(),
            },
            mediaCommand: {
                requestId: Type.bytes(8, ''),
                titleId: Type.uInt32('0'),
                command: Type.uInt32('0'),
            },
            localJoin: {
                clientType: Type.uInt16('3'),
                nativeWidth: Type.uInt16('1080'),
                nativeHeight: Type.uInt16('1920'),
                dpiX: Type.uInt16('96'),
                dpiY: Type.uInt16('96'),
                deviceCapabilities: Type.bytes(8, Buffer.from('ffffffffffffffff', 'hex')),
                clientVersion: Type.uInt32('15'),
                osMajorVersion: Type.uInt32('6'),
                osMinorVersion: Type.uInt32('2'),
                displayName: Type.sgString('Xbox-Smartglass-Node'),
            },
            json: {
                json: Type.sgString('{}')
            },
            disconnect: {
                reason: Type.uInt32('1'),
                errorCode: Type.uInt32('0')
            },
        };
        this.packet = Packet;
        this.structure = Packet[type];
    };

    getMsgType(type) {
        const messageTypes = {
            0x1: "acknowledge",
            0x2: "Group",
            0x3: "localJoin",
            0x5: "StopActivity",
            0x19: "AuxilaryStream",
            0x1A: "ActiveSurfaceChange",
            0x1B: "Navigate",
            0x1C: "json",
            0x1D: "Tunnel",
            0x1E: "status",
            0x1F: "TitleTextConfiguration",
            0x20: "TitleTextInput",
            0x21: "TitleTextSelection",
            0x22: "MirroringRequest",
            0x23: "TitleLaunch",
            0x26: "channelRequest",
            0x27: "channelResponse",
            0x28: "StopChannel",
            0x29: "System",
            0x2A: "disconnect",
            0x2E: "TitleTouch",
            0x2F: "Accelerometer",
            0x30: "Gyrometer",
            0x31: "Inclinometer",
            0x32: "Compass",
            0x33: "Orientation",
            0x36: "PairedIdentityStateChanged",
            0x37: "Unsnap",
            0x38: "recordGameDvr",
            0x39: "powerOff",
            0xF00: "MediaControllerRemoved",
            0xF01: "mediaCommand",
            0xF02: "mediaCommandResult",
            0xF03: "mediaState",
            0xF0A: "gamepad",
            0xF2B: "SystemTextConfiguration",
            0xF2C: "SystemTextInput",
            0xF2E: "SystemTouch",
            0xF34: "SystemTextAck",
            0xF35: "SystemTextDone"
        }
        return messageTypes[type];
    };

    readFlags(flags) {
        flags = hexToBin(flags.toString('hex'));
        const needAck = (flags.slice(2, 3) == 1) ? true : false;
        const isFragment = (flags.slice(3, 4) == 1) ? true : false;
        const type = this.getMsgType(parseInt(flags.slice(4, 16), 2));

        const packet = {
            'version': parseInt(flags.slice(0, 2), 2).toString(),
            'needAck': needAck,
            'isFragment': isFragment,
            'type': type
        };
        return packet;
    };

    setFlags(type) {
        const messageFlags = {
            acknowledge: Buffer.from('8001', 'hex'),
            0x2: "Group",
            localJoin: Buffer.from('2003', 'hex'),
            0x5: "StopActivity",
            0x19: "AuxilaryStream",
            0x1A: "ActiveSurfaceChange",
            0x1B: "Navigate",
            json: Buffer.from('a01c', 'hex'),
            0x1D: "Tunnel",
            status: Buffer.from('a01e', 'hex'),
            0x1F: "TitleTextConfiguration",
            0x20: "TitleTextInput",
            0x21: "TitleTextSelection",
            0x22: "MirroringRequest",
            0x23: "TitleLaunch",
            channelRequest: Buffer.from('a026', 'hex'),
            channelResponse: Buffer.from('a027', 'hex'),
            0x28: "StopChannel",
            0x29: "System",
            disconnect: Buffer.from('802a', 'hex'),
            0x2E: "TitleTouch",
            0x2F: "Accelerometer",
            0x30: "Gyrometer",
            0x31: "Inclinometer",
            0x32: "Compass",
            0x33: "Orientation",
            0x36: "PairedIdentityStateChanged",
            0x37: "Unsnap",
            recordGameDvr: Buffer.from('a038', 'hex'),
            powerOff: Buffer.from('a039', 'hex'),
            0xF00: "MediaControllerRemoved",
            mediaCommand: Buffer.from('af01', 'hex'),
            mediaCommandResult: Buffer.from('af02', 'hex'),
            mediaState: Buffer.from('af03', 'hex'),
            gamepad: Buffer.from('8f0a', 'hex'),
            0xF2B: "SystemTextConfiguration",
            0xF2C: "SystemTextInput",
            0xF2E: "SystemTouch",
            0xF34: "SystemTextAck",
            0xF35: "SystemTextDone"
        };
        return messageFlags[type];
    };

    setChannel(channelId) {
        this.channelId = Buffer.from(channelId);
    };

    set(key, value, subkey = false) {
        if (subkey == false) {
            this.structure[key].value = value;
        } else {
            this.structure[subkey][key].value = value;
        };
    };

    unpack(smartglass = undefined) {
        const payload = new PacketStructure(this.packetData);
        const Packet = this.packet;

        let packet = {
            type: payload.readBytes(2).toString('hex'),
            payloadLength: payload.readUInt16(),
            sequenceNumber: payload.readUInt32(),
            targetParticipantId: payload.readUInt32(),
            sourceParticipantId: payload.readUInt32(),
            flags: this.readFlags(payload.readBytes(2)),
            channelId: payload.readBytes(8),
            protectedPayload: payload.readBytes()
        };
        this.setChannel(packet.channelId);

        packet.name = packet.flags.type;
        this.name = packet.flags.type;

        packet.protectedPayload = Buffer.from(packet.protectedPayload.slice(0, -32));
        packet.signature = packet.protectedPayload.slice(-32);

        // Lets decrypt the data when the payload is encrypted
        if (packet.protectedPayload != undefined) {
            const key = smartglass.crypto.encrypt(this.packetData.slice(0, 16), smartglass.crypto.getIv());

            let decryptedPayload = smartglass.crypto.decrypt(packet.protectedPayload, key);
            packet.decryptedPayload = new PacketStructure(decryptedPayload).toBuffer();
            decryptedPayload = new PacketStructure(decryptedPayload);

            this.structure = Packet[packet.name];
            const protectedStructure = Packet[packet.name];
            packet['protectedPayload'] = {};

            for (let name in protectedStructure) {
                packet.protectedPayload[name] = protectedStructure[name].unpack(decryptedPayload);
            };
        };
        this.packetDecoded = packet;
        return this;
    };

    pack(smartglass) {
        const payload = new PacketStructure();

        for (let name in this.structure) {
            this.structure[name].pack(payload);
        };
        smartglass.getRequestNum();

        const header = new PacketStructure();
        header.writeBytes(Buffer.from('d00d', 'hex'))
        header.writeUInt16(payload.toBuffer().length);
        header.writeUInt32(smartglass.requestNum);
        header.writeUInt32(smartglass.targetParticipantId);
        header.writeUInt32(smartglass.sourceParticipantId);
        header.writeBytes(this.setFlags(this.name));
        header.writeBytes(this.channelId);

        if (payload.toBuffer().length % 16 > 0) {
            const padStart = payload.toBuffer().length % 16;
            const padTotal = (16 - padStart);
            for (let paddingNum = (padStart + 1); paddingNum <= 16; paddingNum++) {
                payload.writeUInt8(padTotal);
            };
        };

        const key = smartglass.crypto.encrypt(header.toBuffer().slice(0, 16), smartglass.crypto.getIv());
        const encryptedPayload = smartglass.crypto.encrypt(payload.toBuffer(), smartglass.crypto.getEncryptionKey(), key);

        let packet = Buffer.concat([
            header.toBuffer(),
            encryptedPayload
        ]);

        const protectedPayloadHash = smartglass.crypto.sign(packet);
        packet = Buffer.concat([
            packet,
            Buffer.from(protectedPayloadHash)
        ]);
        return packet;
    };
};
module.exports = MESSAGE;