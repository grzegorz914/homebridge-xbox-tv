const PacketStructure = require('./structure');

class SIMPLE {
    constructor(packetFormat, packetData = false) {

        this.type = 'simple';
        this.name = packetFormat;
        this.packetData = packetData;
        this.packetDecoded = false;
        this.structureProtected = false;

        const Type = {
            uInt32(value) {
                return {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt32(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readUInt32();
                    }
                }
            },
            uInt16(value) {
                return {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeUInt16(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readUInt16();
                    }
                }
            },
            bytes(length, value) {
                return {
                    value: value,
                    length: length,
                    pack(packetStructure) {
                        return packetStructure.writeBytes(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readBytes(length);
                    }
                }
            },
            sgString(value) {
                return {
                    value: value,
                    pack(packetStructure) {
                        return packetStructure.writeSGString(this.value);
                    },
                    unpack(packetStructure) {
                        return packetStructure.readSGString().toString();
                    }
                }
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
            discovery: {
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
            connectRequestProtected: {
                userhash: Type.sgString(''),
                jwt: Type.sgString(''),
                connectRequestNum: Type.uInt32('0'),
                connectRequestGroupStart: Type.uInt32('0'),
                connectRequestGroupEnd: Type.uInt32('1')
            },
            connectResponse: {
                iv: Type.bytes(16, ''),
                protectedPayload: Type.bytes()
            },
            connectResponseProtected: {
                connectResult: Type.uInt16('1'),
                pairingState: Type.uInt16('2'),
                participantId: Type.uInt32('0')
            },
        };
        this.structure = Packet[packetFormat];

        // Load protected payload PacketStructure
        if (this.structure.protectedPayload != undefined) {
            this.protectedPayload = new PacketStructure();
            const protectedStructure = Packet[`${packetFormat}Protected`];
            this.structureProtected = protectedStructure;
        }
        this.packet = Packet;
        this.packetFormat = packetFormat;
    };

    set(key, value, isProtected = false) {
        if (isProtected == false) {
            this.structure[key].value = value;
            if (this.structure[key].length != undefined) {
                this.structure[key].length = value.length;
            };
        } else {
            this.structureProtected[key].value = value;
            if (this.structureProtected[key].length != undefined) {
                this.structureProtected[key].length = value.length;
            };
        };
    };

    unpack(xbox = undefined) {
        const Packet = this.packet;
        const packetFormat = this.packetFormat;
        const payload = new PacketStructure(this.packetData);

        let packet = {
            type: payload.readBytes(2).toString('hex'),
            payloadLength: payload.readUInt16(),
            version: payload.readUInt16()
        }

        if (packet.version != '0' && packet.version != '2') {
            packet.protectedPayloadLength = packet.version;
            packet.version = payload.readUInt16();
        }

        for (let name in this.structure) {
            packet[name] = this.structure[name].unpack(payload);
            this.set(name, packet[name]);
        }

        if (packet.type == 'dd02') {
            this.name = 'powerOn';
        }

        // Lets decrypt the data when the payload is encrypted
        if (packet.protectedPayload != undefined) {

            packet.protectedPayload = packet.protectedPayload.slice(0, -32);
            packet.signature = packet.protectedPayload.slice(-32);

            let decryptedPayload = xbox.crypto.decrypt(packet.protectedPayload, packet.iv).slice(0, packet.protectedPayloadLength);
            decryptedPayload = new PacketStructure(decryptedPayload);

            const protectedStructure = Packet[`${packetFormat}Protected`];
            packet.protectedPayload = {};

            for (let name in protectedStructure) {
                packet.protectedPayload[name] = protectedStructure[name].unpack(decryptedPayload)
                this.set('protectedPayload', packet.protectedPayload);
            };
        };
        this.packetDecoded = packet;
    };

    pack(xbox = false) {
        let payload = new PacketStructure();
        let packet = payload.toBuffer();

        for (let name in this.structure) {
            if (name != 'protectedPayload') {
                this.structure[name].pack(payload);
            } else {
                let protectedStructure = this.structureProtected;
                for (let nameStruct in protectedStructure) {
                    if (this.structure.protectedPayload.value != undefined) {
                        protectedStructure[nameStruct].value = this.structure.protectedPayload.value[nameStruct];
                    };
                    protectedStructure[nameStruct].pack(this.protectedPayload);
                };
                this.protectedPayloadLength = this.protectedPayload.toBuffer().length;

                if (this.protectedPayload.toBuffer().length % 16 > 0) {
                    const padStart = this.protectedPayload.toBuffer().length % 16;
                    const padTotal = (16 - padStart);
                    for (let paddingnum = (padStart + 1); paddingnum <= 16; paddingnum++) {
                        this.protectedPayload.writeUInt8(padTotal);
                    };
                };
                this.protectedPayloadLengthReal = this.protectedPayload.toBuffer().length;
                const encryptedPayload = xbox.crypto.encrypt(this.protectedPayload.toBuffer(), xbox.crypto.getEncryptionKey(), this.structure.iv.value);
                payload.writeBytes(encryptedPayload);
            }
        };

        if (this.name == 'powerOn') {
            packet = this.pack1(Buffer.from('DD02', 'hex'), payload.toBuffer(), '');
        };
        if (this.name == 'discoveryRequest') {
            packet = this.pack1(Buffer.from('DD00', 'hex'), payload.toBuffer(), Buffer.from('0000', 'hex'));
        };
        if (this.name == 'discovery') {
            packet = this.pack1(Buffer.from('DD01', 'hex'), payload.toBuffer(), '2');
        };
        if (this.name == 'connectRequest') {
            packet = this.pack1(Buffer.from('CC00', 'hex'), payload.toBuffer(), Buffer.from('0002', 'hex'), this.protectedPayloadLength, this.protectedPayloadLengthReal);

            // Sign protected payload
            const protectedPayloadHash = xbox.crypto.sign(packet);
            packet = Buffer.concat([
                packet,
                Buffer.from(protectedPayloadHash)
            ]);
        };
        if (this.name == 'connectResponse') {
            packet = this.pack1(Buffer.from('CC01', 'hex'), payload.toBuffer(), '2')
        };
        return packet;
    };

    pack1(type, payload, version, protectedPayloadLength = false, protectedPayloadLengthReal = 0) {
        let payloadLength = new PacketStructure();

        if (protectedPayloadLength !== false) {
            payloadLength.writeUInt16(payload.length - protectedPayloadLengthReal);
            payloadLength = payloadLength.toBuffer();

            let protectedLength = new PacketStructure();
            protectedLength.writeUInt16(protectedPayloadLength);
            protectedLength = protectedLength.toBuffer();

            return Buffer.concat([
                type,
                payloadLength,
                protectedLength,
                version,
                payload
            ]);
        } else {
            payloadLength.writeUInt16(payload.length);
            payloadLength = payloadLength.toBuffer();

            return Buffer.concat([
                type,
                payloadLength,
                Buffer.from('\x00' + String.fromCharCode(version)),
                payload
            ]);
        };
    };
};
module.exports = SIMPLE;