"use strict";
const PacketStructure = require('./structure.js');

class SIMPLE {
    constructor(type, packetData = false) {
        this.packetType = type;
        this.packetFormat = type;
        this.packetData = packetData;
        this.structureProtected = false;

        const Type = {
            uInt32(value) {
                const packet = {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt32(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readUInt32();
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
                        return packetStructure.readUInt16();
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
                        return packetStructure.readBytes(length);
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
                        return packetStructure.readSGString().toString();
                    }
                }
                return packet;
            }
        };

        const Packet = {
            powerOn: {
                liveId: Type.sgString(),
            },
            discoveryRequest: {
                flags: Type.uInt32('0'),
                clientType: Type.uInt16('3'),
                minVersion: Type.uInt16('0'),
                maxVersion: Type.uInt16('2')
            },
            discoveryResponse: {
                flags: Type.uInt32('0'),
                clientType: Type.uInt16('0'),
                name: Type.sgString(),
                uuid: Type.sgString(),
                lastError: Type.uInt32('0'),
                certificateLength: Type.uInt16('0'),
                certificate: Type.bytes()
            },
            connectRequest: {
                uuid: Type.bytes(16, ''),
                publicKeyType: Type.uInt16('0'),
                publicKey: Type.bytes(64, ''),
                iv: Type.bytes(16, ''),
                protectedPayload: Type.bytes()
            },
            connectResponse: {
                iv: Type.bytes(16, ''),
                protectedPayload: Type.bytes()
            },
            connectRequestProtected: {
                userHash: Type.sgString(''),
                jwt: Type.sgString(''),
                connectRequestNum: Type.uInt32('0'),
                connectRequestGroupStart: Type.uInt32('0'),
                connectRequestGroupEnd: Type.uInt32('1')
            },
            connectResponseProtected: {
                connectResult: Type.uInt16('1'),
                pairingState: Type.uInt16('2'),
                participantId: Type.uInt32('0')
            },
        };
        this.packet = Packet;
        this.structure = Packet[type];

        // Load protected payload PacketStructure
        if (this.structure.protectedPayload !== undefined) {
            this.protectedPayload = new PacketStructure();
            this.structureProtected = Packet[`${type}Protected`];
        };
    };

    set(key, value, isProtected = false) {
        if (!isProtected) {
            this.structure[key].value = value;
            if (this.structure[key].length !== undefined) {
                this.structure[key].length = value.length;
            }
        } else {
            this.structureProtected[key].value = value;
            if (this.structureProtected[key].length !== undefined) {
                this.structureProtected[key].length = value.length;
            }
        }
    }

    pack(xboxlocalapi = false) {
        const payload = new PacketStructure();
        const type = this.packetType;
        let packet = '';

        for (const name in this.structure) {
            switch (name) {
                case 'protectedPayload':
                    let protectedStructure = this.structureProtected;
                    for (const nameStruct in protectedStructure) {
                        if (this.structure.protectedPayload.value !== undefined) {
                            protectedStructure[nameStruct].value = this.structure.protectedPayload.value[nameStruct];
                        }
                        protectedStructure[nameStruct].pack(this.protectedPayload);
                    }
                    this.protectedPayloadLength = this.protectedPayload.toBuffer().length;

                    // Pad packet
                    if (this.protectedPayload.toBuffer().length % 16 > 0) {
                        const padStart = this.protectedPayload.toBuffer().length % 16;
                        const padTotal = 16 - padStart;
                        for (let paddingnum = padStart + 1; paddingnum <= 16; paddingnum++) {
                            this.protectedPayload.writeUInt8(padTotal);
                        }
                    }
                    this.protectedPayloadLengthReal = this.protectedPayload.toBuffer().length;
                    const encryptionKey = xboxlocalapi.crypto.getKey();
                    const encryptedPayload = xboxlocalapi.crypto.encrypt(this.protectedPayload.toBuffer(), encryptionKey, this.structure.iv.value);
                    payload.writeBytes(encryptedPayload);
                    break;
                default:
                    this.structure[name].pack(payload);
            }
        }

        switch (type) {
            case 'powerOn':
                packet = this.pack1(Buffer.from('dd02', 'hex'), payload.toBuffer(), '');
                break;
            case 'discoveryRequest':
                packet = this.pack1(Buffer.from('dd00', 'hex'), payload.toBuffer(), Buffer.from('0000', 'hex'));
                break;
            case 'discoveryResponse':
                packet = this.pack1(Buffer.from('dd01', 'hex'), payload.toBuffer(), '2');
                break;
            case 'connectRequest':
                packet = this.pack1(Buffer.from('cc00', 'hex'), payload.toBuffer(), Buffer.from('0002', 'hex'), this.protectedPayloadLength, this.protectedPayloadLengthReal);
                // Sign protected payload
                const protectedPayloadHash = xboxlocalapi.crypto.sign(packet);
                packet = Buffer.concat([
                    packet,
                    Buffer.from(protectedPayloadHash)
                ]);
                break;
            case 'connectResponse':
                packet = this.pack1(Buffer.from('cc01', 'hex'), payload.toBuffer(), '2')
                break;
            case 'connectRequestProtected':
                // Pad packet
                if (payload.toBuffer().length > 16) {
                    const padStart = payload.toBuffer().length % 16;
                    const padTotal = (16 - padStart);
                    for (let paddingnum = (padStart + 1); paddingnum <= 16; paddingnum++) {
                        payload.writeUInt8(padTotal);
                    };
                };
                const iv = xboxlocalapi.crypto.getIv();
                let encryptedPayload = xboxlocalapi.crypto.encrypt(payload.toBuffer(), iv);
                encryptedPayload = new PacketStructure(encryptedPayload)
                packet = encryptedPayload.toBuffer();
                break;
            default:
                packet = payload.toBuffer();
        };
        return packet;
    };

