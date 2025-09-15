import { LocalApi } from '../constants.js';

class Packets {
    constructor(structure) {
        this.structure = structure;

        const types = {
            flags(length, value) {
                const packet = {
                    value,
                    length,
                    pack(packetStructure) {
                        return packetStructure.writeBytes(setFlags(this.value));
                    },
                    unpack(packetStructure) {
                        return readFlags(packetStructure.readBytes(this.length));
                    }
                };
                return packet;
            },

            bytes(length = 0, value = Buffer.alloc(length)) {
                const packet = {
                    value,
                    length,
                    pack(packetStructure) {
                        return packetStructure.writeBytes(this.value);
                    },
                    unpack(packetStructure) {
                        const readLength = this.length > 0 ? this.length : packetStructure.packet.length - packetStructure.offset;
                        return packetStructure.readBytes(readLength);
                    }
                };
                return packet;
            },

            uInt16(value) {
                const packet = {
                    value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt16(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readUInt16();
                    }
                };
                return packet;
            },

            uInt32(value) {
                const packet = {
                    value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt32(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readUInt32();
                    }
                };
                return packet;
            },

            sInt32(value) {
                const packet = {
                    value,
                    pack(packetStructure) {
                        return packetStructure.writeInt32(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readInt32();
                    }
                };
                return packet;
            },

            uInt64(length, value) {
                const packet = {
                    value,
                    length,
                    pack(packetStructure) {
                        return packetStructure.writeBytes(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readBytes(length);
                    }
                };
                return packet;
            },

            sgString(value) {
                const packet = {
                    value,
                    pack(packetStructure) {
                        return packetStructure.writeSGString(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readSGString().toString();
                    }
                };
                return packet;
            },

            sgArray(structure, value = []) {
                const packet = {
                    value,
                    structure,
                    pack(packetStructure) {
                        packetStructure.writeUInt16(this.value.length);
                        const arrayStructure = packets[this.structure];
                        for (const item of this.value) {
                            Object.keys(arrayStructure).forEach(name => {
                                arrayStructure[name].value = item[name];
                                packetStructure = arrayStructure[name].pack(packetStructure);
                            });
                        }
                        return packetStructure;
                    },
                    unpack(packetStructure) {
                        const arrayCount = packetStructure.readUInt16();
                        const array = [];
                        for (let i = 0; i < arrayCount; i++) {
                            const arrayStructure = packets[this.structure];
                            const item = {};
                            Object.keys(arrayStructure).forEach(name => {
                                item[name] = arrayStructure[name].unpack(packetStructure);
                            });
                            array.push(item);
                        }
                        return array;
                    }
                };
                return packet;
            },

            sgList(structure, value = []) {
                const packet = {
                    value,
                    structure,
                    pack(packetStructure) {
                        packetStructure.writeUInt32(this.value.length);
                        const arrayStructure = packets[this.structure];
                        for (const item of this.value) {
                            Object.keys(arrayStructure).forEach(name => {
                                arrayStructure[name].value = item[name];
                                packetStructure = arrayStructure[name].pack(packetStructure);
                            });
                        }
                        return packetStructure;
                    },
                    unpack(packetStructure) {
                        const arrayCount = packetStructure.readUInt32();
                        const array = [];
                        for (let i = 0; i < arrayCount; i++) {
                            const arrayStructure = packets[this.structure];
                            const item = {};
                            Object.keys(arrayStructure).forEach(name => {
                                item[name] = arrayStructure[name].unpack(packetStructure);
                            });
                            array.push(item);
                        }
                        return array;
                    }
                };
                return packet;
            },

            mapper(map, item) {
                const packet = {
                    item,
                    value: false,
                    pack(packetStructure) {
                        return item.pack(packetStructure);
                    },
                    unpack(packetStructure) {
                        const key = item.unpack(packetStructure);
                        return map[key] ?? key;
                    }
                };
                return packet;
            }
        };

        const packets = {
            powerOn: { liveId: types.sgString() },
            json: { json: types.sgString('{}') },
            discoveryRequest: { flags: types.uInt32(0), clientType: types.uInt16(3), minVersion: types.uInt16(0), maxVersion: types.uInt16(2) },
            discoveryResponse: { flags: types.uInt32(0), clientType: types.uInt16(0), consoleName: types.sgString(), uuid: types.sgString(), lastError: types.uInt32(0), certificateLength: types.uInt16(0), certificate: types.bytes() },
            connectRequest: { uuid: types.bytes(16, ''), publicKeyType: types.uInt16(0), publicKey: types.bytes(64, ''), iv: types.bytes(16, ''), payloadProtected: types.bytes() },
            connectResponse: { iv: types.bytes(16, ''), payloadProtected: types.bytes() },
            connectRequestProtected: { userHash: types.sgString(''), token: types.sgString(''), connectRequestNum: types.uInt32(0), connectRequestGroupStart: types.uInt32(0), connectRequestGroupEnd: types.uInt32(1) },
            connectResponseProtected: { connectResult: types.uInt16(1), pairingState: types.uInt16(2), participantId: types.uInt32(0) },
            localJoin: { clientType: types.uInt16(3), nativeWidth: types.uInt16(1080), nativeHeight: types.uInt16(1920), dpiX: types.uInt16(96), dpiY: types.uInt16(96), deviceCapabilities: types.uInt64(8, Buffer.from('ffffffffffffffff', 'hex')), clientVersion: types.uInt32(15), osMajorVersion: types.uInt32(6), osMinorVersion: types.uInt32(2), displayName: types.sgString('Xbox-TV') },
            channelStartRequest: { channelRequestId: types.uInt32(0), titleId: types.uInt32(0), service: types.bytes(16, ''), activityId: types.uInt32(0) },
            channelStartResponse: { channelRequestId: types.uInt32(0), channelTargetId: types.uInt64(8, ''), result: types.uInt32(0) },
            acknowledge: { lowWatermark: types.uInt32(0), processedList: types.sgList('processedList', []), rejectedList: types.sgList('rejectedList', []) },
            processedList: { id: types.uInt32(0) },
            rejectedList: { id: types.uInt32(0) },
            consoleStatus: { liveTvProvider: types.uInt32(0), majorVersion: types.uInt32(0), minorVersion: types.uInt32(0), buildNumber: types.uInt32(0), locale: types.sgString('en-US'), activeTitles: types.sgArray('activeTitle') },
            activeTitle: { flags: types.bytes(2), titleId: types.uInt32(0), productId: types.bytes(16, ''), sandboxId: types.bytes(16, ''), aumId: types.sgString('') },
            recordGameDvr: { startTimeDelta: types.sInt32(0), endTimeDelta: types.sInt32(0) },
            gamepad: { timestamp: types.uInt64(8, ''), buttons: types.uInt16(0), leftTrigger: types.uInt32(0), rightTrigger: types.uInt32(0), leftThumbstickX: types.uInt32(0), leftThumbstickY: types.uInt32(0), rightThumbstickX: types.uInt32(0), rightThumbstickY: types.uInt32(0) },
            mediaState: { titleId: types.uInt32(0), aumId: types.sgString(), assetId: types.sgString(), mediaType: types.mapper(LocalApi.Media.Types, types.uInt16(0)), soundLevel: types.mapper(LocalApi.Media.SoundLevel, types.uInt16(0)), enabledCommands: types.uInt32(0), playbackStatus: types.mapper(LocalApi.Media.PlaybackState, types.uInt16(0)), rate: types.uInt32(0), position: types.uInt64(8, ''), mediaStart: types.uInt64(8, ''), mediaEnd: types.uInt64(8, ''), minSeek: types.uInt64(8, ''), maxSeek: types.uInt64(8, ''), metadata: types.sgArray('mediaStateList', []) },
            mediaStateList: { name: types.sgString(), value: types.sgString() },
            mediaCommand: { requestId: types.uInt64(8, ''), titleId: types.uInt32(0), command: types.uInt32(0) },
            powerOff: { liveId: types.sgString('') },
            disconnect: { reason: types.uInt32(1), errorCode: types.uInt32(0) }
        };

        return packets;
    }
}

export default Packets;
