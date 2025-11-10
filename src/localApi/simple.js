import Packets from './packets.js';
import Structure from './structure.js';
import { LocalApi } from '../constants.js';

class Simple {
    constructor(type) {
        this.type = type;
        this.packets = new Packets();
        this.packet = this.packets[type];
        this.packetProtected = this.packet.payloadProtected ? this.packets[`${type}Protected`] : false;
    }

    // === Helpers ===
    static applyPKCS7Padding(structure) {
        const blockSize = 16;
        const length = structure.toBuffer().length;
        const padTotal = blockSize - (length % blockSize || blockSize);
        for (let i = 0; i < padTotal; i++) {
            structure.writeUInt8(padTotal);
        }
    }

    set(key, value, isProtected = false) {
        const targetPacket = isProtected ? this.packetProtected : this.packet;
        if (!targetPacket || !targetPacket[key]) return;
        const currentLength = targetPacket[key].length || 0;
        targetPacket[key].value = value;
        targetPacket[key].length = currentLength > 0 ? value.length : currentLength;
    }

    pack(crypto = false) {
        const structure = new Structure();
        let packet;
        let payloadProtectedLength = 0;
        let payloadProtectedLengthReal = 0;

        for (const name in this.packet) {
            if (name === 'payloadProtected' && this.packetProtected) {
                const structureProtected = new Structure();
                for (const fieldName in this.packetProtected) {
                    if (this.packet.payloadProtected?.value?.[fieldName] !== undefined) {
                        this.packetProtected[fieldName].value = this.packet.payloadProtected.value[fieldName];
                    }
                    this.packetProtected[fieldName].pack(structureProtected);
                }

                payloadProtectedLength = structureProtected.toBuffer().length;
                Simple.applyPKCS7Padding(structureProtected);
                payloadProtectedLengthReal = structureProtected.toBuffer().length;

                const payloadEncrypted = crypto.encrypt(
                    structureProtected.toBuffer(),
                    crypto.getKey(),
                    this.packet.iv?.value
                );
                structure.writeBytes(payloadEncrypted);
            } else {
                this.packet[name].pack(structure);
            }
        }

        const payload = structure.toBuffer();
        switch (this.type) {
            case 'powerOn':
                packet = this.pack1(LocalApi.Messages.Flags.powerOn, payload, '');
                break;
            case 'discoveryRequest':
                packet = this.pack1(LocalApi.Messages.Flags.discoveryRequest, payload, Buffer.from('0000', 'hex'));
                break;
            case 'discoveryResponse':
                packet = this.pack1(LocalApi.Messages.Flags.discoveryResponse, payload, Buffer.from([0, 2]));
                break;
            case 'connectRequest':
                packet = this.pack1(LocalApi.Messages.Flags.connectRequest, payload, Buffer.from('0002', 'hex'), payloadProtectedLength, payloadProtectedLengthReal);
                const payloadProtected = crypto.sign(packet);
                packet = Buffer.concat([packet, Buffer.from(payloadProtected)]);
                break;
            case 'connectRequestProtected':
                Simple.applyPKCS7Padding(structure);
                let payloadEncrypted = crypto.encrypt(structure.toBuffer(), crypto.getIv());
                payloadEncrypted = new Structure(payloadEncrypted);
                packet = payloadEncrypted.toBuffer();
                break;
            case 'connectResponse':
                packet = this.pack1(LocalApi.Messages.Flags.connectResponse, payload, Buffer.from([0, 2]));
                break;
            default:
                packet = payload;
        }
        return packet;
    }

    pack1(type, payload, version, payloadProtectedLength = 0, payloadProtectedLengthReal = 0) {
        const structure = new Structure();
        const structureProtected = new Structure();

        if (payloadProtectedLength > 0) {
            structure.writeUInt16(payload.length - payloadProtectedLengthReal);
            const payloadLength = structure.toBuffer();
            structureProtected.writeUInt16(payloadProtectedLength);
            payloadProtectedLength = structureProtected.toBuffer();
            return Buffer.concat([type, payloadLength, payloadProtectedLength, version, payload]);
        }

        structure.writeUInt16(payload.length);
        const payloadLength = structure.toBuffer();
        return Buffer.concat([type, payloadLength, Buffer.from([0, version[1] || 0]), payload]);
    }

    unpack(crypto = undefined, data = false) {
        const structure = new Structure(data);
        const typeHex = structure.readBytes(2).toString('hex');
        const type = typeHex === 'dd02' ? 'powerOn' : this.type;

        let packet = {
            typeHex,
            type,
            payloadLength: structure.readUInt16(),
            version: structure.readUInt16(),
        };

        if (packet.version !== 0 && packet.version !== 2) {
            packet.payloadProtectedLength = packet.version;
            packet.version = structure.readUInt16();
        }

        for (const name in this.packet) {
            packet[name] = this.packet[name].unpack(structure);
            this.set(name, packet[name]);
        }

        if (packet.payloadProtected !== undefined) {
            const signature = packet.payloadProtected.subarray(-32);
            const encryptedData = packet.payloadProtected.subarray(0, -32);
            const decrypted = crypto.decrypt(encryptedData, packet.iv).subarray(0, packet.payloadProtectedLength);

            packet.payloadProtected = {};
            const structurePayloadDecrypted = new Structure(decrypted);
            const packetProtected = this.packets[`${packet.type}Protected`];

            for (const name in packetProtected) {
                packet.payloadProtected[name] = packetProtected[name].unpack(structurePayloadDecrypted);
                this.set('payloadProtected', packet.payloadProtected);
            }

            if (crypto.verify && !crypto.verify(encryptedData, signature)) {
                throw new Error('Invalid signature: payload may be tampered with');
            }

            packet.signature = signature;
        }

        return packet;
    }
}

export default Simple;