    pack1(type, payload, version, protectedPayloadLength = false, protectedPayloadLengthReal = 0) {
        let payloadLength = new PacketStructure();
        let packet = '';

        if (protectedPayloadLength) {
            payloadLength.writeUInt16(payload.length - protectedPayloadLengthReal);
            payloadLength = payloadLength.toBuffer();

            let protectedLength = new PacketStructure();
            protectedLength.writeUInt16(protectedPayloadLength);
            protectedLength = protectedLength.toBuffer();

            packet = Buffer.concat([
                type,
                payloadLength,
                protectedLength,
                version,
                payload
            ]);
        } else {
            payloadLength.writeUInt16(payload.length);
            payloadLength = payloadLength.toBuffer();

            packet = Buffer.concat([
                type,
                payloadLength,
                Buffer.from([0, version]),
                payload
            ]);
        }
        return packet;
    };

    unpack(xboxlocalapi = undefined) {
        const Packet = this.packet;
        const packetFormat = this.packetFormat;
        const payload = new PacketStructure(this.packetData);

        let packet = {
            type: payload.readBytes(2).toString('hex'),
            payloadLength: payload.readUInt16(),
            version: payload.readUInt16()
        };

        if (packet.version !== 0 && packet.version !== 2) {
            packet.protectedPayloadLength = packet.version;
            packet.version = payload.readUInt16();
        }

        for (const name in this.structure) {
            packet[name] = this.structure[name].unpack(payload);
            this.set(name, packet[name]);
        }

        // Lets decrypt the data when the payload is encrypted
        if (packet.protectedPayload !== undefined) {
            packet.protectedPayload = packet.protectedPayload.slice(0, -32);
            packet.signature = packet.protectedPayload.slice(-32);

            const iv = packet.iv;
            const protectedPayloadLength = packet.protectedPayloadLength;
            let decryptedPayload = xboxlocalapi.crypto.decrypt(packet.protectedPayload, iv);
            decryptedPayload = decryptedPayload.slice(0, protectedPayloadLength);
            decryptedPayload = new PacketStructure(decryptedPayload);

            const protectedStructure = Packet[`${packetFormat}Protected`];
            packet.protectedPayload = {};

            for (const name in protectedStructure) {
                packet.protectedPayload[name] = protectedStructure[name].unpack(decryptedPayload);
                this.set('protectedPayload', packet.protectedPayload);
            }
        }

        const packetType = (packet.type === 'dd02') ? 'powerOn' : this.packetType;
        const data = { packetType: packetType, packetDecoded: packet };
        return data;
    }
};
module.exports = SIMPLE;