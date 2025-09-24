import Packets from './packets.js';
import Structure from './structure.js';

// === Constants ===
const PACKET_TYPES = {
    POWER_ON: Buffer.from('dd02', 'hex'),
    DISCOVERY_REQUEST: Buffer.from('dd00', 'hex'),
    DISCOVERY_RESPONSE: Buffer.from('dd01', 'hex'),
    CONNECT_REQUEST: Buffer.from('cc00', 'hex'),
    CONNECT_RESPONSE: Buffer.from('cc01', 'hex'),
};

const VERSION = {
    V0: 0,
    V2: 2,
};

class Simple {
    constructor(type) {
        this.type = type;
        this.packets = new Packets();
        this.packet = this.packets[type];
        this.packetProtected = this.packet.payloadProtected !== undefined ? this.packets[`${type}Protected`] : false;
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

        switch (this.type) {
            case 'powerOn':
                packet = this.pack1(PACKET_TYPES.POWER_ON, structure.toBuffer(), '');
                break;
            case 'discoveryRequest':
                packet = this.pack1(PACKET_TYPES.DISCOVERY_REQUEST, structure.toBuffer(), Buffer.from('0000', 'hex'));
                break;
            case 'discoveryResponse':
                packet = this.pack1(PACKET_TYPES.DISCOVERY_RESPONSE, structure.toBuffer(), Buffer.from([0, VERSION.V2]));
                break;
            case 'connectRequest':
                packet = this.pack1(PACKET_TYPES.CONNECT_REQUEST, structure.toBuffer(), Buffer.from('0002', 'hex'), payloadProtectedLength, payloadProtectedLengthReal);
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
                packet = this.pack1(PACKET_TYPES.CONNECT_RESPONSE, structure.toBuffer(), Buffer.from([0, VERSION.V2]));
                break;
            default:
                packet = structure.toBuffer();
        }
        return packet;
    }

    pack1(type, payload, version, payloadProtectedLength = 0, payloadProtectedLengthReal = 0) {
        const structure = new Structure();
        const structureProtected = new Structure();
        let packet;

        if (payloadProtectedLength > 0) {
            structure.writeUInt16(payload.length - payloadProtectedLengthReal);
            const payloadLength = structure.toBuffer();
            structureProtected.writeUInt16(payloadProtectedLength);
            const payloadProtectedBuffer = structureProtected.toBuffer();
            packet = Buffer.concat([type, payloadLength, payloadProtectedBuffer, version, payload]);
        } else {
            structure.writeUInt16(payload.length);
            const payloadLength = structure.toBuffer();
            packet = Buffer.concat([type, payloadLength, Buffer.from([0, version[1] || VERSION.V0]), payload]);
        }

        return packet;
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

        if (packet.version !== VERSION.V0 && packet.version !== VERSION.V2) {
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
