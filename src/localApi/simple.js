"use strict";
import Packets from './packets.js';
import Structure from './structure.js';

class Simple {
    constructor(type) {
        //type
        this.type = type;

        //packet
        this.packets = new Packets();
        this.packet = this.packets[type];
        this.packetProtected = this.packets[type].payloadProtected !== undefined ? this.packets[`${type}Protected`] : false;
    };

    set(key, value, isProtected = false) {
        switch (isProtected) {
            case false:
                const packetLength = this.packet[key].length || 0;
                this.packet[key].value = value;
                this.packet[key].length = packetLength > 0 ? value.length : packetLength;
                break;
            case true:
                const packetProtectedLength = this.packetProtected[key].length || 0;
                this.packetProtected[key].value = value;
                this.packetProtected[key].length = packetProtectedLength > 0 ? value.length : packetProtectedLength;
                break;
        };
    }

    pack(crypto = false) {
        const structure = new Structure();
        let packet;
        let payloadProtectedLength = 0;
        let payloadProtectedLengthReal = 0;

        for (const name in this.packet) {
            switch (name) {
                case 'payloadProtected':
                    const structureProtected = new Structure();
                    for (const nameStruct in this.packetProtected) {
                        if (this.packet.payloadProtected.value !== undefined) {
                            this.packetProtected[nameStruct].value = this.packet.payloadProtected.value[nameStruct];
                        }
                        this.packetProtected[nameStruct].pack(structureProtected);
                    }
                    payloadProtectedLength = structureProtected.toBuffer().length;

                    // Pad packet
                    if (payloadProtectedLength % 16 > 0) {
                        const padStart = payloadProtectedLength % 16;
                        const padTotal = 16 - padStart;
                        for (let paddingnum = padStart + 1; paddingnum <= 16; paddingnum++) {
                            structureProtected.writeUInt8(padTotal);
                        }
                    }

                    payloadProtectedLengthReal = structureProtected.toBuffer().length;
                    const payloadEncrypted = crypto.encrypt(structureProtected.toBuffer(), crypto.getKey(), this.packet.iv.value);
                    structure.writeBytes(payloadEncrypted);
                    break;
                default:
                    this.packet[name].pack(structure);
            }
        }

        switch (this.type) {
            case 'powerOn':
                packet = this.pack1(Buffer.from('dd02', 'hex'), structure.toBuffer(), '');
                break;
            case 'discoveryRequest':
                packet = this.pack1(Buffer.from('dd00', 'hex'), structure.toBuffer(), Buffer.from('0000', 'hex'));
                break;
            case 'discoveryResponse':
                packet = this.pack1(Buffer.from('dd01', 'hex'), structure.toBuffer(), '2');
                break;
            case 'connectRequest':
                packet = this.pack1(Buffer.from('cc00', 'hex'), structure.toBuffer(), Buffer.from('0002', 'hex'), payloadProtectedLength, payloadProtectedLengthReal);
                // Sign protected payload
                const payloadProtected = crypto.sign(packet);
                packet = Buffer.concat([
                    packet,
                    Buffer.from(payloadProtected)
                ]);
                break;
            case 'connectResponse':
                packet = this.pack1(Buffer.from('CC01', 'hex'), structure.toBuffer(), '2');
                break;
            case 'connectRequestProtected':
                // Pad packet
                if (structure.toBuffer().length > 16) {
                    const padStart = structure.toBuffer().length % 16;
                    const padTotal = (16 - padStart);
                    for (let paddingnum = (padStart + 1); paddingnum <= 16; paddingnum++) {
                        structure.writeUInt8(padTotal);
                    };
                };
                let payloadEncrypted = crypto.encrypt(structure.toBuffer(), crypto.getIv());
                payloadEncrypted = new Structure(payloadEncrypted)
                packet = payloadEncrypted.toBuffer();
                break;
            default:
                packet = structure.toBuffer();
        };
        return packet;
    };

    pack1(type, payload, version, payloadProtectedLength = 0, payloadProtectedLengthReal = 0) {
        const structure = new Structure();
        const structureProtected = new Structure();
        let packet;
        let payloadLength;

        if (payloadProtectedLength > 0) {
            structure.writeUInt16(payload.length - payloadProtectedLengthReal);
            payloadLength = structure.toBuffer();

            structureProtected.writeUInt16(payloadProtectedLength);
            payloadProtectedLength = structureProtected.toBuffer();
            packet = Buffer.concat([
                type,
                payloadLength,
                payloadProtectedLength,
                version,
                payload
            ]);
        } else {
            structure.writeUInt16(payload.length);
            payloadLength = structure.toBuffer();
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
        const structure = new Structure(data);
        const type = structure.readBytes(2).toString('hex') === 'dd02' ? 'powerOn' : this.type;

        let packet = {
            type: type,
            payloadLength: structure.readUInt16(),
            version: structure.readUInt16()
        };

        if (packet.version !== 0 && packet.version !== 2) {
            packet.payloadProtectedLength = packet.version;
            packet.version = structure.readUInt16();
        }

        for (const name in this.packet) {
            packet[name] = this.packet[name].unpack(structure);
            this.set(name, packet[name]);
        }

        // Lets decrypt the data when the payload is encrypted
        const payloadProtectedExist = packet.payloadProtected !== undefined;
        if (payloadProtectedExist) {
            packet.payloadProtected = packet.payloadProtected.slice(0, -32);
            packet.signature = packet.payloadProtected.slice(-32);

            const payloadDecrypted = crypto.decrypt(packet.payloadProtected, packet.iv).slice(0, packet.payloadProtectedLength);
            packet.payloadProtected = {};

            const packetProtected = this.packets[`${packet.type}Protected`]
            const structurePayloadDecrypted = new Structure(payloadDecrypted);
            for (const name in packetProtected) {
                packet.payloadProtected[name] = packetProtected[name].unpack(structurePayloadDecrypted);
                this.set('payloadProtected', packet.payloadProtected);
            }
        }

        return packet;
    }
};
export default Simple;