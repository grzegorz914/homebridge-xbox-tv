"use strict";
const PacketStructure = require('./structure.js');
const Packets = require('./packets.js');

class SIMPLE {
    constructor(type, data = false) {

        switch (type.slice(0, 6)) {
            case 'simple':
                type = type.slice(7);
                break;
            case 'messag':
                type = type.slice(8);
                break;
        };

        //structure
        const structure = new Packets();
        this.structure = structure[type];

        //packet
        this.packet = new Packets(this.structure);
        this.type = type;
        this.data = data;
        this.structureProtected = this.structure.protectedPayload !== undefined ? this.packet[`${type}Protected`] : false;
    };

    set(key, value, isProtected = false) {
        switch (isProtected) {
            case true:
                const structureProtectedLength = this.structureProtected[key].length || 0;
                this.structureProtected[key].value = value;
                this.structureProtected[key].length = structureProtectedLength > 0 ? value.length : structureProtectedLength;
                break;
            case false:
                const structureLength = this.structure[key].length || 0;
                this.structure[key].value = value;
                this.structure[key].length = structureLength > 0 ? value.length : structureLength;
                break;
        };
    }

    pack(crypto = false) {
        const packetStructure = new PacketStructure();
        let packet;
        let protectedPayloadLength = 0;
        let protectedPayloadLengthReal = 0;

        for (const name in this.structure) {
            switch (name) {
                case 'protectedPayload':
                    const packetProtectedStructure = new PacketStructure();
                    for (const nameStruct in this.structureProtected) {
                        if (this.structure.protectedPayload.value !== undefined) {
                            this.structureProtected[nameStruct].value = this.structure.protectedPayload.value[nameStruct];
                        }
                        this.structureProtected[nameStruct].pack(packetProtectedStructure);
                    }
                    protectedPayloadLength = packetProtectedStructure.toBuffer().length;

                    // Pad packet
                    if (protectedPayloadLength % 16 > 0) {
                        const padStart = protectedPayloadLength % 16;
                        const padTotal = 16 - padStart;
                        for (let paddingnum = padStart + 1; paddingnum <= 16; paddingnum++) {
                            packetProtectedStructure.writeUInt8(padTotal);
                        }
                    }

                    protectedPayloadLengthReal = packetProtectedStructure.toBuffer().length;
                    const encryptedPayload = crypto.encrypt(packetProtectedStructure.toBuffer(), crypto.getKey(), this.structure.iv.value);
                    packetStructure.writeBytes(encryptedPayload);
                    break;
                default:
                    this.structure[name].pack(packetStructure);
            }
        }

        switch (this.type) {
            case 'powerOn':
                packet = this.pack1(Buffer.from('dd02', 'hex'), packetStructure.toBuffer(), '');
                break;
            case 'discoveryRequest':
                packet = this.pack1(Buffer.from('dd00', 'hex'), packetStructure.toBuffer(), Buffer.from('0000', 'hex'));
                break;
            case 'discoveryResponse':
                packet = this.pack1(Buffer.from('dd01', 'hex'), packetStructure.toBuffer(), '2');
                break;
            case 'connectRequest':
                packet = this.pack1(Buffer.from('cc00', 'hex'), packetStructure.toBuffer(), Buffer.from('0002', 'hex'), protectedPayloadLength, protectedPayloadLengthReal);
                // Sign protected payload
                const protectedPayloadHash = crypto.sign(packet);
                packet = Buffer.concat([
                    packet,
                    Buffer.from(protectedPayloadHash)
                ]);
                break;
            case 'connectResponse':
                packet = this.pack1(Buffer.from('cc01', 'hex'), packetStructure.toBuffer(), '2');
                break;
            case 'connectRequestProtected':
                // Pad packet
                if (packetStructure.toBuffer().length > 16) {
                    const padStart = packetStructure.toBuffer().length % 16;
                    const padTotal = (16 - padStart);
                    for (let paddingnum = (padStart + 1); paddingnum <= 16; paddingnum++) {
                        packetStructure.writeUInt8(padTotal);
                    };
                };
                let encryptedPayload = crypto.encrypt(packetStructure.toBuffer(), crypto.getIv());
                encryptedPayload = new PacketStructure(encryptedPayload)
                packet = encryptedPayload.toBuffer();
                break;
            default:
                packet = packetStructure.toBuffer();
        };
        return packet;
    };

    pack1(type, payload, version, protectedPayloadLength = 0, protectedPayloadLengthReal = 0) {
        const packetStructure = new PacketStructure();
        const packetStructureProtected = new PacketStructure();
        let packet;
        let payloadLength;

        if (protectedPayloadLength > 0) {
            packetStructure.writeUInt16(payload.length - protectedPayloadLengthReal);
            payloadLength = packetStructure.toBuffer();

            packetStructureProtected.writeUInt16(protectedPayloadLength);
            const protectedLength = packetStructureProtected.toBuffer();
            packet = Buffer.concat([
                type,
                payloadLength,
                protectedLength,
                version,
                payload
            ]);
        } else {
            packetStructure.writeUInt16(payload.length);
            payloadLength = packetStructure.toBuffer();
            packet = Buffer.concat([
                type,
                payloadLength,
                Buffer.from([0, version]),
                payload
            ]);
        }

        return packet;
    };

    unpack(crypto = undefined) {
        const packetStructure = new PacketStructure(this.data);
        const type = packetStructure.readBytes(2).toString('hex') === 'dd02' ? 'powerOn' : this.type;

        let packet = {
            type: type,
            payloadLength: packetStructure.readUInt16(),
            version: packetStructure.readUInt16()
        };

        if (packet.version !== 0 && packet.version !== 2) {
            packet.protectedPayloadLength = packet.version;
            packet.version = packetStructure.readUInt16();
        }

        for (const name in this.structure) {
            packet[name] = this.structure[name].unpack(packetStructure);
            this.set(name, packet[name]);
        }

        // Lets decrypt the data when the payload is encrypted
        if (packet.protectedPayload) {
            packet.protectedPayload = packet.protectedPayload.slice(0, -32);
            packet.signature = packet.protectedPayload.slice(-32);

            const protectedStructure = this.packet[`${packet.type}Protected`];
            const decryptedPayload = crypto.decrypt(packet.protectedPayload, packet.iv).slice(0, packet.protectedPayloadLength);
            const decryptedPacket = new PacketStructure(decryptedPayload);
            packet.protectedPayload = {};

            for (const name in protectedStructure) {
                packet.protectedPayload[name] = protectedStructure[name].unpack(decryptedPacket);
                this.set('protectedPayload', packet.protectedPayload);
            }
        }

        return packet;
    }
};
module.exports = SIMPLE;