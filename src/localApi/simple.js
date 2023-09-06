"use strict";
const PacketStructure = require('./structure.js');
const Packets = require('./packets.js');

class SIMPLE {
    constructor(type) {
        //type
        this.type = type;

        //structure
        const structure = new Packets();
        this.structure = structure[type];

        //packet
        this.packet = new Packets(this.structure);
        this.structureProtected = this.structure.payloadProtected !== undefined ? this.packet[`${type}Protected`] : false;
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
        let payloadProtectedLength = 0;
        let payloadProtectedLengthReal = 0;

        for (const name in this.structure) {
            switch (name) {
                case 'payloadProtected':
                    const packetStructureProtected = new PacketStructure();
                    for (const nameStruct in this.structureProtected) {
                        if (this.structure.payloadProtected.value !== undefined) {
                            this.structureProtected[nameStruct].value = this.structure.payloadProtected.value[nameStruct];
                        }
                        this.structureProtected[nameStruct].pack(packetStructureProtected);
                    }
                    payloadProtectedLength = packetStructureProtected.toBuffer().length;

                    // Pad packet
                    if (payloadProtectedLength % 16 > 0) {
                        const padStart = payloadProtectedLength % 16;
                        const padTotal = 16 - padStart;
                        for (let paddingnum = padStart + 1; paddingnum <= 16; paddingnum++) {
                            packetStructureProtected.writeUInt8(padTotal);
                        }
                    }

                    payloadProtectedLengthReal = packetStructureProtected.toBuffer().length;
                    const payloadEncrypted = crypto.encrypt(packetStructureProtected.toBuffer(), crypto.getKey(), this.structure.iv.value);
                    packetStructure.writeBytes(payloadEncrypted);
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
                packet = this.pack1(Buffer.from('cc00', 'hex'), packetStructure.toBuffer(), Buffer.from('0002', 'hex'), payloadProtectedLength, payloadProtectedLengthReal);
                // Sign protected payload
                const payloadProtected = crypto.sign(packet);
                packet = Buffer.concat([
                    packet,
                    Buffer.from(payloadProtected)
                ]);
                break;
            case 'connectResponse':
                packet = this.pack1(Buffer.from('cc01', 'hex'), packetStructure.toBuffer(), '2');
                break;
            default:
                packet = packetStructure.toBuffer();
        };
        return packet;
    };

    pack1(type, payload, version, payloadProtectedLength = 0, payloadProtectedLengthReal = 0) {
        const packetStructure = new PacketStructure();
        const packetStructureProtected = new PacketStructure();
        let packet;
        let payloadLength;

        if (payloadProtectedLength > 0) {
            packetStructure.writeUInt16(payload.length - payloadProtectedLengthReal);
            payloadLength = packetStructure.toBuffer();

            packetStructureProtected.writeUInt16(payloadProtectedLength);
            payloadProtectedLength = packetStructureProtected.toBuffer();
            packet = Buffer.concat([
                type,
                payloadLength,
                payloadProtectedLength,
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

    unpack(crypto = undefined, data = false) {
        const packetStructure = new PacketStructure(data);
        const type = packetStructure.readBytes(2).toString('hex') === 'dd02' ? 'powerOn' : this.type;

        let packet = {
            type: type,
            payloadLength: packetStructure.readUInt16(),
            version: packetStructure.readUInt16()
        };

        if (packet.version !== 0 && packet.version !== 2) {
            packet.payloadProtectedLength = packet.version;
            packet.version = packetStructure.readUInt16();
        }

        for (const name in this.structure) {
            packet[name] = this.structure[name].unpack(packetStructure);
            this.set(name, packet[name]);
        }

        // Lets decrypt the data when the payload is encrypted
        if (packet.payloadProtected) {
            packet.payloadProtected = packet.payloadProtected.slice(0, -32);
            packet.signature = packet.payloadProtected.slice(-32);

            const packetStructureProtected = this.packet[`${packet.type}Protected`];
            const payloadDecrypted = crypto.decrypt(packet.payloadProtected, packet.iv).slice(0, packet.payloadProtectedLength);
            const packetDecrypted = new PacketStructure(payloadDecrypted);
            packet.payloadProtected = {};

            for (const name in packetStructureProtected) {
                packet.payloadProtected[name] = packetStructureProtected[name].unpack(packetDecrypted);
                this.set('payloadProtected', packet.payloadProtected);
            }
        }

        return packet;
    }
};
module.exports = SIMPLE;